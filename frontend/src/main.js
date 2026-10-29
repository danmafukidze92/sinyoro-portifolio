import '@fontsource-variable/bricolage-grotesque';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './styles.css';
import { aboutHTML, experienceHTML, projectHTML, skillsHTML, certsHTML, contactHTML, classicHTML, bindContactForms, esc } from './ui/content.js';
import { V8Engine } from './audio/V8Engine.js';

const $ = (s) => document.querySelector(s);
const state = { data: null, exp: null, engine: new V8Engine(), modalOpen: false, zone: null, mode: '3d' };

// ---------------------------------------------------------------- boot
const progress = (pct, text) => {
  $('#progress-bar').style.width = `${pct}%`;
  if (text) $('#loader-status').textContent = text;
};

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2')) || !!c.getContext('webgl');
  } catch { return false; }
}

async function boot() {
  progress(8, 'Fetching portfolio…');
  const res = await fetch('/api/portfolio');
  if (!res.ok) throw new Error(`Portfolio API returned ${res.status}`);
  state.data = await res.json();

  renderClassic();
  const wantClassic = new URLSearchParams(location.search).has('classic') || location.hash === '#classic';
  if (!webglAvailable()) {
    showClassic('Your browser has no WebGL, so here is the classic portfolio.');
    return;
  }

  progress(25, 'Loading fonts…');
  await Promise.all([
    document.fonts.load('800 64px "Bricolage Grotesque Variable"'),
    document.fonts.load('500 30px "JetBrains Mono"'),
  ]).catch(() => {});

  progress(45, 'Building the savanna…');
  const { Experience } = await import('./world/Experience.js');
  progress(70, 'Polishing the paint…');
  await new Promise((r) => requestAnimationFrame(r));

  state.exp = new Experience($('#scene'), state.data, { onZone, onTick });
  state.engine.onPop = (s) => state.exp.car.flash(s);
  if (new URLSearchParams(location.search).has('debug')) window.__exp = state.exp;
  state.exp.paused = true;

  progress(100, 'Ready. Turn the key.');
  const start = $('#start-btn');
  start.disabled = false;
  start.focus();
  start.addEventListener('click', startDriving, { once: true });

  if (wantClassic) showClassic();
}

function startDriving() {
  state.engine.start();
  state.exp.paused = false;
  $('#loader').classList.add('done');
  setTimeout(() => $('#loader').remove(), 800);
  for (const id of ['#hud', '#dash', '#minimap']) $(id).hidden = false;
  const touch = matchMedia('(pointer: coarse)').matches;
  $('#touch').hidden = !touch;
  $('#keys').hidden = touch;
  $('#scene').focus();
}

// ---------------------------------------------------------------- per-frame
let mmFrame = 0;
const mmCtx = $('#minimap').getContext('2d');
function onTick(dt, { speed, throttle }) {
  const kmh = Math.abs(speed) * 3.6 * 1.4;
  state.engine.update(dt, state.modalOpen ? 0 : throttle, kmh);
  const d = state.engine.display;
  $('#speed').textContent = Math.round(kmh);
  $('#gear').textContent = speed < -0.5 ? 'R' : kmh < 1 && !throttle ? 'N' : d.gear;
  $('#rpm-bar').style.width = `${Math.min(100, (d.rpm / 7000) * 100)}%`;
  $('#boost-bar').style.transform = `scaleX(${d.boost.toFixed(2)})`;
  if (++mmFrame % 2 === 0 && !$('#minimap').hidden) state.exp.drawMinimap(mmCtx, 168, 168);
  if (state.exp.view === 'cockpit' && mmFrame % 3 === 0) {
    state.exp.car.drawCluster(kmh, d.rpm, speed < -0.5 ? 'R' : kmh < 1 && !throttle ? 'N' : d.gear, d.boost);
  }
}

// ---------------------------------------------------------------- zones
const KIND_LABEL = { about: 'Start here', experience: 'Career milestone', project: 'Project', skills: 'Toolbox', certs: 'Achievements', contact: 'Get in touch' };
const KIND_SUB = {
  about: 'Who I am, what I’ve delivered and where I’m heading.',
  skills: 'Platforms, languages and tools I work with. Knock the crates over.',
  certs: 'Vendor and technology certifications.',
  contact: 'Email, LinkedIn, or send a message right here.',
};

