import emptyCardSrc    from '../assets/cards/EmptyCard.png';
import fieldFrameSrc   from '../assets/cards/OnFieldFrame.png';
import _bundledCollection from '../assets/cards/CreatedCards/collection.json';
import iconFolkSrc     from '../assets/cards/Icons/FolkIcon.png';
import iconMagicalSrc  from '../assets/cards/Icons/MagicalIcon.png';
import iconWildSrc     from '../assets/cards/Icons/WildIcon.png';

// Pre-load faction icons for canvas drawImage
const FACTION_ICON_IMGS = {};
[['Folk', iconFolkSrc], ['Magical', iconMagicalSrc], ['Wild', iconWildSrc]].forEach(([k, src]) => {
  const img = new Image(); img.src = src; FACTION_ICON_IMGS[k] = img;
});

// ── Constants ─────────────────────────────────────────────────────────────────
const SCALE  = 2;
const W      = 128 * SCALE;   // 256  — matches PNG 2:3 ratio (1024÷4)
const H      = 192 * SCALE;   // 384  — matches PNG 2:3 ratio (1536÷4)
const CX     = W / 2;         // 128  (horizontal centre)
const CY     = H / 2;         // 192  (vertical centre)

// Art bounding box – default matches the transparent window in EmptyCard.png (at 256×384 canvas)
const ART = { x: 14, y: 42, w: 228, h: 232 }; // kept for export fallback

// ── Hand art window (mutable, saved to localStorage) ─────────────────────────
const HAND_ART_KEY     = 'card-hand-art-box';
const HAND_ART_DEFAULT = { x: 14, y: 42, w: 228, h: 232 };

function loadHandArtBox() {
  try {
    const s = JSON.parse(localStorage.getItem(HAND_ART_KEY) || 'null');
    if (!s) return { ...HAND_ART_DEFAULT };
    return { x: s.x ?? HAND_ART_DEFAULT.x, y: s.y ?? HAND_ART_DEFAULT.y,
             w: s.w ?? HAND_ART_DEFAULT.w, h: s.h ?? HAND_ART_DEFAULT.h };
  } catch { return { ...HAND_ART_DEFAULT }; }
}
function saveHandArtBox() {
  localStorage.setItem(HAND_ART_KEY, JSON.stringify(handArtBox));
  _saveLayoutToFile();
}

let handArtBox = loadHandArtBox();

// Description position (fixed)
const DESC_Y = 258;

// ── Stat positions (draggable per view mode, saved to localStorage) ───────────
const STAT_LAYOUT_KEY = 'card-stat-layout';
const MODE_DEFAULTS = {
  hand: {
    attack:  { x: CX + (-15 * SCALE), y: CY + (46 * SCALE) },
    health:  { x: CX + ( 14 * SCALE), y: CY + (46 * SCALE) },
    mana:    { x: 27,  y: 27 },
    name:    { x: CX,  y: 30 },
    faction: { x: CX,  y: 62 },
    factionIconSize: 56,
  },
  field: {
    attack:  { x: CX + (-15 * SCALE), y: CY + (46 * SCALE) },
    health:  { x: CX + ( 14 * SCALE), y: CY + (46 * SCALE) },
    mana:    { x: 27,  y: 27 },
    name:    { x: CX,  y: 30 },
    faction: { x: CX,  y: 62 },
    factionIconSize: 56,
  },
};

function loadStatLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(STAT_LAYOUT_KEY) || 'null');
    const load = (mode) => {
      // Support old single-mode format (no .hand/.field keys)
      const src = saved?.[mode] ?? (saved?.attack ? (mode === 'hand' ? saved : {}) : {});
      const def = MODE_DEFAULTS[mode];
      return {
        attack:  src.attack  ?? { ...def.attack  },
        health:  src.health  ?? { ...def.health  },
        mana:    src.mana    ?? { ...def.mana    },
        name:    src.name    ?? { ...def.name    },
        faction: src.faction ?? { ...def.faction },
        factionIconSize: src.factionIconSize ?? def.factionIconSize,
      };
    };
    return { hand: load('hand'), field: load('field') };
  } catch { return structuredClone(MODE_DEFAULTS); }
}

function saveStatLayout() {
  localStorage.setItem(STAT_LAYOUT_KEY, JSON.stringify(layout));
  _saveLayoutToFile();
}

let layout = loadStatLayout();

// Active position vars — always reference layout[viewMode].* so mutating
// them (pos.x = ...) automatically updates the saved layout for that mode.
let ATTACK_POS  = layout.hand.attack;
let HEALTH_POS  = layout.hand.health;
let MANA_POS    = layout.hand.mana;
let NAME_POS    = layout.hand.name;
let FACTION_POS = layout.hand.faction;

function syncPosVars() {
  const m = layout[viewMode];
  ATTACK_POS  = m.attack;
  HEALTH_POS  = m.health;
  MANA_POS    = m.mana;
  NAME_POS    = m.name;
  FACTION_POS = m.faction;
}

// ── Field circle window (draggable, saved globally) ───────────────────────────
const FIELD_CIRCLE_KEY     = 'card-field-circle';
const FIELD_CIRCLE_DEFAULT = { cx: CX, cy: 156, r: 89 };

function loadFieldCircle() {
  try {
    const s = JSON.parse(localStorage.getItem(FIELD_CIRCLE_KEY) || 'null');
    if (!s) return { ...FIELD_CIRCLE_DEFAULT };
    return { cx: s.cx ?? FIELD_CIRCLE_DEFAULT.cx,
             cy: s.cy ?? FIELD_CIRCLE_DEFAULT.cy,
             r:  s.r  ?? FIELD_CIRCLE_DEFAULT.r  };
  } catch { return { ...FIELD_CIRCLE_DEFAULT }; }
}
function saveFieldCircle() {
  localStorage.setItem(FIELD_CIRCLE_KEY, JSON.stringify(fieldCircle));
  _saveLayoutToFile();
}

let fieldCircle = loadFieldCircle();

