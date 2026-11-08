// Panel de administración de "Adopta un Regalo". Sin dependencias.
// Privacidad: la foto del niño se reduce y se recodifica aquí (sin EXIF/GPS), vive solo en
// memoria para poder regenerar la caricatura y se borra al aprobarla o al salir del perfil.

const app = document.getElementById('app');
const state = {
  children: [],
  filter: 'all',
  child: null,
  gifts: [],          // regalos que se están editando en la sección 1
  photo: null,        // Blob JPEG ya limpio
  photoUrl: null,
  background: '',
  extra: '',
  warnings: [],
  letter: null,       // carta que se está preparando en la sección 2 (páginas, pinitos y textos)
  giftIdeas: [],      // ideas de regalo de la IA (sección 3), sin guardar
  dirty: new Set(),
  busy: null,
};

// --- API ---

const ERRORS = {
  unauthorized: 'Tu sesión terminó. Toca "Volver a entrar".',
  forbidden: 'No se permitió la acción.',
  not_found: 'No se encontró.',
  ai_not_configured: 'Falta configurar la llave de la IA. Avísale a Jorge.',
  ai_busy: 'La IA está ocupada. Intenta de nuevo en un minuto.',
  ai_refused: 'La IA no quiso generar esto. Prueba con otra foto o ajusta las notas.',
  ai_failed: 'La IA falló. Intenta de nuevo.',
  invalid_gifts: 'Revisa los regalos: cada uno necesita nombre y un link de Amazon que empiece con https://',
  not_ready: 'Todavía falta información para publicar.',
  too_large: 'La imagen es demasiado grande.',
  no_draft: 'No hay una caricatura nueva para aprobar.',
  invalid: 'Revisa los datos e intenta de nuevo.',
  server_error: 'Algo falló en el servidor. Intenta de nuevo.',
  network: 'Sin conexión. Revisa tu internet e intenta de nuevo.',
};

class ApiError extends Error {
  constructor(code, data) {
    super(ERRORS[code] || ERRORS.server_error);
    this.code = code;
    this.data = data;
  }
}

async function api(method, path, body) {
  const opts = { method, headers: {}, redirect: 'manual', credentials: 'same-origin' };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers['Content-Type'] = 'application/json';
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new ApiError('network');
  }
  // Access redirige al login cuando la sesión vence.
  if (res.type === 'opaqueredirect' || res.status === 401) {
    showSessionExpired();
    throw new ApiError('unauthorized');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new ApiError(data.error || 'server_error', data);
  return data;
}

function showSessionExpired() {
  if (document.getElementById('expired')) return;
  const el = document.createElement('div');
  el.id = 'expired';
  el.className = 'wrap';
  el.innerHTML = `<div class="note note-warn">Tu sesión terminó.
    <div class="btn-row"><button class="btn btn-primary" onclick="location.reload()">Volver a entrar</button></div></div>`;
  document.body.insertBefore(el, app);
}

// --- UTILIDADES ---

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let toastTimer;
function toast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), isError ? 6000 : 3500);
}

function fail(err) {
  console.error(err);
  if (err?.code !== 'unauthorized') toast(err?.message || ERRORS.server_error, true);
}

const AMAZON = /^(www\.|smile\.)?amazon\.com$|^a\.co$|^amzn\.to$/i;
function checkUrl(raw) {
  try {
    const u = new URL(String(raw).trim());
    if (u.protocol !== 'https:' || !AMAZON.test(u.hostname)) return { ok: false };
    return { ok: true, fromList: u.searchParams.has('colid') || u.searchParams.has('coliid') || u.pathname.includes('/hz/wishlist/') };
  } catch {
    return { ok: false };
  }
}

const PROBLEMS = {
  guardian: 'Falta marcar la autorización del tutor legal',
  first_name: 'Falta el nombre',
  age: 'Falta la edad',
  profile_es: 'Falta el perfil en español',
  profile_en: 'Falta el perfil en inglés',
  image: 'Falta aprobar una caricatura',
  gifts: 'Falta al menos un regalo',
};

function displayName(c) {
  return c.first_name || 'Sin nombre todavía';
}

// --- RUTAS ---

let currentHash = location.hash;
let ignoreHash = false;

window.addEventListener('hashchange', () => {
  if (ignoreHash) { ignoreHash = false; return; }
  if (state.dirty.size && !confirm('Tienes cambios sin guardar. ¿Salir de todos modos?')) {
    ignoreHash = true;
    location.hash = currentHash;
    return;
  }
  currentHash = location.hash;
  leaveChild();
  route();
});

window.addEventListener('beforeunload', (e) => {
  if (state.dirty.size || state.photo || state.letter) { e.preventDefault(); e.returnValue = ''; }
});

