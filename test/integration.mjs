// Prueba de punta a punta contra `npm run dev` con AI_MOCK=1 y DEV_ADMIN_EMAIL en .dev.vars.
// Uso: node test/integration.mjs [http://localhost:8787]
import assert from 'node:assert/strict';

const BASE = process.argv[2] || 'http://localhost:8787';
const H = { Origin: BASE };
const api = async (method, path, body, raw = false) => {
  const opts = { method, headers: { ...H } };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  const res = await fetch(BASE + path, opts);
  return raw ? res : { status: res.status, body: await res.json().catch(() => null) };
};
const step = (name) => console.log('✓', name);

// Imagen sintética (no es una foto real): JPEG mínimo de 1x1 con un segmento EXIF falso.
const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/4QAWRXhpZgAATU0AKgAAAAgAAAAAAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
// WebP mínimo válido (1x1) para la miniatura.
const webp = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64');

let r = await api('GET', '/api/admin/me');
assert.equal(r.status, 200); step(`login de desarrollo como ${r.body.email}`);

r = await api('POST', '/api/admin/children', {
  notes: 'Emilio, 9 años, cuarto grado, le gustan los carros, quiere un carrito de control remoto y un paquete de calcetines',
  gifts: [
    { title: 'Carrito de control remoto', url: 'https://www.amazon.com/dp/B000TEST01?colid=ABC123&coliid=XYZ789' },
    { title: 'Paquete de calcetines', url: 'https://www.amazon.com/dp/B000TEST02' },
  ],
});
assert.equal(r.status, 201);
const child = r.body.child;
assert.match(child.id, /^NINO-\d{3}$/);
assert.equal(child.gifts[0].from_list, true);
assert.equal(child.gifts[1].from_list, false);
step(`perfil creado ${child.id} (${child.gifts.length} regalos)`);
const C = `/api/admin/children/${child.id}`;

r = await api('POST', '/api/admin/children', { notes: 'x', gifts: [{ title: 'Malo', url: 'https://evil.example/dp/1' }] });
assert.equal(r.status, 422); step('rechaza links que no son de Amazon');

r = await api('POST', `${C}/generate-text`, {});
assert.equal(r.status, 200);
const s = r.body.suggestion;
assert.equal(s.first_name, 'Emilio'); assert.equal(s.age, 9);
r = await api('GET', C);
assert.equal(r.body.child.profile_es, ''); step('genera sugerencia de texto sin guardarla');

r = await api('PATCH', C, { first_name: s.first_name + ' Pérez García', age: s.age, grade_es: s.grade_es, grade_en: s.grade_en, interests: s.interests, profile_es: s.profile_es, profile_en: s.profile_en });
assert.equal(r.status, 200);
assert.equal(r.body.child.first_name, 'Emilio Pérez', 'recorta a 2 palabras');
r = await api('PATCH', C, { first_name: 'Emilio' });
step('guarda el texto editado');

r = await api('PUT', `${C}/gifts`, { gifts: child.gifts.map((g, i) => ({ id: g.id, title_es: g.title_es, title_en: s.gifts[i].en, url: g.url })) });
assert.equal(r.status, 200); assert.equal(r.body.child.gifts[0].id, child.gifts[0].id); step('actualiza regalos conservando sus IDs');

r = await api('POST', `${C}/publish`);
assert.equal(r.status, 409); assert.deepEqual(r.body.problems.sort(), ['guardian', 'image']); step('no publica sin autorización ni caricatura');

const fd = new FormData();
fd.append('photo', new Blob([jpeg], { type: 'image/jpeg' }), 'foto.jpg');
fd.append('background', 'toy race cars');
r = await api('POST', `${C}/generate-image`, fd);
assert.equal(r.status, 200); assert.ok(r.body.child.draft_image_url); assert.equal(r.body.child.image_url, null);
const draftUrl = r.body.child.draft_image_url;
let res = await api('GET', draftUrl, undefined, true);
assert.equal(res.status, 200); step('genera caricatura en borrador (privada)');

