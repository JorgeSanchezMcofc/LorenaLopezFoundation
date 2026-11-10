// Utilidades compartidas por el Worker.

export function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export function error(code, status) {
  return json({ ok: false, error: code }, status);
}

export function isLocalhost(url) {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}

export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// NINO-001 / nino-001
export function childIdFromSeq(seq) {
  return 'NINO-' + String(seq).padStart(3, '0');
}

export function slugFromId(id) {
  return id.toLowerCase();
}

export function cleanText(value, max) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

export function parseJsonArray(text) {
  try {
    const v = JSON.parse(text || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Solo aceptamos enlaces de Amazon para evitar que un link malicioso llegue a la página pública.
const AMAZON_HOSTS = /^(www\.|smile\.)?amazon\.com$|^a\.co$|^amzn\.to$/i;

export function checkAmazonUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return { ok: false };
  }
  if (u.protocol !== 'https:' || !AMAZON_HOSTS.test(u.hostname)) return { ok: false };
  // Los artículos copiados desde una Lista de Deseos llevan colid/coliid: así Amazon envía a la dirección de la lista.
  const fromList = u.searchParams.has('colid') || u.searchParams.has('coliid') || /\/hz\/wishlist\//.test(u.pathname);
  return { ok: true, url: u.toString(), fromList };
}

// Precio en dólares ("29.99", 29.99) o en centavos. Vacío = sin precio (null). Inválido = undefined.
export function parsePriceCents(cents, dollars) {
  if (cents != null && cents !== '') {
    const n = Number(cents);
    return Number.isInteger(n) && n > 0 && n <= 1000000 ? n : undefined;
  }
  if (dollars == null || String(dollars).trim() === '') return null;
  const n = Number(String(dollars).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n <= 0 || n > 10000) return undefined;
  return Math.round(n * 100);
}

// Donativo sugerido: lo que cuestan los regalos que todavía nadie ha regalado.
export function totalCents(gifts) {
  return gifts.filter((g) => g.status !== 'gifted' && g.price_cents).reduce((sum, g) => sum + g.price_cents, 0);
}
