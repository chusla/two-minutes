import { AMBIENCES, VOICES } from '../lib/ambiences.js';
import { LIMITS } from '../lib/prompt.js';

// One source of truth for voices and ambiences: the front end asks the server what
// it is allowed to pick, so a fork can change this list in one file.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).json({ voices: VOICES, ambiences: AMBIENCES, maxIntentionChars: LIMITS.maxIntentionChars });
}
