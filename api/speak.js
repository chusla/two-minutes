import { VOICE_IDS } from '../lib/ambiences.js';
import { verifyTicket } from '../lib/sign.js';
import { clientIp, rateLimit } from '../lib/ratelimit.js';

const MODEL = 'eleven_v3';
const FALLBACK_MODEL = 'eleven_multilingual_v2';

// Whitespace's house settings: steady enough not to wander across a long pause,
// expressive enough that it does not read like an announcement.
const VOICE_SETTINGS = { stability: 0.55, similarity_boost: 0.85, style: 0, use_speaker_boost: true };

async function synthesise(text, voiceId, modelId) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: modelId, voice_settings: VOICE_SETTINGS }),
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs ${modelId} ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return response.json();
}

// The API returns per-character timings. Words are what a reader follows, so fold
// the characters up into words here rather than shipping thousands of entries.
function charsToWords(alignment) {
  if (!alignment?.characters?.length) return [];

  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment;
  const words = [];
  let text = '';
  let start = null;
  let end = null;

  const flush = () => {
    if (text.trim()) words.push({ word: text, startMs: Math.round(start * 1000), endMs: Math.round(end * 1000) });
    text = '';
    start = null;
    end = null;
  };

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    if (char === ' ' || char === '\n') {
      flush();
      continue;
    }
    if (start === null) start = starts[i];
    end = ends[i];
    text += char;
  }
  flush();

  return words;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }

  const { text, voiceId, ticket } = req.body || {};

  if (typeof text !== 'string' || !text.trim() || !VOICE_IDS.has(voiceId)) {
    return res.status(400).json({ error: 'Bad request.' });
  }

  // A line is only voiced if /api/script wrote it. This is what stops the endpoint
  // becoming free text-to-speech for the internet.
  if (!verifyTicket(ticket, { text, voiceId })) {
    return res.status(403).json({ error: 'That line did not come from a meditation I wrote.' });
  }

  const limit = rateLimit(`speak:${clientIp(req)}`, {
    limit: Number(process.env.LINES_PER_HOUR || 120),
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.ok) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds));
    return res.status(429).json({ error: 'Too much audio in one hour.' });
  }

  try {
    let data;
    try {
      data = await synthesise(text, voiceId, MODEL);
      // v3 does not always return alignment; word highlighting needs it.
      if (!data.alignment?.characters?.length) data = await synthesise(text, voiceId, FALLBACK_MODEL);
    } catch {
      data = await synthesise(text, voiceId, FALLBACK_MODEL);
    }

    // Cacheable: the same line in the same voice is always the same audio, and
    // ElevenLabs is deterministic enough here that a repeat play costs nothing.
    res.setHeader('Cache-Control', 'private, max-age=1800');
    return res.status(200).json({ audioBase64: data.audio_base64, words: charsToWords(data.alignment) });
  } catch (error) {
    console.error('tts failed:', error);
    return res.status(502).json({ error: 'The voice is unavailable right now.' });
  }
}
