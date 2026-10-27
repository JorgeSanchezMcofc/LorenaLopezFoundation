// API privada del panel de administración (/api/admin/*).
import { getAdmin } from './auth.js';
import { generateProfile, generateCaricature, AiError } from './ai.js';
import { detectFormat, stripMetadata, CONTENT_TYPES, EXTENSIONS } from './lib/images.js';
import { toCsv } from './lib/csv.js';
import { json, error, nowIso, childIdFromSeq, slugFromId, cleanText, parseJsonArray, checkAmazonUrl } from './lib/util.js';

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_THUMB_BYTES = 400 * 1024;
const MAX_GIFTS = 6;

export async function handleAdmin(request, env, url) {
  const admin = await getAdmin(request, env, url);
  if (!admin) return error('unauthorized', 401);

  const origin = request.headers.get('Origin');
  if (request.method !== 'GET' && origin && origin !== url.origin) return error('forbidden', 403);

  const path = url.pathname.replace(/^\/api\/admin/, '');
  const m = request.method;
  const ctx = { request, env, url, admin };
  let match;

  if (path === '/me' && m === 'GET') return json({ ok: true, email: admin });
  if (path === '/children' && m === 'GET') return listChildren(ctx);
  if (path === '/children' && m === 'POST') return createChild(ctx);
  if (path === '/export.csv' && m === 'GET') return exportCsv(ctx);
  if ((match = path.match(/^\/gifts\/(\d+)$/)) && m === 'PATCH') return setGiftStatus(ctx, Number(match[1]));

  if ((match = path.match(/^\/children\/(NINO-\d{3,})(\/[a-z-]+(?:\/[a-z]+)?)?$/))) {
    const child = await getChild(env, match[1]);
    if (!child) return error('not_found', 404);
    const action = match[2] || '';
    if (action === '' && m === 'GET') return json({ ok: true, child: await childView(env, child) });
    if (action === '' && m === 'PATCH') return updateChild(ctx, child);
    if (action === '' && m === 'DELETE') return deleteChild(ctx, child);
    if (action === '/gifts' && m === 'PUT') return replaceGifts(ctx, child);
    if (action === '/generate-text' && m === 'POST') return generateText(ctx, child);
    if (action === '/generate-image' && m === 'POST') return generateImage(ctx, child);
    if (action === '/approve-image' && m === 'POST') return approveImage(ctx, child);
    if (action === '/publish' && m === 'POST') return publish(ctx, child);
    if (action === '/unpublish' && m === 'POST') return unpublish(ctx, child);
    const img = action.match(/^\/image\/(draft|main|thumb)$/);
    if (img && m === 'GET') return serveChildImage(env, child, img[1]);
  }
  return error('not_found', 404);
}

// --- LECTURA ---

async function getChild(env, id) {
  return env.DB.prepare('SELECT * FROM children WHERE id = ?').bind(id).first();
}

async function getGifts(env, childId) {
  const { results } = await env.DB.prepare('SELECT * FROM gifts WHERE child_id = ? ORDER BY position, id').bind(childId).all();
  return results;
}

async function childView(env, c, gifts) {
  gifts = gifts || (await getGifts(env, c.id));
  const base = `/api/admin/children/${c.id}/image`;
  return {
    id: c.id,
    slug: c.slug,
    first_name: c.first_name,
    age: c.age,
    grade_es: c.grade_es,
    grade_en: c.grade_en,
    interests: parseJsonArray(c.interests),
    profile_es: c.profile_es,
    profile_en: c.profile_en,
    notes: c.notes,
    privacy_warnings: parseJsonArray(c.privacy_warnings),
    guardian_ok: !!c.guardian_ok,
    status: c.status,
    published_at: c.published_at,
    published_by: c.published_by,
    created_at: c.created_at,
    updated_at: c.updated_at,
    image_url: c.image_key ? `${base}/main?v=${encodeURIComponent(c.image_key)}` : null,
    thumb_url: c.thumb_key ? `${base}/thumb?v=${encodeURIComponent(c.thumb_key)}` : null,
    draft_image_url: c.draft_image_key ? `${base}/draft?v=${encodeURIComponent(c.draft_image_key)}` : null,
    public_url: `/ninos/${c.slug}`,
    gifts: gifts.map(giftView),
    problems: publishProblems(c, gifts),
  };
}

