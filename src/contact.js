// Formulario de contacto: POST /api/contact -> correo al buzón del equipo.
import { EmailMessage } from 'cloudflare:email';
import { json } from './lib/util.js';

const LIMITS = { name: 100, email: 200, org: 150, reason: 60, message: 5000 };
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export async function handleContact(request, env, url) {
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return json({ ok: false, error: 'forbidden' }, 403);

  const isJson = (request.headers.get('Content-Type') || '').includes('application/json');
  let data;
  try {
    data = isJson ? await request.json() : Object.fromEntries(await request.formData());
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  // Campo trampa para bots: si viene lleno, fingimos éxito y no enviamos nada.
  if (data.website) return done(isJson, url);

  const f = {};
  for (const k of Object.keys(LIMITS)) f[k] = String(data[k] ?? '').trim().slice(0, LIMITS[k]);
  if (!f.name || !f.message || !EMAIL_RE.test(f.email)) return json({ ok: false, error: 'invalid' }, 422);

  if (!env.CONTACT_TO || !env.CONTACT_FROM) {
    console.error('Falta CONTACT_TO o CONTACT_FROM');
    return json({ ok: false, error: 'not_configured' }, 503);
  }

  const body = [
    `Nombre: ${f.name}`,
    `Email: ${f.email}`,
    `Organización: ${f.org || '-'}`,
    `Motivo: ${f.reason || '-'}`,
    '',
    f.message,
    '',
    '--',
    'Enviado desde el formulario de lorenalopezfoundation.org',
  ].join('\n');

  const raw = mimeMessage({
    from: env.CONTACT_FROM,
    to: env.CONTACT_TO,
    replyTo: f.email,
    subject: `Contacto web: ${f.reason || 'Mensaje'} - ${f.name}`,
    text: body,
  });

  try {
    await env.EMAIL.send(new EmailMessage(env.CONTACT_FROM, env.CONTACT_TO, raw));
  } catch (err) {
    console.error('Error enviando correo', err);
    return json({ ok: false, error: 'send_failed' }, 502);
  }
  return done(isJson, url);
}

function done(isJson, url) {
  return isJson ? json({ ok: true }) : Response.redirect(new URL('/?enviado=1#contact', url), 303);
}

// Mensaje RFC 5322 en texto plano UTF-8. Los encabezados no aceptan saltos de línea
// para evitar inyección de encabezados.
function mimeMessage({ from, to, replyTo, subject, text }) {
  const clean = (s) => String(s).replace(/[\r\n]+/g, ' ');
  const domain = from.split('@')[1];
  const headers = [
    `From: "Formulario web" <${clean(from)}>`,
    `To: <${clean(to)}>`,
    `Reply-To: <${clean(replyTo)}>`,
    `Subject: ${encodeHeader(clean(subject))}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ];
  const b64 = base64(text).replace(/.{76}/g, '$&\r\n');
  return headers.join('\r\n') + '\r\n\r\n' + b64 + '\r\n';
}

function encodeHeader(s) {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${base64(s)}?=`;
}

function base64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
