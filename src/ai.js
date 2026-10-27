// Generación con IA: perfil bilingüe (Claude) y caricatura (OpenAI GPT Image).
// La foto del niño solo vive en memoria durante la petición: nunca se guarda ni se registra.
import Anthropic from '@anthropic-ai/sdk';
import { Buffer } from 'node:buffer';
import { stripMetadata, detectFormat } from './lib/images.js';
import { isLocalhost } from './lib/util.js';

const CLAUDE_MODEL = 'claude-opus-5-5';

export class AiError extends Error {
  constructor(code, detail) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

// --- PERFIL (Claude) ---

const PROFILE_SYSTEM = `Escribes perfiles cortos para la campaña navideña "Adopta un Regalo / Sponsor a Child" de The Lorena Lopez Foundation, una organización 501(c)(3) de McAllen, Texas. Los perfiles se publican en una página donde donantes eligen un regalo para cada niño.

Recibirás notas internas del equipo y la lista de ideas de regalo. Devuelve los datos en el formato JSON indicado.

Privacidad (obligatorio):
- Usa solo el primer nombre del niño. Nunca escribas apellidos.
- Nunca menciones escuela, ciudad, orfanato, casa hogar, familia, situación legal, salud, ni cómo o por qué llegó a donde vive.
- Si las notas traen alguno de esos datos, no los uses y anótalo en privacy_warnings (en español, una frase corta por dato, sin repetir el dato). Ejemplo: "Las notas incluyen un apellido."

Tono:
- Cálido, digno y alegre. Habla de quién es el niño: su personalidad, lo que le gusta, lo que sueña.
- Nunca des lástima. No uses palabras como pobre, abandonado, triste, necesitado, sufrir o carencia.
- No inventes datos que no estén en las notas. Si no hay un sueño explícito, usa su deseo de Navidad como el sueño.

Contenido:
- profile_es y profile_en: 3 o 4 oraciones cada uno. Incluyen nombre, edad, grado escolar (si se conoce), qué le gusta y qué sueña. Español natural de México; inglés natural, no traducción literal.
- grade_es y grade_en: el grado escolar en forma corta ("4.º de primaria" / "4th grade"); cadena vacía si no se sabe.
- interests: de 1 a 5 intereses cortos en minúsculas, en ambos idiomas, útiles como filtro (por ejemplo carros/cars, fútbol/soccer, dibujar/drawing).
- gifts: un título corto en ambos idiomas para cada idea de regalo, en el mismo orden en que llegan.
- appearance_hint_en: una frase en inglés que describa un fondo sencillo para la ilustración, relacionado con lo que le gusta (sin personas). Ejemplo: "toy race cars and a checkered flag".`;

const PROFILE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['first_name', 'age', 'grade_es', 'grade_en', 'interests', 'profile_es', 'profile_en', 'gifts', 'appearance_hint_en', 'privacy_warnings'],
  properties: {
    first_name: { type: 'string' },
    age: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    grade_es: { type: 'string' },
    grade_en: { type: 'string' },
    interests: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['es', 'en'], properties: { es: { type: 'string' }, en: { type: 'string' } } },
    },
    profile_es: { type: 'string' },
    profile_en: { type: 'string' },
    gifts: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['es', 'en'], properties: { es: { type: 'string' }, en: { type: 'string' } } },
    },
    appearance_hint_en: { type: 'string' },
    privacy_warnings: { type: 'array', items: { type: 'string' } },
  },
};

