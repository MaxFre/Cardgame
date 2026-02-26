import * as PIXI from 'pixi.js';
import { VFX, cssToHex } from '../game/VFX.js';
import frameSrc    from '../assets/cards/OnFieldFrame.png';
import forrestSrc  from '../assets/backgrounds/Forrest/BoardForrest.png';
import portrait0   from '../assets/CardPortraits/Captain.png';
import portrait1   from '../assets/CardPortraits/Drake.png';
import portrait2   from '../assets/CardPortraits/GreenDino.png';
import portrait3   from '../assets/CardPortraits/Priestess.png';
import portrait4   from '../assets/CardPortraits/Huntress.png';
import portrait5   from '../assets/CardPortraits/witch.png';

const _PORTRAITS = [portrait0, portrait1, portrait2, portrait3, portrait4, portrait5];

/** Create a 128×192 field-framed card Container with a random portrait inside a circle mask. */
function makePreviewCard(x, y) {
  const c = new PIXI.Container();
  c.x = x;
  c.y = y;

  // Circle mask matching FIELD_CIRCLE constants (cx=0, cy=-18, r=44)
  const cx = 0, cy = -18, r = 44;

  const mask = new PIXI.Graphics();
  mask.beginFill(0xffffff);
  mask.drawCircle(cx, cy, r);
  mask.endFill();
  c.addChild(mask);

  const src = _PORTRAITS[Math.floor(Math.random() * _PORTRAITS.length)];
  const portrait = PIXI.Sprite.from(src);
  portrait.anchor.set(0.5);
  portrait.x = cx;
  portrait.y = cy;
  portrait.width  = r * 2;
  portrait.height = r * 2;
  portrait.mask = mask;
  c.addChild(portrait);

  const frame = PIXI.Sprite.from(frameSrc);
  frame.anchor.set(0.5);
  frame.width  = 128;
  frame.height = 192;
  c.addChild(frame);

  return c;
}

// ── Step type metadata ────────────────────────────────────────────────────────
const STEP_COLORS = {
  burst: '#7c3aed', ring: '#1d4ed8', shake: '#dc2626',
  text:  '#d97706', rise: '#16a34a', flash: '#0891b2',
  fire:  '#e85d04',
};

