// Detección de formato y eliminación de metadatos (EXIF, XMP, C2PA, comentarios)
// sin recodificar la imagen. Funciona en el Worker y en Node (pruebas).

export function detectFormat(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
  return null;
}

export const CONTENT_TYPES = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
export const EXTENSIONS = { jpeg: 'jpg', png: 'png', webp: 'webp' };

export function stripMetadata(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const format = detectFormat(bytes);
  if (format === 'jpeg') return stripJpeg(bytes);
  if (format === 'png') return stripPng(bytes);
  if (format === 'webp') return stripWebp(bytes);
  throw new Error('unsupported_image');
}

// JPEG: conserva solo APP0 (JFIF), APP2 (perfil de color ICC) y APP14 (Adobe, colores)
// y los segmentos de imagen. Quita APP1 (EXIF/XMP), APP11 (C2PA), APP13, COM, etc.
const JPEG_KEEP_APP = new Set([0xe0, 0xe2, 0xee]);

function stripJpeg(b) {
  const out = [b.subarray(0, 2)];
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new Error('bad_jpeg');
    const marker = b[i + 1];
    if (marker === 0xff) { i++; continue; } // relleno
    if (marker === 0xda) { out.push(b.subarray(i)); break; } // SOS: el resto son datos de imagen
    if (marker === 0xd9) { out.push(b.subarray(i, i + 2)); break; }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { out.push(b.subarray(i, i + 2)); i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    const seg = b.subarray(i, i + 2 + len);
    const isMeta = (marker >= 0xe0 && marker <= 0xef && !JPEG_KEEP_APP.has(marker)) || marker === 0xfe;
    if (!isMeta) out.push(seg);
    i += 2 + len;
  }
  return concat(out);
}

// PNG: conserva solo los chunks críticos y los que afectan cómo se ve la imagen.
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'pHYs']);

function stripPng(b) {
  const out = [b.subarray(0, 8)];
  let i = 8;
  while (i < b.length) {
    const len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    const type = ascii(b, i + 4, 4);
    const total = 12 + len;
    if (PNG_KEEP.has(type)) out.push(b.subarray(i, i + total));
    i += total;
    if (type === 'IEND') break;
  }
  return concat(out);
}

// WebP (RIFF): quita los chunks EXIF y XMP y apaga sus banderas en VP8X.
function stripWebp(b) {
  const chunks = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const type = ascii(b, i, 4);
    const len = (b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24)) >>> 0;
    const total = 8 + len + (len & 1);
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = b.slice(i, i + total);
      if (type === 'VP8X') chunk[8] &= ~0x0c; // bits de EXIF (0x08) y XMP (0x04)
      chunks.push(chunk);
    }
    i += total;
  }
  const body = concat(chunks);
  const header = new Uint8Array(12);
  header.set(b.subarray(0, 4), 0);
  const size = body.length + 4;
  header.set([size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >>> 24) & 0xff], 4);
  header.set(b.subarray(8, 12), 8);
  return concat([header, body]);
}

function ascii(b, start, len) {
  let s = '';
  for (let k = 0; k < len; k++) s += String.fromCharCode(b[start + k]);
  return s;
}

function concat(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
