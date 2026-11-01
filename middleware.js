import { next } from '@vercel/functions';
import { authenticate } from './server/auth.js';

export const config = { runtime: 'nodejs' };

// No path exclusions: the image and JavaScript require a session too.
export default async function middleware(request) {
  return await authenticate(request) ?? next({
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
