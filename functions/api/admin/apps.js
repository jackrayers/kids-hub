// GET /api/admin/apps → the app registry (for parent mode switches).
import { APPS } from '../../../lib/apps.js';
import { json } from '../../../lib/http.js';

export function onRequestGet() {
  return json({ apps: APPS });
}