export async function generateProfile(env, url, { notes, gifts }) {
  if (useMock(env, url)) return mockProfile(notes, gifts);
  if (!env.ANTHROPIC_API_KEY) throw new AiError('ai_not_configured', 'ANTHROPIC_API_KEY');

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const giftList = gifts.map((g, i) => `${i + 1}. ${g}`).join('\n') || '(sin ideas de regalo)';
  let response;
  try {
    response = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: PROFILE_SCHEMA } },
      system: PROFILE_SYSTEM,
      messages: [{ role: 'user', content: `Notas del equipo:\n${notes}\n\nIdeas de regalo:\n${giftList}` }],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new AiError('ai_busy');
    if (err instanceof Anthropic.AuthenticationError) throw new AiError('ai_not_configured', 'ANTHROPIC_API_KEY inválida');
    if (err instanceof Anthropic.APIError) throw new AiError('ai_failed', `Claude ${err.status}`);
    throw err;
  }
  logUsage('claude perfil', response.model, response.usage);
  if (response.stop_reason === 'refusal') throw new AiError('ai_refused');
  if (response.stop_reason === 'max_tokens') throw new AiError('ai_failed', 'max_tokens');

  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let out;
  try {
    out = JSON.parse(text);
  } catch {
    throw new AiError('ai_failed', 'JSON inválido');
  }
  return normalizeProfile(out);
}

function normalizeProfile(o) {
  const pair = (x) => ({ es: String(x?.es || '').trim(), en: String(x?.en || '').trim() });
  return {
    first_name: String(o.first_name || '').trim().split(/\s+/).slice(0, 2).join(' '),
    age: Number.isInteger(o.age) && o.age >= 0 && o.age < 25 ? o.age : null,
    grade_es: String(o.grade_es || '').trim(),
    grade_en: String(o.grade_en || '').trim(),
    interests: (o.interests || []).map(pair).filter((p) => p.es && p.en).slice(0, 5),
    profile_es: String(o.profile_es || '').trim(),
    profile_en: String(o.profile_en || '').trim(),
    gifts: (o.gifts || []).map(pair),
    appearance_hint_en: String(o.appearance_hint_en || '').trim().slice(0, 200),
    privacy_warnings: (o.privacy_warnings || []).map((s) => String(s).trim()).filter(Boolean),
  };
}

// --- CARICATURA ---

const STYLE = `Warm children's storybook illustration, soft hand-painted picture-book style with gentle textures. Friendly character portrait from the chest up, smiling, facing the viewer. Stylized and simplified: it must not look like a photograph or a realistic portrait. Soft cream background (#FDFAF6) with gentle purple (#7B4FB5) and warm gold (#C9A96E) accents. No text, letters, numbers, logos or watermarks. Joyful, dignified and wholesome.`;

// mode "photo": la foto va como referencia a OpenAI.
// mode "description": Claude describe rasgos generales y OpenAI dibuja solo con texto.
export async function generateCaricature(env, url, { photo, photoType, background, extra }) {
  const mode = env.IMAGE_MODE === 'description' ? 'description' : 'photo';
  const scene = `Background: a simple scene with ${background || 'favorite toys, books and stars'}.`;
  const hint = extra ? ` Additional direction from the team: ${extra}` : '';

  if (useMock(env, url)) return mockImage(env, url);
  if (!env.OPENAI_API_KEY) throw new AiError('ai_not_configured', 'OPENAI_API_KEY');

  // Quitar metadatos de la foto antes de mandarla a cualquier proveedor.
  const cleanPhoto = stripMetadata(photo);

  if (mode === 'description') {
    const traits = await describeTraits(env, cleanPhoto, photoType);
    const prompt = `${STYLE} The child has these general features: ${traits}. ${scene}${hint}`;
    return openaiImage(env, 'generations', { prompt });
  }

  const prompt = `${STYLE} Use the reference photo only to capture the child's general features: hairstyle and hair color, skin tone, glasses if any, and the shape of the smile. Do not copy the photo's background, clothing logos or other people. ${scene}${hint}`;
  return openaiImage(env, 'edits', { prompt, photo: cleanPhoto, photoType });
}