// ── Persist all layout data to layout.json via the Vite dev server ────────────
function _saveLayoutToFile() {
  let handLayoutConfig;
  try { handLayoutConfig = JSON.parse(localStorage.getItem('hand-layout-config') || 'null'); } catch { /* ignore */ }
  const payload = JSON.stringify({
    statLayout:  layout,
    fieldCircle: fieldCircle,
    handArtBox:  handArtBox,
    ...(handLayoutConfig ? { handLayoutConfig } : {}),
  }, null, 2);
  fetch('/api/save-layout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  }).catch(() => { /* dev server not available — localStorage still has it */ });
}

// Rarity colours
const RARITY_COLORS = {
  common:    '#9ca3af',
  rare:      '#60a5fa',
  epic:      '#a855f7',
  legendary: '#f1c40f',
};

// ── State ──────────────────────────────────────────────────────────────────────
let cardFrame      = null;   // HTMLImageElement – EmptyCard.png (hand)
let cardFieldFrame = null;   // HTMLImageElement – OnFieldFrame.png (field)
let artImage       = null;   // HTMLImageElement – user-uploaded art
let isDirty        = false;
let viewMode       = 'hand'; // 'hand' | 'field'

// Art pan/zoom (in canvas-pixel space) — always reflects the active view mode
let artOffset = { x: 0, y: 0 };
let artZoom   = 1;

// Which card fields hold the art transform for the current view mode
function artOffsetKey() { return viewMode === 'field' ? 'fieldArtOffset' : 'artOffset'; }
function artZoomKey()   { return viewMode === 'field' ? 'fieldArtZoom'   : 'artZoom';   }

function syncArtVars() {
  artOffset = { ...(currentCard[artOffsetKey()] ?? { x: 0, y: 0 }) };
  artZoom   = currentCard[artZoomKey()] ?? 1;
}

function resetArtTransform() {
  artOffset = { x: 0, y: 0 };
  artZoom   = 1;
  currentCard[artOffsetKey()] = { x: 0, y: 0 };
  currentCard[artZoomKey()]   = 1;
}

let currentCard = freshCard();
let collection  = loadCollection();
let editingId   = null;   // id of card being edited (null = new)

// ── Load frames ───────────────────────────────────────────────────────────────
cardFrame = new Image();
cardFrame.onload  = () => redraw();
cardFrame.onerror = () => console.warn('Could not load EmptyCard.png');
cardFrame.src     = emptyCardSrc;

cardFieldFrame = new Image();
cardFieldFrame.onload  = () => redraw();
cardFieldFrame.onerror = () => console.warn('Could not load OnFieldFrame.png');
cardFieldFrame.src     = fieldFrameSrc;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const canvas      = document.getElementById('card-canvas');
const ctx         = canvas.getContext('2d');

const fName       = document.getElementById('f-name');
const fMana       = document.getElementById('f-mana');
const fAttack     = document.getElementById('f-attack');
const fHealth     = document.getElementById('f-health');
const fDesc       = document.getElementById('f-desc');
const fEffect          = document.getElementById('f-effect');
const fEffectValue     = document.getElementById('f-effect-value');
const effectValueRow   = document.getElementById('effect-value-row');
const fDeathEffect     = document.getElementById('f-death-effect');
const fDeathEffectValue = document.getElementById('f-death-effect-value');
const deathEffectValueRow = document.getElementById('death-effect-value-row');
const fSummonPreset    = document.getElementById('f-summon-preset');
const fDeathVfxPreset  = document.getElementById('f-death-vfx-preset');

// Populate the summon & death VFX preset dropdowns from vfx-presets.json
(async () => {
  try {
    const res = await fetch('/CreatedCards/vfx-presets.json');
    if (res.ok) {
      const presets = await res.json();
      for (const [id, preset] of Object.entries(presets)) {
        if (id.startsWith('_')) continue;
        const makeOpt = () => { const o = document.createElement('option'); o.value = id; o.textContent = preset.name ?? id; return o; };
        fSummonPreset.appendChild(makeOpt());
        fDeathVfxPreset.appendChild(makeOpt());
      }
    }
  } catch {}
})();
const iconSizeSlider = document.getElementById('icon-size-slider');
const iconSizeVal    = document.getElementById('icon-size-val');

const artInput    = document.getElementById('art-input');
const artThumb    = document.getElementById('art-thumb');
const artNameEl   = document.getElementById('art-name');
const clearArtBtn = document.getElementById('clear-art');
const uploadArea  = document.getElementById('upload-area');

const btnSave     = document.getElementById('btn-save');
const btnNew      = document.getElementById('btn-new');
const btnPlay     = document.getElementById('btn-play');
const btnDiscard  = document.getElementById('btn-discard');
const btnExport   = document.getElementById('btn-export');
const btnImport   = document.getElementById('btn-import');
const importInput = document.getElementById('import-input');
const cardGrid    = document.getElementById('card-grid');
const cardCount   = document.getElementById('card-count');
const saveToast   = document.getElementById('save-toast');
const artHint     = document.getElementById('art-canvas-hint');
const btnResetArt = document.getElementById('btn-reset-art');
const btnViewHand    = document.getElementById('btn-view-hand');
const btnViewField   = document.getElementById('btn-view-field');
const btnResetCircle = document.getElementById('btn-reset-circle');
const btnResetHandArt = document.getElementById('btn-reset-hand-art');

// ── Canvas drag / zoom ────────────────────────────────────────────────────────
function canvasToPixel(cx, cy) {
  return { px: cx * (W / canvas.offsetWidth), py: cy * (H / canvas.offsetHeight) };
}

function isOverArt(cx, cy) {
  const { px, py } = canvasToPixel(cx, cy);
  if (viewMode === 'field') {
    const dx = px - fieldCircle.cx, dy = py - fieldCircle.cy;
    return dx * dx + dy * dy <= fieldCircle.r * fieldCircle.r;
  }
  return px >= handArtBox.x && px <= handArtBox.x + handArtBox.w &&
         py >= handArtBox.y && py <= handArtBox.y + handArtBox.h;
}

// Returns 'attack' | 'health' | 'mana' | 'name' | null
const STAT_HIT_R  = 18;
const NAME_HIT_HW = 90;
const NAME_HIT_HH = 14;
const FACTION_HIT_HW = 50;
const FACTION_HIT_HH = 16;
function statAtPoint(cx, cy) {
  const { px, py } = canvasToPixel(cx, cy);
  if (viewMode === 'hand') {
    if (Math.abs(px - NAME_POS.x) <= NAME_HIT_HW && Math.abs(py - NAME_POS.y) <= NAME_HIT_HH) return 'name';
    if (Math.abs(px - FACTION_POS.x) <= FACTION_HIT_HW && Math.abs(py - FACTION_POS.y) <= FACTION_HIT_HH) return 'faction';
    const dm = { x: MANA_POS.x - px, y: MANA_POS.y - py };
    if (dm.x * dm.x + dm.y * dm.y <= STAT_HIT_R * STAT_HIT_R) return 'mana';
  }
  if (viewMode === 'field') {
    if (Math.abs(px - FACTION_POS.x) <= FACTION_HIT_HW && Math.abs(py - FACTION_POS.y) <= FACTION_HIT_HH) return 'faction';
  }
  const slots = { attack: ATTACK_POS, health: HEALTH_POS };
  for (const [key, pos] of Object.entries(slots)) {
    const dx = px - pos.x, dy = py - pos.y;
    if (dx * dx + dy * dy <= STAT_HIT_R * STAT_HIT_R) return key;
  }
  return null;
}

// Returns 'center' | 'edge' | null — for the field circle window handles
const CIRCLE_HANDLE_R = 14;
function circleHandleAtPoint(cx, cy) {
  if (viewMode !== 'field') return null;
  const { px, py } = canvasToPixel(cx, cy);
  const edx = px - (fieldCircle.cx + fieldCircle.r), edy = py - fieldCircle.cy;
  if (edx * edx + edy * edy <= CIRCLE_HANDLE_R * CIRCLE_HANDLE_R) return 'edge';
  const cdx = px - fieldCircle.cx, cdy = py - fieldCircle.cy;
  if (cdx * cdx + cdy * cdy <= CIRCLE_HANDLE_R * CIRCLE_HANDLE_R) return 'center';
  return null;
}

// Returns 'center' | 'corner' | null — for the hand art rectangle window handles
const RECT_HANDLE_R = 14;
function rectHandleAtPoint(cx, cy) {
  if (viewMode !== 'hand') return null;
  const { px, py } = canvasToPixel(cx, cy);
  // Bottom-right corner resize dot
  const brx = handArtBox.x + handArtBox.w, bry = handArtBox.y + handArtBox.h;
  const cdx = px - brx, cdy = py - bry;
  if (cdx * cdx + cdy * cdy <= RECT_HANDLE_R * RECT_HANDLE_R) return 'corner';
  // Center move crosshair
  const midx = handArtBox.x + handArtBox.w / 2, midy = handArtBox.y + handArtBox.h / 2;
  const mdx = px - midx, mdy = py - midy;
  if (mdx * mdx + mdy * mdy <= RECT_HANDLE_R * RECT_HANDLE_R) return 'center';
  return null;
}

let drag        = null; // { startX, startY, baseOffsetX, baseOffsetY }
let statDrag    = null; // { stat, startX, startY, basePosX, basePosY }
let circleDrag  = null; // { type:'center'|'edge', startPx, startPy, baseCx, baseCy }
let handArtDrag = null; // { type:'center'|'corner', startPx, startPy, baseX, baseY, baseW, baseH }

canvas.addEventListener('mouseenter', e => {
  const rh = rectHandleAtPoint(e.offsetX, e.offsetY);
  if (rh) { canvas.style.cursor = rh === 'center' ? 'move' : 'nwse-resize'; return; }
  const ch = circleHandleAtPoint(e.offsetX, e.offsetY);
  if (ch) { canvas.style.cursor = ch === 'center' ? 'move' : 'ew-resize'; return; }
  if (statAtPoint(e.offsetX, e.offsetY)) { canvas.style.cursor = 'grab'; return; }
  if (artImage && isOverArt(e.offsetX, e.offsetY)) canvas.style.cursor = 'grab';
});
canvas.addEventListener('mousemove', e => {
  if (handArtDrag) {
    const { px, py } = canvasToPixel(e.offsetX, e.offsetY);
    const dx = px - handArtDrag.startPx, dy = py - handArtDrag.startPy;
    if (handArtDrag.type === 'center') {
      handArtBox.x = Math.round(handArtDrag.baseX + dx);
      handArtBox.y = Math.round(handArtDrag.baseY + dy);
    } else {
      handArtBox.w = Math.max(20, Math.round(handArtDrag.baseW + dx));
      handArtBox.h = Math.max(20, Math.round(handArtDrag.baseH + dy));
    }
    redraw();
    return;
  }
  if (circleDrag) {
    const { px, py } = canvasToPixel(e.offsetX, e.offsetY);
    if (circleDrag.type === 'center') {
      fieldCircle.cx = Math.round(circleDrag.baseCx + (px - circleDrag.startPx));
      fieldCircle.cy = Math.round(circleDrag.baseCy + (py - circleDrag.startPy));
    } else {
      fieldCircle.r = Math.max(20, Math.round(Math.hypot(px - fieldCircle.cx, py - fieldCircle.cy)));
    }
    redraw();
    return;
  }
  if (statDrag) {
    const { px, py } = canvasToPixel(e.offsetX, e.offsetY);
    const { px: sx, py: sy } = canvasToPixel(statDrag.startX, statDrag.startY);
    const nx = statDrag.basePosX + (px - sx), ny = statDrag.basePosY + (py - sy);
    const tgt = statDrag.stat === 'attack'  ? ATTACK_POS
               : statDrag.stat === 'health'  ? HEALTH_POS
               : statDrag.stat === 'mana'    ? MANA_POS
               : statDrag.stat === 'faction' ? FACTION_POS : NAME_POS;
    tgt.x = nx; tgt.y = ny;
    redraw();
    return;
  }
  if (drag) {
    artOffset.x = drag.baseOffsetX + (e.offsetX - drag.startX) * (W / canvas.offsetWidth);
    artOffset.y = drag.baseOffsetY + (e.offsetY - drag.startY) * (H / canvas.offsetHeight);
    currentCard[artOffsetKey()] = { ...artOffset };
    markDirty();
    redraw();
  } else {
    const rh = rectHandleAtPoint(e.offsetX, e.offsetY);
    if (rh) { canvas.style.cursor = rh === 'center' ? 'move' : 'nwse-resize'; return; }
    const ch = circleHandleAtPoint(e.offsetX, e.offsetY);
    if (ch) { canvas.style.cursor = ch === 'center' ? 'move' : 'ew-resize'; return; }
    const overStat = statAtPoint(e.offsetX, e.offsetY);
    canvas.style.cursor = overStat ? 'grab' : (artImage && isOverArt(e.offsetX, e.offsetY)) ? 'grab' : 'default';
  }
});
canvas.addEventListener('mousedown', e => {
  // Rect window handles — hand mode
  const rh = rectHandleAtPoint(e.offsetX, e.offsetY);
  if (rh) {
    e.preventDefault();
    const { px, py } = canvasToPixel(e.offsetX, e.offsetY);
    handArtDrag = { type: rh, startPx: px, startPy: py,
                    baseX: handArtBox.x, baseY: handArtBox.y,
                    baseW: handArtBox.w, baseH: handArtBox.h };
    canvas.style.cursor = rh === 'center' ? 'move' : 'nwse-resize';
    return;
  }
  // Circle window handles — field mode
  const ch = circleHandleAtPoint(e.offsetX, e.offsetY);
  if (ch) {
    e.preventDefault();
    const { px, py } = canvasToPixel(e.offsetX, e.offsetY);
    circleDrag = { type: ch, startPx: px, startPy: py, baseCx: fieldCircle.cx, baseCy: fieldCircle.cy };
    canvas.style.cursor = ch === 'center' ? 'move' : 'ew-resize';
    return;
  }
  // Stat drag has priority over art drag
  const stat = statAtPoint(e.offsetX, e.offsetY);
  if (stat) {
    e.preventDefault();
    const pos = stat === 'attack'  ? ATTACK_POS
             : stat === 'health'  ? HEALTH_POS
             : stat === 'mana'    ? MANA_POS
             : stat === 'faction' ? FACTION_POS : NAME_POS;
    statDrag = { stat, startX: e.offsetX, startY: e.offsetY, basePosX: pos.x, basePosY: pos.y };
    canvas.style.cursor = 'grabbing';
    return;
  }
  if (!artImage || !isOverArt(e.offsetX, e.offsetY)) return;
  e.preventDefault();
  drag = { startX: e.offsetX, startY: e.offsetY,
           baseOffsetX: artOffset.x, baseOffsetY: artOffset.y };
  canvas.style.cursor = 'grabbing';
});
window.addEventListener('mouseup', () => {
  if (handArtDrag) { saveHandArtBox(); handArtDrag = null; canvas.style.cursor = 'default'; return; }
  if (circleDrag)  { saveFieldCircle(); circleDrag = null; canvas.style.cursor = 'default'; return; }
  if (statDrag)    { saveStatLayout(); statDrag = null; canvas.style.cursor = 'default'; return; }
  if (drag) { drag = null; canvas.style.cursor = 'grab'; }
});

// ── Reset stat positions ──────────────────────────────────────────────────────
document.getElementById('btn-reset-stats').addEventListener('click', () => {
  const d = structuredClone(MODE_DEFAULTS[viewMode]);
  Object.assign(ATTACK_POS,  d.attack);
  Object.assign(HEALTH_POS,  d.health);
  Object.assign(MANA_POS,    d.mana);
  Object.assign(NAME_POS,    d.name);
  Object.assign(FACTION_POS, d.faction);
  saveStatLayout();
  redraw();
});

btnResetCircle.addEventListener('click', () => {
  fieldCircle = { ...FIELD_CIRCLE_DEFAULT };
  saveFieldCircle();
  redraw();
});

btnResetHandArt.addEventListener('click', () => {
  handArtBox = { ...HAND_ART_DEFAULT };
  saveHandArtBox();
  redraw();
});

// Touch support
canvas.addEventListener('touchstart', e => {
  if (!artImage) return;
  const t = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const ox = t.clientX - rect.left;
  const oy = t.clientY - rect.top;
  if (!isOverArt(ox, oy)) return;
  e.preventDefault();
  drag = { startX: ox, startY: oy, baseOffsetX: artOffset.x, baseOffsetY: artOffset.y };
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  if (!drag) return;
  e.preventDefault();
  const t = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  artOffset.x = drag.baseOffsetX + (t.clientX - rect.left - drag.startX) * (W / canvas.offsetWidth);
  artOffset.y = drag.baseOffsetY + (t.clientY - rect.top  - drag.startY) * (H / canvas.offsetHeight);
  currentCard[artOffsetKey()] = { ...artOffset };
  markDirty();
  redraw();
}, { passive: false });
canvas.addEventListener('touchend', () => { drag = null; });

// Scroll to zoom
canvas.addEventListener('wheel', e => {
  if (!artImage) return;
  e.preventDefault();
  const delta    = e.deltaY > 0 ? -0.08 : 0.08;
  artZoom        = Math.min(4, Math.max(0.3, artZoom + delta));
  currentCard[artZoomKey()] = artZoom;
  markDirty();
  redraw();
}, { passive: false });

// Reset art position button
btnResetArt.addEventListener('click', () => {
  resetArtTransform();
  markDirty();
  redraw();
});

function updateArtHint(visible) {
  artHint.style.display     = visible ? 'block' : 'none';
  btnResetArt.style.display = visible ? 'inline-block' : 'none';
}

// ── View mode toggle ─────────────────────────────────────────────────────
function setViewMode(mode) {
  viewMode = mode;
  syncPosVars();
  syncArtVars();
  btnViewHand.classList.toggle('active',  mode === 'hand');
  btnViewField.classList.toggle('active', mode === 'field');
  btnResetCircle.style.display  = mode === 'field' ? '' : 'none';
  btnResetHandArt.style.display = mode === 'hand'  ? '' : 'none';
  const circHint = document.getElementById('field-circle-hint');
  if (circHint) circHint.style.display = mode === 'field' ? '' : 'none';
  const handHint = document.getElementById('hand-art-hint');
  if (handHint) handHint.style.display = mode === 'hand'  ? '' : 'none';
  redraw();
}

btnViewHand.addEventListener('click',  () => setViewMode('hand'));
btnViewField.addEventListener('click', () => setViewMode('field'));

// ── Canvas rendering ──────────────────────────────────────────────────────────
function redraw() {
  ctx.clearRect(0, 0, W, H);

  // 1. Art drawn first so the card frame (transparent centre) sits on top
  if (artImage) {
    ctx.save();

    // Clip shape: circle for field view, rounded rect for hand view
    if (viewMode === 'field') {
      const { cx, cy, r } = fieldCircle;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      // Use the circle bounds as the fit target
      const dw = r * 2, dh = r * 2;
      const baseScale  = Math.max(dw / artImage.naturalWidth, dh / artImage.naturalHeight);
      const totalScale = baseScale * artZoom;
      const imgW = artImage.naturalWidth  * totalScale;
      const imgH = artImage.naturalHeight * totalScale;
      const imgX = (cx - r) + (dw - imgW) / 2 + artOffset.x;
      const imgY = (cy - r) + (dh - imgH) / 2 + artOffset.y;
      ctx.drawImage(artImage, imgX, imgY, imgW, imgH);
    } else {
      roundRectPath(ctx, handArtBox.x, handArtBox.y, handArtBox.w, handArtBox.h, 4);
      ctx.clip();
      const baseScale  = Math.max(handArtBox.w / artImage.naturalWidth, handArtBox.h / artImage.naturalHeight);
      const totalScale = baseScale * artZoom;
      const imgW = artImage.naturalWidth  * totalScale;
      const imgH = artImage.naturalHeight * totalScale;
      const imgX = handArtBox.x + (handArtBox.w - imgW) / 2 + artOffset.x;
      const imgY = handArtBox.y + (handArtBox.h - imgH) / 2 + artOffset.y;
      ctx.drawImage(artImage, imgX, imgY, imgW, imgH);
    }

    ctx.restore();
  }

  // 2. Card frame on top – EmptyCard.png (hand) or OnFieldFrame.png (field)
  const activeFrame = viewMode === 'field' ? cardFieldFrame : cardFrame;
  if (activeFrame) {
    ctx.drawImage(activeFrame, 0, 0, W, H);
  }

  // 2.5 Field circle window drag handles (field mode only)
  if (viewMode === 'field') {
    const { cx, cy, r } = fieldCircle;
    ctx.save();
    // Dashed guide circle
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // Center crosshair
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy); ctx.lineTo(cx + 9, cy);
    ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy + 9);
    ctx.stroke();
    // Edge resize handle
    ctx.beginPath();
    ctx.arc(cx + r, cy, 7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // 2.6 Hand art window drag handles (hand mode only)
  if (viewMode === 'hand') {
    const { x, y, w, h } = handArtBox;
    const midx = x + w / 2, midy = y + h / 2;
    ctx.save();
    // Dashed guide rect
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(x, y, w, h);
    // Center crosshair
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(midx - 9, midy); ctx.lineTo(midx + 9, midy);
    ctx.moveTo(midx, midy - 9); ctx.lineTo(midx, midy + 9);
    ctx.stroke();
    // Bottom-right corner resize dot
    ctx.beginPath();
    ctx.arc(x + w, y + h, 7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // 3. Card name – draggable, gold text with outline (hand only)
  if (viewMode === 'hand') {
    const nx = NAME_POS.x, ny = NAME_POS.y;
    // Dashed drag-handle border
    ctx.save();
    ctx.strokeStyle = '#ffd700';
    ctx.globalAlpha = 0.4;
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(nx - NAME_HIT_HW, ny - NAME_HIT_HH, NAME_HIT_HW * 2, NAME_HIT_HH * 2);
    ctx.restore();

    if (currentCard.name) {
      const maxW = NAME_HIT_HW * 2 - 8;
      ctx.save();
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      let fontSize = 26;
      ctx.font = `bold ${fontSize}px Georgia, serif`;
      while (ctx.measureText(currentCard.name).width > maxW && fontSize > 11) {
        fontSize--;
        ctx.font = `bold ${fontSize}px Georgia, serif`;
      }
      ctx.strokeStyle   = 'rgba(0,0,0,0.95)';
      ctx.lineWidth     = 4;
      ctx.lineJoin      = 'round';
      ctx.miterLimit    = 2;
      ctx.shadowColor   = 'rgba(0,0,0,0.0)';
      ctx.strokeText(currentCard.name, nx, ny);
      const grad = ctx.createLinearGradient(nx, ny - fontSize / 2, nx, ny + fontSize / 2);
      grad.addColorStop(0,   '#ffe98a');
      grad.addColorStop(0.45,'#ffd700');
      grad.addColorStop(1,   '#c8860a');
      ctx.fillStyle    = grad;
      ctx.shadowColor  = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur   = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
      ctx.fillText(currentCard.name, nx, ny);
      ctx.restore();
    }
  }

  // 5. Stat numbers + drag-handle indicators
  const statSlots = viewMode === 'field'
    ? [
        { key: 'attack', pos: ATTACK_POS, label: String(currentCard.attack),   color: '#f97316' },
        { key: 'health', pos: HEALTH_POS, label: String(currentCard.health),   color: '#ef4444' },
      ]
    : [
        { key: 'attack', pos: ATTACK_POS, label: String(currentCard.attack),   color: '#f97316' },
        { key: 'health', pos: HEALTH_POS, label: String(currentCard.health),   color: '#ef4444' },
        { key: 'mana',   pos: MANA_POS,   label: String(currentCard.manaCost), color: '#60a5fa' },
      ];
  for (const s of statSlots) {
    // Dashed ring indicator
    ctx.save();
    ctx.strokeStyle = s.color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(s.pos.x, s.pos.y, STAT_HIT_R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawStat(ctx, s.label, s.pos.x, s.pos.y, s.color);
  }

  // 6. Rarity dot – follows the name position (hand only)
  if (viewMode === 'hand') {
    const rc = RARITY_COLORS[currentCard.rarity] || '#9ca3af';
    ctx.save();
    ctx.beginPath();
    ctx.arc(NAME_POS.x, NAME_POS.y + NAME_HIT_HH + 4, 4, 0, Math.PI * 2);
    ctx.fillStyle   = rc;
    ctx.shadowColor = rc;
    ctx.shadowBlur  = 10;
    ctx.fill();
    ctx.restore();

    // 6b. Faction icon — replaces text pill (draggable)
    const ICON_SIZE_H = layout[viewMode].factionIconSize ?? 40;
    // Drag-hint dashed ring
    ctx.save();
    ctx.strokeStyle = '#c084fc';
    ctx.globalAlpha = 0.5;
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(FACTION_POS.x, FACTION_POS.y, ICON_SIZE_H / 2 + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const fIconH = FACTION_ICON_IMGS[currentCard.faction] ?? FACTION_ICON_IMGS['Folk'];
    if (fIconH && fIconH.complete && fIconH.naturalWidth > 0) {
      ctx.drawImage(fIconH, FACTION_POS.x - ICON_SIZE_H / 2, FACTION_POS.y - ICON_SIZE_H / 2, ICON_SIZE_H, ICON_SIZE_H);
    } else if (fIconH) {
      fIconH.onload = () => redraw();
    }
  }

  // 6c. Faction icon in field mode (draggable)
  if (viewMode === 'field') {
    const ICON_SIZE_F = layout.field.factionIconSize ?? 40;
    // Drag-hint dashed ring around the icon
    ctx.save();
    ctx.strokeStyle = '#c084fc';
    ctx.globalAlpha = 0.5;
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(FACTION_POS.x, FACTION_POS.y, ICON_SIZE_F / 2 + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const fIconF = FACTION_ICON_IMGS[currentCard.faction] ?? FACTION_ICON_IMGS['Folk'];
    if (fIconF && fIconF.complete && fIconF.naturalWidth > 0) {
      ctx.drawImage(fIconF, FACTION_POS.x - ICON_SIZE_F / 2, FACTION_POS.y - ICON_SIZE_F / 2, ICON_SIZE_F, ICON_SIZE_F);
    } else if (fIconF) {
      fIconF.onload = () => redraw();
    }
  }
}

function drawStat(ctx, text, x, y, glowColor = '#ffffff') {
  ctx.save();
  ctx.font          = "bold 28px 'Impact', 'Arial Black', sans-serif";
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'middle';
  ctx.lineJoin      = 'round';
  // Thick black outline
  ctx.strokeStyle   = 'rgba(0,0,0,0.95)';
  ctx.lineWidth     = 5;
  ctx.shadowColor   = 'rgba(0,0,0,0)';
  ctx.strokeText(text, x, y);
  // White fill with coloured glow
  ctx.fillStyle     = '#ffffff';
  ctx.shadowColor   = glowColor;
  ctx.shadowBlur    = 10;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function addTextShadow(ctx, blur = 2) {
  ctx.shadowColor   = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur    = blur;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Returns source crop coords to cover-fit srcW×srcH into dstW×dstH */
function coverFit(srcW, srcH, dstW, dstH) {
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const sw    = dstW / scale;
  const sh    = dstH / scale;
  const sx    = (srcW - sw) / 2;
  const sy    = (srcH - sh) / 2;
  return { sx, sy, sw, sh };
}

function drawFittedText(ctx, text, x, y, maxW) {
  let size = 17;
  ctx.font = `bold ${size}px Georgia, serif`;
  while (ctx.measureText(text).width > maxW && size > 8) {
    size--;
    ctx.font = `bold ${size}px Georgia, serif`;
  }
  ctx.fillText(text, x, y);
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy  += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

// ── Mini-canvas for collection thumbnails ─────────────────────────────────────
function renderThumbCanvas(cardData, artImg) {
  const sc = 0.75;          // bigger thumbnails
  const tw = W * sc;
  const th = H * sc;
  const tc = document.createElement('canvas');
  tc.width  = tw;
  tc.height = th;
  const tctx = tc.getContext('2d');
  tctx.scale(sc, sc);

  // 1. Art (correctly save → clip → draw → restore)
  if (artImg) {
    tctx.save();
    roundRectPath(tctx, handArtBox.x, handArtBox.y, handArtBox.w, handArtBox.h, 4);
    tctx.clip();
    const off   = cardData.artOffset ?? { x: 0, y: 0 };
    const zoom  = cardData.artZoom   ?? 1;
    const base  = Math.max(handArtBox.w / artImg.naturalWidth, handArtBox.h / artImg.naturalHeight);
    const total = base * zoom;
    const imgW  = artImg.naturalWidth  * total;
    const imgH  = artImg.naturalHeight * total;
    const imgX  = handArtBox.x + (handArtBox.w - imgW) / 2 + off.x;
    const imgY  = handArtBox.y + (handArtBox.h - imgH) / 2 + off.y;
    tctx.drawImage(artImg, imgX, imgY, imgW, imgH);
    tctx.restore();
  }

  // 2. Card frame
  if (cardFrame) tctx.drawImage(cardFrame, 0, 0, W, H);

  // 3. Gold name at top
  if (cardData.name) {
    tctx.save();
    tctx.textAlign    = 'center';
    tctx.textBaseline = 'middle';
    let sz = 18;
    tctx.font = `bold ${sz}px Georgia, serif`;
    while (tctx.measureText(cardData.name).width > 190 && sz > 9) {
      sz--;
      tctx.font = `bold ${sz}px Georgia, serif`;
    }
    tctx.strokeStyle  = 'rgba(0,0,0,0.95)';
    tctx.lineWidth    = 3;
    tctx.lineJoin     = 'round';
    tctx.strokeText(cardData.name, NAME_POS.x, NAME_POS.y);
    const g = tctx.createLinearGradient(NAME_POS.x, NAME_POS.y - sz / 2, NAME_POS.x, NAME_POS.y + sz / 2);
    g.addColorStop(0,   '#ffe98a');
    g.addColorStop(0.5, '#ffd700');
    g.addColorStop(1,   '#c8860a');
    tctx.fillStyle = g;
    tctx.shadowColor = 'rgba(0,0,0,0.8)';
    tctx.shadowBlur  = 4;
    tctx.fillText(cardData.name, NAME_POS.x, NAME_POS.y);
    tctx.restore();
  }

  // 4. Stats
  drawStatOnCtx(tctx, String(cardData.attack),   ATTACK_POS.x, ATTACK_POS.y, '#f97316');
  drawStatOnCtx(tctx, String(cardData.health),   HEALTH_POS.x, HEALTH_POS.y, '#ef4444');
  drawStatOnCtx(tctx, String(cardData.manaCost), MANA_POS.x,   MANA_POS.y,   '#60a5fa');

  return tc;
}

function drawStatOnCtx(c, text, x, y, glowColor = '#ffffff') {
  c.save();
  c.font          = "bold 22px 'Impact', 'Arial Black', sans-serif";
  c.textAlign     = 'center';
  c.textBaseline  = 'middle';
  c.lineJoin      = 'round';
  c.strokeStyle   = 'rgba(0,0,0,0.95)';
  c.lineWidth     = 4;
  c.shadowColor   = 'rgba(0,0,0,0)';
  c.strokeText(text, x, y);
  c.fillStyle     = '#ffffff';
  c.shadowColor   = glowColor;
  c.shadowBlur    = 8;
  c.shadowOffsetX = 0;
  c.shadowOffsetY = 0;
  c.fillText(text, x, y);
  c.restore();
}

// ── Form ↔ state sync ─────────────────────────────────────────────────────────
function syncFromForm() {
  currentCard.name        = fName.value.trim();
  currentCard.manaCost    = clampInt(fMana.value,   0, 20);
  currentCard.attack      = clampInt(fAttack.value, 0, 20);
  currentCard.health      = clampInt(fHealth.value, 1, 30);
  currentCard.description = fDesc.value.trim();
  const effectId = fEffect.value;
  if (effectId) {
    currentCard.onPlayEffect = { id: effectId, value: clampInt(fEffectValue.value, 1, 20) };
  } else {
    currentCard.onPlayEffect = null;
  }
  const deathEffectId = fDeathEffect.value;
  if (deathEffectId) {
    currentCard.deathEffect = { id: deathEffectId, value: clampInt(fDeathEffectValue.value, 1, 20) };
  } else {
    currentCard.deathEffect = null;
  }
  currentCard.summonVfxPreset = fSummonPreset.value || null;
  currentCard.deathVfxPreset  = fDeathVfxPreset.value  || null;
  markDirty();
  redraw();
}

function populateForm(card) {
  fName.value        = card.name        ?? '';
  fMana.value        = card.manaCost    ?? 1;
  fAttack.value      = card.attack      ?? 1;
  fHealth.value      = card.health      ?? 1;
  fDesc.value        = card.description ?? '';

  // On-play effect
  const eff = card.onPlayEffect;
  fEffect.value = eff?.id ?? '';
  fEffectValue.value = eff?.value ?? 3;
  effectValueRow.style.display = eff?.id ? 'block' : 'none';

  // Death effect
  const de = card.deathEffect;
  fDeathEffect.value = de?.id ?? '';
  fDeathEffectValue.value = de?.value ?? 2;
  deathEffectValueRow.style.display = de?.id ? 'block' : 'none';

  // Summon VFX preset
  fSummonPreset.value = card.summonVfxPreset ?? '';
  fDeathVfxPreset.value  = card.deathVfxPreset  ?? '';

  setActiveType(card.type ?? 'minion');
  setActiveRarity(card.rarity ?? 'common');
  setActiveFaction(card.faction ?? 'Folk');
  syncIconSizeSlider();
}

// ── Form events ───────────────────────────────────────────────────────────────
[fName, fDesc].forEach(el => el.addEventListener('input', syncFromForm));
[fMana, fAttack, fHealth].forEach(el => {
  el.addEventListener('input',  syncFromForm);
  el.addEventListener('change', syncFromForm);
});

// Effect dropdown
fEffect.addEventListener('change', () => {
  effectValueRow.style.display = fEffect.value ? 'block' : 'none';
  syncFromForm();
});
fEffectValue.addEventListener('input',  syncFromForm);
fEffectValue.addEventListener('change', syncFromForm);
document.getElementById('effect-val-minus').addEventListener('click', () => {
  fEffectValue.value = Math.max(1, Number(fEffectValue.value) - 1);
  syncFromForm();
});
document.getElementById('effect-val-plus').addEventListener('click', () => {
  fEffectValue.value = Math.min(20, Number(fEffectValue.value) + 1);
  syncFromForm();
});

// Death effect dropdown
fDeathEffect.addEventListener('change', () => {
  deathEffectValueRow.style.display = fDeathEffect.value ? 'block' : 'none';
  syncFromForm();
});
fDeathEffectValue.addEventListener('input',  syncFromForm);
fDeathEffectValue.addEventListener('change', syncFromForm);
document.getElementById('death-effect-val-minus').addEventListener('click', () => {
  fDeathEffectValue.value = Math.max(1, Number(fDeathEffectValue.value) - 1);
  syncFromForm();
});
document.getElementById('death-effect-val-plus').addEventListener('click', () => {
  fDeathEffectValue.value = Math.min(20, Number(fDeathEffectValue.value) + 1);
  syncFromForm();
});

// Summon VFX preset dropdown
fSummonPreset.addEventListener('change', syncFromForm);
fDeathVfxPreset.addEventListener('change', syncFromForm);

// Spinner +/- buttons
document.querySelectorAll('.stat-spinner button').forEach(btn => {
  btn.addEventListener('click', () => {
    const stat = btn.dataset.stat;
    const dir  = Number(btn.dataset.dir);
    const input = document.getElementById(`f-${stat}`);
    const min   = Number(input.min);
    const max   = Number(input.max);
    input.value = Math.min(max, Math.max(min, Number(input.value) + dir));
    syncFromForm();
  });
});

// Type buttons
document.getElementById('type-row').addEventListener('click', e => {
  const btn = e.target.closest('.type-btn');
  if (!btn) return;
  setActiveType(btn.dataset.type);
  currentCard.type = btn.dataset.type;
  markDirty();
});

function setActiveType(type) {
  document.querySelectorAll('.type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === type);
  });
}

// Rarity buttons
document.getElementById('rarity-row').addEventListener('click', e => {
  const btn = e.target.closest('.rarity-btn');
  if (!btn) return;
  setActiveRarity(btn.dataset.rarity);
  currentCard.rarity = btn.dataset.rarity;
  markDirty();
  redraw();
});

function setActiveRarity(rarity) {
  document.querySelectorAll('.rarity-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.rarity === rarity);
  });
}

// Faction buttons
document.getElementById('faction-row').addEventListener('click', e => {
  const btn = e.target.closest('.faction-btn');
  if (!btn) return;
  setActiveFaction(btn.dataset.faction);
  currentCard.faction = btn.dataset.faction;
  markDirty();
  redraw();
});

function setActiveFaction(faction) {
  document.querySelectorAll('.faction-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.faction === faction);
  });
}

// Icon size slider
iconSizeSlider.addEventListener('input', () => {
  const v = Number(iconSizeSlider.value);
  iconSizeVal.textContent = v;
  layout.hand.factionIconSize  = v;
  layout.field.factionIconSize = v;
  saveStatLayout();
  redraw();
});

function syncIconSizeSlider() {
  const v = layout[viewMode]?.factionIconSize ?? 40;
  iconSizeSlider.value    = v;
  iconSizeVal.textContent = v;
}

// ── Image upload ──────────────────────────────────────────────────────────────
artInput.addEventListener('change', () => {
  const file = artInput.files[0];
  if (file) loadArtFile(file);
});

uploadArea.addEventListener('dragover', e => {
  e.preventDefault();
  uploadArea.classList.add('drag-over');
});
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) loadArtFile(file);
});

function loadArtFile(file) {
  const reader = new FileReader();
  reader.onload = ev => {
    currentCard.artDataUrl = ev.target.result;
    resetArtTransform();  // fresh pan/zoom for new image
    artImage = new Image();
    artImage.onload = () => {
      artThumb.src     = currentCard.artDataUrl;
      artThumb.style.display  = 'block';
      clearArtBtn.style.display = 'inline';
      artNameEl.textContent = file.name;
      updateArtHint(true);
      markDirty();
      redraw();
    };
    artImage.src = currentCard.artDataUrl;
  };
  reader.readAsDataURL(file);
}

clearArtBtn.addEventListener('click', () => {
  currentCard.artDataUrl  = null;
  artImage                = null;
  artInput.value          = '';
  artThumb.style.display  = 'none';
  clearArtBtn.style.display = 'none';
  artNameEl.textContent   = 'No image selected';
  resetArtTransform();
  updateArtHint(false);
  markDirty();
  redraw();
});

// ── Save / New / Discard ──────────────────────────────────────────────────────
btnSave.addEventListener('click', () => {
  syncFromForm();
  if (!currentCard.name) {
    fName.focus();
    fName.style.borderColor = '#ef4444';
    setTimeout(() => fName.style.borderColor = '', 1500);
    return;
  }
  const artImg = artImage; // capture for thumbnail

  if (editingId !== null) {
    // Update existing
    const idx = collection.findIndex(c => c.id === editingId);
    if (idx !== -1) {
      collection[idx] = { ...currentCard };
      rebuildGrid();
      setActiveThumb(editingId);
    }
  } else {
    // New card
    currentCard.id = Date.now();
    collection.push({ ...currentCard });
    editingId = currentCard.id;
    rebuildGrid();
    setActiveThumb(editingId);
  }

  saveCollection(collection);
  clearDirty();
  showToast(`✔ “${currentCard.name}” saved (${collection.length} card${collection.length !== 1 ? 's' : ''} in collection)`);
});

btnNew.addEventListener('click', () => {
  if (isDirty && !confirm('Discard unsaved changes?')) return;
  startNewCard();
});

btnPlay.addEventListener('click', () => {
  // Open the game in the same tab – always loads fresh so localStorage is read
  window.location.href = '/';
});

btnDiscard.addEventListener('click', () => {
  if (editingId !== null) {
    const saved = collection.find(c => c.id === editingId);
    if (saved) { loadCard(saved); return; }
  }
  startNewCard();
});

function startNewCard() {
  editingId = null;
  currentCard = freshCard();
  artImage = null;
  artOffset = { x: 0, y: 0 };
  artZoom   = 1;
  artInput.value = '';
  artThumb.style.display = 'none';
  clearArtBtn.style.display = 'none';
  artNameEl.textContent = 'No image selected';
  updateArtHint(false);
  populateForm(currentCard);
  clearDirty();
  redraw();
  document.querySelectorAll('.card-thumb').forEach(t => t.classList.remove('active'));
}

function loadCard(cardData) {
  editingId = cardData.id;
  currentCard = { ...cardData };
  populateForm(currentCard);

  artImage  = null;
  // Restore art transform for whichever view is currently active
  artOffset = cardData[viewMode === 'field' ? 'fieldArtOffset' : 'artOffset']
              ? { ...cardData[viewMode === 'field' ? 'fieldArtOffset' : 'artOffset'] }
              : { x: 0, y: 0 };
  artZoom   = cardData[viewMode === 'field' ? 'fieldArtZoom' : 'artZoom'] ?? 1;
  if (cardData.artDataUrl) {
    artImage = new Image();
    artImage.onload = () => {
      artThumb.src            = cardData.artDataUrl;
      artThumb.style.display  = 'block';
      clearArtBtn.style.display = 'inline';
      artNameEl.textContent   = 'Saved image';
      updateArtHint(true);
      clearDirty();
      redraw();
    };
    artImage.src = cardData.artDataUrl;
  } else {
    artThumb.style.display    = 'none';
    clearArtBtn.style.display = 'none';
    artNameEl.textContent     = 'No image selected';
    updateArtHint(false);
    clearDirty();
    redraw();
  }
}

// ── Export / Import ───────────────────────────────────────────────────────────
btnExport.addEventListener('click', () => {
  const exportData = collection.map(({ artDataUrl, ...rest }) => rest);  // strip art by default
  const withArt = confirm(
    'Include card art (base64) in the export?\n\nYes = full export with images\nNo = stats only'
  );
  const data = withArt ? collection : exportData;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'cards.json';
  a.click();
  URL.revokeObjectURL(url);
});

btnImport.addEventListener('click', () => importInput.click());
importInput.addEventListener('change', () => {
  const file = importInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (!Array.isArray(imported)) throw new Error('Expected array');
      if (!confirm(`Import ${imported.length} card(s)? This will merge with the current collection.`)) return;
      imported.forEach(card => {
        if (!card.id) card.id = Date.now() + Math.random();
        if (!collection.find(c => c.id === card.id)) {
          collection.push(card);
        }
      });
      saveCollection(collection);
      rebuildGrid();
    } catch (e) {
      alert('Failed to parse JSON: ' + e.message);
    }
  };
  reader.readAsText(file);
  importInput.value = '';
});

// ── Collection grid ───────────────────────────────────────────────────────────
function rebuildGrid() {
  cardGrid.innerHTML = '';
  cardCount.textContent = collection.length;

  if (collection.length === 0) {
    cardGrid.innerHTML = '<span class="empty-collection">No cards yet — create one above!</span>';
    return;
  }

  collection.forEach(card => {
    const wrap = document.createElement('div');
    wrap.className = 'card-thumb';
    wrap.dataset.id = card.id;

    // Build mini thumbnail canvas
    const buildThumb = (artImg) => {
      // Remove any existing canvas before rebuilding
      const old = wrap.querySelector('canvas');
      if (old) old.remove();
      const tc = renderThumbCanvas(card, artImg);
      wrap.insertBefore(tc, wrap.firstChild);
    };

    if (card.artDataUrl) {
      const img = new Image();
      img.onload = () => buildThumb(img);
      img.src = card.artDataUrl;
    } else {
      buildThumb(null);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'thumb-del';
    delBtn.title = 'Delete card';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm(`Delete "${card.name || 'Unnamed'}"?`)) return;
      collection = collection.filter(c => c.id !== card.id);
      saveCollection(collection);
      if (editingId === card.id) startNewCard();
      rebuildGrid();
    });
    wrap.appendChild(delBtn);

    wrap.addEventListener('click', () => {
      const found = collection.find(c => c.id === card.id);
      if (found) {
        loadCard(found);
        setActiveThumb(found.id);
      }
    });

    cardGrid.appendChild(wrap);
  });

  if (editingId !== null) setActiveThumb(editingId);
}

