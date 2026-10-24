import { authenticateAdult } from '../../../lib/auth.js';

export async function onRequest(context) {
  context.data.adult = await authenticateAdult(context.request, context.env);
  return context.next();
}
