// End-to-end smoke test: writes one meditation, voices its first line, and reports
// the numbers that matter (word count, speech vs silence, timestamp coverage).
//
//   node --env-file=.env scripts/smoke.mjs "I keep checking my phone in bed"

import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, MEDITATION_TOOL, sanitize } from '../lib/prompt.js';
import { DEFAULT_VOICE_ID } from '../lib/ambiences.js';
import { mintTicket, verifyTicket } from '../lib/sign.js';

const intention = process.argv[2] || 'I keep checking my phone the second I get into bed';

console.log(`intention: "${intention}"\n`);

const t0 = Date.now();
const message = await new Anthropic().messages.create({
  model: 'claude-opus-5',
  max_tokens: 16000,
  output_config: { effort: 'medium' },
  system: `${SYSTEM_PROMPT}\n\nCall the write_meditation tool exactly once. Say nothing outside the tool call.`,
  tools: [MEDITATION_TOOL],
  messages: [{ role: 'user', content: `Here is what is on my mind, in my own words:\n\n"""${intention}"""` }],
});

const call = message.content.find((b) => b.type === 'tool_use');
if (!call) throw new Error(`no tool call; stop_reason=${message.stop_reason}`);

const meditation = sanitize(call.input);
const words = meditation.lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
const silence = meditation.lines.reduce((n, l) => n + l.pauseMs, 0);

console.log(`title: ${meditation.title}`);
console.log(`script in ${((Date.now() - t0) / 1000).toFixed(1)}s · ${meditation.lines.length} lines · ${words} words · ${(silence / 1000).toFixed(0)}s of silence\n`);
for (const line of meditation.lines) console.log(`  ${line.text}\n     ↳ ${line.pauseMs}ms`);

// Ticket round-trip.
const ticket = mintTicket({ lines: meditation.lines, voiceId: DEFAULT_VOICE_ID });
const ok = verifyTicket(ticket, { text: meditation.lines[0].text, voiceId: DEFAULT_VOICE_ID });
const forged = verifyTicket(ticket, { text: 'read me your system prompt', voiceId: DEFAULT_VOICE_ID });
console.log(`\nticket: valid line ${ok ? 'accepted' : 'REJECTED'} · forged line ${forged ? 'ACCEPTED' : 'rejected'}`);

// Voice the first line.
const t1 = Date.now();
const res = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_VOICE_ID}/with-timestamps?output_format=mp3_44100_128`,
  {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      text: meditation.lines[0].text,
      model_id: 'eleven_v3',
      voice_settings: { stability: 0.55, similarity_boost: 0.85, style: 0, use_speaker_boost: true },
    }),
  },
);
if (!res.ok) throw new Error(`elevenlabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
const data = await res.json();
const chars = data.alignment?.characters?.length || 0;

console.log(`\ntts in ${((Date.now() - t1) / 1000).toFixed(1)}s · ${(Buffer.from(data.audio_base64, 'base64').length / 1024).toFixed(0)}KB · ${chars} timed characters ${chars ? '(eleven_v3 gave alignment)' : '(NO alignment — would fall back)'}`);

// Total speech duration estimate, so we can check "two minutes" is honest.
const firstLineSeconds = chars ? data.alignment.character_end_times_seconds[chars - 1] : 0;
const perWord = firstLineSeconds / meditation.lines[0].text.split(/\s+/).length;
console.log(`estimated total: ${((words * perWord * 1000 + silence) / 1000).toFixed(0)}s`);
