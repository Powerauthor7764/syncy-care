import { handleRequest } from '../../src/server.js';

/** POST /api/demo/reset */
export default function handler(req, res) {
  req.url = '/api/demo/reset';
  return handleRequest(req, res);
}