function giftView(g) {
  return {
    id: g.id,
    title_es: g.title_es,
    title_en: g.title_en,
    url: g.url,
    from_list: checkAmazonUrl(g.url).fromList || false,
    status: g.status,
    gifted_at: g.gifted_at,
  };
}

async function listChildren({ env }) {
  const { results: children } = await env.DB.prepare('SELECT * FROM children ORDER BY seq').all();
  const { results: gifts } = await env.DB.prepare('SELECT * FROM gifts ORDER BY child_id, position, id').all();
  const byChild = groupBy(gifts);
  const list = await Promise.all(children.map((c) => childView(env, c, byChild.get(c.id) || [])));
  return json({ ok: true, children: list });
}

function groupBy(gifts) {
  const m = new Map();
  for (const g of gifts) (m.get(g.child_id) || m.set(g.child_id, []).get(g.child_id)).push(g);
  return m;
}

// --- CREAR / EDITAR ---

async function createChild(ctx) {
  const { env, admin } = ctx;
  const body = await readJson(ctx.request);
  if (!body) return error('bad_request', 400);
  const notes = cleanText(body.notes, 3000);
  const gifts = validateGifts(body.gifts || []);
  if (gifts.error) return json({ ok: false, error: 'invalid_gifts', detail: gifts.error }, 422);

  const row = await env.DB.prepare("UPDATE counters SET value = value + 1 WHERE name = 'child' RETURNING value").first();
  const seq = row.value;
  const id = childIdFromSeq(seq);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO children (id, seq, slug, notes) VALUES (?, ?, ?, ?)').bind(id, seq, slugFromId(id), notes),
    ...gifts.items.map((g, i) =>
      env.DB.prepare('INSERT INTO gifts (child_id, position, title_es, title_en, url) VALUES (?, ?, ?, ?, ?)').bind(id, i, g.title_es, g.title_en, g.url),
    ),
    audit(env, admin, 'create', id),
  ]);
  const child = await getChild(env, id);
  return json({ ok: true, child: await childView(env, child) }, 201);
}

const TEXT_FIELDS = { first_name: 40, grade_es: 40, grade_en: 40, profile_es: 1200, profile_en: 1200, notes: 3000 };