function setActiveThumb(id) {
  document.querySelectorAll('.card-thumb').forEach(t => {
    t.classList.toggle('active', Number(t.dataset.id) === id);
  });
}

// ── Dirty state ───────────────────────────────────────────────────────────────
function markDirty() {
  isDirty = true;
  btnDiscard.style.display = 'block';
}
function clearDirty() {
  isDirty = false;
  btnDiscard.style.display = 'none';
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg) {
  saveToast.textContent = msg;
  saveToast.style.opacity   = '1';
  saveToast.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    saveToast.style.opacity   = '0';
    saveToast.style.transform = 'translateX(-50%) translateY(20px)';
  }, 2800);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function freshCard() {
  return {
    id: null, name: '', type: 'minion', faction: 'Folk', rarity: 'common',
    description: '', manaCost: 1, attack: 1, health: 1,
    artDataUrl: null,
    artOffset: { x: 0, y: 0 }, artZoom: 1,
    fieldArtOffset: { x: 0, y: 0 }, fieldArtZoom: 1,
    onPlayEffect: null,
    deathEffect: null,
  };
}

function clampInt(val, min, max) {
  return Math.min(max, Math.max(min, Math.round(Number(val) || 0)));
}

function loadCollection() {
  try {
    const stored = JSON.parse(localStorage.getItem('card-editor-collection') || '[]');
    if (stored.length > 0) return stored;
  } catch { /* fall through */ }
  // Seed from the bundled collection.json (same source as the game)
  if (Array.isArray(_bundledCollection) && _bundledCollection.length > 0) {
    return _bundledCollection;
  }
  return [];
}

