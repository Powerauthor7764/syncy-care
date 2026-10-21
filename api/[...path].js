import { handleRequest } from '../src/server.js';

/** Catch-all for /api/* on Vercel. */
export default function handler(req, res) {
  return handleRequest(req, res);
}
