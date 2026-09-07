# Two Minutes

Say what's on your mind. You get a two-minute guided meditation about *that*, spoken
aloud in a real voice, with the silence left in.

**[Try it →](https://two-minutes.vercel.app)** · no sign-up, no account, nothing stored.

> "I keep checking my phone the second I get into bed"
>
> → *Putting the phone down* — 14 lines, 63 seconds of speech, 71 seconds of silence.

---

## Why this exists

Most AI meditation demos have the same two problems. They generate a wall of text and
read it out at podcast pace, and they say nothing that couldn't have been said to
anybody. A meditation is mostly **silence**, and the useful part is that it is about
*your* thing.

Two Minutes is the smallest honest version of that: one text box, one tightly-scoped
prompt, and ElevenLabs doing the part that actually matters — sounding like a person
who is not in a hurry.

## How it works

```
your words → Claude writes lines + pause lengths → ElevenLabs voices each line
                                                 → the browser schedules the silence
```

Three ideas do all the work:

**1. The pauses are data, not punctuation.** The model returns
`{ text, pauseMs }` per line, not a blob of prose full of ellipses that a TTS engine
will race straight through. A meditation that is 130 words of speech and 70 seconds of
silence is a normal, correct output here.

**2. Each line is synthesised separately.** Playback starts as soon as the *first*
line comes back — about two seconds after the script lands — while the rest render in
the background. There is no "generating your meditation, please wait 90 seconds" screen,
and the pauses are exact because the browser schedules them on the audio clock rather
than baking silence into a file.

**3. Word highlighting comes free from ElevenLabs.** The
[`/with-timestamps`](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps)
endpoint returns character-level timings; `api/speak.js` folds those into words and the
browser lights each one up as the voice reaches it. No forced alignment, no Whisper pass.

Pausing suspends the `AudioContext`, and because the silences are timed against
`context.currentTime` rather than `setTimeout`, they pause with it.

## The prompt

The whole "product" is [`lib/prompt.js`](lib/prompt.js) — about 40 lines you can read
in one sitting. It is worth opening even if you never run this. The bans are the
interesting part:

- No metaphors, no imagery. Not "a warm light", not "waves", not "a still lake".
- No science. No nervous system, no cortisol, no studies.
- No praise. Nobody needs to be congratulated for sitting down.
- No spiritual vocabulary.
- No ellipses or dashes used as pauses — pauses live in `pauseMs` and nowhere else.

Output is forced through a strict tool schema, so a malformed generation is a 502
rather than a nine-minute "two-minute" meditation. `sanitize()` clamps every pause and
scales the total back down if the model overshoots.

## Running your own

```bash
git clone https://github.com/chusla/two-minutes.git
cd two-minutes
npm install
cp .env.example .env
# add your ANTHROPIC_API_KEY and ELEVENLABS_API_KEY
npx vercel dev
```

Deploy with `npx vercel deploy --prod`, or click through from a fork. The only
required configuration is the two API keys — there is no database, no auth, and no
build step.

To check both APIs end to end without opening a browser — it writes one meditation,
voices its first line, round-trips a forged ticket, and prints the speech/silence split:

```bash
node --env-file=.env scripts/smoke.mjs "I keep checking my phone in bed"
```

### Cost per meditation

Roughly **1,400 ElevenLabs characters** (~14 short lines) plus one Claude call. On a
paid ElevenLabs plan that is a fraction of a cent of quota; the Claude call is a few
cents at most.

## Files

| Path | What's in it |
|---|---|
| `lib/prompt.js` | The system prompt, the strict tool schema, and the output clamps |
| `lib/ambiences.js` | The three voices and three ambient beds on offer |
| `lib/sign.js` | HMAC ticket so `/api/speak` isn't an open TTS proxy |
| `lib/ratelimit.js` | In-memory sliding window, no infrastructure required |
| `api/script.js` | Claude → `{ title, lines: [{ text, pauseMs }] }` |
| `api/speak.js` | ElevenLabs TTS + character timings → words |
| `public/app.js` | The player: prefetch, scheduling, word highlighting, pause/resume |

## Notes on the parts that usually go wrong

**`/api/speak` is not an open TTS endpoint.** `/api/script` mints an HMAC ticket over
the exact lines it wrote; `/api/speak` will only voice a line whose hash is in a valid,
unexpired ticket. It is stateless, so there is nothing to provision — but it means you
cannot point a script at the endpoint and get free narration on someone else's quota.

**Rate limiting is in-memory and therefore approximate.** Serverless instances come and
go, so a determined caller spread across cold starts gets more than
`SCRIPTS_PER_HOUR`. That is a deliberate trade: a fork deploys with two environment
variables and no Redis. The hard ceiling on cost is structural — the ticket requirement
plus an 18-line cap.

**`eleven_v3` doesn't always return alignment.** `api/speak.js` falls back to
`eleven_multilingual_v2` when the timestamps come back empty, so word highlighting
degrades to a slightly different voice rather than to nothing.

**Crisis input is refused, not softened.** If someone types something about self-harm
or an emergency, the model sets `safe: false` and no meditation is generated. Two
minutes of silence is the wrong response and the demo says so.

## Audio assets

The three ambient beds — *Fields of Grace*, *Resonant Grace*, and *Overtones of
Affirmation* — were composed with the [ElevenLabs Music
API](https://elevenlabs.io/docs/api-reference/music) and are streamed from Whitespace's
public storage. **They are not covered by the MIT licence**; they are provided for use
with this demo. If you fork this into your own product, swap the URLs in
`lib/ambiences.js` for beds you have rights to — generating three with the Music API
takes about a minute.

The code is MIT. Use it for anything.

## Where this came from

Two Minutes is a stripped-down demo from the team behind
[Whitespace](https://trywhitespace.com), a meditation app that generates full programmes
rather than two-minute singles. This repo is the interesting 5% — the prompt, the pause
model, and the streaming player — with everything else taken out.

Built with [ElevenLabs](https://elevenlabs.io) and [Claude](https://claude.com).