const STEP_SCHEMAS = {
  burst: [
    { key: 'color',   label: 'Color',         type: 'color',  default: '#ffd700' },
    { key: 'count',   label: 'Particle Count', type: 'range',  min: 1,  max: 80,   step: 1,   default: 20 },
    { key: 'minDist', label: 'Min Distance',   type: 'range',  min: 0,  max: 300,  step: 5,   default: 30 },
    { key: 'maxDist', label: 'Max Distance',   type: 'range',  min: 0,  max: 500,  step: 5,   default: 80 },
    { key: 'minSize', label: 'Min Particle Size', type: 'range', min: 1, max: 30, step: 1,   default: 3 },
    { key: 'maxSize', label: 'Max Particle Size', type: 'range', min: 1, max: 30, step: 1,   default: 7 },
    { key: 'duration',label: 'Duration (ms)',  type: 'range',  min: 100,max: 3000, step: 50,  default: 600 },
    { key: 'delay',   label: 'Start Delay (ms)',type:'range',  min: 0,  max: 3000, step: 50,  default: 0 },
  ],
  ring: [
    { key: 'color',   label: 'Color',         type: 'color',  default: '#ffd700' },
    { key: 'radius',  label: 'Max Radius',    type: 'range',  min: 10, max: 400,  step: 5,   default: 80 },
    { key: 'duration',label: 'Duration (ms)', type: 'range',  min: 60, max: 2000, step: 20,  default: 280 },
    { key: 'delay',   label: 'Start Delay (ms)',type:'range', min: 0,  max: 3000, step: 50,  default: 0 },
  ],
  shake: [
    { key: 'intensity',label: 'Intensity (px)',type:'range',  min: 1,  max: 40,   step: 1,   default: 8 },
    { key: 'duration', label: 'Duration (ms)', type:'range',  min: 50, max: 2000, step: 25,  default: 300 },
    { key: 'delay',    label: 'Start Delay (ms)',type:'range',min: 0,  max: 3000, step: 50,  default: 0 },
  ],
  text: [
    { key: 'content', label: 'Text',          type: 'text',   default: '!' },
    { key: 'color',   label: 'Color',         type: 'color',  default: '#ffd700' },
    { key: 'size',    label: 'Font Size',      type: 'range',  min: 12, max: 120,  step: 2,   default: 58 },
    { key: 'riseY',   label: 'Rise Height',   type: 'range',  min: 0,  max: 300,  step: 5,   default: 80 },
    { key: 'duration',label: 'Duration (ms)', type: 'range',  min: 200,max: 3000, step: 50,  default: 700 },
    { key: 'delay',   label: 'Start Delay (ms)',type:'range', min: 0,  max: 3000, step: 50,  default: 0 },
  ],
  rise: [
    { key: 'color',      label: 'Color',          type: 'color', default: '#44ff88' },
    { key: 'count',      label: 'Particle Count',  type: 'range', min: 1,  max: 80,   step: 1,  default: 24 },
    { key: 'minSize',    label: 'Min Particle Size',type:'range', min: 1,  max: 30,   step: 1,  default: 3 },
    { key: 'maxSize',    label: 'Max Particle Size',type:'range', min: 1,  max: 30,   step: 1,  default: 8 },
    { key: 'riseHeight', label: 'Rise Height',     type: 'range', min: 40, max: 400,  step: 10, default: 160 },
    { key: 'duration',   label: 'Duration (ms)',   type: 'range', min: 300,max: 5000, step: 100,default: 1400 },
    { key: 'delay',      label: 'Start Delay (ms)',type:'range',  min: 0,  max: 3000, step: 50, default: 0 },
  ],
  flash: [
    { key: 'color',   label: 'Color',         type: 'color',  default: '#ffffff' },
    { key: 'alpha',   label: 'Opacity',       type: 'range',  min: 0.05, max: 1, step: 0.05, default: 0.6 },
    { key: 'duration',label: 'Duration (ms)', type: 'range',  min: 50,   max: 1500, step: 25, default: 300 },
    { key: 'delay',   label: 'Start Delay (ms)',type:'range', min: 0,    max: 3000, step: 50, default: 0 },
  ],
  fire: [
    { key: 'count',    label: 'Particle Count', type: 'range', min: 5,  max: 120, step: 1,   default: 40 },
    { key: 'height',   label: 'Rise Height',    type: 'range', min: 20, max: 300, step: 5,   default: 110 },
    { key: 'spread',   label: 'Horizontal Spread', type: 'range', min: 0, max: 100, step: 2, default: 28 },
    { key: 'duration', label: 'Duration (ms)',  type: 'range', min: 200, max: 4000, step: 50, default: 900 },
    { key: 'delay',    label: 'Start Delay (ms)', type: 'range', min: 0, max: 3000, step: 50, default: 0 },
  ],
};

function makeDefaultStep(type) {
  const schema = STEP_SCHEMAS[type] ?? [];
  const step = { type };
  for (const f of schema) step[f.key] = f.default;
  return step;
}

// ── Storage ───────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'vfx-presets';

