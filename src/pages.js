// Páginas públicas /navidad y /ninos/<slug>.
// Se arman a partir de la plantilla navidad/index.html: el Worker incrusta los datos publicados
// y las etiquetas Open Graph (las redes sociales no ejecutan JavaScript al crear la vista previa).
import { listPublishedData, findPublished, publicView } from './public.js';

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=60',
  'X-Robots-Tag': 'noindex', // los niños no deben aparecer en Google por su nombre
};

export async function handlePages(request, env, url) {
  const p = url.pathname;
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405 });
  if (p === '/navidad' || p === '/navidad/') return renderGallery(env, url);
  if (p === '/ninos' || p === '/ninos/') return Response.redirect(new URL('/navidad', url), 302);
  const m = p.match(/^\/ninos\/(nino-\d{3,})\/?$/);
  if (m) return renderChild(env, url, m[1]);
  // Cualquier otra ruta bajo /navidad (p. ej. /navidad/index.html) va a la galería.
  return Response.redirect(new URL('/navidad', url), 302);
}

async function renderGallery(env, url) {
  const children = await listPublishedData(env);
  return render(env, url, {
    mode: 'gallery',
    children,
    title: 'Adopta un Regalo · Sponsor a Child | The Lorena Lopez Foundation',
    description: 'Elige a un niño y regálale algo de su lista de Navidad en Amazon, o patrocínalo. Choose a child and send a Christmas gift from their Amazon list.',
    image: new URL('/assets/img/og-navidad.jpg', url).toString(),
    pageUrl: new URL('/navidad', url).toString(),
  });
}

async function renderChild(env, url, slug) {
  const row = await findPublished(env, slug);
  // Perfil no publicado o borrado: llevar a la galería en lugar de mostrar un error.
  if (!row) return Response.redirect(new URL('/navidad', url), 302);
  const { results: gifts } = await env.DB.prepare('SELECT * FROM gifts WHERE child_id = ? ORDER BY position, id').bind(row.id).all();
  const child = publicView(row, gifts);
  const img = child.og || child.image;
  return render(env, url, {
    mode: 'child',
    children: [child],
    title: `Adopta un regalo para ${child.first_name} · Sponsor ${child.first_name} | The Lorena Lopez Foundation`,
    description: firstSentences(child.profile_es, 200),
    image: img ? new URL(img, url).toString() : new URL('/assets/img/og-navidad.jpg', url).toString(),
    pageUrl: new URL(`/ninos/${child.slug}`, url).toString(),
  });
}

async function render(env, url, page) {
  const tpl = await env.ASSETS.fetch(new URL('/navidad/', url));
  if (!tpl.ok) return new Response('Plantilla no encontrada', { status: 500 });
  const data = JSON.stringify({ mode: page.mode, children: page.children }).replace(/</g, '\\u003c');
  const setMeta = (sel, value) => [sel, { element: (e) => e.setAttribute('content', value) }];
  const rewriter = new HTMLRewriter()
    .on('title', { element: (e) => e.setInnerContent(page.title) })
    .on(...setMeta('meta[name="description"]', page.description))
    .on(...setMeta('meta[property="og:title"]', page.title))
    .on(...setMeta('meta[property="og:description"]', page.description))
    .on(...setMeta('meta[property="og:image"]', page.image))
    .on(...setMeta('meta[property="og:url"]', page.pageUrl))
    .on('script#ninos-data', { element: (e) => e.setInnerContent(data, { html: true }) });
  const res = rewriter.transform(new Response(tpl.body, { headers: tpl.headers }));
  return new Response(res.body, { status: 200, headers: HEADERS });
}

function firstSentences(text, max) {
  const t = String(text || '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '));
  return end > 60 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…';
}
