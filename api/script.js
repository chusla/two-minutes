import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, MEDITATION_TOOL, LIMITS, sanitize } from '../lib/prompt.js';
import { VOICE_IDS, DEFAULT_VOICE_ID } from '../lib/ambiences.js';
import { mintTicket } from '../lib/sign.js';
import { clientIp, rateLimit } from '../lib/ratelimit.js';

const anthropic = new Anthropic();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }

  const intention = String(req.body?.intention || '').trim().slice(0, LIMITS.maxIntentionChars);
  const voiceId = VOICE_IDS.has(req.body?.voiceId) ? req.body.voiceId : DEFAULT_VOICE_ID;

  if (intention.length < 3) {
    return res.status(400).json({ error: 'Tell me what is on your mind first.' });
  }

  const limit = rateLimit(`script:${clientIp(req)}`, {
    limit: Number(process.env.SCRIPTS_PER_HOUR || 5),
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.ok) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds));
    return res.status(429).json({
      error: "That's a few meditations in one hour. Give it a little while, or run your own copy — the repo is right there.",
    });
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      // Interactive demo: someone is staring at a spinner, so trade a little depth
      // for a shorter wait. The prompt is doing most of the work anyway.
      output_config: { effort: 'medium' },
      system: `${SYSTEM_PROMPT}\n\nCall the write_meditation tool exactly once. Say nothing outside the tool call.`,
      tools: [MEDITATION_TOOL],
      messages: [
        {
          role: 'user',
          content: `Here is what is on my mind, in my own words:\n\n"""${intention}"""`,
        },
      ],
    });

    if (message.stop_reason === 'refusal') {
      return res.status(422).json({ error: "I can't write a meditation for that one." });
    }

    const call = message.content.find((block) => block.type === 'tool_use');
    if (!call) {
      return res.status(502).json({ error: 'The model did not return a meditation. Try again.' });
    }

    if (!call.input.safe) {
      return res.status(422).json({
        error: 'Two minutes of silence is the wrong thing to offer right now, so I am not going to.',
        crisis: true,
      });
    }

    const meditation = sanitize(call.input);

    return res.status(200).json({
      title: meditation.title,
      lines: meditation.lines,
      voiceId,
      ticket: mintTicket({ lines: meditation.lines, voiceId }),
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: 'The writer is busy. Try again in a moment.' });
    }
    console.error('script generation failed:', error);
    return res.status(500).json({ error: 'Could not write the meditation. Try again.' });
  }
}