function loadPresets() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}
function savePresetsToLocal(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
async function savePresetsToFile(data) {
  try {
    await fetch('/api/save-vfx-presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch { /* server not available */ }
}

// ── State ─────────────────────────────────────────────────────────────────────
let presets        = loadPresets();
let currentId      = null;
let selectedStep   = null; // index
let _looping       = false;
let _loopHandle    = null;

function currentPreset() { return currentId ? presets[currentId] : null; }
function currentSteps()  { return currentPreset()?.steps ?? []; }

// ── PIXI setup — fixed 1280×720 letterboxed ───────────────────────────────────
const DESIGN_W = 1280, DESIGN_H = 720;
const TOOLBAR_H = 48;

const app = new PIXI.Application({
  backgroundColor: 0x0a0a18,
  antialias: true,
  resolution: 2,
  autoDensity: true,
  width:  DESIGN_W,
  height: DESIGN_H,
});

const canvas = app.view;
canvas.style.position = 'absolute';
document.getElementById('app').appendChild(canvas);

function resizeEditor() {
  const availW = window.innerWidth - 240 - 280; // subtract panels
  const availH = window.innerHeight - TOOLBAR_H;
  const scale  = Math.min(availW / DESIGN_W, availH / DESIGN_H);
  const cssW   = Math.round(DESIGN_W * scale);
  const cssH   = Math.round(DESIGN_H * scale);
  const wrapEl = document.getElementById('canvasWrap');
  wrapEl.style.width  = cssW + 'px';
  wrapEl.style.height = cssH + 'px';
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.style.left   = '0';
  canvas.style.top   = '0';
}
window.addEventListener('resize', resizeEditor);
resizeEditor();

// Background
const bg = PIXI.Sprite.from(forrestSrc);
bg.alpha = 0.28;
bg.width  = DESIGN_W;
bg.height = DESIGN_H;
app.stage.addChild(bg);

// Source card on the left — framed with random portrait
const cardSprite = makePreviewCard(DESIGN_W * 0.28, DESIGN_H / 2);
app.stage.addChild(cardSprite);

// Target card on the right — framed with random portrait
const targetSprite = makePreviewCard(DESIGN_W * 0.72, DESIGN_H / 2);
app.stage.addChild(targetSprite);

// VFX layer
const vfx = new VFX(app);
app.stage.addChild(vfx.container);

// ── Play effect ───────────────────────────────────────────────────────────────
function playEffect() {
  const steps = currentSteps();
  if (!steps.length) return;
  vfx.playCustomEffect(steps, cardSprite.x, cardSprite.y).catch(() => {});
}

// ── Preview bolt flight ───────────────────────────────────────────────────────
function previewBolt(key) {
  // Reload config from DOM inputs so in-progress changes are reflected
  if (!presets._specialPresets) presets._specialPresets = {};
  const colorEl = document.getElementById(key + 'Color');
  const sizeEl  = document.getElementById(key + 'Size');
  const speedEl = document.getElementById(key + 'Speed');
  if (colorEl) presets._specialPresets[key + 'Color'] = colorEl.value;
  if (sizeEl)  presets._specialPresets[key + 'Size']  = Number(sizeEl.value);
  if (speedEl) presets._specialPresets[key + 'Speed'] = Number(speedEl.value);
  try { localStorage.setItem('vfx-special-presets', JSON.stringify(presets._specialPresets)); } catch {}
  // Sync VFX instance so the test uses latest values
  vfx._specialPresetsSync = presets._specialPresets;

  vfx.testBolt(
    cardSprite.x, cardSprite.y,
    targetSprite.x, targetSprite.y,
    key
  ).catch(() => {});
}
window.previewBolt = previewBolt;

document.getElementById('playBtn').addEventListener('click', () => {
  if (_looping) {
    // Stop loop
    _looping = false;
    clearTimeout(_loopHandle);
    document.getElementById('playBtn').textContent = '▶ Play';
    document.getElementById('loopCheck').checked = false;
  } else {
    playEffect();
  }
});

document.getElementById('loopCheck').addEventListener('change', e => {
  _looping = e.target.checked;
  document.getElementById('playBtn').textContent = _looping ? '⏹ Stop' : '▶ Play';
  if (_looping) startLoop();
  else clearTimeout(_loopHandle);
});

function startLoop() {
  if (!_looping) return;
  playEffect();
  const maxDur = Math.max(1200, ...currentSteps().map(s => (s.delay ?? 0) + (s.duration ?? 700)));
  _loopHandle = setTimeout(startLoop, maxDur + 300);
}

// ── Faction default selects ───────────────────────────────────────────────────
function renderFactionSelects() {
  const factionKeys = ['Folk', 'Wild', 'Magical'];
  const fp = presets._factionPresets ?? {};
  for (const faction of factionKeys) {
    const sel = document.getElementById('faction' + faction);
    if (!sel) continue;
    const current = fp[faction] ?? '';
    sel.innerHTML = '<option value="">\u2014 None (default flash) \u2014</option>';
    for (const [id, preset] of Object.entries(presets)) {
      if (id.startsWith('_')) continue;
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = preset.name ?? id;
      if (id === current) opt.selected = true;
      sel.appendChild(opt);
    }
  }
}

// Wire faction selects — update _factionPresets and persist on change
['Folk', 'Wild', 'Magical'].forEach(faction => {
  const sel = document.getElementById('faction' + faction);
  if (!sel) return;
  sel.addEventListener('change', () => {
    if (!presets._factionPresets) presets._factionPresets = {};
    presets._factionPresets[faction] = sel.value || null;
    // also write sync key so VFX.js can read without await
    try { localStorage.setItem('vfx-faction-presets', JSON.stringify(presets._factionPresets)); } catch {}
    persistPresets();
  });
});

// ── Special animation selects ────────────────────────────────────────────────
function renderSpecialSelects() {
  const sp = presets._specialPresets ?? {};

  // Battlecry: impact preset only
  const bcSel = document.getElementById('specialBattlecry');
  if (bcSel) {
    const current = sp['battlecry'] ?? '';
    bcSel.innerHTML = '<option value="">— Default —</option>';
    for (const [id, preset] of Object.entries(presets)) {
      if (id.startsWith('_')) continue;
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = preset.name ?? id;
      if (id === current) opt.selected = true;
      bcSel.appendChild(opt);
    }
  }

  // Death: global default override
  const deathSel = document.getElementById('specialDeath');
  if (deathSel) {
    const current = sp['death'] ?? '';
    deathSel.innerHTML = '<option value="">— Default (explosion) —</option>';
    for (const [id, preset] of Object.entries(presets)) {
      if (id.startsWith('_')) continue;
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = preset.name ?? id;
      if (id === current) opt.selected = true;
      deathSel.appendChild(opt);
    }
  }

  // Damage bolt + morale bolt: impact preset + color / size / speed
  [
    { key: 'damageBolt', colorDef: '#ff6600', sizeDef: 10, speedDef: 320 },
    { key: 'moraleBolt', colorDef: '#cc1111', sizeDef: 7,  speedDef: 380 },
  ].forEach(({ key, colorDef, sizeDef, speedDef }) => {
    const selId = 'special' + key.charAt(0).toUpperCase() + key.slice(1);
    const sel   = document.getElementById(selId);
    if (sel) {
      const current = sp[key] ?? '';
      sel.innerHTML = '<option value="">— Default —</option>';
      for (const [id, preset] of Object.entries(presets)) {
        if (id.startsWith('_')) continue;
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = preset.name ?? id;
        if (id === current) opt.selected = true;
        sel.appendChild(opt);
      }
    }
    const colorEl    = document.getElementById(key + 'Color');
    const sizeEl     = document.getElementById(key + 'Size');
    const speedEl    = document.getElementById(key + 'Speed');
    const speedValEl = document.getElementById(key + 'SpeedVal');
    if (colorEl)    colorEl.value          = sp[key + 'Color'] || colorDef;
    if (sizeEl)     sizeEl.value           = sp[key + 'Size']  ?? sizeDef;
    if (speedEl)    speedEl.value          = sp[key + 'Speed'] ?? speedDef;
    if (speedValEl) speedValEl.textContent = sp[key + 'Speed'] ?? speedDef;
    // Sprite thumbnail + scale
    const spriteUrl    = sp[key + 'Sprite']      || null;
    const spriteScale  = sp[key + 'SpriteScale'] ?? 1;
    const thumbEl      = document.getElementById(key + 'SpriteThumb');
    const emptyEl      = document.getElementById(key + 'SpriteEmpty');
    const scaleEl      = document.getElementById(key + 'SpriteScale');
    const scaleValEl   = document.getElementById(key + 'SpriteScaleVal');
    if (thumbEl && emptyEl) {
      if (spriteUrl) { thumbEl.src = spriteUrl; thumbEl.style.display = ''; emptyEl.style.display = 'none'; }
      else           { thumbEl.style.display = 'none'; emptyEl.style.display = ''; }
    }
    if (scaleEl)    scaleEl.value          = spriteScale;
    if (scaleValEl) scaleValEl.textContent = Number(spriteScale).toFixed(1);
  });
}

// Impact preset dropdowns (battlecry / damageBolt impact / moraleBolt impact / death)
['battlecry', 'damageBolt', 'moraleBolt', 'death'].forEach(key => {
  const elId = key === 'death' ? 'specialDeath' : ('special' + key.charAt(0).toUpperCase() + key.slice(1));
  const sel  = document.getElementById(elId);
  if (!sel) return;
  sel.addEventListener('change', () => {
    if (!presets._specialPresets) presets._specialPresets = {};
    presets._specialPresets[key] = sel.value || null;
    try { localStorage.setItem('vfx-special-presets', JSON.stringify(presets._specialPresets)); } catch {}
    persistPresets();
  });
});

// Bolt appearance: color / size / speed / sprite for damageBolt and moraleBolt
[
  { key: 'damageBolt' },
  { key: 'moraleBolt' },
].forEach(({ key }) => {
  const colorEl    = document.getElementById(key + 'Color');
  const sizeEl     = document.getElementById(key + 'Size');
  const speedEl    = document.getElementById(key + 'Speed');
  const speedValEl = document.getElementById(key + 'SpeedVal');
  const scaleEl    = document.getElementById(key + 'SpriteScale');
  const scaleValEl = document.getElementById(key + 'SpriteScaleVal');
  const thumbEl    = document.getElementById(key + 'SpriteThumb');
  const emptyEl    = document.getElementById(key + 'SpriteEmpty');
  const pickBtn    = document.getElementById(key + 'SpritePick');
  const clearBtn   = document.getElementById(key + 'SpriteClear');

  function saveBoltConfig() {
    if (!presets._specialPresets) presets._specialPresets = {};
    if (colorEl) presets._specialPresets[key + 'Color']       = colorEl.value;
    if (sizeEl)  presets._specialPresets[key + 'Size']        = Number(sizeEl.value);
    if (speedEl) presets._specialPresets[key + 'Speed']       = Number(speedEl.value);
    if (scaleEl) presets._specialPresets[key + 'SpriteScale'] = Number(scaleEl.value);
    try { localStorage.setItem('vfx-special-presets', JSON.stringify(presets._specialPresets)); } catch {}
    persistPresets();
  }

  colorEl?.addEventListener('input', saveBoltConfig);
  sizeEl?.addEventListener( 'input', saveBoltConfig);
  speedEl?.addEventListener('input', e => {
    if (speedValEl) speedValEl.textContent = e.target.value;
    saveBoltConfig();
  });
  scaleEl?.addEventListener('input', e => {
    if (scaleValEl) scaleValEl.textContent = Number(e.target.value).toFixed(1);
    saveBoltConfig();
  });

  // Sprite file picker
  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = 'image/png,image/webp,image/gif';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  pickBtn?.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      if (!presets._specialPresets) presets._specialPresets = {};
      presets._specialPresets[key + 'Sprite'] = dataUrl;
      try { localStorage.setItem('vfx-special-presets', JSON.stringify(presets._specialPresets)); } catch {}
      persistPresets();
      if (thumbEl) { thumbEl.src = dataUrl; thumbEl.style.display = ''; }
      if (emptyEl) emptyEl.style.display = 'none';
      // Sync VFX instance immediately for live preview
      vfx._specialPresetsSync = presets._specialPresets;
    };
    reader.readAsDataURL(file);
    fileInput.value = ''; // allow re-picking same file
  });

  clearBtn?.addEventListener('click', () => {
    if (!presets._specialPresets) presets._specialPresets = {};
    delete presets._specialPresets[key + 'Sprite'];
    try { localStorage.setItem('vfx-special-presets', JSON.stringify(presets._specialPresets)); } catch {}
    persistPresets();
    if (thumbEl) thumbEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = '';
    vfx._specialPresetsSync = presets._specialPresets;
  });
});

