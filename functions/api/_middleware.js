import { HttpError, json } from '../../lib/http.js';

// Turns thrown HttpErrors into JSON responses for every /api route.
export async function onRequest(context) {
  try {
    return await context.next();
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    const msg = String(err?.message || err);
    if (msg.includes('FOREIGN KEY constraint failed')) return json({ error: 'Referenced record does not exist' }, 400);
    if (msg.includes('UNIQUE constraint failed')) return json({ error: 'That already exists' }, 409);
    console.error(err);
    return json({ error: 'Something went wrong' }, 500);
  }
}
