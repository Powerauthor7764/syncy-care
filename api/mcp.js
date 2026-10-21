import { handleRequest } from '../src/server.js';

/** /api/mcp (rewritten from /mcp on Vercel). */
export default function handler(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  req.url = '/mcp' + url.search;
  return handleRequest(req, res);
}
