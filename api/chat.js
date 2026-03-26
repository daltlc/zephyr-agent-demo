/**
 * Vercel serverless proxy for the <z-agent> widget.
 * Forwards chat requests to the Anthropic API, keeping the API key on the server.
 *
 * Security: rate limiting, origin validation, model lockdown, payload caps.
 */

/* ── Rate limiter (in-memory, per serverless instance) ── */
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 1024;
const MAX_MESSAGES = 30;
const RATE_WINDOW_MS = 60_000;   // 1 minute
const RATE_MAX_REQUESTS = 10;    // per IP per window

const hits = new Map(); // ip → { count, resetAt }

function isRateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);

  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_MAX_REQUESTS;
}

/* ── Allowed origins ── */
const ALLOWED_ORIGINS = [
  'https://zephyr-agent-demo.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some(
    allowed => origin === allowed || origin.endsWith('.vercel.app')
  );
}

/* ── Handler ── */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Origin check — block random curl / cross-site requests
  const origin = req.headers['origin'] || req.headers['referer'] || '';
  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Rate limit by IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured' });
  }

  const { messages, tools, system } = req.body;

  // Validate payload — cap message history to prevent abuse
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }
  const trimmedMessages = messages.slice(-MAX_MESSAGES);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,          // locked — ignores client-sent model
        max_tokens: MAX_TOKENS,
        system,
        messages: trimmedMessages,
        tools,
      }),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach Anthropic API' });
  }
}
