// Pruebas unitarias: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { stripMetadata, detectFormat } from '../src/lib/images.js';
import { toCsv } from '../src/lib/csv.js';
import { checkAmazonUrl, childIdFromSeq } from '../src/lib/util.js';
import { verifyAccessJwt, getAdmin, _resetCertCache } from '../src/auth.js';
import { publishProblems } from '../src/admin.js';

// --- Imágenes ---

const seg = (marker, text) => {
  const body = Buffer.from(text);
  const len = body.length + 2;
  return Buffer.concat([Buffer.from([0xff, marker, len >> 8, len & 0xff]), body]);
};

test('JPEG: quita EXIF, XMP, C2PA y comentarios, conserva JFIF, ICC e imagen', () => {
  const jpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, 'JFIF\0'),
    seg(0xe1, 'Exif\0\0GPS 26.2034N 98.2300W'),
    seg(0xe1, 'http://ns.adobe.com/xap/1.0/ XMP'),
    seg(0xe2, 'ICC_PROFILE\0'),
    seg(0xeb, 'JP c2pa manifest'),
    seg(0xfe, 'comentario'),
    seg(0xdb, 'DQT'),
    Buffer.from([0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0xaa, 0xbb, 0xff, 0xd9]),
  ]);
  const out = Buffer.from(stripMetadata(jpeg));
  const s = out.toString('latin1');
  assert.equal(detectFormat(out), 'jpeg');
  for (const gone of ['Exif', 'GPS', 'XMP', 'c2pa', 'comentario']) assert.ok(!s.includes(gone), gone);
  for (const kept of ['JFIF', 'ICC_PROFILE', 'DQT']) assert.ok(s.includes(kept), kept);
  assert.ok(out.subarray(-4).equals(Buffer.from([0xaa, 0xbb, 0xff, 0xd9])), 'datos de imagen intactos');
});

test('PNG: quita tEXt/eXIf y conserva IHDR/IDAT/IEND', () => {
  const chunk = (type, data) => {
    const d = Buffer.from(data);
    const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
    return Buffer.concat([len, Buffer.from(type), d, Buffer.alloc(4)]);
  };
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', 'x'.repeat(13)), chunk('tEXt', 'Author\0Secreto'), chunk('eXIf', 'gps'), chunk('caBX', 'c2pa'),
    chunk('IDAT', 'pixels'), chunk('IEND', ''),
  ]);
  const s = Buffer.from(stripMetadata(png)).toString('latin1');
  for (const gone of ['tEXt', 'Secreto', 'eXIf', 'caBX']) assert.ok(!s.includes(gone), gone);
  for (const kept of ['IHDR', 'IDAT', 'pixels', 'IEND']) assert.ok(s.includes(kept), kept);
});

test('WebP: quita EXIF/XMP, apaga banderas VP8X y corrige el tamaño RIFF', () => {
  const chunk = (type, data) => {
    const d = Buffer.from(data);
    const len = Buffer.alloc(4); len.writeUInt32LE(d.length);
    return Buffer.concat([Buffer.from(type), len, d, d.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)]);
  };
  const vp8x = Buffer.alloc(10); vp8x[0] = 0x08 | 0x04;
  const body = Buffer.concat([Buffer.from('WEBP'), chunk('VP8X', vp8x), chunk('VP8 ', 'imagen!'), chunk('EXIF', 'gps'), chunk('XMP ', 'xmp')]);
  const size = Buffer.alloc(4); size.writeUInt32LE(body.length);
  const out = Buffer.from(stripMetadata(Buffer.concat([Buffer.from('RIFF'), size, body])));
  const s = out.toString('latin1');
  assert.equal(detectFormat(out), 'webp');
  assert.ok(!s.includes('EXIF') && !s.includes('XMP '));
  assert.ok(s.includes('imagen!'));
  assert.equal(out.readUInt32LE(4), out.length - 8);
  assert.equal(out[20] & 0x0c, 0, 'banderas EXIF/XMP apagadas');
});

test('rechaza formatos desconocidos', () => {
  assert.throws(() => stripMetadata(Buffer.from('GIF89a....')), /unsupported_image/);
});

// --- CSV ---

test('CSV: BOM, comillas y protección contra fórmulas', () => {
  const csv = toCsv(['a', 'b'], [['=HYPERLINK("x")', 'hola, "mundo"'], ['+1', 'línea\nnueva']]);
  assert.ok(csv.startsWith('﻿a,b\r\n'));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(csv.includes('"hola, ""mundo"""'));
  assert.ok(csv.includes("'+1"));
  assert.ok(csv.includes('"línea\nnueva"'));
});