async function updateChild(ctx, child) {
  const { env, admin } = ctx;
  const body = await readJson(ctx.request);
  if (!body) return error('bad_request', 400);
  const sets = [];
  const vals = [];
  for (const [k, max] of Object.entries(TEXT_FIELDS)) {
    if (k in body) {
      let v = cleanText(body[k], max);
      if (k === 'first_name') v = v.split(/\s+/).slice(0, 2).join(' '); // solo primer nombre
      sets.push(`${k} = ?`);
      vals.push(v);
    }
  }
  if ('age' in body) {
    const age = body.age === null || body.age === '' ? null : Number(body.age);
    if (age !== null && !(Number.isInteger(age) && age >= 0 && age < 25)) return json({ ok: false, error: 'invalid', detail: 'age' }, 422);
    sets.push('age = ?');
    vals.push(age);
  }
  if ('interests' in body) {
    if (!Array.isArray(body.interests)) return json({ ok: false, error: 'invalid', detail: 'interests' }, 422);
    const interests = body.interests
      .map((x) => ({ es: cleanText(x?.es, 30).toLowerCase(), en: cleanText(x?.en, 30).toLowerCase() }))
      .filter((x) => x.es && x.en)
      .slice(0, 5);
    sets.push('interests = ?');
    vals.push(JSON.stringify(interests));
  }
  if ('privacy_warnings' in body && Array.isArray(body.privacy_warnings)) {
    sets.push('privacy_warnings = ?');
    vals.push(JSON.stringify(body.privacy_warnings.map((s) => cleanText(s, 200)).filter(Boolean).slice(0, 10)));
  }
  if ('guardian_ok' in body) {
    const ok = body.guardian_ok ? 1 : 0;
    sets.push('guardian_ok = ?');
    vals.push(ok);
    // Sin autorización del tutor el perfil no puede seguir publicado.
    if (!ok && child.status === 'published') sets.push("status = 'draft'", 'published_at = NULL', 'published_by = NULL');
  }
  if (sets.length === 0) return json({ ok: true, child: await childView(env, child) });

  sets.push('updated_at = ?');
  vals.push(nowIso());
  await env.DB.batch([
    env.DB.prepare(`UPDATE children SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, child.id),
    audit(env, admin, 'update', child.id, Object.keys(body).filter((k) => k in TEXT_FIELDS || ['age', 'interests', 'guardian_ok'].includes(k)).join(',')),
  ]);
  return json({ ok: true, child: await childView(env, await getChild(env, child.id)) });
}

function validateGifts(list) {
  if (!Array.isArray(list)) return { error: 'gifts' };
  if (list.length > MAX_GIFTS) return { error: 'too_many' };
  const items = [];
  for (const [i, g] of list.entries()) {
    const title_es = cleanText(g?.title_es ?? g?.title, 120);
    const title_en = cleanText(g?.title_en, 120);
    const check = checkAmazonUrl(g?.url);
    if (!title_es) return { error: `title_${i}` };
    if (!check.ok) return { error: `url_${i}` };
    items.push({ id: Number.isInteger(g?.id) ? g.id : null, title_es, title_en, url: check.url });
  }
  return { items };
}

async function replaceGifts(ctx, child) {
  const { env, admin } = ctx;
  const body = await readJson(ctx.request);
  const gifts = validateGifts(body?.gifts);
  if (gifts.error) return json({ ok: false, error: 'invalid_gifts', detail: gifts.error }, 422);

  // Conserva el estado (disponible / regalado) de los regalos que ya existían.
  const existing = new Set((await getGifts(env, child.id)).map((g) => g.id));
  const keep = new Set(gifts.items.filter((g) => g.id && existing.has(g.id)).map((g) => g.id));
  const stmts = [];
  for (const id of existing) if (!keep.has(id)) stmts.push(env.DB.prepare('DELETE FROM gifts WHERE id = ?').bind(id));
  gifts.items.forEach((g, i) => {
    if (g.id && keep.has(g.id)) {
      stmts.push(env.DB.prepare('UPDATE gifts SET position = ?, title_es = ?, title_en = ?, url = ? WHERE id = ? AND child_id = ?').bind(i, g.title_es, g.title_en, g.url, g.id, child.id));
    } else {
      stmts.push(env.DB.prepare('INSERT INTO gifts (child_id, position, title_es, title_en, url) VALUES (?, ?, ?, ?, ?)').bind(child.id, i, g.title_es, g.title_en, g.url));
    }
  });
  stmts.push(env.DB.prepare('UPDATE children SET updated_at = ? WHERE id = ?').bind(nowIso(), child.id));
  stmts.push(audit(env, admin, 'gifts', child.id, String(gifts.items.length)));
  await env.DB.batch(stmts);
  return json({ ok: true, child: await childView(env, await getChild(env, child.id)) });
}

async function setGiftStatus(ctx, giftId) {
  const { env, admin } = ctx;
  const body = await readJson(ctx.request);
  const status = body?.status;
  if (status !== 'available' && status !== 'gifted') return json({ ok: false, error: 'invalid', detail: 'status' }, 422);
  const gift = await env.DB.prepare('SELECT * FROM gifts WHERE id = ?').bind(giftId).first();
  if (!gift) return error('not_found', 404);
  await env.DB.batch([
    env.DB.prepare('UPDATE gifts SET status = ?, gifted_at = ? WHERE id = ?').bind(status, status === 'gifted' ? nowIso() : null, giftId),
    audit(env, admin, 'gift_' + status, gift.child_id, String(giftId)),
  ]);
  const updated = await env.DB.prepare('SELECT * FROM gifts WHERE id = ?').bind(giftId).first();
  return json({ ok: true, gift: giftView(updated) });
}

// --- IA ---

// Devuelve sugerencias sin guardarlas: el admin las revisa, edita y guarda.
async function generateText(ctx, child) {
  const { env, url, admin } = ctx;
  const body = (await readJson(ctx.request)) || {};
  const notes = cleanText(body.notes ?? child.notes, 3000);
  if (!notes) return json({ ok: false, error: 'invalid', detail: 'notes' }, 422);
  const gifts = Array.isArray(body.gifts) ? body.gifts.map((g) => cleanText(g, 120)).filter(Boolean) : (await getGifts(env, child.id)).map((g) => g.title_es);
  try {
    const suggestion = await generateProfile(env, url, { notes, gifts });
    await audit(env, admin, 'generate_text', child.id).run();
    return json({ ok: true, suggestion });
  } catch (err) {
    return aiError(err);
  }
}

async function generateImage(ctx, child) {
  const { env, url, admin, request } = ctx;
  let form;
  try {
    form = await request.formData();
  } catch {
    return error('bad_request', 400);
  }
  const file = form.get('photo');
  if (!file || typeof file === 'string') return json({ ok: false, error: 'invalid', detail: 'photo' }, 422);
  if (file.size > MAX_PHOTO_BYTES) return json({ ok: false, error: 'too_large' }, 413);
  // La foto queda solo en esta variable; no se escribe en R2, D1 ni en los registros.
  const photo = new Uint8Array(await file.arrayBuffer());
  if (!detectFormat(photo)) return json({ ok: false, error: 'invalid', detail: 'photo_format' }, 422);

  let image;
  try {
    image = await generateCaricature(env, url, {
      photo,
      photoType: file.type,
      background: cleanText(form.get('background'), 200),
      extra: cleanText(form.get('extra'), 300),
    });
  } catch (err) {
    return aiError(err);
  }
  const format = detectFormat(image);
  const key = `drafts/${child.id}/${crypto.randomUUID()}.${EXTENSIONS[format]}`;
  await env.IMAGES.put(key, image, { httpMetadata: { contentType: CONTENT_TYPES[format] } });
  if (child.draft_image_key) await env.IMAGES.delete(child.draft_image_key);
  await env.DB.batch([
    env.DB.prepare('UPDATE children SET draft_image_key = ?, updated_at = ? WHERE id = ?').bind(key, nowIso(), child.id),
    audit(env, admin, 'generate_image', child.id, env.IMAGE_MODE === 'description' ? 'description' : 'photo'),
  ]);
  return json({ ok: true, child: await childView(env, await getChild(env, child.id)) });
}

// Usa la caricatura generada como la oficial. El panel puede mandar una versión
// ligera en WebP (campo "thumb") hecha en el navegador.
async function approveImage(ctx, child) {
  const { env, admin, request } = ctx;
  if (!child.draft_image_key) return json({ ok: false, error: 'no_draft' }, 409);
  const draft = await env.IMAGES.get(child.draft_image_key);
  if (!draft) return json({ ok: false, error: 'no_draft' }, 409);

  let thumb = null;
  if ((request.headers.get('Content-Type') || '').includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('thumb');
    if (file && typeof file !== 'string') {
      if (file.size > MAX_THUMB_BYTES) return json({ ok: false, error: 'too_large' }, 413);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (detectFormat(bytes) !== 'webp') return json({ ok: false, error: 'invalid', detail: 'thumb_format' }, 422);
      thumb = stripMetadata(bytes);
    }
  }

  const ext = child.draft_image_key.split('.').pop();
  const id = crypto.randomUUID();
  const imageKey = `public/${child.id}/${id}.${ext}`;
  const thumbKey = thumb ? `public/${child.id}/${id}-600.webp` : null;
  await env.IMAGES.put(imageKey, await draft.arrayBuffer(), { httpMetadata: draft.httpMetadata });
  if (thumb) await env.IMAGES.put(thumbKey, thumb, { httpMetadata: { contentType: 'image/webp' } });
  const old = [child.draft_image_key, child.image_key, child.thumb_key].filter(Boolean);
  await env.DB.batch([
    env.DB.prepare('UPDATE children SET image_key = ?, thumb_key = ?, draft_image_key = NULL, updated_at = ? WHERE id = ?').bind(imageKey, thumbKey, nowIso(), child.id),
    audit(env, admin, 'approve_image', child.id),
  ]);
  await env.IMAGES.delete(old);
  return json({ ok: true, child: await childView(env, await getChild(env, child.id)) });
}

async function serveChildImage(env, child, which) {
  const key = { draft: child.draft_image_key, main: child.image_key, thumb: child.thumb_key }[which];
  if (!key) return error('not_found', 404);
  const obj = await env.IMAGES.get(key);
  if (!obj) return error('not_found', 404);
  return new Response(obj.body, {
    headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'private, max-age=300' },
  });
}

// --- PUBLICAR ---

export function publishProblems(c, gifts) {
  const p = [];
  if (!c.guardian_ok) p.push('guardian');
  if (!c.first_name) p.push('first_name');
  if (c.age === null || c.age === undefined) p.push('age');
  if (!c.profile_es) p.push('profile_es');
  if (!c.profile_en) p.push('profile_en');
  if (!c.image_key) p.push('image');
  if (!gifts.length) p.push('gifts');
  return p;
}

async function publish(ctx, child) {
  const { env, admin } = ctx;
  const problems = publishProblems(child, await getGifts(env, child.id));
  if (problems.length) return json({ ok: false, error: 'not_ready', problems }, 409);
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare("UPDATE children SET status = 'published', published_at = ?, published_by = ?, updated_at = ? WHERE id = ?").bind(now, admin, now, child.id),
    audit(env, admin, 'publish', child.id),
  ]);
  return json({ ok: true, child: await childView(env, await getChild(env, child.id)) });
}

async function unpublish(ctx, child) {
  const { env, admin } = ctx;
  await env.DB.batch([
    env.DB.prepare("UPDATE children SET status = 'draft', published_at = NULL, published_by = NULL, updated_at = ? WHERE id = ?").bind(nowIso(), child.id),
    audit(env, admin, 'unpublish', child.id),
  ]);
  return json({ ok: true, child: await childView(env, await getChild(env, child.id)) });
}

// Borra el perfil y todas sus imágenes (por ejemplo, si el tutor retira la autorización).
async function deleteChild(ctx, child) {
  const { env, admin } = ctx;
  const listed = await env.IMAGES.list({ prefix: `drafts/${child.id}/` });
  const listedPublic = await env.IMAGES.list({ prefix: `public/${child.id}/` });
  const keys = [...listed.objects, ...listedPublic.objects].map((o) => o.key);
  if (keys.length) await env.IMAGES.delete(keys);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM gifts WHERE child_id = ?').bind(child.id),
    env.DB.prepare('DELETE FROM children WHERE id = ?').bind(child.id),
    audit(env, admin, 'delete', child.id),
  ]);
  return json({ ok: true });
}

// --- CSV ---

async function exportCsv({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.first_name, c.age, c.grade_es, c.status, c.guardian_ok,
            g.title_es, g.url, g.status AS gift_status, g.gifted_at
       FROM children c LEFT JOIN gifts g ON g.child_id = c.id
      ORDER BY c.seq, g.position, g.id`,
  ).all();
  const header = ['ID', 'Nombre', 'Edad', 'Grado', 'Perfil', 'Autorización tutor', 'Regalo', 'Link Amazon', 'Estado del regalo', 'Fecha regalado'];
  const rows = results.map((r) => [
    r.id,
    r.first_name,
    r.age ?? '',
    r.grade_es,
    r.status === 'published' ? 'Publicado' : 'Borrador',
    r.guardian_ok ? 'Sí' : 'No',
    r.title_es ?? '',
    r.url ?? '',
    r.gift_status === 'gifted' ? 'Ya fue regalado' : r.gift_status ? 'Disponible' : '',
    r.gifted_at ?? '',
  ]);
  const date = nowIso().slice(0, 10);
  return new Response(toCsv(header, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="adopta-un-regalo-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

// --- AUXILIARES ---

function audit(env, actor, action, childId, detail = null) {
  return env.DB.prepare('INSERT INTO audit_log (actor, action, child_id, detail) VALUES (?, ?, ?, ?)').bind(actor, action, childId, detail);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

const AI_STATUS = { ai_not_configured: 503, ai_busy: 429, ai_refused: 422, ai_failed: 502 };

function aiError(err) {
  if (err instanceof AiError) {
    console.error('IA:', err.code, err.detail || '');
    return json({ ok: false, error: err.code }, AI_STATUS[err.code] || 502);
  }
  if (err?.message === 'unsupported_image' || err?.message === 'bad_jpeg') return json({ ok: false, error: 'invalid', detail: 'photo_format' }, 422);
  throw err;
}