function onZone(zone) {
  state.zone = zone;
  const card = $('#zone-card');
  if (!zone) { card.hidden = true; return; }
  let html = `<p class="eyebrow">${KIND_LABEL[zone.kind]}</p>`;
  if (zone.kind === 'experience') {
    const m = zone.payload;
    html += `<h2>${esc(m.role)}</h2><p class="sub">${esc(m.company)} · ${esc(m.period)}</p>`;
    if (m.points?.length) html += `<ul>${m.points.slice(0, 2).map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`;
    if (m.points?.length > 2) html += openButton('Read more');
  } else if (zone.kind === 'project') {
    const p = zone.payload;
    html += `<h2 style="color:${esc(p.color)}">${esc(p.name)}</h2><p class="sub">${esc(p.tagline)}</p>` + openButton('Open project');
  } else {
    html += `<h2>${esc(zone.title)}</h2><p class="sub">${KIND_SUB[zone.kind] || ''}</p>` + openButton('Open');
  }
  card.innerHTML = html;
  card.hidden = false;
  card.querySelector('[data-open]')?.addEventListener('click', openZone);
}

const openButton = (label) => `<button class="btn btn-primary" data-open>${label}</button><span class="hint">or press E</span>`;

function openZone() {
  const z = state.zone;
  if (!z) return;
  const d = state.data;
  const html = {
    about: () => aboutHTML(d),
    experience: () => experienceHTML(z.payload),
    project: () => projectHTML(z.payload),
    skills: () => skillsHTML(d),
    certs: () => certsHTML(d),
    contact: () => contactHTML(d),
  }[z.kind]?.();
  if (html) openModal(html);
}

function openModal(html) {
  $('#modal-body').innerHTML = html;
  bindContactForms($('#modal-body'));
  $('#modal').hidden = false;
  state.modalOpen = true;
  releaseAll();
  $('.modal-close').focus();
}

function closeModal() {
  $('#modal').hidden = true;
  state.modalOpen = false;
  $('#scene').focus();
}
$('#modal').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); });

// ---------------------------------------------------------------- input
const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'brake', ShiftLeft: 'boost', ShiftRight: 'boost',
};
function setInput(key, v) { if (state.exp) state.exp.car.input[key] = v; }
function releaseAll() { if (state.exp) for (const k of Object.keys(state.exp.car.input)) state.exp.car.input[k] = 0; }

window.addEventListener('keydown', (e) => {
  if (state.mode !== '3d' || !state.exp || state.exp.paused) return;
  if (e.target.closest?.('input, textarea')) return;
  if (state.modalOpen) { if (e.key === 'Escape') closeModal(); return; }
  if (KEYMAP[e.code]) { setInput(KEYMAP[e.code], 1); e.preventDefault(); return; }
  switch (e.code) {
    case 'KeyE': case 'Enter': openZone(); break;
    case 'KeyR': state.exp.resetCar(); break;
    case 'KeyC': cyclePaint(); break;
    case 'KeyV': toggleView(); break;
    case 'KeyM': toggleSound(); break;
    case 'KeyG': toggleMenu(); break;
    case 'KeyH': showClassic(); break;
    case 'Escape': toggleMenu(false); break;
  }
});
window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) setInput(KEYMAP[e.code], 0); });
window.addEventListener('blur', releaseAll);

// touch buttons
document.querySelectorAll('#touch [data-key]').forEach((btn) => {
  const key = btn.dataset.key;
  const on = (e) => { e.preventDefault(); btn.classList.add('active'); setInput(key, 1); };
  const off = (e) => { e.preventDefault(); btn.classList.remove('active'); setInput(key, 0); };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointercancel', off);
  btn.addEventListener('pointerleave', off);
});