// ── Preset list ───────────────────────────────────────────────────────────────
function renderPresets() {
  const el = document.getElementById('presetList');
  el.innerHTML = '';
  for (const [id, preset] of Object.entries(presets)) {
    if (id.startsWith('_')) continue; // skip meta keys like _factionPresets
    const row = document.createElement('div');
    row.className = 'preset-item' + (id === currentId ? ' active' : '');
    row.innerHTML = `<span>${escHtml(preset.name)}</span><button class="del-btn" title="Delete">✕</button>`;
    row.querySelector('span').addEventListener('click', () => selectPreset(id));
    row.querySelector('.del-btn').addEventListener('click', e => { e.stopPropagation(); deletePreset(id); });
    el.appendChild(row);
  }
  // Sync name input
  const nameEl = document.getElementById('presetName');
  nameEl.value = currentPreset()?.name ?? '';
  // Keep faction + special dropdowns in sync with the current preset list
  renderFactionSelects();
  renderSpecialSelects();
}

function selectPreset(id) {
  currentId = id;
  selectedStep = null;
  document.getElementById('presetName').value = currentPreset()?.name ?? '';
  renderPresets();
  renderSteps();
  renderInspector();
}

function deletePreset(id) {
  if (!confirm('Delete this preset?')) return;
  delete presets[id];
  if (currentId === id) {
    currentId = Object.keys(presets)[0] ?? null;
    selectedStep = null;
  }
  renderPresets();
  renderSteps();
  renderInspector();
  persistPresets();
}

