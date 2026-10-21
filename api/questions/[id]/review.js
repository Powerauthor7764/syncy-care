import { handleRequest } from '../../../src/server.js';

/** POST /api/questions/:id/review */
export default function handler(req, res) {
  const id = req.query?.id;
  req.url = `/api/questions/${encodeURIComponent(String(id || ''))}/review`;
  return handleRequest(req, res);
}
