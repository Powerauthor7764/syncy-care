import { handleRequest } from '../src/server.js';

/** Catch-all for /api/* single-segment routes on Vercel. */
export default function handler(req, res) {
  const parts = req.query?.path;
  if (parts != null) {
    const suffix = Array.isArray(parts) ? parts.join('/') : String(parts);
    const qs = String(req.url || '').includes('?') ? '?' + String(req.url).split('?')[1] : '';
    // Drop Vercel's internal path query when rebuilding the app pathname.
    const clean = qs
      .replace(/([?&])path=[^&]*/g, '$1')
      .replace(/[?&]$/, '')
      .replace(/\?&/, '?')
      .replace(/^&/, '?');
    req.url = `/api/${suffix}${clean === '?' ? '' : clean}`;
  }
  return handleRequest(req, res);
}
