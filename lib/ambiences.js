// Three ambient beds, streamed from Whitespace's public track storage.
//
// These three loops were composed with the ElevenLabs Music API and are the same
// beds the Whitespace app uses. They are NOT covered by this repository's MIT
// licence — see the Audio assets section of the README. The code is yours; the
// music is provided for use with this demo.

export const AMBIENCES = [
  {
    id: 'fields_of_grace',
    name: 'Fields of Grace',
    description: 'Felt upright piano, slow major-seventh chords over soft strings.',
    url: 'https://auth.trywhitespace.com/storage/v1/object/public/background-tracks/fields_of_grace-loop.mp3',
  },
  {
    id: 'resonant_grace',
    name: 'Resonant Grace',
    description: 'Warm Rhodes with a slow tremolo over an analog pad.',
    url: 'https://auth.trywhitespace.com/storage/v1/object/public/background-tracks/resonant_grace-loop.mp3',
  },
  {
    id: 'overtones_of_affirmation',
    name: 'Overtones of Affirmation',
    description: 'Analog pads with singing-bowl overtones. No rhythm, no attacks.',
    url: 'https://auth.trywhitespace.com/storage/v1/object/public/background-tracks/overtones_of_affirmation-loop.mp3',
  },
];

// Three Whitespace voices, one per temperament.
export const VOICES = [
  { id: 'ROMJ9yK1NAMuu1ggrjDW', name: 'Noa', description: 'Gentle companion for winding down.' },
  { id: 'wgHvco1wiREKN0BdyVx5', name: 'Soren', description: 'Deep and grounding, like still water.' },
  { id: '8quEMRkSpwEaWBzHvTLv', name: 'Alma', description: 'Warm presence, unhurried and close.' },
];

export const VOICE_IDS = new Set(VOICES.map((v) => v.id));
export const DEFAULT_VOICE_ID = VOICES[0].id;
