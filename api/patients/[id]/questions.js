import { handleRequest } from '../../../src/server.js';

/** GET /api/patients/:id/questions */
export default function handler(req, res) {
  const id = req.query?.id;
  req.url = `/api/patients/${encodeURIComponent(String(id || ''))}/questions`;
  return handleRequest(req, res);
}
