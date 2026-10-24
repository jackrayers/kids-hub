import { authenticateDevice } from '../../../lib/auth.js';

export async function onRequest(context) {
  context.data.device = await authenticateDevice(context.request, context.env);
  return context.next();
}
