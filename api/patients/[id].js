import { handleRequest } from '../../src/server.js';

/** /api/patients/:id — Vercel dynamic route (nested paths miss the catch-all). */
export default function handler(req, res) {
  const id = req.query?.id;
  const q = String(req.url || '').includes('?') ? '?' + String(req.url).split('?')[1] : '';
  req.url = `/api/patients/${encodeURIComponent(String(id || ''))}${q}`;
  return handleRequest(req, res);
}