document.getElementById('btnNew').addEventListener('click', () => {
  const id = 'p_' + Date.now();
  presets[id] = { id, name: 'New Effect', steps: [] };
  selectPreset(id);
  persistPresets();
  document.getElementById('presetName').focus();
  document.getElementById('presetName').select();
});

document.getElementById('btnDeletePreset').addEventListener('click', () => {
  if (currentId) deletePreset(currentId);
});

document.getElementById('presetName').addEventListener('input', e => {
  const p = currentPreset();
  if (p) { p.name = e.target.value; renderPresets(); }
});

// ── Steps list ────────────────────────────────────────────────────────────────
function renderSteps() {
  const el = document.getElementById('stepList');
  el.innerHTML = '';
  const steps = currentSteps();
  steps.forEach((step, i) => {
    const row = document.createElement('div');
    row.className = 'step-item' + (i === selectedStep ? ' active' : '');

    const pill = document.createElement('span');
    pill.className = 'step-type-pill';
    pill.style.background = STEP_COLORS[step.type] ?? '#555';
    pill.style.color = '#fff';
    pill.textContent = step.type;
    row.appendChild(pill);

    const desc = document.createElement('span');
    desc.style.fontSize = '11px';
    desc.style.color = '#778';
    desc.textContent = _stepDesc(step);
    row.appendChild(desc);

    const ctrl = document.createElement('div');
    ctrl.className = 'step-controls';
    ctrl.innerHTML = `
      <button title="Move up"   onclick="event.stopPropagation();moveStep(${i},-1)">↑</button>
      <button title="Move down" onclick="event.stopPropagation();moveStep(${i},1)">↓</button>
      <button title="Delete"    onclick="event.stopPropagation();removeStep(${i})" style="color:#ef4444">✕</button>
    `;
    row.appendChild(ctrl);

    row.addEventListener('click', () => selectStep(i));
    el.appendChild(row);
  });
}