async function route() {
  window.scrollTo(0, 0);
  const h = location.hash;
  try {
    if (h === '#/nuevo') return viewNew();
    const m = h.match(/^#\/nino\/(NINO-\d{3,})$/);
    if (m) return await viewChild(m[1]);
    return await viewList();
  } catch (err) {
    fail(err);
    app.innerHTML = `<div class="note note-danger">${esc(err.message)}</div><div class="btn-row"><a class="btn" href="#/">Volver a la lista</a></div>`;
  }
}

function leaveChild() {
  clearPhoto();
  state.dirty.clear();
  state.child = null;
  state.background = '';
  state.extra = '';
  state.warnings = [];
  state.letter = null;
  state.giftIdeas = [];
}

// --- LISTA ---

async function viewList() {
  app.innerHTML = '<p class="loading">Cargando…</p>';
  const { children } = await api('GET', '/api/admin/children');
  state.children = children;
  renderList();
}

function renderList() {
  const all = state.children;
  const published = all.filter((c) => c.status === 'published').length;
  const gifts = all.flatMap((c) => c.gifts);
  const gifted = gifts.filter((g) => g.status === 'gifted').length;
  const shown = all.filter((c) => state.filter === 'all' || c.status === state.filter);
  const tab = (key, label, n) => `<button class="tab ${state.filter === key ? 'active' : ''}" data-filter="${key}">${label} (${n})</button>`;

  app.innerHTML = `
    <div class="list-head">
      <h1>Niños</h1>
      <a class="btn btn-small" href="/api/admin/export.csv" download>⬇︎ Exportar CSV</a>
    </div>
    <div class="stats">
      <div class="stat"><b>${all.length}</b><span>perfiles</span></div>
      <div class="stat"><b>${published}</b><span>publicados</span></div>
      <div class="stat"><b>${gifted}/${gifts.length}</b><span>regalos entregados</span></div>
    </div>
    <a class="btn btn-primary btn-block" href="#/nuevo">＋ Agregar un niño</a>
    <div class="tabs" style="margin-top:1rem">
      ${tab('all', 'Todos', all.length)}${tab('draft', 'Borradores', all.length - published)}${tab('published', 'Publicados', published)}
    </div>
    <div class="cards">
      ${shown.length ? shown.map(cardHtml).join('') : `<div class="empty">${all.length ? 'No hay perfiles en esta lista.' : 'Todavía no hay niños. Toca "Agregar un niño" para empezar.'}</div>`}
    </div>`;
  app.querySelectorAll('[data-filter]').forEach((b) =>
    b.addEventListener('click', () => { state.filter = b.dataset.filter; renderList(); }),
  );
}

function cardHtml(c) {
  const img = c.thumb_url || c.image_url;
  const gifted = c.gifts.filter((g) => g.status === 'gifted').length;
  const meta = [c.id, c.age != null ? `${c.age} años` : null, `${gifted}/${c.gifts.length} regalados`].filter(Boolean).join(' · ');
  return `
    <a class="card" href="#/nino/${esc(c.id)}">
      ${img ? `<img class="avatar" src="${esc(img)}" alt="" loading="lazy">` : '<div class="avatar">🎁</div>'}
      <div class="card-body">
        <div class="card-title">${esc(displayName(c))}
          <span class="badge ${c.status === 'published' ? 'badge-published' : 'badge-draft'}">${c.status === 'published' ? 'Publicado' : 'Borrador'}</span>
        </div>
        <div class="card-meta">${esc(meta)}</div>
        ${c.status !== 'published' && c.problems.length ? `<div class="card-meta">Falta: ${c.problems.length} paso${c.problems.length > 1 ? 's' : ''}</div>` : ''}
      </div>
    </a>`;
}

// --- NUEVO ---

function viewNew() {
  state.gifts = [{ title_es: '', title_en: '', url: '' }, { title_es: '', title_en: '', url: '' }];
  app.innerHTML = `
    <a class="back" href="#/">← Lista</a>
    <h1>Agregar un niño</h1>
    <p class="muted">Escribe lo que sepas; todo se puede completar después. En el siguiente paso subes la foto y la carta, y la IA prepara el perfil.</p>
    <div class="note note-info">📷 La carta y la foto se suben después de tocar <b>Crear perfil</b> (secciones 2 y 4). Si tienes su carta, puedes dejar las notas vacías: la IA escribe el perfil con lo que dice la carta.</div>
    <div class="section" data-section="new">
      ${notesFieldHtml('')}
      <div class="field">
        <span class="label">Ideas de regalo <span class="muted">(opcional)</span></span>
        <div id="giftEditor"></div>
        <button class="btn btn-small" id="addGift" type="button" style="margin-top:.7rem">＋ Agregar otro regalo</button>
        <p class="hint">El link de Amazon puede esperar: cópialo después desde la Lista de Deseos de la fundación.</p>
      </div>
      <button class="btn btn-primary btn-block" id="create" style="margin-top:1.2rem">Crear perfil</button>
    </div>`;
  renderGiftEditor();
  trackDirty(app.querySelector('[data-section="new"]'), 'new');
  document.getElementById('addGift').onclick = addGift;
  document.getElementById('create').onclick = async (e) => {
    const notes = document.getElementById('notes').value.trim();
    const gifts = readGiftEditor();
    const bad = badGift(gifts);
    if (bad) return toast(bad, true);
    e.target.disabled = true;
    try {
      const { child } = await api('POST', '/api/admin/children', { notes, gifts });
      state.dirty.clear();
      toast(`Perfil ${child.id} creado.`);
      location.hash = `#/nino/${child.id}`;
    } catch (err) {
      fail(err);
      e.target.disabled = false;
    }
  };
}

function notesFieldHtml(value) {
  return `
    <div class="field">
      <label for="notes">Notas sobre el niño</label>
      <textarea id="notes" class="tall" maxlength="3000" placeholder="Ejemplo: Emilio, 9 años, cuarto grado, le gustan los carros, quiere un carrito de control remoto y un paquete de calcetines">${esc(value)}</textarea>
      <p class="hint">🔒 Solo el primer nombre. No escribas apellido, escuela, ciudad, orfanato ni su historia.</p>
    </div>`;
}

// --- EDITOR DE REGALOS ---

function renderGiftEditor() {
  const box = document.getElementById('giftEditor');
  if (!box) return;
  box.innerHTML = state.gifts.map((g, i) => {
    const check = g.url ? checkUrl(g.url) : null;
    return `
      <div class="gift" data-i="${i}">
        <div class="gift-top"><span>Regalo ${i + 1}${g.status === 'gifted' ? ' · <span class="badge badge-gifted">Ya fue regalado</span>' : ''}</span>
          <button class="link-btn" type="button" data-remove="${i}">Quitar</button></div>
        <div class="field"><label>Nombre del regalo</label>
          <input type="text" data-k="title_es" value="${esc(g.title_es)}" maxlength="120" placeholder="Carrito de control remoto"></div>
        <div class="field"><label>En inglés <span class="muted">(la IA lo llena)</span></label>
          <input type="text" data-k="title_en" value="${esc(g.title_en)}" maxlength="120" placeholder="Remote control car"></div>
        <div class="field"><label>Link de Amazon <span class="muted">(puede ser después)</span></label>
          <input type="url" data-k="url" value="${esc(g.url)}" inputmode="url" autocomplete="off" placeholder="https://www.amazon.com/...">
          ${check && !check.ok ? '<p class="note note-danger">Este link no es de Amazon o no empieza con https://</p>' : ''}
          ${check && check.ok && !check.fromList ? '<p class="note note-warn">Este link no viene de la Lista de Deseos. Así Amazon no sabrá enviarlo a la fundación. Cópialo desde la lista.</p>' : ''}
        </div>
      </div>`;
  }).join('') || '<p class="muted">Sin regalos.</p>';

  box.querySelectorAll('input').forEach((inp) =>
    inp.addEventListener('input', () => { state.gifts[inp.closest('.gift').dataset.i][inp.dataset.k] = inp.value; }),
  );
  box.querySelectorAll('input[data-k="url"]').forEach((inp) => inp.addEventListener('change', renderGiftEditor));
  box.querySelectorAll('[data-remove]').forEach((b) =>
    b.addEventListener('click', () => {
      const g = state.gifts[b.dataset.remove];
      if (g.title_es && !confirm(`¿Quitar "${g.title_es}"?`)) return;
      state.gifts.splice(Number(b.dataset.remove), 1);
      markDirty(b);
      renderGiftEditor();
    }),
  );
}

function addGift(e) {
  if (state.gifts.length >= 6) return toast('Máximo 6 regalos por niño.', true);
  state.gifts.push({ title_es: '', title_en: '', url: '' });
  markDirty(e.target);
  renderGiftEditor();
}

// Cada regalo necesita nombre. El link es opcional, pero si lo pegan tiene que ser de Amazon.
function badGift(gifts) {
  const i = gifts.findIndex((g) => !g.title_es || (g.url && !checkUrl(g.url).ok));
  if (i < 0) return null;
  return gifts[i].title_es ? `Revisa el regalo ${i + 1}: el link no es de Amazon o no empieza con https://` : `Revisa el regalo ${i + 1}: falta el nombre.`;
}

function readGiftEditor() {
  return state.gifts
    .map((g) => ({ ...(g.id ? { id: g.id } : {}), title_es: g.title_es.trim(), title_en: g.title_en.trim(), url: g.url.trim() }))
    .filter((g) => g.title_es || g.url);
}

// --- CAMBIOS SIN GUARDAR ---

function trackDirty(el, name) {
  el.addEventListener('input', () => state.dirty.add(name));
}

function markDirty(el) {
  const sec = el.closest('[data-section]');
  if (sec) state.dirty.add(sec.dataset.section);
}

// --- PERFIL DE UN NIÑO ---

async function viewChild(id) {
  app.innerHTML = '<p class="loading">Cargando…</p>';
  const { child } = await api('GET', `/api/admin/children/${id}`);
  setChild(child);
  state.warnings = child.privacy_warnings;
  app.innerHTML = `
    <a class="back" href="#/">← Lista</a>
    <div id="sec-head"></div>
    <div class="section" id="sec-notes" data-section="notes"></div>
    <div class="section" id="sec-letter" data-section="letter"></div>
    <div class="section" id="sec-profile" data-section="profile"></div>
    <div class="section" id="sec-image" data-section="image"></div>
    <div class="section" id="sec-gifts" data-section="giftstatus"></div>
    <div class="section" id="sec-publish" data-section="publish"></div>`;
  for (const name of ['notes', 'profile']) trackDirty(document.getElementById(`sec-${name}`), name);
  refresh(true);
}

function setChild(child) {
  state.child = child;
}

// Vuelve a dibujar las secciones que no tienen cambios sin guardar.
function refresh(all = false) {
  renderHead();
  if (all || !state.dirty.has('notes')) renderNotes();
  if (all || !state.dirty.has('profile')) renderProfile();
  renderImage();
  renderLetter();
  renderGiftStatus();
  renderPublish();
}

function renderHead() {
  const c = state.child;
  const img = c.thumb_url || c.image_url;
  document.getElementById('sec-head').innerHTML = `
    <div class="child-head">
      ${img ? `<img class="avatar" src="${esc(img)}" alt="">` : '<div class="avatar">🎁</div>'}
      <div>
        <h1>${esc(displayName(c))}</h1>
        <div class="muted">${esc(c.id)} · <span class="badge ${c.status === 'published' ? 'badge-published' : 'badge-draft'}">${c.status === 'published' ? 'Publicado' : 'Borrador'}</span></div>
      </div>
    </div>`;
}

// 1. Notas y regalos
function renderNotes() {
  const c = state.child;
  state.gifts = c.gifts.map((g) => ({ ...g }));
  const el = document.getElementById('sec-notes');
  el.innerHTML = `
    <h2><span class="section-num">1</span>Notas y regalos</h2>
    <p class="muted">Lo que escribas aquí es interno: no se publica.</p>
    ${notesFieldHtml(c.notes)}
    <div class="field">
      <span class="label">Ideas de regalo</span>
      <div id="giftEditor"></div>
      <button class="btn btn-small" id="addGift" type="button" style="margin-top:.7rem">＋ Agregar otro regalo</button>
    </div>
    <button class="btn btn-primary btn-block" id="saveNotes" style="margin-top:1rem">Guardar notas y regalos</button>`;
  renderGiftEditor();
  document.getElementById('addGift').onclick = addGift;
  document.getElementById('saveNotes').onclick = saveNotes;
}

async function saveNotes(e) {
  const c = state.child;
  const gifts = readGiftEditor();
  const bad = badGift(gifts);
  if (bad) return toast(bad, true);
  e.target.disabled = true;
  try {
    await api('PATCH', `/api/admin/children/${c.id}`, { notes: document.getElementById('notes').value });
    const { child } = await api('PUT', `/api/admin/children/${c.id}/gifts`, { gifts });
    setChild(child);
    state.dirty.delete('notes');
    renderNotes();
    refresh();
    toast('Notas y regalos guardados.');
  } catch (err) {
    fail(err);
  } finally {
    e.target.disabled = false;
  }
}

// 3. Perfil
function renderProfile() {
  const c = state.child;
  const interests = c.interests.map((x) => `${x.es} / ${x.en}`).join('\n');
  const el = document.getElementById('sec-profile');
  el.innerHTML = `
    <h2><span class="section-num">3</span>Perfil</h2>
    <p class="muted">La IA lo escribe con las notas y la carta de arriba, y propone regalos según la carta. Revísalo y corrige lo que haga falta antes de guardar.</p>
    <button class="btn btn-gold btn-block" id="genText">✨ ${c.profile_es ? 'Volver a generar' : 'Generar perfil con IA'}</button>
    <div id="textBusy"></div>
    <div id="warnings"></div>
    <div id="giftIdeas"></div>
    <div class="grid2">
      <div class="field"><label for="f_first_name">Primer nombre</label><input type="text" id="f_first_name" value="${esc(c.first_name)}" maxlength="40" autocomplete="off"></div>
      <div class="field"><label for="f_age">Edad</label><input type="number" id="f_age" value="${c.age ?? ''}" min="0" max="24" inputmode="numeric"></div>
    </div>
    <div class="grid2">
      <div class="field"><label for="f_grade_es">Grado escolar</label><input type="text" id="f_grade_es" value="${esc(c.grade_es)}" maxlength="40" placeholder="4.º de primaria"></div>
      <div class="field"><label for="f_grade_en">Grade (inglés)</label><input type="text" id="f_grade_en" value="${esc(c.grade_en)}" maxlength="40" placeholder="4th grade"></div>
    </div>
    <div class="field"><label for="f_interests">Intereses (para los filtros)</label>
      <textarea id="f_interests" style="min-height:80px" placeholder="carros / cars&#10;dibujar / drawing">${esc(interests)}</textarea>
      <p class="hint">Uno por línea: español / inglés. Máximo 5.</p></div>
    <div class="field"><label for="f_profile_es">Perfil en español</label>
      <textarea id="f_profile_es" class="tall" maxlength="1200">${esc(c.profile_es)}</textarea>
      <p class="hint">3 o 4 oraciones. Tono cálido y digno, nunca de lástima.</p></div>
    <div class="field"><label for="f_profile_en">Perfil en inglés</label>
      <textarea id="f_profile_en" class="tall" maxlength="1200">${esc(c.profile_en)}</textarea></div>
    <button class="btn btn-primary btn-block" id="saveProfile" style="margin-top:1rem">Guardar perfil</button>`;
  renderWarnings();
  renderGiftIdeas();
  document.getElementById('genText').onclick = generateText;
  document.getElementById('saveProfile').onclick = saveProfile;
}

function renderWarnings() {
  const box = document.getElementById('warnings');
  if (!box) return;
  box.innerHTML = state.warnings.length
    ? `<div class="note note-warn"><b>🔒 Revisa la privacidad:</b><ul>${state.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
       Borra ese dato de las notas y guarda.</div>`
    : '';
}

// Ideas de regalo que la IA propone a partir de la carta, en tres rangos de precio.
const TIERS = { cheap: 'Económico · hasta $15', low: 'Bajo · $15 a $30', medium: 'Medio · $30 a $60' };

function renderGiftIdeas() {
  const box = document.getElementById('giftIdeas');
  if (!box) return;
  const ideas = state.giftIdeas || [];
  if (!ideas.length) { box.innerHTML = ''; return; }
  const taken = new Set(state.gifts.map((g) => g.title_es.trim().toLowerCase()));
  box.innerHTML = `
    <div class="ideas">
      <b>💡 Ideas de regalo según su carta</b>
      <p class="hint">Toca <b>＋ Agregar</b> para pasarla a la lista de regalos (sección 1). Luego búscala en Amazon,
        agrégala a la Lista de Deseos de la fundación y pega el link.</p>
      ${Object.entries(TIERS).map(([tier, label]) => {
        const list = ideas.map((g, i) => ({ ...g, i })).filter((g) => g.tier === tier);
        return list.length ? `
          <div class="tier"><span class="tier-label tier-${tier}">${label}</span>
            ${list.map((g) => `
              <div class="idea">
                <div class="idea-name">${esc(g.es)}${g.price_usd ? ` <span class="muted">~$${g.price_usd}</span>` : ''}</div>
                <div class="idea-actions">
                  <a class="btn btn-small" href="https://www.amazon.com/s?k=${encodeURIComponent(g.search_en)}" target="_blank" rel="noopener">Buscar ↗</a>
                  ${taken.has(g.es.trim().toLowerCase())
                    ? '<span class="badge badge-published">✓ En la lista</span>'
                    : `<button class="btn btn-small btn-primary" type="button" data-idea="${g.i}">＋ Agregar</button>`}
                </div>
              </div>`).join('')}
          </div>` : '';
      }).join('')}
    </div>`;
  box.querySelectorAll('[data-idea]').forEach((b) => (b.onclick = () => addIdea(Number(b.dataset.idea))));
}

function addIdea(i) {
  const g = state.giftIdeas[i];
  if (state.gifts.filter((x) => x.title_es || x.url).length >= 6) return toast('Máximo 6 regalos por niño.', true);
  // Usa un renglón vacío si hay; si no, agrega uno nuevo.
  const empty = state.gifts.find((x) => !x.title_es && !x.url);
  if (empty) Object.assign(empty, { title_es: g.es, title_en: g.en });
  else state.gifts.push({ title_es: g.es, title_en: g.en, url: '' });
  state.dirty.add('notes');
  renderGiftEditor();
  renderGiftIdeas();
  toast('Agregado a la lista. Toca "Guardar notas y regalos" en la sección 1.');
}

async function generateText(e) {
  const c = state.child;
  const notes = document.getElementById('notes').value.trim();
  if (!notes && !c.letter_text_es) return toast('Primero sube su carta (sección 2) o escribe unas notas.', true);
  e.target.disabled = true;
  setBusy('textBusy', 'La IA está escribiendo el perfil…');
  try {
    const { suggestion: s } = await api('POST', `/api/admin/children/${c.id}/generate-text`, {
      notes,
      gifts: readGiftEditor().map((g) => g.title_es),
    });
    const set = (id, v) => { document.getElementById(id).value = v ?? ''; };
    set('f_first_name', s.first_name);
    set('f_age', s.age);
    set('f_grade_es', s.grade_es);
    set('f_grade_en', s.grade_en);
    set('f_interests', s.interests.map((x) => `${x.es} / ${x.en}`).join('\n'));
    set('f_profile_es', s.profile_es);
    set('f_profile_en', s.profile_en);
    state.dirty.add('profile');
    // Títulos de regalo en inglés para la sección 1
    let changed = false;
    s.gifts.forEach((g, i) => {
      if (state.gifts[i] && g.en && state.gifts[i].title_en !== g.en) { state.gifts[i].title_en = g.en; changed = true; }
    });
    if (changed) { state.dirty.add('notes'); renderGiftEditor(); }
    if (s.appearance_hint_en) { state.background = s.appearance_hint_en; renderImage(); }
    state.warnings = s.privacy_warnings;
    state.giftIdeas = s.gift_ideas || [];
    renderWarnings();
    renderGiftIdeas();
    toast(changed ? 'Listo. Revisa el perfil y los regalos, y guarda ambos.' : 'Listo. Revisa el texto y toca "Guardar perfil".');
  } catch (err) {
    fail(err);
  } finally {
    setBusy('textBusy', null);
    e.target.disabled = false;
  }
}

async function saveProfile(e) {
  const c = state.child;
  const val = (id) => document.getElementById(id).value;
  const interests = val('f_interests').split('\n').map((line) => {
    const [es, en] = line.split('/').map((s) => (s || '').trim());
    return { es, en: en || es };
  }).filter((x) => x.es);
  const age = val('f_age').trim();
  e.target.disabled = true;
  try {
    const { child } = await api('PATCH', `/api/admin/children/${c.id}`, {
      first_name: val('f_first_name'),
      age: age === '' ? null : Number(age),
      grade_es: val('f_grade_es'),
      grade_en: val('f_grade_en'),
      interests,
      profile_es: val('f_profile_es'),
      profile_en: val('f_profile_en'),
      privacy_warnings: state.warnings,
    });
    setChild(child);
    state.dirty.delete('profile');
    renderProfile();
    refresh();
    toast('Perfil guardado.');
  } catch (err) {
    fail(err);
  } finally {
    e.target.disabled = false;
  }
}

// 4. Caricatura
function renderImage() {
  const c = state.child;
  const el = document.getElementById('sec-image');
  if (!el) return;
  el.innerHTML = `
    <h2><span class="section-num">4</span>Caricatura</h2>
    <p class="muted">La foto solo se usa para crear el dibujo. No se guarda en ningún lado y se borra de este teléfono al aprobar la caricatura.</p>
    ${(c.image_url || c.draft_image_url) ? `<div class="pics">
      ${c.image_url ? `<figure class="pic"><img src="${esc(c.image_url)}" alt="Caricatura aprobada"><figcaption>✓ Aprobada</figcaption></figure>` : ''}
      ${c.draft_image_url ? `<figure class="pic draft"><img src="${esc(c.draft_image_url)}" alt="Caricatura nueva"><figcaption>Nueva, sin aprobar</figcaption></figure>` : ''}
    </div>` : ''}
    ${c.draft_image_url ? `<div class="btn-row"><button class="btn btn-primary" id="approve">✓ Usar esta caricatura</button></div>` : ''}
    <div class="field">
      <label class="photo-pick">📷 ${state.photo ? 'Cambiar foto' : 'Tomar o elegir foto'}
        <input type="file" id="photo" accept="image/*"></label>
      ${state.photo ? `<div class="photo-chosen"><img src="${state.photoUrl}" alt="Foto elegida"><span>Foto lista. Solo está en este teléfono.
        <button class="link-btn" id="clearPhoto" type="button">Borrar foto</button></span></div>` : ''}
    </div>
    <div class="field"><label for="f_bg">Fondo del dibujo</label>
      <input type="text" id="f_bg" value="${esc(state.background)}" maxlength="200" placeholder="carritos de carreras y una bandera a cuadros">
      <p class="hint">Algo relacionado con lo que le gusta. La IA lo sugiere al generar el perfil.</p></div>
    <div class="field"><label for="f_extra">Indicaciones extra <span class="muted">(opcional)</span></label>
      <input type="text" id="f_extra" value="${esc(state.extra)}" maxlength="300" placeholder="con lentes, cabello más corto"></div>
    <button class="btn btn-gold btn-block" id="genImage" style="margin-top:1rem" ${state.photo ? '' : 'disabled'}>
      🎨 ${c.draft_image_url || c.image_url ? 'Generar otra caricatura' : 'Generar caricatura'}</button>
    ${state.photo ? '' : '<p class="hint" style="text-align:center">Elige una foto para generar la caricatura.</p>'}
    <div id="imageBusy"></div>`;

  document.getElementById('photo').onchange = choosePhoto;
  document.getElementById('f_bg').oninput = (ev) => (state.background = ev.target.value);
  document.getElementById('f_extra').oninput = (ev) => (state.extra = ev.target.value);
  document.getElementById('genImage').onclick = generateImage;
  const cp = document.getElementById('clearPhoto');
  if (cp) cp.onclick = () => { clearPhoto(); renderImage(); };
  const ap = document.getElementById('approve');
  if (ap) ap.onclick = approveImage;
}

async function choosePhoto(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const blob = await preparePhoto(file);
    clearPhoto();
    state.photo = blob;
    state.photoUrl = URL.createObjectURL(blob);
    renderImage();
  } catch (err) {
    console.error(err);
    toast('No se pudo leer esa foto. Prueba con otra.', true);
  }
}