// ---------------------------------------------------------------- HUD actions
async function buildMenu() {
  const { TELEPORTS } = await import('./world/Zones.js');
  const colors = { spawn: '#fff3e2', about: '#ffd166', experience: '#ffb347', projects: '#4fb3ff', skills: '#5ad17a', certs: '#ff5d73', contact: '#4fb3ff' };
  $('#go-menu').innerHTML = TELEPORTS.map((t) => `<button role="menuitem" data-go="${t.id}"><span class="dot" style="background:${colors[t.id]}"></span>${t.label}</button>`).join('');
  $('#go-menu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (!b) return;
    state.exp.teleport(b.dataset.go);
    toggleMenu(false);
    $('#scene').focus();
  });
}
function toggleMenu(force) {
  const menu = $('#go-menu');
  const open = force ?? menu.hidden;
  menu.hidden = !open;
  $('#go-btn').setAttribute('aria-expanded', String(open));
  if (open) menu.querySelector('button')?.focus();
}
function toggleView() {
  const v = state.exp.toggleView();
  $('#view-name').textContent = v === 'cockpit' ? 'Chase' : 'Cockpit';
  $('#dash').classList.toggle('in-cockpit', v === 'cockpit');
  $('#keys').classList.toggle('in-cockpit', v === 'cockpit');
}
function cyclePaint() {
  const p = state.exp.car.nextPaint();
  $('#paint-name').textContent = p.name;
}
function toggleSound() {
  const muted = !state.engine.muted;
  state.engine.setMuted(muted);
  $('#sound-btn').setAttribute('aria-pressed', String(!muted));
}
$('#go-btn').addEventListener('click', () => toggleMenu());
$('#paint-btn').addEventListener('click', cyclePaint);
$('#view-btn').addEventListener('click', toggleView);
$('#sound-btn').addEventListener('click', toggleSound);
$('#classic-btn').addEventListener('click', () => showClassic());
$('#brand').addEventListener('click', (e) => { e.preventDefault(); openModal(aboutHTML(state.data)); });
document.addEventListener('click', (e) => { if (!e.target.closest('.menu-wrap')) toggleMenu(false); });

// ---------------------------------------------------------------- classic view
function renderClassic() {
  const root = $('#classic');
  root.innerHTML = classicHTML(state.data);
  bindContactForms(root);
  root.querySelector('#back-to-3d').addEventListener('click', (e) => { e.preventDefault(); show3D(); });
  document.title = `${state.data.profile.name} — Portfolio`;
}

function showClassic(note) {
  state.mode = 'classic';
  releaseAll();
  if (state.exp) state.exp.paused = true;
  state.engine.setMuted(true);
  document.body.classList.add('classic-mode');
  $('#classic').hidden = false;
  $('#loader')?.classList.add('done');
  for (const id of ['#hud', '#dash', '#minimap', '#touch', '#keys', '#zone-card']) $(id).hidden = true;
  if (note) $('#classic').insertAdjacentHTML('afterbegin', `<p class="c-eyebrow" style="padding:12px 16px;margin:0">${esc(note)}</p>`);
  if (!state.exp) $('#back-to-3d')?.remove();
  window.scrollTo(0, 0);
}

function show3D() {
  if (!state.exp) return;
  state.mode = '3d';
  document.body.classList.remove('classic-mode');
  $('#classic').hidden = true;
  if (!$('#loader') || $('#loader').classList.contains('done')) {
    // already started: resume straight away
    if (!state.engine.started) state.engine.start();
    state.engine.setMuted($('#sound-btn').getAttribute('aria-pressed') === 'false');
    state.exp.paused = false;
    for (const id of ['#hud', '#dash', '#minimap']) $(id).hidden = false;
    const touch = matchMedia('(pointer: coarse)').matches;
    $('#touch').hidden = !touch; $('#keys').hidden = touch;
    onZone(state.zone);
  }
  if ($('#loader') && !$('#loader').classList.contains('done')) return;
  $('#scene').focus();
}
$('#loader-classic').addEventListener('click', (e) => { e.preventDefault(); if (state.data) showClassic(); });

// ---------------------------------------------------------------- go
$('#scene').tabIndex = 0;
boot()
  .then(() => state.exp && buildMenu())
  .catch((err) => {
    console.error(err);
    progress(100, 'Something went wrong loading the 3D world.');
    if (state.data) showClassic('The 3D world could not load, so here is the classic portfolio.');
  });
