import * as PIXI from 'pixi.js';
import cardBackSrc from '../assets/cards/CardBack.png';
import forrestSrc  from '../assets/backgrounds/Forrest/BoardForrest.png';

// ── Storage ───────────────────────────────────────────────────────────────────
const PLAYER_KEY   = 'hand-slot-positions';
const OPPONENT_KEY = 'hand-slot-positions-opponent';

function getKey(mode) { return mode === 'opponent' ? OPPONENT_KEY : PLAYER_KEY; }

function loadAll(mode) {
  try { return JSON.parse(localStorage.getItem(getKey(mode)) || '{}'); }
  catch { return {}; }
}
function saveAll(data, mode) {
  localStorage.setItem(getKey(mode), JSON.stringify(data));
}

// ── PIXI app — fixed 1280×720 (same coordinate space as the game) ────────────
const DESIGN_W = 1280, DESIGN_H = 720;
const TOOLBAR_H = 52; // height of the fixed toolbar above the canvas

const app = new PIXI.Application({
  backgroundColor: 0x1a1a2e,
  antialias:       true,
  resolution:      2,
  autoDensity:     true,
  width:           DESIGN_W,
  height:          DESIGN_H,
});
const canvas = app.view;
canvas.style.position = 'fixed';
document.getElementById('app').appendChild(canvas);

function resizeEditor() {
  const availW = window.innerWidth;
  const availH = window.innerHeight - TOOLBAR_H;
  const scale  = Math.min(availW / DESIGN_W, availH / DESIGN_H);
  const cssW   = Math.round(DESIGN_W * scale);
  const cssH   = Math.round(DESIGN_H * scale);
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.style.left   = Math.round((availW - cssW) / 2) + 'px';
  canvas.style.top    = (TOOLBAR_H + Math.round((availH - cssH) / 2)) + 'px';
}
window.addEventListener('resize', resizeEditor);
resizeEditor();

const CARD_W = 128, CARD_H = 192;

// Background
const bg = new PIXI.Sprite(PIXI.Texture.from(forrestSrc));
bg.anchor.set(0, 0);
bg.alpha = 0.35;
app.stage.addChild(bg);

const handLayer = new PIXI.Container();
app.stage.addChild(handLayer);

// ── Origin marker ─────────────────────────────────────────────────────────────
// Mirrors exactly the positions used in BoardUI.js so saved offsets are in
// the same 1280×720 coordinate space as the game.
//   hand.x = screen.width  * 0.30  →  1280 * 0.30 = 384
//   hand.y = screen.height * 0.88  →  720  * 0.88 = 633.6  (player)
//            screen.height * 0.13  →  720  * 0.13 = 93.6   (opponent)
function originX()     { return DESIGN_W * 0.30; }
function originY(mode) {
  return mode === 'opponent' ? DESIGN_H * 0.13 : DESIGN_H * 0.88;
}

const originMarker = new PIXI.Graphics();
app.stage.addChild(originMarker);

function drawOrigin(mode) {
  const ox = originX(), oy = originY(mode);
  originMarker.clear();
  originMarker.lineStyle(1, 0xffffff, 0.3);
  originMarker.moveTo(ox - 14, oy); originMarker.lineTo(ox + 14, oy);
  originMarker.moveTo(ox, oy - 14); originMarker.lineTo(ox, oy + 14);
  originMarker.lineStyle(0);
  originMarker.beginFill(0xffd700, 0.22);
  originMarker.drawCircle(ox, oy, 5);
  originMarker.endFill();
}

window.addEventListener('resize', () => {
  bg.width  = DESIGN_W;
  bg.height = DESIGN_H;
  drawOrigin(currentMode);
});
bg.width  = DESIGN_W;
bg.height = DESIGN_H;

// ── Auto-layout (mirrors Hand.js defaults) ───────────────────────────────────
function autoLayout(n) {
  const spacing = Math.min(145, 870 / Math.max(n - 1, 1));
  const mid = (n - 1) / 2;
  return Array.from({ length: n }, (_, i) => {
    const t = i - mid;
    return { x: t * spacing, y: Math.abs(t) * 6, r: (t * 6 * Math.PI) / 180 };
  });
}

// ── File persistence ─────────────────────────────────────────────────────────
async function saveHandLayoutToFile() {
  try {
    await fetch('/api/save-hand-layout', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        handSlots:         loadAll('player'),
        opponentHandSlots: loadAll('opponent'),
      }),
    });
  } catch { /* dev server not reachable — localStorage is still updated */ }
}

// On startup: seed localStorage from the saved file so VS Code layout carries over.
;(async function syncHandLayoutFromFile() {
  try {
    const res = await fetch('/CreatedCards/layout.json?t=' + Date.now());
    if (!res.ok) return;
    const data = await res.json();
    // File wins — overwrite localStorage so we see the same layout as in VS Code
    if (data.handSlots)         localStorage.setItem(PLAYER_KEY,   JSON.stringify(data.handSlots));
    if (data.opponentHandSlots) localStorage.setItem(OPPONENT_KEY, JSON.stringify(data.opponentHandSlots));
    rebuild();
  } catch { /* server not available */ }
})();

// ── State ─────────────────────────────────────────────────────────────────────
let currentSize = 5;
let currentMode = 'player';   // 'player' | 'opponent'
let sprites     = [];

// ── Drag ──────────────────────────────────────────────────────────────────────
let dragTarget = null, dragOffX = 0, dragOffY = 0;
app.stage.eventMode = 'static';
app.stage.on('pointermove', (e) => {
  if (!dragTarget) return;
  dragTarget.x = e.global.x - dragOffX;
  dragTarget.y = e.global.y - dragOffY;
});
app.stage.on('pointerup',        () => { dragTarget = null; });
app.stage.on('pointerupoutside', () => { dragTarget = null; });