function clearPhoto() {
  if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
  state.photo = null;
  state.photoUrl = null;
}

async function generateImage(e) {
  const c = state.child;
  if (!state.photo) return toast('Elige una foto primero.', true);
  e.target.disabled = true;
  setBusy('imageBusy', 'Creando la caricatura… puede tardar hasta un minuto. No cierres esta página.');
  try {
    const form = new FormData();
    form.append('photo', state.photo, 'foto.jpg');
    form.append('background', state.background);
    form.append('extra', state.extra);
    const { child } = await api('POST', `/api/admin/children/${c.id}/generate-image`, form);
    setChild(child);
    renderImage();
    toast('Caricatura lista. Si te gusta, toca "Usar esta caricatura".');
  } catch (err) {
    fail(err);
    setBusy('imageBusy', null);
    e.target.disabled = false;
  }
}

async function approveImage(e) {
  const c = state.child;
  e.target.disabled = true;
  setBusy('imageBusy', 'Guardando la caricatura…');
  try {
    const form = new FormData();
    const { thumb, og } = await makeDerivatives(c.draft_image_url);
    if (thumb) form.append('thumb', thumb, thumb.type === 'image/webp' ? 'thumb.webp' : 'thumb.jpg');
    if (og) form.append('og', og, 'og.jpg');
    const { child } = await api('POST', `/api/admin/children/${c.id}/approve-image`, form);
    setChild(child);
    const hadPhoto = !!state.photo;
    clearPhoto();
    refresh();
    toast(hadPhoto ? 'Caricatura aprobada. La foto se borró de este teléfono.' : 'Caricatura aprobada.');
  } catch (err) {
    fail(err);
    setBusy('imageBusy', null);
    e.target.disabled = false;
  }
}

