// Two Minutes — front end.
//
// The interesting part is the player. A meditation is mostly silence, so instead of
// rendering one long audio file, each line is synthesised separately and the pauses
// are scheduled in the browser. That means playback can start as soon as the FIRST
// line comes back rather than after the whole thing is rendered, and it keeps the
// pauses exact instead of hoping the model put the right number of commas in.

const el = (id) => document.getElementById(id);
const ui = {
  compose: el('compose'),
  intention: el('intention'),
  counter: el('counter'),
  voices: el('voices'),
  ambiences: el('ambiences'),
  start: el('start'),
  error: el('error'),
  player: el('player'),
  status: el('status'),
  title: el('title'),
  spoken: el('spoken'),
  bar: el('bar'),
  toggle: el('toggle'),
  stop: el('stop'),
  ambience: el('ambience'),
};

const AMBIENCE_VOLUME = 0.26;

let options = { voices: [], ambiences: [] };
let chosenVoice = null;
let chosenAmbience = null;

/** Live playback state. Reset by `stop()`. */
let session = null;

// ─────────────────────────────────────────────── setup

ui.intention.addEventListener('input', () => {
  ui.counter.textContent = String(ui.intention.value.length);
});

function renderPills(container, items, onPick, selectedId) {
  container.replaceChildren(
    ...items.map((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pill';
      button.setAttribute('aria-pressed', String(item.id === selectedId));
      button.innerHTML = `<span class="pill-name"></span><span class="pill-note"></span>`;
      button.querySelector('.pill-name').textContent = item.name;
      button.querySelector('.pill-note').textContent = item.description;
      button.addEventListener('click', () => {
        onPick(item);
        for (const sibling of container.children) sibling.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-pressed', 'true');
      });
      return button;
    }),
  );
}

async function loadOptions() {
  const response = await fetch('/api/options');
  options = await response.json();

  chosenVoice = options.voices[0];
  chosenAmbience = options.ambiences[0];

  renderPills(ui.voices, options.voices, (v) => (chosenVoice = v), chosenVoice.id);
  renderPills(ui.ambiences, options.ambiences, (a) => pickAmbience(a), chosenAmbience.id);
}

function pickAmbience(ambience) {
  chosenAmbience = ambience;
  // Swap the bed mid-meditation without stopping the voice.
  if (session?.playing) {
    ui.ambience.src = ambience.url;
    ui.ambience.play().catch(() => {});
  }
}

// ─────────────────────────────────────────────── network

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Synthesise one line and decode it. Two lines are fetched at a time — enough to
 * stay ahead of playback (every line is followed by seconds of silence) without
 * firing fifteen requests at once.
 */
function fetchClips(script, context) {
  const clips = new Array(script.lines.length);
  let next = 0;

  const worker = async () => {
    while (next < script.lines.length) {
      const index = next++;
      const line = script.lines[index];
      clips[index] = (async () => {
        const data = await postJson('/api/speak', {
          text: line.text,
          voiceId: script.voiceId,
          ticket: script.ticket,
        });
        const buffer = await context.decodeAudioData(base64ToBytes(data.audioBase64).buffer);
        return { buffer, words: data.words };
      })();
      await clips[index].catch(() => {});
    }
  };

  worker();
  worker();

  return clips;
}

// ─────────────────────────────────────────────── playback

/** Wait on the audio clock, so a suspended context genuinely pauses the silence too. */
function waitOnClock(context, seconds) {
  const target = context.currentTime + seconds;
  return new Promise((resolve) => {
    const tick = () => {
      if (!session?.playing || context.currentTime >= target) return resolve();
      setTimeout(tick, 60);
    };
    tick();
  });
}

function renderLine(text, words) {
  ui.spoken.classList.remove('resting');
  ui.spoken.replaceChildren(
    ...(words.length ? words : text.split(/\s+/).map((word) => ({ word }))).flatMap((entry, i) => {
      const span = document.createElement('span');
      span.textContent = entry.word;
      span.dataset.startMs = entry.startMs ?? 0;
      return i === 0 ? [span] : [document.createTextNode(' '), span];
    }),
  );
}

