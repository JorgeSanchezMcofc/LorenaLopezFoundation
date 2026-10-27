// API pública: solo niños publicados y solo campos públicos.
// Nunca expone notas, autorización del tutor, avisos ni bitácora.
import { json, error, parseJsonArray } from './lib/util.js';

const PUBLIC_CACHE = { 'Cache-Control': 'public, max-age=60', 'X-Robots-Tag': 'noindex' };

export async function handlePublicApi(request, env, url) {
  if (request.method !== 'GET') return error('method_not_allowed', 405);
  if (url.pathname === '/api/ninos') return listPublished(env);
  const m = url.pathname.match(/^\/api\/ninos\/(nino-\d{3,})$/);
  if (m) return getPublished(env, m[1]);
  return error('not_found', 404);
}

export async function listPublished(env) {
  const { results: children } = await env.DB.prepare("SELECT * FROM children WHERE status = 'published' ORDER BY seq").all();
  const { results: gifts } = await env.DB.prepare(
    "SELECT g.* FROM gifts g JOIN children c ON c.id = g.child_id WHERE c.status = 'published' ORDER BY g.child_id, g.position, g.id",
  ).all();
  const byChild = new Map();
  for (const g of gifts) (byChild.get(g.child_id) || byChild.set(g.child_id, []).get(g.child_id)).push(g);
  return json({ ok: true, children: children.map((c) => publicView(c, byChild.get(c.id) || [])) }, 200, PUBLIC_CACHE);
}

async function getPublished(env, slug) {
  const child = await findPublished(env, slug);
  if (!child) return error('not_found', 404);
  const { results: gifts } = await env.DB.prepare('SELECT * FROM gifts WHERE child_id = ? ORDER BY position, id').bind(child.id).all();
  return json({ ok: true, child: publicView(child, gifts) }, 200, PUBLIC_CACHE);
}

export async function findPublished(env, slug) {
  return env.DB.prepare("SELECT * FROM children WHERE slug = ? AND status = 'published'").bind(slug).first();
}

export function publicView(c, gifts) {
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
    image: c.image_key ? imageUrl(c.image_key) : null,
    thumb: c.thumb_key ? imageUrl(c.thumb_key) : null,
    gifts: gifts.map((g) => ({ id: g.id, title_es: g.title_es, title_en: g.title_en, url: g.url, status: g.status })),
  };
}

// public/NINO-001/<uuid>.jpg -> /img/ninos/NINO-001/<uuid>.jpg
function imageUrl(key) {
  return '/img/ninos/' + key.replace(/^public\//, '');
}

// Las caricaturas solo se sirven si el niño está publicado y la imagen es la vigente.
export async function servePublicImage(request, env, url) {
  const m = url.pathname.match(/^\/img\/ninos\/(NINO-\d{3,})\/([0-9a-f-]{36}(?:-600)?\.(?:jpg|png|webp))$/);
  if (!m || request.method !== 'GET') return error('not_found', 404);
  const key = `public/${m[1]}/${m[2]}`;
  const child = await env.DB.prepare("SELECT image_key, thumb_key FROM children WHERE id = ? AND status = 'published'").bind(m[1]).first();
  if (!child || (child.image_key !== key && child.thumb_key !== key)) return error('not_found', 404);
  const obj = await env.IMAGES.get(key);
  if (!obj) return error('not_found', 404);
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
      'X-Robots-Tag': 'noindex',
    },
  });
}
