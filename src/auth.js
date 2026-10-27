// Login de administradores con Cloudflare Access.
// Access pide el correo y manda un código de un solo uso; luego agrega a cada petición
// el encabezado Cf-Access-Jwt-Assertion. Aquí verificamos esa firma (por si alguien
// llegara al Worker sin pasar por Access) y que el correo esté en ADMIN_EMAILS.
import { isLocalhost } from './lib/util.js';

let certCache = { at: 0, keys: [] };
const CERT_TTL_MS = 60 * 60 * 1000;

// Devuelve el correo del admin o null.
export async function getAdmin(request, env, url) {
  // Solo en desarrollo local (wrangler dev) se puede simular un admin.
  if (env.DEV_ADMIN_EMAIL && isLocalhost(url)) return env.DEV_ADMIN_EMAIL.toLowerCase();

  const team = (env.ACCESS_TEAM_DOMAIN || '').replace(/\/$/, '');
  const allowed = parseAllowed(env.ADMIN_EMAILS);
  if (!team || !env.ACCESS_AUD || allowed.size === 0) return null; // sin configuración: nadie entra

  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  const payload = await verifyAccessJwt(token, team, env.ACCESS_AUD);
  const email = String(payload?.email || '').toLowerCase();
  return email && allowed.has(email) ? email : null;
}

export function parseAllowed(list) {
  return new Set(String(list || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export async function verifyAccessJwt(token, team, aud, now = Date.now()) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header, payload;
  try {
    header = JSON.parse(b64urlToString(parts[0]));
    payload = JSON.parse(b64urlToString(parts[1]));
  } catch {
    return null;
  }
  if (header.alg !== 'RS256') return null;

  const jwk = await findKey(team, header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1]),
  );
  if (!valid) return null;

  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  const secs = Math.floor(now / 1000);
  if (!auds.includes(aud)) return null;
  if (payload.iss !== team) return null;
  if (typeof payload.exp !== 'number' || payload.exp < secs) return null;
  if (typeof payload.nbf === 'number' && payload.nbf > secs + 60) return null;
  return payload;
}

async function findKey(team, kid) {
  const fresh = Date.now() - certCache.at < CERT_TTL_MS;
  let key = fresh && certCache.keys.find((k) => k.kid === kid);
  if (key) return key;
  // Clave desconocida o caché vencida: volver a descargar (Access rota sus llaves).
  const res = await fetch(`${team}/cdn-cgi/access/certs`);
  if (!res.ok) return null;
  const { keys = [] } = await res.json();
  certCache = { at: Date.now(), keys };
  return keys.find((k) => k.kid === kid) || null;
}

export function _resetCertCache() {
  certCache = { at: 0, keys: [] };
}

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToString(s) {
  return new TextDecoder().decode(b64urlToBytes(s));
}