// --- Amazon y IDs ---

test('links de Amazon', () => {
  assert.deepEqual(checkAmazonUrl('https://www.amazon.com/dp/B01?colid=1&coliid=2'), { ok: true, url: 'https://www.amazon.com/dp/B01?colid=1&coliid=2', fromList: true });
  assert.equal(checkAmazonUrl('https://www.amazon.com/dp/B01').fromList, false);
  assert.equal(checkAmazonUrl('https://a.co/d/abc').ok, true);
  assert.equal(checkAmazonUrl('http://www.amazon.com/dp/B01').ok, false, 'solo https');
  assert.equal(checkAmazonUrl('https://amazon.com.evil.example/dp/B01').ok, false);
  assert.equal(checkAmazonUrl('javascript:alert(1)').ok, false);
  assert.equal(childIdFromSeq(7), 'NINO-007');
  assert.equal(childIdFromSeq(1234), 'NINO-1234');
});

test('reglas para publicar', () => {
  const ok = { guardian_ok: 1, first_name: 'Ana', age: 8, profile_es: 'x', profile_en: 'y', image_key: 'k' };
  assert.deepEqual(publishProblems(ok, [{}]), []);
  assert.deepEqual(publishProblems({ ...ok, guardian_ok: 0 }, [{}]), ['guardian']);
  assert.deepEqual(publishProblems({ ...ok, age: null, image_key: null }, []), ['age', 'image', 'gifts']);
});

// --- Login (Cloudflare Access) ---

const TEAM = 'https://prueba.cloudflareaccess.com';
const AUD = 'aud-123';

async function makeKeys() {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1', alg: 'RS256' };
  return { pair, jwk };
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

async function sign(pair, payload, header = { alg: 'RS256', kid: 'k1' }) {
  const data = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(payload));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(data));
  return data + '.' + b64url(sig);
}

test('JWT de Access: acepta solo firmas válidas, audiencia, emisor y vigencia correctos', async (t) => {
  const { pair, jwk } = await makeKeys();
  const other = await makeKeys();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => {
    assert.equal(String(u), `${TEAM}/cdn-cgi/access/certs`);
    return new Response(JSON.stringify({ keys: [jwk] }));
  };
  t.after(() => { globalThis.fetch = realFetch; _resetCertCache(); });

  const now = Math.floor(Date.now() / 1000);
  const good = { aud: [AUD], iss: TEAM, exp: now + 600, email: 'Lorena@Example.com' };
  assert.equal((await verifyAccessJwt(await sign(pair, good), TEAM, AUD)).email, 'Lorena@Example.com');
  assert.equal(await verifyAccessJwt(await sign(pair, { ...good, aud: ['otra'] }), TEAM, AUD), null, 'audiencia');
  assert.equal(await verifyAccessJwt(await sign(pair, { ...good, iss: 'https://evil.cloudflareaccess.com' }), TEAM, AUD), null, 'emisor');
  assert.equal(await verifyAccessJwt(await sign(pair, { ...good, exp: now - 10 }), TEAM, AUD), null, 'vencido');
  assert.equal(await verifyAccessJwt(await sign(other.pair, good), TEAM, AUD), null, 'otra llave');
  assert.equal(await verifyAccessJwt(await sign(pair, good, { alg: 'none', kid: 'k1' }), TEAM, AUD), null, 'alg none');
  assert.equal(await verifyAccessJwt('basura', TEAM, AUD), null);

  // getAdmin: el correo debe estar en ADMIN_EMAILS (sin importar mayúsculas)
  const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ADMIN_EMAILS: 'jorge@example.com, lorena@example.com' };
  const url = new URL('https://lorenalopezfoundation.org/api/admin/me');
  const req = (token) => new Request(url, { headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {} });
  assert.equal(await getAdmin(req(await sign(pair, good)), env, url), 'lorena@example.com');
  assert.equal(await getAdmin(req(await sign(pair, { ...good, email: 'intruso@example.com' })), env, url), null);
  assert.equal(await getAdmin(req(null), env, url), null);
  assert.equal(await getAdmin(req(await sign(pair, good)), { ...env, ADMIN_EMAILS: '' }, url), null, 'sin lista, nadie entra');
});

test('el admin de desarrollo solo funciona en localhost', async () => {
  const env = { DEV_ADMIN_EMAIL: 'dev@example.com' };
  const local = new URL('http://localhost:8787/api/admin/me');
  const prod = new URL('https://lorenalopezfoundation.org/api/admin/me');
  assert.equal(await getAdmin(new Request(local), env, local), 'dev@example.com');
  assert.equal(await getAdmin(new Request(prod), env, prod), null);
});
