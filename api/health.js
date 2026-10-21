import { handleRequest } from '../src/server.js';

/** /api/health (rewritten from /health on Vercel). */
export default function handler(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  req.url = '/health' + url.search;
  return handleRequest(req, res);
}