// ── Wheel = rotate hovered card ───────────────────────────────────────────────
let wheelTarget = null;
window.addEventListener('wheel', (e) => {
  if (!wheelTarget) return;
  e.preventDefault();
  const step = e.shiftKey ? 0.005 : 0.02;
  // In opponent mode the card's visual scaleY is -1; negate step so clockwise
  // drag → clockwise visual result regardless of mode.
  const dir = currentMode === 'opponent' ? -1 : 1;
  wheelTarget.rotation += dir * (e.deltaY > 0 ? step : -step);
}, { passive: false });

// ── Build sprites ─────────────────────────────────────────────────────────────
function buildSprites(n, mode) {
  handLayer.removeChildren();
  sprites = [];

  const saved    = loadAll(mode)[String(n)] ?? autoLayout(n);
  const ox       = originX();
  const oy       = originY(mode);
  const flipY    = mode === 'opponent' ? -1 : 1;

  for (let i = 0; i < n; i++) {
    const p = saved[i] ?? { x: 0, y: 0, r: 0 };

    const spr      = new PIXI.Sprite(PIXI.Texture.from(cardBackSrc));
    spr.anchor.set(0.5);
    // Set scale directly: width/height setters write into scale.x/y, so setting
    // scale.y = flipY afterwards was overwriting the height scaling.
    // Instead compute both axes at once after the texture is confirmed loaded.
    const applyScale = () => {
      const tw = spr.texture.width  || 1;
      const th = spr.texture.height || 1;
      spr.scale.x = CARD_W / tw;
      spr.scale.y = (CARD_H / th) * flipY;
    };
    if (spr.texture.baseTexture.valid) applyScale();
    else spr.texture.baseTexture.once('loaded', applyScale);
    spr.x        = ox + p.x;
    spr.y        = oy + p.y * flipY;
    spr.rotation = (p.r ?? 0) * flipY;
    spr.eventMode  = 'static';
    spr.cursor     = 'grab';
    spr.zIndex     = i;

    // Number label — counter-flip so it reads right-side up
    const label = new PIXI.Text(String(i + 1), {
      fontFamily: 'Arial', fontSize: 18, fill: 0xffd700,
      stroke: 0x000000, strokeThickness: 3,
    });
    label.anchor.set(0.5);
    label.scale.y = flipY;
    spr.addChild(label);

    spr.on('pointerdown', (e) => {
      dragTarget  = spr;
      wheelTarget = spr;
      dragOffX    = e.global.x - spr.x;
      dragOffY    = e.global.y - spr.y;
      spr.cursor  = 'grabbing';
      handLayer.setChildIndex(spr, handLayer.children.length - 1);
      e.stopPropagation();
    });
    spr.on('pointerup',        () => { spr.cursor = 'grab'; });
    spr.on('pointerupoutside', () => { spr.cursor = 'grab'; });
    spr.on('pointerover',      () => { if (spr !== dragTarget) wheelTarget = spr; });

    handLayer.addChild(spr);
    sprites.push(spr);
  }
  handLayer.sortableChildren = true;
}

// ── Read positions back to logical (un-flipped) space ────────────────────────
function readPositions(mode) {
  const ox    = originX();
  const oy    = originY(mode);
  const flipY = mode === 'opponent' ? -1 : 1;
  return sprites.map(spr => ({
    x: Math.round(spr.x - ox),
    y: Math.round((spr.y - oy) * flipY),   // un-flip Y
    r: +((spr.rotation) * flipY).toFixed(4), // un-flip rotation
  }));
}

// ── Full rebuild ──────────────────────────────────────────────────────────────
function rebuild() {
  buildSprites(currentSize, currentMode);
  drawOrigin(currentMode);
  wheelTarget = null;
}

// ── Controls ──────────────────────────────────────────────────────────────────
const sizeSelect  = document.getElementById('sizeSelect');
const btnSave     = document.getElementById('btnSave');
const btnReset    = document.getElementById('btnReset');
const savedBadge  = document.getElementById('savedBadge');
const btnPlayer   = document.getElementById('btnPlayer');
const btnOpponent = document.getElementById('btnOpponent');

sizeSelect.addEventListener('change', () => {
  currentSize = parseInt(sizeSelect.value, 10);
  rebuild();
});

function setMode(mode) {
  currentMode = mode;
  btnPlayer.style.background   = mode === 'player'   ? '#4f6ef7' : '#222';
  btnPlayer.style.color        = mode === 'player'   ? '#fff'    : '#aaa';
  btnOpponent.style.background = mode === 'opponent' ? '#ef4444' : '#222';
  btnOpponent.style.color      = mode === 'opponent' ? '#fff'    : '#aaa';
  rebuild();
}

btnPlayer.addEventListener('click',   () => setMode('player'));
btnOpponent.addEventListener('click', () => setMode('opponent'));

btnSave.addEventListener('click', async () => {
  const all = loadAll(currentMode);
  all[String(currentSize)] = readPositions(currentMode);
  saveAll(all, currentMode);
  await saveHandLayoutToFile();
  savedBadge.style.opacity = '1';
  setTimeout(() => savedBadge.style.opacity = '0', 1600);
});

btnReset.addEventListener('click', async () => {
  const all = loadAll(currentMode);
  delete all[String(currentSize)];
  saveAll(all, currentMode);
  await saveHandLayoutToFile(); // sync the deletion to the file too
  rebuild();
});

// ── Init ──────────────────────────────────────────────────────────────────────
rebuild();
