// POST /api/admin/toys/:id/generate  { kind: 'stylized' | 'coloring' }
// stylized: product photo → storybook illustration
// coloring: storybook illustration → black-and-white outline (so the two match)
import { getToyRow, PROMPTS, shapeToy } from '../../../../../lib/catalog.js';
import { generateImage } from '../../../../../lib/gemini.js';
import { HttpError, json, readJson } from '../../../../../lib/http.js';
import { deleteImages, getImage, putImage } from '../../../../../lib/images.js';

export async function onRequestPost({ request, env, params }) {
  const toy = await getToyRow(env.DB, params.id);
  const { kind } = await readJson(request);
  if (!['stylized', 'coloring'].includes(kind)) throw new HttpError(400, 'kind must be stylized or coloring');

  const inputKey = kind === 'stylized' ? toy.source_key : toy.stylized_key;
  if (!inputKey) {
    throw new HttpError(400, kind === 'coloring' ? 'Make the storybook picture first' : 'This toy has no photo');
  }
  const input = await getImage(env, inputKey);
  if (!input) throw new HttpError(404, 'The input picture is missing from storage');

  let output;
  try {
    output = await generateImage(env, { prompt: PROMPTS[kind], image: input, label: kind });
  } catch (err) {
    await env.DB.prepare(`UPDATE toys SET gen_error = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(String(err.message).slice(0, 300), toy.id).run();
    throw err;
  }

  const column = kind === 'stylized' ? 'stylized_key' : 'coloring_key';
  const newKey = await putImage(env, `toys/${toy.id}/${kind}`, output.bytes, output.mime);
  await env.DB.prepare(
    `UPDATE toys SET ${column} = ?, gen_error = NULL, updated_at = datetime('now') WHERE id = ?`,
  ).bind(newKey, toy.id).run();
  // A new storybook picture makes the old cutout stale; parent mode makes a fresh one.
  if (kind === 'stylized' && toy.cutout_key) {
    await env.DB.prepare('UPDATE toys SET cutout_key = NULL WHERE id = ?').bind(toy.id).run();
  }
  await deleteImages(env, toy[column], kind === 'stylized' ? toy.cutout_key : null);
  return json({ toy: shapeToy(await getToyRow(env.DB, toy.id)) });
}