// 2. Carta
// Todo se prepara en este teléfono: las páginas se enderezan y los datos se tapan con pinitos.
// Solo se sube la versión con pinitos.
const ROLES = { front: 'Sobre (frente)', back: 'Sobre (atrás)', letter: 'Carta', skip: 'No usar' };
// Formato impreso "Carta para Santa Claus": lo que sigue al primer nombre y el lugar donde vive.
const SANTA_FORM = [
  { x: 0.489, y: 0.284, w: 0.339, h: 0.036 },
  { x: 0.606, y: 0.331, w: 0.315, h: 0.045 },
];

function renderLetter() {
  const c = state.child;
  const el = document.getElementById('sec-letter');
  if (!el) return;
  syncLetterText();
  const L = state.letter;
  el.innerHTML = `
    <h2><span class="section-num">2</span>Carta <span class="muted">(opcional)</span></h2>
    <p class="muted">Sube la carta y el sobre que decoró. En la página, el sobre se voltea y la carta sale de adentro.
      Tapa con 🌲 el apellido, la casa hogar, la escuela o cualquier lugar: solo se guarda la versión con pinitos.</p>
    ${L ? draftLetterHtml(L) : `
      ${c.letter_url ? savedLetterHtml(c) : ''}
      <div class="field"><label class="photo-pick">📄 ${c.letter_url ? 'Cambiar carta y sobre' : 'Subir escaneo (PDF) o fotos'}
        <input type="file" id="letterFiles" accept="image/*,application/pdf" multiple></label>
        <p class="hint">Puede ser el PDF del escáner de Notas con todas las páginas, o fotos sueltas.</p></div>`}
    <div id="letterBusy"></div>`;

  document.getElementById('letterFiles').onchange = addLetterFiles;
  el.onclick = onLetterClick;
  if (L) L.pages.forEach((p, i) => { bindPageCanvas(i); drawPreview(i); });
}

