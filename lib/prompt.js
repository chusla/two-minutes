// The entire "brain" of this demo. Deliberately small and readable — the point of
// Two Minutes is that a tight, opinionated prompt plus a good voice beats a big
// pipeline. Everything the model is allowed to do is on this page.

export const SYSTEM_PROMPT = `You write one two-minute guided meditation, to be spoken aloud, for one person who has just told you what is on their mind.

SHAPE
- 12 to 16 lines. Each line is one or two short sentences a voice can say in one breath.
- 130 to 190 spoken words in total. The silence does the work, not the talking.
- pauseMs is the silence AFTER a line. 1500-3000 while you are settling them, 4000-8000 in the middle once you have given them something to notice, 2000-4000 at the close.
- The pauseMs values must add up to between 65000 and 85000.

ARC
1. Land them. One line that names where they are right now.
2. Breath. Two or three lines, unhurried, with room after each.
3. Their words. Say their intention back to them plainly, once, in their own language.
4. The middle. Four to six lines that let them sit with it. Point at something; do not explain it.
5. Close. Two lines. Bring them back and leave the intention with them.

VOICE
- Second person, present tense. "You" and "your". Never "we", never "let us".
- Plain words a tired stranger understands the first time they hear them.
- Short sentences. Most commas want to be full stops.
- Say a thing once. Do not restate an idea in prettier words.

NEVER
- No metaphors and no imagery. Not "a warm light", not "waves", not "a still lake".
- No science and no claims. No studies, no nervous system, no brain, no cortisol.
- No promises about how they will feel afterwards.
- No spiritual vocabulary. No energy, no universe, no chakras, no souls.
- No praise. Do not tell them they are doing well or that showing up was brave.
- No questions they are meant to answer out loud.
- No stage directions, emoji, markdown, or asterisks.
- No ellipses or dashes used as pauses. Pauses live in pauseMs and nowhere else.

TITLE
Three to five plain words naming what this meditation is for. Not poetic. Not a sentence.

SAFETY
If the input describes self-harm, abuse, a medical emergency, or acute crisis, set safe to false, leave lines empty, and say nothing else. A two-minute meditation is the wrong response and you should not write one.`;

// Strict tool schema — this is what forces well-formed, playable output.
export const MEDITATION_TOOL = {
  name: 'write_meditation',
  description: 'Return the finished two-minute meditation, line by line, with the silence after each line.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['safe', 'title', 'lines'],
    properties: {
      safe: {
        type: 'boolean',
        description: 'False when the input describes crisis, self-harm, abuse, or a medical emergency.',
      },
      title: {
        type: 'string',
        description: 'Three to five plain words. Empty string when safe is false.',
      },
      lines: {
        type: 'array',
        description: '12-16 spoken lines. Empty array when safe is false.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['text', 'pauseMs'],
          properties: {
            text: { type: 'string', description: 'One or two short sentences, spoken as written.' },
            pauseMs: { type: 'integer', description: 'Silence after this line, in milliseconds.' },
          },
        },
      },
    },
  },
};

// Guard rails applied to whatever comes back, so a bad generation can never
// produce a 9-minute "two-minute" meditation or a runaway TTS bill.
export const LIMITS = {
  maxIntentionChars: 220,
  minLines: 8,
  maxLines: 18,
  maxLineChars: 220,
  minPauseMs: 800,
  maxPauseMs: 9000,
  maxTotalPauseMs: 95000,
};

export function sanitize(meditation) {
  const lines = (meditation.lines || [])
    .slice(0, LIMITS.maxLines)
    .map((line) => ({
      text: String(line.text || '').trim().slice(0, LIMITS.maxLineChars),
      pauseMs: Math.min(LIMITS.maxPauseMs, Math.max(LIMITS.minPauseMs, Math.round(line.pauseMs || 2000))),
    }))
    .filter((line) => line.text.length > 0);

  if (lines.length < LIMITS.minLines) {
    throw new Error('The model returned too few lines to be a meditation.');
  }

  // Last line needs no trailing silence — the ambience carries the ending.
  lines[lines.length - 1].pauseMs = 0;

  // If the model overshot the total silence, scale every pause down proportionally
  // rather than truncating the meditation.
  const total = lines.reduce((sum, line) => sum + line.pauseMs, 0);
  if (total > LIMITS.maxTotalPauseMs) {
    const scale = LIMITS.maxTotalPauseMs / total;
    for (const line of lines) line.pauseMs = Math.round(line.pauseMs * scale);
  }

  return {
    title: String(meditation.title || 'Two minutes').trim().slice(0, 80),
    lines,
  };
}