function _stepDesc(step) {
  if (step.type === 'text')  return `"${step.content ?? '!'}"`;
  if (step.type === 'burst') return `×${step.count ?? 18}`;
  if (step.type === 'ring')  return `r:${step.radius ?? 80}`;
  if (step.type === 'shake') return `±${step.intensity ?? 8}px`;
  if (step.type === 'rise')  return `↑${step.riseHeight ?? 160}`;
  if (step.type === 'flash') return `${Math.round((step.alpha ?? 0.6) * 100)}%`;
  return '';
}

function selectStep(i) {
  selectedStep = i;
  renderSteps();
  renderInspector();
}

window.addStep = function(type) {
  const p = currentPreset();
  if (!p) return;
  p.steps.push(makeDefaultStep(type));
  selectedStep = p.steps.length - 1;
  renderSteps();
  renderInspector();
};

window.removeStep = function(i) {
  const p = currentPreset();
  if (!p) return;
  p.steps.splice(i, 1);
  if (selectedStep >= p.steps.length) selectedStep = p.steps.length - 1;
  if (selectedStep < 0) selectedStep = null;
  renderSteps();
  renderInspector();
};

window.moveStep = function(i, dir) {
  const p = currentPreset();
  if (!p) return;
  const j = i + dir;
  if (j < 0 || j >= p.steps.length) return;
  [p.steps[i], p.steps[j]] = [p.steps[j], p.steps[i]];
  if (selectedStep === i) selectedStep = j;
  renderSteps();
};