function speakLine(context, clip, line) {
  return new Promise((resolve) => {
    const source = context.createBufferSource();
    source.buffer = clip.buffer;
    source.connect(context.destination);

    renderLine(line.text, clip.words);

    const startedAt = context.currentTime;
    const spans = [...ui.spoken.querySelectorAll('span')];
    let frame;

    const highlight = () => {
      const elapsedMs = (context.currentTime - startedAt) * 1000;
      for (const span of spans) {
        span.classList.toggle('said', Number(span.dataset.startMs) <= elapsedMs);
      }
      frame = requestAnimationFrame(highlight);
    };

    source.onended = () => {
      cancelAnimationFrame(frame);
      for (const span of spans) span.classList.add('said');
      resolve();
    };

    session.source = source;
    source.start();
    highlight();
  });
}

function fadeAmbience(to, ms) {
  const from = ui.ambience.volume;
  const startedAt = performance.now();
  const step = () => {
    const progress = Math.min(1, (performance.now() - startedAt) / ms);
    ui.ambience.volume = from + (to - from) * progress;
    if (progress < 1) requestAnimationFrame(step);
    else if (to === 0) ui.ambience.pause();
  };
  step();
}

async function run(script, context) {
  const clips = fetchClips(script, context);

  ui.title.textContent = script.title;
  ui.toggle.disabled = false;
  ui.status.textContent = 'Two minutes';

  for (let i = 0; i < script.lines.length && session?.playing; i++) {
    let clip;
    try {
      clip = await clips[i];
    } catch (error) {
      // One line failing shouldn't end the meditation — take the silence instead.
      console.warn(`line ${i} could not be voiced:`, error);
      await waitOnClock(context, 2);
      continue;
    }
    if (!session?.playing) return;

    ui.bar.style.width = `${((i + 0.5) / script.lines.length) * 100}%`;
    await speakLine(context, clip, script.lines[i]);
    if (!session?.playing) return;

    const pauseSeconds = script.lines[i].pauseMs / 1000;
    if (pauseSeconds > 2.5) {
      ui.spoken.classList.add('resting');
      ui.spoken.textContent = 'just breathe';
    }
    await waitOnClock(context, pauseSeconds);
  }

  if (!session?.playing) return;

  ui.bar.style.width = '100%';
  ui.status.textContent = 'Done';
  ui.spoken.classList.add('resting');
  ui.spoken.textContent = 'that was two minutes';
  ui.toggle.disabled = true;
  fadeAmbience(0, 4000);
}

// ─────────────────────────────────────────────── controls

async function begin() {
  const intention = ui.intention.value.trim();
  if (intention.length < 3) {
    showError('Tell me what is on your mind first.');
    return;
  }

  ui.error.hidden = true;
  ui.start.disabled = true;
  ui.start.textContent = 'Writing…';

  // The AudioContext and the ambience both have to start inside the click, or
  // iOS will refuse to play anything later.
  const context = new (window.AudioContext || window.webkitAudioContext)();
  ui.ambience.src = chosenAmbience.url;
  ui.ambience.volume = 0;
  ui.ambience.play().catch(() => {});
  fadeAmbience(AMBIENCE_VOLUME, 3000);

  session = { playing: true, context, source: null };

  ui.compose.hidden = true;
  ui.player.hidden = false;
  ui.status.textContent = 'Writing your meditation…';
  ui.spoken.classList.add('resting');
  ui.spoken.textContent = 'settle in';
  ui.bar.style.width = '0';

  try {
    const script = await postJson('/api/script', { intention, voiceId: chosenVoice.id });
    if (!session?.playing) return;
    await run(script, context);
  } catch (error) {
    stop();
    showError(error.message);
  }
}

function stop() {
  if (session) {
    session.playing = false;
    try {
      session.source?.stop();
    } catch {}
    session.context.close();
    session = null;
  }

  fadeAmbience(0, 800);
  ui.player.hidden = true;
  ui.compose.hidden = false;
  ui.start.disabled = false;
  ui.start.textContent = 'Make my two minutes';
  ui.toggle.disabled = true;
  ui.toggle.textContent = 'Pause';
}

function showError(message) {
  ui.error.textContent = message;
  ui.error.hidden = false;
}

ui.start.addEventListener('click', begin);
ui.stop.addEventListener('click', stop);

ui.toggle.addEventListener('click', async () => {
  if (!session) return;
  if (session.context.state === 'running') {
    await session.context.suspend();
    ui.ambience.pause();
    ui.toggle.textContent = 'Resume';
  } else {
    await session.context.resume();
    ui.ambience.play().catch(() => {});
    ui.toggle.textContent = 'Pause';
  }
});

loadOptions().catch(() => showError('Could not reach the server. Reload and try again.'));
