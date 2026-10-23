import { handleRequest } from '../../src/server.js';

/** POST /api/demo/advance — explicit Vercel route (nested paths are unreliable on catch-all alone). */
export default function handler(req, res) {
  req.url = '/api/demo/advance';
  return handleRequest(req, res);
}