async function saveCollection(cards) {
  // Always mirror to localStorage so loadCollection() works instantly on next open
  localStorage.setItem('card-editor-collection', JSON.stringify(cards));

  const json = JSON.stringify(cards, null, 2);

  // Save to src/assets/cards/CreatedCards/collection.json via the Vite dev plugin
  try {
    const res = await fetch('/api/save-collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    });
    if (res.ok) return; // done
    console.warn('save-collection API error', await res.text());
  } catch (e) {
    console.warn('save-collection request failed:', e);
  }

  // Fallback: trigger a file download if the dev server endpoint isn't available
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  Object.assign(document.createElement('a'), { href: url, download: 'collection.json' }).click();
  URL.revokeObjectURL(url);
}

// On startup: if the collection file is empty but localStorage has cards,
// immediately save them to the file so they get baked into the game.
// Also fetch the file in case another browser/session has newer data.
;(async function syncCollectionFromFile() {
  try {
    const res = await fetch('/CreatedCards/collection.json?t=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        // File has content — it wins; update localStorage and grid
        localStorage.setItem('card-editor-collection', JSON.stringify(data));
        collection = data;
        rebuildGrid();
        return;
      }
    }
  } catch { /* server not available */ }
  // File is empty or unreachable — push localStorage cards into the file now
  if (collection.length > 0) {
    await saveCollection(collection);
  }
})();

