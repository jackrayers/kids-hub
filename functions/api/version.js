// GET /api/version → the deployed commit, so open tablets can reload themselves after a deploy.
import { json } from '../../lib/http.js';

export function onRequestGet({ env }) {
  return json({ version: env.CF_PAGES_COMMIT_SHA || 'dev' });
}