const fd2 = new FormData();
fd2.append('thumb', new Blob([webp], { type: 'image/webp' }), 'thumb.webp');
fd2.append('og', new Blob([jpeg], { type: 'image/jpeg' }), 'og.jpg');
r = await api('POST', `${C}/approve-image`, fd2);
assert.equal(r.status, 200); assert.ok(r.body.child.image_url); assert.ok(r.body.child.thumb_url); assert.equal(r.body.child.draft_image_url, null);
step('aprueba caricatura con miniatura WebP e imagen para redes');

r = await api('POST', `${C}/publish`);
assert.equal(r.status, 409); assert.deepEqual(r.body.problems, ['guardian']);
r = await api('PATCH', C, { guardian_ok: true });
r = await api('POST', `${C}/publish`);
assert.equal(r.status, 200); assert.equal(r.body.child.status, 'published'); assert.equal(r.body.child.published_by, 'jorge@example.com');
step('publica con autorización del tutor');

r = await api('GET', '/api/ninos');
assert.equal(r.status, 200);
const pub = r.body.children.find((c) => c.id === child.id);
assert.ok(pub);
for (const k of ['notes', 'guardian_ok', 'privacy_warnings', 'published_by', 'draft_image_url']) assert.ok(!(k in pub), `no expone ${k}`);
assert.equal(pub.first_name, 'Emilio');
res = await fetch(BASE + pub.image, { headers: H });
assert.equal(res.status, 200); assert.equal(res.headers.get('x-robots-tag'), 'noindex');
const imgBytes = new Uint8Array(await res.arrayBuffer());
res = await fetch(BASE + pub.thumb);
assert.equal(res.status, 200); assert.equal(res.headers.get('content-type'), 'image/webp');
res = await fetch(BASE + pub.og);
assert.equal(res.status, 200); assert.equal(res.headers.get('content-type'), 'image/jpeg');
const ogBytes = Buffer.from(await res.arrayBuffer());
assert.ok(!ogBytes.includes(Buffer.from('Exif')), 'og sin EXIF');
step('API pública sin datos internos; imágenes con noindex');

r = await api('GET', `/api/ninos/${child.slug}`);
assert.equal(r.status, 200); assert.equal(r.body.child.gifts.length, 2);

r = await api('PATCH', `/api/admin/gifts/${pub.gifts[0].id}`, { status: 'gifted' });
assert.equal(r.status, 200); assert.equal(r.body.gift.status, 'gifted');
r = await api('GET', `/api/ninos/${child.slug}`);
assert.equal(r.body.child.gifts[0].status, 'gifted'); step('marca regalo como "Ya fue regalado"');

res = await api('GET', '/api/admin/export.csv', undefined, true);
const csvBytes = new Uint8Array(await res.arrayBuffer());
const csv = new TextDecoder().decode(csvBytes);
assert.equal(res.status, 200); assert.deepEqual([...csvBytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'BOM para Excel'); assert.ok(csv.startsWith('ID,Nombre')); assert.ok(csv.includes('Ya fue regalado')); assert.ok(!csv.includes('cuarto grado, le gustan'), 'no exporta notas');
step('exporta CSV');

r = await api('PATCH', C, { guardian_ok: false });
assert.equal(r.body.child.status, 'draft');
r = await api('GET', '/api/ninos');
assert.ok(!r.body.children.some((c) => c.id === child.id));
res = await fetch(BASE + pub.image);
assert.equal(res.status, 404); step('quitar la autorización despublica y oculta la imagen');

r = await api('POST', `${C}/publish`, undefined);
assert.equal(r.status, 409);
res = await fetch(BASE + C, { method: 'PATCH', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
assert.equal(res.status, 403); step('rechaza peticiones desde otro sitio');

r = await api('DELETE', C);
assert.equal(r.status, 200);
r = await api('GET', C);
assert.equal(r.status, 404); step('borra el perfil y sus imágenes');

console.log('\nTodo bien. Imagen pública de prueba:', imgBytes.length, 'bytes');