async function openaiImage(env, kind, { prompt, photo, photoType }) {
  const model = env.IMAGE_MODEL || 'gpt-image-2.5-sunburst';
  const quality = env.IMAGE_QUALITY || 'medium';
  let res;
  if (kind === 'edits') {
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('size', '1024x1024');
    form.append('quality', quality);
    form.append('output_format', 'jpeg');
    form.append('output_compression', '88');
    form.append('image[]', new Blob([photo], { type: photoType || 'image/jpeg' }), 'reference.jpg');
    res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: form,
    });
  } else {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, size: '1024x1024', quality, output_format: 'jpeg', output_compression: 88 }),
    });
  }
  if (!res.ok) {
    let code = 'ai_failed';
    let detail = `OpenAI ${res.status}`;
    try {
      const body = await res.json();
      // Solo guardamos el código del error, nunca el contenido de la petición.
      if (body?.error?.code === 'moderation_blocked' || body?.error?.type === 'image_generation_user_error') code = 'ai_refused';
      detail += ` ${body?.error?.code || ''}`.trimEnd();
    } catch {}
    if (res.status === 429) code = 'ai_busy';
    if (res.status === 401) code = 'ai_not_configured';
    throw new AiError(code, detail);
  }
  const body = await res.json();
  logUsage(`openai ${kind}`, model, body?.usage);
  const b64 = body?.data?.[0]?.b64_json;
  if (!b64) throw new AiError('ai_failed', 'OpenAI sin imagen');
  return stripMetadata(new Uint8Array(Buffer.from(b64, 'base64')));
}

async function describeTraits(env, photo, photoType) {
  if (!env.ANTHROPIC_API_KEY) throw new AiError('ai_not_configured', 'ANTHROPIC_API_KEY');
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const b64 = Buffer.from(photo).toString('base64');
  const mediaType = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[detectFormat(photo)] || photoType;
  let response;
  try {
    response = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text', text: 'For a children\'s book illustrator, describe only the general visual features of the child in this photo in one English sentence of at most 35 words: approximate age, hair style, length and color, skin tone, eye color if clear, glasses, and smile. Do not describe the background, clothing text, or anything that identifies the child or the place. Reply with the sentence only.' },
        ],
      }],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) throw new AiError('ai_failed', `Claude ${err.status}`);
    throw err;
  }
  logUsage('claude rasgos', response.model, response.usage);
  if (response.stop_reason === 'refusal') throw new AiError('ai_refused');
  return response.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim().slice(0, 400);
}

// Solo cifras de uso (para calcular costos); nunca el contenido.
function logUsage(label, model, usage) {
  if (!usage) return;
  const nums = Object.fromEntries(Object.entries(usage).filter(([, v]) => typeof v === 'number'));
  const details = usage.input_tokens_details || usage.output_tokens_details;
  console.log(`IA uso ${label} ${model}: ${JSON.stringify({ ...nums, ...(details ? { input_details: usage.input_tokens_details, output_details: usage.output_tokens_details } : {}) })}`);
}

// --- MODO DE PRUEBA LOCAL (sin llaves de API) ---

function useMock(env, url) {
  return env.AI_MOCK === '1' && isLocalhost(url);
}

function mockProfile(notes, gifts) {
  const name = (notes.match(/^\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/) || [])[1] || 'Niño';
  const age = Number((notes.match(/(\d{1,2})\s*años/) || [])[1]) || null;
  return normalizeProfile({
    first_name: name,
    age,
    grade_es: '4.º de primaria',
    grade_en: '4th grade',
    interests: [{ es: 'carros', en: 'cars' }, { es: 'dibujar', en: 'drawing' }],
    profile_es: `${name} tiene ${age ?? 'pocos'} años y una sonrisa contagiosa. Le encantan los carros y dibujar. Sueña con estrenar un regalo especial esta Navidad.`,
    profile_en: `${name} is ${age ?? 'a few'} years old and has a contagious smile. They love cars and drawing. Their Christmas dream is to open a special gift this year.`,
    gifts: gifts.map((g) => ({ es: g, en: `${g} (EN)` })),
    appearance_hint_en: 'toy race cars and colored pencils',
    privacy_warnings: /apellido|escuela/i.test(notes) ? ['Las notas parecen incluir datos sensibles.'] : [],
  });
}

async function mockImage(env, url) {
  const res = await env.ASSETS.fetch(new URL('/assets/img/logo.webp', url));
  return stripMetadata(new Uint8Array(await res.arrayBuffer()));
}