function savedLetterHtml(c) {
  return `
    <div class="letter-saved">
      ${c.letter_front_url ? `<button class="flip" id="flip" type="button" aria-label="Voltear el sobre"><span class="flip-in">
        <img src="${esc(c.letter_front_url)}" alt="Sobre (frente)">
        ${c.letter_back_url ? `<img class="flip-back" src="${esc(c.letter_back_url)}" alt="Sobre (atrás)">` : ''}</span></button>` : ''}
      <img class="letter-thumb" src="${esc(c.letter_url)}" alt="Carta">
    </div>
    ${c.letter_back_url ? '<p class="hint">Toca el sobre para voltearlo.</p>' : ''}
    ${letterTextHtml(c.letter_text_es, c.letter_text_en)}
    <div class="btn-row"><button class="btn btn-primary" id="saveLetterText" type="button">Guardar texto</button></div>
    <div class="btn-row"><button class="btn btn-small btn-danger" id="deleteLetter" type="button">Quitar carta</button></div>`;
}

function draftLetterHtml(L) {
  return `
    ${L.pages.map((p, i) => `
      <div class="lpage">
        <canvas class="lpage-canvas ${p.drawing ? 'drawing' : ''}" data-canvas="${i}"></canvas>
        <div class="roles">${Object.entries(ROLES).map(([r, label]) =>
          `<button type="button" class="role ${p.role === r ? 'active' : ''}" data-role="${r}" data-i="${i}">${label}</button>`).join('')}</div>
        <div class="btn-row">
          <button class="btn btn-small" type="button" data-rot="-1" data-i="${i}">⟲ Girar</button>
          <button class="btn btn-small" type="button" data-rot="1" data-i="${i}">⟳ Girar</button>
          <button class="btn btn-small ${p.drawing ? 'btn-gold' : ''}" type="button" data-draw="${i}">${p.drawing ? '✓ Listo' : '🌲 Tapar con pinitos'}</button>
        </div>
        ${p.role === 'letter' ? `<div class="btn-row"><button class="btn btn-small" type="button" data-preset="${i}">🌲 Tapar nombre y lugar del formato de Santa Claus</button></div>` : ''}
        ${p.drawing ? '<p class="hint">Arrastra el dedo sobre lo que quieras tapar. Toca un pinito para quitarlo.</p>' : ''}
      </div>`).join('')}
    <div class="field"><label class="photo-pick">＋ Agregar otra foto o PDF
      <input type="file" id="letterFiles" accept="image/*,application/pdf" multiple></label></div>
    ${L.warnings.length ? `<div class="note note-warn"><b>🔒 Revisa la privacidad:</b><ul>${L.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
    <button class="btn btn-gold btn-block" id="transcribe" type="button" style="margin-top:1rem">✨ Leer la carta con IA</button>
    ${letterTextHtml(L.text_es, L.text_en)}
    <div class="btn-row">
      <button class="btn btn-primary" id="saveLetter" type="button">Guardar carta</button>
      <button class="btn" id="cancelLetter" type="button">Cancelar</button>
    </div>`;
}

function letterTextHtml(es, en) {
  return `
    <div class="field"><label for="lt_es">Lo que dice la carta</label>
      <textarea id="lt_es" class="tall" maxlength="3000">${esc(es)}</textarea></div>
    <div class="field"><label for="lt_en">Traducción al inglés</label>
      <textarea id="lt_en" class="tall" maxlength="3000">${esc(en)}</textarea>
      <p class="hint">Se ve en la página con el botón "Ver lo que dice". Solo el primer nombre: sin apellidos ni lugares.</p></div>`;
}

// Pasa lo escrito en los cuadros de texto al borrador antes de volver a dibujar la sección.
function syncLetterText() {
  const es = document.getElementById('lt_es');
  if (!state.letter || !es) return;
  state.letter.text_es = es.value;
  state.letter.text_en = document.getElementById('lt_en').value;
}

function onLetterClick(e) {
  const t = e.target.closest('button');
  if (!t) return;
  const L = state.letter;
  const i = Number(t.dataset.i ?? t.dataset.draw ?? t.dataset.preset);
  if (t.id === 'flip') return t.classList.toggle('flipped');
  if (t.id === 'transcribe') return transcribe(t);
  if (t.id === 'saveLetter') return saveLetter(t);
  if (t.id === 'saveLetterText') return saveLetterText(t);
  if (t.id === 'deleteLetter') return deleteLetter(t);
  if (t.id === 'cancelLetter') {
    if (!confirm('¿Descartar esta carta? No se guardó nada.')) return;
    state.letter = null;
    return renderLetter();
  }
  if (!L) return;
  const p = L.pages[i];
  if (t.dataset.role) {
    // Cada papel (frente, atrás, carta) lo tiene una sola página: si otra ya lo tenía, intercambian.
    const other = t.dataset.role !== 'skip' && L.pages.find((q) => q !== p && q.role === t.dataset.role);
    if (other) other.role = p.role;
    p.role = t.dataset.role;
  } else if (t.dataset.rot) {
    const dir = Number(t.dataset.rot);
    p.rot = (p.rot + dir + 4) % 4;
    p.stickers = p.stickers.map((r) => turnRect(r, dir));
  } else if (t.dataset.draw !== undefined) {
    p.drawing = !p.drawing;
  } else if (t.dataset.preset !== undefined) {
    p.stickers.push(...SANTA_FORM.map((r) => ({ ...r })));
    toast('Listo. Revisa que los pinitos tapen bien; si no, quítalos y dibuja otros.');
  }
  renderLetter();
}

// Gira un recuadro (en coordenadas de 0 a 1) junto con la página.
function turnRect(r, dir) {
  return dir > 0
    ? { x: 1 - (r.y + r.h), y: r.x, w: r.h, h: r.w }
    : { x: r.y, y: 1 - (r.x + r.w), w: r.h, h: r.w };
}

const rectFrom = (a, b) => ({
  x: Math.max(0, Math.min(a.x, b.x)), y: Math.max(0, Math.min(a.y, b.y)),
  w: Math.min(1, Math.abs(b.x - a.x)), h: Math.min(1, Math.abs(b.y - a.y)),
});

function bindPageCanvas(i) {
  const canvas = app.querySelector(`[data-canvas="${i}"]`);
  const p = state.letter.pages[i];
  const pos = (e) => {
    const b = canvas.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) };
  };
  let start = null;
  canvas.onpointerdown = (e) => {
    if (!p.drawing) return;
    const pt = pos(e);
    const hit = p.stickers.findIndex((r) => pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h);
    if (hit >= 0) { p.stickers.splice(hit, 1); drawPreview(i); return; }
    start = pt;
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove = (e) => {
    if (!start) return;
    p.temp = rectFrom(start, pos(e));
    drawPreview(i);
  };
  canvas.onpointerup = (e) => {
    if (!start) return;
    const r = rectFrom(start, pos(e));
    start = null;
    p.temp = null;
    if (r.w > 0.02 && r.h > 0.01) p.stickers.push(r);
    drawPreview(i);
  };
}

function drawPreview(i) {
  const canvas = app.querySelector(`[data-canvas="${i}"]`);
  if (!canvas) return;
  const p = state.letter.pages[i];
  const img = renderPage(p, 1000);
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  if (p.temp) {
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#2E8B3E';
    ctx.strokeRect(p.temp.x * img.width, p.temp.y * img.height, p.temp.w * img.width, p.temp.h * img.height);
  }
}

// La página girada y con pinitos, lista para mostrar o subir.
function renderPage(p, maxSide) {
  const sw = p.src.width;
  const sh = p.src.height;
  const turned = p.rot % 2 === 1;
  const w0 = turned ? sh : sw;
  const h0 = turned ? sw : sh;
  const s = Math.min(1, maxSide / Math.max(w0, h0));
  const cv = document.createElement('canvas');
  cv.width = Math.round(w0 * s);
  cv.height = Math.round(h0 * s);
  const ctx = cv.getContext('2d');
  ctx.save();
  ctx.translate(cv.width / 2, cv.height / 2);
  ctx.rotate((p.rot * Math.PI) / 2);
  ctx.drawImage(p.src, (-sw * s) / 2, (-sh * s) / 2, sw * s, sh * s);
  ctx.restore();
  for (const r of p.stickers) drawSticker(ctx, r.x * cv.width, r.y * cv.height, r.w * cv.width, r.h * cv.height);
  return cv;
}

// Calcomanía crema con una fila de pinitos de Navidad.
function drawSticker(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(h, w) / 2);
  ctx.fillStyle = '#FFF1DC';
  ctx.fill();
  ctx.setLineDash([h * 0.18, h * 0.11]);
  ctx.lineWidth = Math.max(2, h * 0.05);
  ctx.strokeStyle = '#FFAC32';
  ctx.stroke();
  const th = Math.min(h * 0.78, w * 0.9 / 0.72);
  const tw = th * 0.72;
  const n = Math.max(1, Math.floor((w - h * 0.4) / (tw * 1.25)));
  const gap = (w - n * tw) / (n + 1);
  for (let k = 0; k < n; k++) {
    const tx = x + gap + k * (tw + gap);
    const top = y + (h - th) / 2;
    const trunk = th * 0.16;
    ctx.fillStyle = '#8C5A2B';
    ctx.fillRect(tx + tw * 0.39, top + th - trunk, tw * 0.22, trunk);
    ctx.fillStyle = k % 2 ? '#40A34D' : '#2E8B3E';
    for (const f of [0, 0.28, 0.52]) {
      const tWidth = tw * (1 - f * 0.55);
      const base = top + th - trunk - th * f * 0.62;
      ctx.beginPath();
      ctx.moveTo(tx + tw / 2 - tWidth / 2, base);
      ctx.lineTo(tx + tw / 2 + tWidth / 2, base);
      ctx.lineTo(tx + tw / 2, base - th * 0.46);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#FFC531';
    ctx.beginPath();
    ctx.arc(tx + tw / 2, top + th * 0.06, th * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

async function addLetterFiles(e) {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  if (!files.length) return;
  setBusy('letterBusy', 'Abriendo…');
  try {
    const sources = [];
    for (const f of files) {
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) sources.push(...(await pdfPages(f)));
      else sources.push(await toCanvas(await loadImage(f), 1800));
    }
    syncLetterText();
    const c = state.child;
    const L = state.letter || (state.letter = { pages: [], text_es: c.letter_text_es, text_en: c.letter_text_en, warnings: [] });
    for (const src of sources) L.pages.push(guessRole(L.pages, src));
    renderLetter();
  } catch (err) {
    console.error(err);
    setBusy('letterBusy', null);
    toast('No se pudo abrir ese archivo. Prueba con fotos o con otro PDF.', true);
  }
}

// La hoja de la carta es casi cuadrada; el sobre es largo y angosto. Si el sobre viene de lado, se acuesta.
function guessRole(pages, src) {
  const ratio = Math.min(src.width, src.height) / Math.max(src.width, src.height);
  const taken = (r) => pages.some((p) => p.role === r);
  let role = 'skip';
  if (ratio > 0.6 && !taken('letter')) role = 'letter';
  else if (ratio <= 0.6 && !taken('front')) role = 'front';
  else if (ratio <= 0.6 && !taken('back')) role = 'back';
  const rot = ratio <= 0.6 && src.height > src.width ? 3 : 0;
  return { src, rot, role, stickers: [], drawing: false, temp: null };
}

async function toCanvas(img, maxSide) {
  const w = img.width || img.naturalWidth;
  const h = img.height || img.naturalHeight;
  const s = Math.min(1, maxSide / Math.max(w, h));
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * s);
  cv.height = Math.round(h * s);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  img.close?.();
  return cv;
}

// El lector de PDF solo se descarga si alguien sube un PDF.
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
let pdfjs = null;
async function loadPdfJs() {
  if (pdfjs) return pdfjs;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PDFJS + 'pdf.min.js';
    s.integrity = 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e';
    s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  pdfjs = window.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
  return pdfjs;
}

async function pdfPages(file) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out = [];
  for (let n = 1; n <= Math.min(doc.numPages, 6); n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 1800 / Math.max(base.width, base.height) });
    const cv = document.createElement('canvas');
    cv.width = Math.round(viewport.width);
    cv.height = Math.round(viewport.height);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    out.push(cv);
  }
  return out;
}

// JPEG de 1600 px por papel, ya girado y con pinitos (sin metadatos, porque sale de un canvas).
async function letterBlobs() {
  const out = {};
  for (const role of ['front', 'back', 'letter']) {
    const p = state.letter.pages.find((x) => x.role === role);
    if (p) out[role] = await canvasBlob(renderPage(p, 1600), 'image/jpeg', 0.86);
  }
  return out;
}

async function transcribe(btn) {
  const c = state.child;
  syncLetterText();
  const blobs = await letterBlobs();
  if (!blobs.letter) return toast('Marca cuál página es la carta.', true);
  btn.disabled = true;
  setBusy('letterBusy', 'Leyendo la carta… tarda unos segundos.');
  try {
    const form = new FormData();
    for (const [k, b] of Object.entries(blobs)) form.append(k, b, `${k}.jpg`);
    const { suggestion: s } = await api('POST', `/api/admin/children/${c.id}/transcribe-letter`, form);
    document.getElementById('lt_es').value = s.text_es;
    document.getElementById('lt_en').value = s.text_en;
    state.letter.warnings = s.privacy_warnings;
    renderLetter();
    toast(s.privacy_warnings.length ? 'Listo. Revisa los avisos de privacidad.' : 'Listo. Revisa el texto antes de guardar.');
  } catch (err) {
    fail(err);
    setBusy('letterBusy', null);
    btn.disabled = false;
  }
}

async function saveLetter(btn) {
  const c = state.child;
  syncLetterText();
  const L = state.letter;
  const letterPage = L.pages.find((p) => p.role === 'letter');
  if (!letterPage) return toast('Marca cuál página es la carta.', true);
  if (!letterPage.stickers.length && !confirm('La carta no tiene pinitos. ¿Seguro que no trae apellido, casa hogar, escuela ni dirección?')) return;
  btn.disabled = true;
  setBusy('letterBusy', 'Guardando la carta…');
  try {
    const blobs = await letterBlobs();
    const form = new FormData();
    for (const [k, b] of Object.entries(blobs)) form.append(k, b, `${k}.jpg`);
    if (!blobs.front && c.letter_front_url) form.append('remove_front', '1');
    if (!blobs.back && c.letter_back_url) form.append('remove_back', '1');
    form.append('text_es', L.text_es);
    form.append('text_en', L.text_en);
    const { child } = await api('POST', `/api/admin/children/${c.id}/letter`, form);
    setChild(child);
    state.letter = null;
    refresh();
    toast('Carta guardada. Se verá en la página cuando el perfil esté publicado.');
  } catch (err) {
    fail(err);
    setBusy('letterBusy', null);
    btn.disabled = false;
  }
}

async function saveLetterText(btn) {
  const c = state.child;
  btn.disabled = true;
  try {
    const form = new FormData();
    form.append('text_es', document.getElementById('lt_es').value);
    form.append('text_en', document.getElementById('lt_en').value);
    const { child } = await api('POST', `/api/admin/children/${c.id}/letter`, form);
    setChild(child);
    renderLetter();
    toast('Texto guardado.');
  } catch (err) {
    fail(err);
    btn.disabled = false;
  }
}

async function deleteLetter(btn) {
  const c = state.child;
  if (!confirm('¿Quitar la carta y el sobre de este perfil? Se borran las imágenes.')) return;
  btn.disabled = true;
  try {
    const { child } = await api('DELETE', `/api/admin/children/${c.id}/letter`);
    setChild(child);
    renderLetter();
    toast('Carta quitada.');
  } catch (err) {
    fail(err);
    btn.disabled = false;
  }
}

// 5. Estado de los regalos
function renderGiftStatus() {
  const c = state.child;
  const el = document.getElementById('sec-gifts');
  el.innerHTML = `
    <h2><span class="section-num">5</span>¿Ya regalaron algo?</h2>
    <p class="muted">Cuando llegue un regalo de Amazon, márcalo aquí. En la página aparecerá como "Ya fue regalado".</p>
    ${c.gifts.length ? c.gifts.map((g) => `
      <div class="gift-status">
        <div class="name"><div>${esc(g.title_es)}</div>${g.url
          ? `<a href="${esc(g.url)}" target="_blank" rel="noopener">Ver en Amazon ↗</a>`
          : '<span class="muted">Sin link de Amazon todavía</span>'}</div>
        ${g.status === 'gifted'
          ? `<button class="btn btn-small" data-gift="${g.id}" data-status="available">✓ Regalado</button>`
          : `<button class="btn btn-small btn-primary" data-gift="${g.id}" data-status="gifted">Marcar regalado</button>`}
      </div>`).join('') : '<p class="muted">Sin regalos todavía.</p>'}`;
  el.querySelectorAll('[data-gift]').forEach((b) => (b.onclick = () => setGiftStatus(b)));
}

async function setGiftStatus(btn) {
  const { gift: giftId, status } = btn.dataset;
  if (status === 'available' && !confirm('¿Marcar este regalo como disponible otra vez?')) return;
  btn.disabled = true;
  try {
    const { gift } = await api('PATCH', `/api/admin/gifts/${giftId}`, { status });
    state.child.gifts = state.child.gifts.map((g) => (g.id === gift.id ? { ...g, ...gift } : g));
    renderGiftStatus();
    if (!state.dirty.has('notes')) renderNotes();
    toast(status === 'gifted' ? '¡Regalo marcado como entregado!' : 'Regalo disponible otra vez.');
  } catch (err) {
    fail(err);
    btn.disabled = false;
  }
}

// 5. Publicar
function renderPublish() {
  const c = state.child;
  const el = document.getElementById('sec-publish');
  const published = c.status === 'published';
  el.innerHTML = `
    <h2><span class="section-num">6</span>Publicar</h2>
    <label class="check">
      <input type="checkbox" id="guardian" ${c.guardian_ok ? 'checked' : ''}>
      <span><b>Tenemos la autorización del tutor legal</b><br>
      <span class="muted">Obligatorio para publicar. Es interno: no aparece en la página.</span></span>
    </label>
    ${c.gifts.some((g) => !g.url) ? `<div class="note note-warn">${c.gifts.filter((g) => !g.url).length === 1 ? '1 regalo no tiene' : `${c.gifts.filter((g) => !g.url).length} regalos no tienen`} link de Amazon.
      Se puede publicar, pero en la página saldrán como "Muy pronto en Amazon" hasta que agregues el link en la sección 1.</div>` : ''}
    ${c.problems.length && !published ? `<div class="note note-info"><b>Antes de publicar falta:</b><ul>${c.problems.map((p) => `<li>${esc(PROBLEMS[p] || p)}</li>`).join('')}</ul></div>` : ''}
    ${published ? `<div class="note note-ok">Publicado${c.published_by ? ` por ${esc(c.published_by)}` : ''}. Se ve en <a href="${esc(c.public_url)}" target="_blank" rel="noopener">${esc(location.host + c.public_url)}</a></div>` : ''}
    <div class="btn-row">
      ${published
        ? '<button class="btn" id="unpublish">Quitar de la página</button>'
        : `<button class="btn btn-primary" id="publish" ${c.problems.length ? 'disabled' : ''}>Publicar en la página</button>`}
    </div>
    <div class="btn-row" style="margin-top:2rem">
      <button class="btn btn-small btn-danger" id="delete">Borrar este perfil</button>
    </div>`;
  document.getElementById('guardian').onchange = setGuardian;
  const pub = document.getElementById('publish');
  if (pub) pub.onclick = publish;
  const unpub = document.getElementById('unpublish');
  if (unpub) unpub.onclick = unpublish;
  document.getElementById('delete').onclick = deleteChild;
}

async function setGuardian(e) {
  const c = state.child;
  const ok = e.target.checked;
  if (!ok && c.status === 'published' && !confirm('Sin la autorización, el perfil se quita de la página de inmediato. ¿Continuar?')) {
    e.target.checked = true;
    return;
  }
  e.target.disabled = true;
  try {
    const { child } = await api('PATCH', `/api/admin/children/${c.id}`, { guardian_ok: ok });
    setChild(child);
    refresh();
    toast(ok ? 'Autorización registrada.' : 'Autorización quitada.');
  } catch (err) {
    e.target.checked = !ok;
    fail(err);
  } finally {
    e.target.disabled = false;
  }
}

async function publish(e) {
  const c = state.child;
  if (state.dirty.size) return toast('Primero guarda tus cambios.', true);
  if (!confirm(`¿Publicar el perfil de ${c.first_name}? Lo podrá ver cualquier persona con el link.`)) return;
  e.target.disabled = true;
  try {
    const { child } = await api('POST', `/api/admin/children/${c.id}/publish`);
    setChild(child);
    refresh();
    toast('¡Publicado! 🎁');
  } catch (err) {
    if (err.code === 'not_ready') {
      state.child.problems = err.data.problems || state.child.problems;
      renderPublish();
    }
    fail(err);
    e.target.disabled = false;
  }
}

async function unpublish(e) {
  const c = state.child;
  if (!confirm('¿Quitar este perfil de la página? Puedes volver a publicarlo después.')) return;
  e.target.disabled = true;
  try {
    const { child } = await api('POST', `/api/admin/children/${c.id}/unpublish`);
    setChild(child);
    refresh();
    toast('Perfil quitado de la página.');
  } catch (err) {
    fail(err);
    e.target.disabled = false;
  }
}

async function deleteChild() {
  const c = state.child;
  const typed = prompt(`Esto borra el perfil, sus regalos y sus imágenes para siempre.\n\nPara confirmar escribe ${c.id}`);
  if (typed === null) return;
  if (typed.trim().toUpperCase() !== c.id) return toast('El ID no coincide. No se borró nada.', true);
  try {
    await api('DELETE', `/api/admin/children/${c.id}`);
    state.dirty.clear();
    toast(`${c.id} borrado.`);
    location.hash = '#/';
  } catch (err) {
    fail(err);
  }
}

// --- IMÁGENES EN EL NAVEGADOR ---

function setBusy(id, text) {
  const box = document.getElementById(id);
  if (box) box.innerHTML = text ? `<div class="busy"><span class="spinner"></span><span>${esc(text)}</span></div>` : '';
}

async function loadImage(blob) {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

const canvasBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

// Reduce a 1024 px y recodifica en JPEG: el resultado no lleva EXIF, GPS ni otros metadatos.
async function preparePhoto(file) {
  const img = await loadImage(file);
  const w = img.width || img.naturalWidth;
  const h = img.height || img.naturalHeight;
  const scale = Math.min(1, 1024 / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close?.();
  const blob = await canvasBlob(canvas, 'image/jpeg', 0.9);
  if (!blob) throw new Error('canvas');
  return blob;
}

// Miniatura de 600 px (WebP si el navegador puede; Safari usa JPEG) e imagen 1200x630 para redes.
async function makeDerivatives(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  const img = await loadImage(await res.blob());
  const w = img.width || img.naturalWidth;
  const h = img.height || img.naturalHeight;

  const t = document.createElement('canvas');
  t.width = t.height = 600;
  drawCover(t.getContext('2d'), img, w, h, 0, 0, 600, 600);
  let thumb = await canvasBlob(t, 'image/webp', 0.82);
  if (!thumb || thumb.type !== 'image/webp') thumb = await canvasBlob(t, 'image/jpeg', 0.84);

  await Promise.all([
    document.fonts.load('600 76px "Cormorant Garamond"'),
    document.fonts.load('italic 400 76px "Cormorant Garamond"'),
    document.fonts.load('500 24px Outfit'),
  ]).catch(() => {});
  const o = document.createElement('canvas');
  o.width = 1200;
  o.height = 630;
  const ctx = o.getContext('2d');
  ctx.fillStyle = '#2D1A45';
  ctx.fillRect(0, 0, 1200, 630);
  const glow = ctx.createRadialGradient(1100, 80, 0, 1100, 80, 520);
  glow.addColorStop(0, 'rgba(123,79,181,0.45)');
  glow.addColorStop(1, 'rgba(123,79,181,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(630, 0, 570, 630);
  drawCover(ctx, img, w, h, 0, 0, 630, 630);
  ctx.fillStyle = '#C9A96E';
  ctx.fillRect(630, 0, 4, 630);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#C9A96E';
  ctx.font = '500 20px Outfit, sans-serif';
  ctx.fillText('THE LORENA LOPEZ FOUNDATION', 690, 170);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '600 76px "Cormorant Garamond", serif';
  ctx.fillText('Adopta un', 690, 270);
  ctx.fillStyle = '#C9A96E';
  ctx.font = 'italic 400 76px "Cormorant Garamond", serif';
  ctx.fillText('Regalo', 690, 350);
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = '400 28px Outfit, sans-serif';
  ctx.fillText('Sponsor a Child · Navidad', 690, 410);
  ctx.fillStyle = '#C9A96E';
  ctx.fillRect(690, 455, 60, 2);
  ctx.fillStyle = '#E8D5B0';
  ctx.font = '400 22px Outfit, sans-serif';
  ctx.fillText('lorenalopezfoundation.org', 690, 500);
  img.close?.();
  const og = await canvasBlob(o, 'image/jpeg', 0.86);
  return { thumb, og };
}

function drawCover(ctx, img, w, h, x, y, dw, dh) {
  const s = Math.max(dw / w, dh / h);
  const sw = dw / s;
  const sh = dh / s;
  ctx.drawImage(img, (w - sw) / 2, (h - sh) / 2, sw, sh, x, y, dw, dh);
}

// --- INICIO ---

(async () => {
  try {
    const { email } = await api('GET', '/api/admin/me');
    document.getElementById('who').textContent = email;
  } catch (err) {
    if (err.code !== 'unauthorized') fail(err);
    return;
  }
  route();
})();