// ── Inspector ─────────────────────────────────────────────────────────────────
function renderInspector() {
  const body = document.getElementById('inspectorBody');
  body.innerHTML = '';

  const steps = currentSteps();
  if (selectedStep === null || selectedStep >= steps.length) {
    body.innerHTML = '<div id="noStep">Select a step to edit its properties.</div>';
    return;
  }

  const step = steps[selectedStep];
  const schema = STEP_SCHEMAS[step.type] ?? [];

  schema.forEach(field => {
    const val  = step[field.key] ?? field.default;
    const div  = document.createElement('div');
    div.className = 'field';

    const label = document.createElement('label');
    label.textContent = field.label;
    div.appendChild(label);

    if (field.type === 'color') {
      // Convert stored value (number or #hex) to CSS #hex for the color input
      const hexStr = typeof val === 'number'
        ? '#' + val.toString(16).padStart(6, '0')
        : (String(val).startsWith('#') ? val : '#' + String(val).replace('0x', '').padStart(6, '0'));
      const inp = document.createElement('input');
      inp.type  = 'color';
      inp.value = hexStr;
      inp.addEventListener('input', e => {
        step[field.key] = e.target.value; // store as '#rrggbb'
        renderSteps();
      });
      div.appendChild(inp);

    } else if (field.type === 'range') {
      const row  = document.createElement('div');
      row.className = 'range-row';
      const inp  = document.createElement('input');
      inp.type  = 'range';
      inp.min   = field.min;
      inp.max   = field.max;
      inp.step  = field.step ?? 1;
      inp.value = val;
      const display = document.createElement('span');
      display.className = 'range-val';
      display.textContent = val;
      inp.addEventListener('input', e => {
        const v = parseFloat(e.target.value);
        step[field.key] = v;
        display.textContent = v;
        renderSteps();
      });
      row.appendChild(inp);
      row.appendChild(display);
      div.appendChild(row);

    } else if (field.type === 'text') {
      const inp = document.createElement('input');
      inp.type  = 'text';
      inp.value = val;
      inp.addEventListener('input', e => {
        step[field.key] = e.target.value;
        renderSteps();
      });
      div.appendChild(inp);
    }

    body.appendChild(div);
  });

  // Live preview button for just this step
  const previewBtn = document.createElement('button');
  previewBtn.textContent = '▶ Preview step';
  Object.assign(previewBtn.style, {
    margin: '12px 14px', padding: '6px 18px', background: '#3730a3',
    color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
  });
  previewBtn.addEventListener('click', () => {
    vfx._runStep(step, cardSprite.x, cardSprite.y).catch(() => {});
  });
  body.appendChild(previewBtn);
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function persistPresets() {
  savePresetsToLocal(presets);
  await savePresetsToFile(presets);
}

document.getElementById('btnSave').addEventListener('click', async () => {
  await persistPresets();
  const badge = document.getElementById('savedBadge');
  badge.style.opacity = '1';
  setTimeout(() => badge.style.opacity = '0', 1600);
});

// Load presets from file on startup (file wins over localStorage for sharing)
;(async function syncFromFile() {
  try {
    const res = await fetch('/CreatedCards/vfx-presets.json?t=' + Date.now());
    if (!res.ok) return;
    const data = await res.json();
    if (data && typeof data === 'object' && Object.keys(data).length > 0) {
      presets = data;
      savePresetsToLocal(presets);
      // Sync faction presets to localStorage for game-side sync access
      if (presets._factionPresets) {
        try { localStorage.setItem('vfx-faction-presets', JSON.stringify(presets._factionPresets)); } catch {}
      }
      // Sync special presets to localStorage
      if (presets._specialPresets) {
        try { localStorage.setItem('vfx-special-presets', JSON.stringify(presets._specialPresets)); } catch {}
      }
    }
  } catch { /* server not available */ }
  // Select first non-meta preset if any
  const ids = Object.keys(presets).filter(k => !k.startsWith('_'));
  if (ids.length > 0) selectPreset(ids[0]);
  else renderPresets();
  renderFactionSelects();
  renderSpecialSelects();
  renderSteps();
  renderInspector();
})();

// ── Utils ─────────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