// ── Warn before closing with unsaved changes ──────────────────────────────────
window.addEventListener('beforeunload', e => {
  if (isDirty) { e.preventDefault(); e.returnValue = ''; }
});

// ── Init ──────────────────────────────────────────────────────────────────────
populateForm(currentCard);
rebuildGrid();
redraw();
// Write layout.json on startup so other browsers always have the latest settings
_saveLayoutToFile();

// ── Hand Layout Editor ────────────────────────────────────────────────────────
(function () {
  const HLKEY = 'hand-layout-config';
  const HLDEFAULTS = { spacing: 145, angle: 6, arc: 6, hover: 30 };
  const HL_N = 5;

  function loadHLCfg() {
    try { return { ...HLDEFAULTS, ...JSON.parse(localStorage.getItem(HLKEY) || '{}') }; }
    catch { return { ...HLDEFAULTS }; }
  }

  let hlCfg = loadHLCfg();

  const canvas   = document.getElementById('hand-canvas');
  const ctx      = canvas.getContext('2d');
  const slSpacing  = document.getElementById('sl-spacing');
  const slAngle    = document.getElementById('sl-angle');
  const slArc      = document.getElementById('sl-arc');
  const slHover    = document.getElementById('sl-hover');
  const lblSpacing = document.getElementById('lbl-spacing');
  const lblAngle   = document.getElementById('lbl-angle');
  const lblArc     = document.getElementById('lbl-arc');
  const lblHover   = document.getElementById('lbl-hover');

  const CW = 65, CH = 91;     // card preview size (~0.5× game scale)
  const MID_Y = canvas.height / 2 + 20;

  function getPositions() {
    const mid = (HL_N - 1) / 2;
    const spacing = Math.min(hlCfg.spacing, 870 / Math.max(HL_N - 1, 1));
    const cx = canvas.width / 2;
    return Array.from({ length: HL_N }, (_, i) => {
      const t = i - mid;
      return { x: cx + t * spacing, y: MID_Y + Math.abs(t) * hlCfg.arc, rot: (t * hlCfg.angle * Math.PI) / 180, t };
    });
  }

  function rr(cx2, cy2, w, h, r) {
    ctx.moveTo(cx2 - w/2 + r, cy2 - h/2);
    ctx.lineTo(cx2 + w/2 - r, cy2 - h/2);
    ctx.quadraticCurveTo(cx2 + w/2, cy2 - h/2, cx2 + w/2, cy2 - h/2 + r);
    ctx.lineTo(cx2 + w/2, cy2 + h/2 - r);
    ctx.quadraticCurveTo(cx2 + w/2, cy2 + h/2, cx2 + w/2 - r, cy2 + h/2);
    ctx.lineTo(cx2 - w/2 + r, cy2 + h/2);
    ctx.quadraticCurveTo(cx2 - w/2, cy2 + h/2, cx2 - w/2, cy2 + h/2 - r);
    ctx.lineTo(cx2 - w/2, cy2 - h/2 + r);
    ctx.quadraticCurveTo(cx2 - w/2, cy2 - h/2, cx2 - w/2 + r, cy2 - h/2);
    ctx.closePath();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    getPositions().forEach(({ x, y, rot }, i) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.shadowColor = 'rgba(0,0,0,.55)';
      ctx.shadowBlur  = 12;
      ctx.beginPath(); rr(0, 0, CW, CH, 6);
      ctx.fillStyle = `hsl(${215 + i * 18}, 38%, 22%)`;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#4f6ef7';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 14px Segoe UI, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(i + 1, 0, 0);
      ctx.restore();
    });
  }

  function syncSliders() {
    slSpacing.value = hlCfg.spacing;
    slAngle.value   = hlCfg.angle;
    slArc.value     = hlCfg.arc;
    slHover.value   = hlCfg.hover;
    lblSpacing.textContent = `${hlCfg.spacing} px`;
    lblAngle.textContent   = `${hlCfg.angle} °`;
    lblArc.textContent     = `${hlCfg.arc} px`;
    lblHover.textContent   = `${hlCfg.hover} px`;
  }

  function hitCard(mx, my) {
    const pos = getPositions();
    for (let i = pos.length - 1; i >= 0; i--) {
      const { x, y, rot } = pos[i];
      const dx = mx - x, dy = my - y;
      const lx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
      const ly = dx * Math.sin(-rot) + dy * Math.cos(-rot);
      if (Math.abs(lx) <= CW / 2 && Math.abs(ly) <= CH / 2) return i;
    }
    return -1;
  }

  let dragIdx = -1, dragStartMX, dragStartMY, dragStartSpacing, dragStartArc;

  canvas.addEventListener('mousedown', e => {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width, sy = canvas.height / r.height;
    const mx = (e.clientX - r.left) * sx, my = (e.clientY - r.top) * sy;
    const idx = hitCard(mx, my);
    if (idx === -1) return;
    dragIdx = idx; dragStartMX = mx; dragStartMY = my;
    dragStartSpacing = hlCfg.spacing; dragStartArc = hlCfg.arc;
    e.preventDefault();
  });

  window.addEventListener('mousemove', e => {
    if (dragIdx === -1) return;
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width, sy = canvas.height / r.height;
    const mx = (e.clientX - r.left) * sx, my = (e.clientY - r.top) * sy;
    const dx = mx - dragStartMX, dy = my - dragStartMY;
    const mid = (HL_N - 1) / 2;
    const t = dragIdx - mid;
    if (Math.abs(t) > 0.01) {
      hlCfg.spacing = Math.round(Math.max(40, Math.min(200, dragStartSpacing + dx / t)));
      hlCfg.arc     = Math.round(Math.max(0, Math.min(40, dragStartArc + dy / Math.abs(t))));
      syncSliders(); draw();
    }
  });

  window.addEventListener('mouseup', () => { dragIdx = -1; });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.5 : 0.5;
    hlCfg.angle = Math.max(0, Math.min(20, Math.round((hlCfg.angle + delta) * 2) / 2));
    syncSliders(); draw();
  }, { passive: false });

  slSpacing.addEventListener('input', () => { hlCfg.spacing = +slSpacing.value; syncSliders(); draw(); });
  slAngle.addEventListener('input',   () => { hlCfg.angle   = +slAngle.value;   syncSliders(); draw(); });
  slArc.addEventListener('input',     () => { hlCfg.arc     = +slArc.value;     syncSliders(); draw(); });
  slHover.addEventListener('input',   () => { hlCfg.hover   = +slHover.value;   syncSliders(); draw(); });

  document.getElementById('btn-hand-apply').addEventListener('click', () => {
    localStorage.setItem(HLKEY, JSON.stringify(hlCfg));
    _saveLayoutToFile();  // bake hand-layout-config into layout.json for deployment
    const t = document.getElementById('save-toast');
    t.textContent = '\u2714 Hand layout saved!';
    t.style.opacity = '1'; t.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(20px)'; }, 2200);
  });

  document.getElementById('btn-hand-reset').addEventListener('click', () => {
    hlCfg = { ...HLDEFAULTS };
    localStorage.removeItem(HLKEY);
    syncSliders(); draw();
  });

  syncSliders();
  draw();
})();

