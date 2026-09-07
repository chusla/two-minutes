import crypto from 'node:crypto';

// /api/script mints a ticket over the exact lines it generated. /api/speak will only
// voice a line that appears in a valid ticket. Without this, /api/speak is an open
// text-to-speech proxy on someone else's ElevenLabs quota.
//
// Stateless on purpose: no database, no session store, nothing to deploy.

const TICKET_TTL_MS = 20 * 60 * 1000; // a meditation is ~2 min; 20 is generous

function secret() {
  // A dedicated secret is better, but derive a stable one so a fresh fork works
  // with nothing but the two API keys set.
  const source = process.env.SIGNING_SECRET || process.env.ELEVENLABS_API_KEY || '';
  if (!source) throw new Error('SIGNING_SECRET or ELEVENLABS_API_KEY must be set.');
  return crypto.createHash('sha256').update(`two-minutes:${source}`).digest();
}

const hmac = (payload) => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

export function mintTicket({ lines, voiceId }) {
  const payload = JSON.stringify({
    v: 1,
    exp: Date.now() + TICKET_TTL_MS,
    voiceId,
    // Hash each line rather than carrying the text, so the ticket stays small.
    lines: lines.map((line) => hmac(line.text)),
  });
  const body = Buffer.from(payload).toString('base64url');
  return `${body}.${hmac(body)}`;
}

export function verifyTicket(ticket, { text, voiceId }) {
  if (typeof ticket !== 'string' || !ticket.includes('.')) return false;

  const [body, signature] = ticket.split('.');
  const expected = hmac(body);
  if (signature.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;

  let claims;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return false;
  }

  if (claims.v !== 1 || Date.now() > claims.exp) return false;
  if (claims.voiceId !== voiceId) return false;
  return claims.lines.includes(hmac(text));
}
