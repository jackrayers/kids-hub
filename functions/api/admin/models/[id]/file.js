// GET /api/admin/models/:id/file → downloads the original PrusaSlicer project.
import { HttpError } from '../../../../../lib/http.js';
import { getModelRow } from '../../../../../lib/printshop.js';

export async function onRequestGet({ env, params }) {
  const model = await getModelRow(env.DB, params.id);
  const obj = await env.IMAGES.get(model.file_key);
  if (!obj) throw new HttpError(404, 'File missing from storage');
  const name = (model.file_name || `${model.title}.3mf`).replace(/["\\]/g, '');
  return new Response(obj.body, {
    headers: {
      'content-type': 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'private, no-store',
    },
  });
}
