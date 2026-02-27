import emptyCardSrc         from '../assets/cards/EmptyCard.png';
import fieldFrameSrc        from '../assets/cards/OnFieldFrame.png';
import spellCardEmptyFrameSrc from '../assets/cards/SpellCardEmptyFrame.png';
import _bundledCollection from '../assets/cards/CreatedCards/collection.json';
import iconFolkSrc     from '../assets/cards/Icons/FolkIcon.png';
import iconMagicalSrc  from '../assets/cards/Icons/MagicalIcon.png';
import iconWildSrc     from '../assets/cards/Icons/WildIcon.png';
import rationIconSrc   from '../assets/onFieldEffects/RationIcon.png';

// Pre-load faction icons for canvas drawImage
const FACTION_ICON_IMGS = {};
[['Folk', iconFolkSrc], ['Magical', iconMagicalSrc], ['Wild', iconWildSrc]].forEach(([k, src]) => {
  const img = new Image(); img.src = src; FACTION_ICON_IMGS[k] = img;
});

// Pre-load ration icon for the mana-cost slot in the canvas preview
const RATION_ICON_IMG = new Image();
RATION_ICON_IMG.src = rationIconSrc;
RATION_ICON_IMG.onload = () => typeof redraw === 'function' && redraw();

// Replace ⚡ emoji in the Rations stat label with the real icon sprite
{
  const manaLabel = document.querySelector('.stat-field.mana label');
  if (manaLabel) {
    manaLabel.innerHTML =
      `<img src="${rationIconSrc}" style="width:18px;height:18px;vertical-align:middle;margin-right:4px;image-rendering:auto"> Rations`;
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────
const SCALE  = 2;
const W      = 128 * SCALE;   // 256  — matches PNG 2:3 ratio (1024÷4)
const H      = 192 * SCALE;   // 384  — matches PNG 2:3 ratio (1536÷4)
const CX     = W / 2;         // 128  (horizontal centre)
const CY     = H / 2;         // 192  (vertical centre)

// Art bounding box – default matches the transparent window in EmptyCard.png (at 256×384 canvas)
const ART = { x: 14, y: 42, w: 228, h: 232 }; // kept for export fallback

// ── Hand art window (mutable, persisted to layout.json) ─────────────────────────
const HAND_ART_KEY     = 'card-hand-art-box';
const HAND_ART_DEFAULT = { x: 14, y: 42, w: 228, h: 232 };
const SPELL_ART_DEFAULT = { x: 14, y: 42, w: 228, h: 232 };

function loadHandArtBox() {
  return { ...HAND_ART_DEFAULT };
}
function saveHandArtBox() {
  _saveLayoutToFile();
}

let handArtBox  = { ...HAND_ART_DEFAULT };
let spellArtBox = { ...SPELL_ART_DEFAULT };

// Returns the art-window box object that should be used for the current card type.
function activeArtBox() {
  return effectiveMode() === 'spell' ? spellArtBox : handArtBox;
}

// Description position (fixed)
const DESC_Y = 258;

// ── Stat positions (draggable per view mode, persisted to layout.json) ───────────
const STAT_LAYOUT_KEY = 'card-stat-layout';
const MODE_DEFAULTS = {
  hand: {
    attack:      { x: CX + (-15 * SCALE), y: CY + (46 * SCALE) },
    health:      { x: CX + ( 14 * SCALE), y: CY + (46 * SCALE) },
    mana:        { x: 27,  y: 27 },
    rationIcon:  { x: 27,  y: 52 },
    name:        { x: CX,  y: 30 },
    faction:     { x: CX,  y: 62 },
    factionIconSize: 56,
    rationIconSize:  28,
  },
  // Spell cards use their own independent positions (hand view, spell frame)
  spell: {
    attack:      { x: CX + (-15 * SCALE), y: CY + (46 * SCALE) },
    health:      { x: CX + ( 14 * SCALE), y: CY + (46 * SCALE) },
    mana:        { x: 27,  y: 27 },
    rationIcon:  { x: 27,  y: 52 },
    name:        { x: CX,  y: 30 },
    faction:     { x: CX,  y: 62 },
    factionIconSize: 56,
    rationIconSize:  28,
  },
  field: {
    attack:      { x: CX + (-15 * SCALE), y: CY + (46 * SCALE) },
    health:      { x: CX + ( 14 * SCALE), y: CY + (46 * SCALE) },
    mana:        { x: 27,  y: 27 },
    rationIcon:  { x: 27,  y: 52 },
    name:        { x: CX,  y: 30 },
    faction:     { x: CX,  y: 62 },
    factionIconSize: 56,
    rationIconSize:  28,
  },
};

function loadStatLayout() {
  const d = structuredClone(MODE_DEFAULTS);
  // Ensure the 'spell' key always exists (older saved layouts may not have it)
  if (!d.spell) d.spell = structuredClone(MODE_DEFAULTS.spell);
  return d;
}

function saveStatLayout() {
  _saveLayoutToFile();
}

let layout = loadStatLayout();

// Active position vars — always reference layout[viewMode].* so mutating
// them (pos.x = ...) automatically updates the saved layout for that mode.
let ATTACK_POS       = layout.hand.attack;
let HEALTH_POS       = layout.hand.health;
let MANA_POS         = layout.hand.mana;
let RATION_ICON_POS  = layout.hand.rationIcon;
let NAME_POS         = layout.hand.name;
let FACTION_POS      = layout.hand.faction;

function syncPosVars() {
  const eMode = effectiveMode();
  // Ensure the spell sub-object exists even if loaded from an old layout.json
  if (!layout.spell) layout.spell = structuredClone(MODE_DEFAULTS.spell);
  const m = layout[eMode];
  ATTACK_POS      = m.attack;
  HEALTH_POS      = m.health;
  MANA_POS        = m.mana;
  RATION_ICON_POS = m.rationIcon ?? (m.rationIcon = { ...MODE_DEFAULTS.hand.rationIcon });
  NAME_POS        = m.name;
  FACTION_POS     = m.faction;
}

// ── Field circle window (draggable, saved globally) ───────────────────────────
const FIELD_CIRCLE_KEY     = 'card-field-circle';
const FIELD_CIRCLE_DEFAULT = { cx: CX, cy: 156, r: 89 };

function loadFieldCircle() {
  return { ...FIELD_CIRCLE_DEFAULT };
}
function saveFieldCircle() {
  _saveLayoutToFile();
}

let fieldCircle = { ...FIELD_CIRCLE_DEFAULT };

// ── Persist all layout data to layout.json via the Vite dev server ────────────
// Module-level vars used by _saveLayoutToFile (set by editor sub-sections)
let hlCfg = null;  // hand layout config — set by the hand layout IIFE
let glowColors = { highlight: '#ffd700', buff: '#22ee66', damage: '#ff3333' };

function _saveLayoutToFile() {
  const payload = JSON.stringify({
    statLayout:      layout,
    fieldCircle:     fieldCircle,
    handArtBox:      handArtBox,
    spellArtBox:     spellArtBox,
    ...(hlCfg      ? { handLayoutConfig: hlCfg }     : {}),
    ...(glowColors ? { glowColors }                  : {}),
    ...(glowInset  !== 0   ? { glowInset }            : {}),
    ...(glowWidth  !== 1.0 ? { glowWidth }            : {}),
  }, null, 2);
  fetch('/api/save-layout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  }).catch(() => { /* dev server not available */ });
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
let cardSpellFrame = null;   // HTMLImageElement – SpellCardEmptyFrame.png (spell hand)
let artImage       = null;   // HTMLImageElement – user-uploaded art
let isDirty        = false;
let viewMode       = 'hand'; // 'hand' | 'field'

// Returns the layout key to use for positions/sizes.
// When editing a spell card in hand view, positions are stored under 'spell'
// so they can differ from minion-hand positions.
function effectiveMode() {
  if (viewMode === 'hand' && currentCard?.type === 'spell') return 'spell';
  return viewMode;
}

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

// ── Glow preview state ────────────────────────────────────────────────────────
let glowPreviewMode = 'none'; // 'none' | 'highlight' | 'buff' | 'damage'
let glowInset = 0;            // ring offset in editor pixels (256×384 space); saved to layout.json
let glowWidth = 1.0;          // ring stroke-width multiplier; saved to layout.json

// ── Load frames ───────────────────────────────────────────────────────────────
cardFrame = new Image();
cardFrame.onload  = () => redraw();
cardFrame.onerror = () => console.warn('Could not load EmptyCard.png');
cardFrame.src     = emptyCardSrc;

cardFieldFrame = new Image();
cardFieldFrame.onload  = () => redraw();
cardFieldFrame.onerror = () => console.warn('Could not load OnFieldFrame.png');
cardFieldFrame.src     = fieldFrameSrc;

cardSpellFrame = new Image();
cardSpellFrame.onload  = () => redraw();
cardSpellFrame.onerror = () => console.warn('Could not load SpellCardEmptyFrame.png');
cardSpellFrame.src     = spellCardEmptyFrameSrc;

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
const iconSizeSlider        = document.getElementById('icon-size-slider');
const iconSizeVal           = document.getElementById('icon-size-val');
const rationIconSizeSlider  = document.getElementById('ration-icon-size-slider');
const rationIconSizeVal     = document.getElementById('ration-icon-size-val');

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
  const ab = activeArtBox();
  return px >= ab.x && px <= ab.x + ab.w &&
         py >= ab.y && py <= ab.y + ab.h;
}

// Returns 'attack' | 'health' | 'mana' | 'rationIcon' | 'name' | null
const STAT_HIT_R  = 18;
const NAME_HIT_HW = 90;
const NAME_HIT_HH = 14;
const FACTION_HIT_HW = 50;
const FACTION_HIT_HH = 16;
function statAtPoint(cx, cy) {
  const { px, py } = canvasToPixel(cx, cy);
  const eMode = effectiveMode();
  const isSpell = currentCard.type === 'spell';
  if (eMode !== 'field') {
    // Name is always draggable in hand/spell view
    if (Math.abs(px - NAME_POS.x) <= NAME_HIT_HW && Math.abs(py - NAME_POS.y) <= NAME_HIT_HH) return 'name';
    // Faction only for minions (hidden on spell cards)
    if (!isSpell && Math.abs(px - FACTION_POS.x) <= FACTION_HIT_HW && Math.abs(py - FACTION_POS.y) <= FACTION_HIT_HH) return 'faction';
    const dm = { x: MANA_POS.x - px, y: MANA_POS.y - py };
    if (dm.x * dm.x + dm.y * dm.y <= STAT_HIT_R * STAT_HIT_R) return 'mana';
    const riSz = (layout[eMode]?.rationIconSize ?? 28) / 2 + 4;
    const dri = { x: RATION_ICON_POS.x - px, y: RATION_ICON_POS.y - py };
    if (dri.x * dri.x + dri.y * dri.y <= riSz * riSz) return 'rationIcon';
  }
  if (viewMode === 'field') {
    if (Math.abs(px - FACTION_POS.x) <= FACTION_HIT_HW && Math.abs(py - FACTION_POS.y) <= FACTION_HIT_HH) return 'faction';
  }
  // Attack / health only for non-spell cards
  if (!isSpell) {
    const slots = { attack: ATTACK_POS, health: HEALTH_POS };
    for (const [key, pos] of Object.entries(slots)) {
      const dx = px - pos.x, dy = py - pos.y;
      if (dx * dx + dy * dy <= STAT_HIT_R * STAT_HIT_R) return key;
    }
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
  const ab = activeArtBox();
  // Bottom-right corner resize dot
  const brx = ab.x + ab.w, bry = ab.y + ab.h;
  const cdx = px - brx, cdy = py - bry;
  if (cdx * cdx + cdy * cdy <= RECT_HANDLE_R * RECT_HANDLE_R) return 'corner';
  // Center move crosshair
  const midx = ab.x + ab.w / 2, midy = ab.y + ab.h / 2;
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
    const ab = activeArtBox();
    if (handArtDrag.type === 'center') {
      ab.x = Math.round(handArtDrag.baseX + dx);
      ab.y = Math.round(handArtDrag.baseY + dy);
    } else {
      ab.w = Math.max(20, Math.round(handArtDrag.baseW + dx));
      ab.h = Math.max(20, Math.round(handArtDrag.baseH + dy));
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
    const tgt = statDrag.stat === 'attack'      ? ATTACK_POS
               : statDrag.stat === 'health'      ? HEALTH_POS
               : statDrag.stat === 'mana'        ? MANA_POS
               : statDrag.stat === 'rationIcon'  ? RATION_ICON_POS
               : statDrag.stat === 'faction'     ? FACTION_POS : NAME_POS;
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
    const ab = activeArtBox();
    handArtDrag = { type: rh, startPx: px, startPy: py,
                    baseX: ab.x, baseY: ab.y,
                    baseW: ab.w, baseH: ab.h };
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
    const pos = stat === 'attack'     ? ATTACK_POS
             : stat === 'health'     ? HEALTH_POS
             : stat === 'mana'       ? MANA_POS
             : stat === 'rationIcon' ? RATION_ICON_POS
             : stat === 'faction'    ? FACTION_POS : NAME_POS;
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
  const eMode = effectiveMode();
  const d = structuredClone(MODE_DEFAULTS[eMode] ?? MODE_DEFAULTS.hand);
  Object.assign(ATTACK_POS,      d.attack);
  Object.assign(HEALTH_POS,      d.health);
  Object.assign(MANA_POS,        d.mana);
  Object.assign(RATION_ICON_POS, d.rationIcon ?? MODE_DEFAULTS.hand.rationIcon);
  Object.assign(NAME_POS,        d.name);
  Object.assign(FACTION_POS,     d.faction);
  saveStatLayout();
  redraw();
});

btnResetCircle.addEventListener('click', () => {
  fieldCircle = { ...FIELD_CIRCLE_DEFAULT };
  saveFieldCircle();
  redraw();
});

btnResetHandArt.addEventListener('click', () => {
  if (effectiveMode() === 'spell') {
    spellArtBox = { ...SPELL_ART_DEFAULT };
  } else {
    handArtBox = { ...HAND_ART_DEFAULT };
  }
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
      roundRectPath(ctx, activeArtBox().x, activeArtBox().y, activeArtBox().w, activeArtBox().h, 4);
      ctx.clip();
      const ab = activeArtBox();
      const baseScale  = Math.max(ab.w / artImage.naturalWidth, ab.h / artImage.naturalHeight);
      const totalScale = baseScale * artZoom;
      const imgW = artImage.naturalWidth  * totalScale;
      const imgH = artImage.naturalHeight * totalScale;
      const imgX = ab.x + (ab.w - imgW) / 2 + artOffset.x;
      const imgY = ab.y + (ab.h - imgH) / 2 + artOffset.y;
      ctx.drawImage(artImage, imgX, imgY, imgW, imgH);
    }

    ctx.restore();
  }

  // 2. Card frame on top – EmptyCard.png (hand) or OnFieldFrame.png (field)
  const activeFrame = viewMode === 'field' ? cardFieldFrame
    : (currentCard.type === 'spell' ? cardSpellFrame : cardFrame);

  // For field mode: glow goes BEHIND the frame (between art and frame layer).
  // For hand mode: glow goes ON TOP of the frame.
  const _glowActive = glowPreviewMode !== 'none';
  const _glowColorMap = {
    highlight: glowColors?.highlight || '#ffd700',
    buff:      glowColors?.buff      || '#22ee66',
    damage:    glowColors?.damage    || '#ff3333',
  };

  if (_glowActive && viewMode === 'field') {
    drawGlowPreview(_glowColorMap[glowPreviewMode], glowInset, glowWidth);
  }

  if (activeFrame) {
    ctx.drawImage(activeFrame, 0, 0, W, H);
  }

  // Hand-mode glow sits on top of the frame
  if (_glowActive && viewMode !== 'field') {
    drawGlowPreview(_glowColorMap[glowPreviewMode], glowInset, glowWidth);
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
    const { x, y, w, h } = activeArtBox();
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
      ctx.font = `bold ${fontSize}px 'Cinzel', serif`;
      while (ctx.measureText(currentCard.name).width > maxW && fontSize > 11) {
        fontSize--;
        ctx.font = `bold ${fontSize}px 'Cinzel', serif`;
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
  const _isSpellCard = currentCard.type === 'spell';
  const statSlots = viewMode === 'field'
    ? [
        { key: 'attack', pos: ATTACK_POS, label: String(currentCard.attack),   color: '#f97316' },
        { key: 'health', pos: HEALTH_POS, label: String(currentCard.health),   color: '#ef4444' },
      ]
    : _isSpellCard ? []
    : [
        { key: 'attack', pos: ATTACK_POS, label: String(currentCard.attack),   color: '#f97316' },
        { key: 'health', pos: HEALTH_POS, label: String(currentCard.health),   color: '#ef4444' },
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

  // Ration icon — drawn separately at its own draggable position (hand/spell view only)
  if (viewMode === 'hand') {
    const riSz = layout[effectiveMode()].rationIconSize ?? 28;
    const riHitR = riSz / 2 + 4;
    // Dashed drag-handle ring
    ctx.save();
    ctx.strokeStyle = '#a78bfa';
    ctx.globalAlpha = 0.55;
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(RATION_ICON_POS.x, RATION_ICON_POS.y, riHitR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (RATION_ICON_IMG.complete && RATION_ICON_IMG.naturalWidth > 0) {
      ctx.drawImage(RATION_ICON_IMG,
        RATION_ICON_POS.x - riSz / 2, RATION_ICON_POS.y - riSz / 2, riSz, riSz);
    } else {
      RATION_ICON_IMG.onload = () => redraw();
    }
    // Mana cost number — independent position, separate drag handle
    ctx.save();
    ctx.strokeStyle = '#60a5fa';
    ctx.globalAlpha = 0.45;
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(MANA_POS.x, MANA_POS.y, STAT_HIT_R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawStat(ctx, String(currentCard.manaCost), MANA_POS.x, MANA_POS.y, '#60a5fa');
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

    // 6b. Faction icon — hidden for spell cards (they have no faction)
    if (!_isSpellCard) {
      const ICON_SIZE_H = layout[effectiveMode()].factionIconSize ?? 40;
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
  ctx.font          = "bold 28px 'Cinzel', serif";
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

// Draw a glow around the card frame in the 2D preview canvas.
// inset > 0 → rings move inward; inset < 0 → rings extend outward.
function drawGlowPreview(hexColor, inset, widthScale = 1) {
  if (viewMode === 'field') {
    // Circle glow centred on the field circle window
    const { cx, cy, r } = fieldCircle;
    const effR = Math.max(1, r - inset);
    const w    = widthScale;
    ctx.save();
    ctx.strokeStyle = hexColor;
    ctx.shadowColor = hexColor;
    ctx.shadowBlur  = 18 * w; ctx.lineWidth = 4 * w; ctx.globalAlpha = 1.0;
    ctx.beginPath(); ctx.arc(cx, cy, effR, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur  = 10 * w; ctx.lineWidth = 8 * w; ctx.globalAlpha = 0.55;
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, effR - 2), 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur  = 5  * w; ctx.lineWidth = 14 * w; ctx.globalAlpha = 0.22;
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, effR - 6), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    return;
  }

  const i = inset;
  const cornerR = Math.max(3, 16 - i * 0.4);
  const w = widthScale;

  ctx.save();
  ctx.strokeStyle = hexColor;

  // Ring 1 — crisp outer border
  ctx.shadowColor = hexColor;
  ctx.shadowBlur  = 18 * w;
  ctx.lineWidth   = 4 * w;
  ctx.globalAlpha = 1.0;
  roundRectPath(ctx, i, i, W - i * 2, H - i * 2, cornerR);
  ctx.stroke();

  // Ring 2 — mid halo (2 px inside ring 1)
  const i2 = i + 2;
  ctx.shadowBlur  = 10 * w;
  ctx.lineWidth   = 8 * w;
  ctx.globalAlpha = 0.55;
  roundRectPath(ctx, i2, i2, W - i2 * 2, H - i2 * 2, Math.max(2, cornerR - 1));
  ctx.stroke();

  // Ring 3 — deep inner fill
  const i3 = i + 6;
  ctx.shadowBlur  = 5 * w;
  ctx.lineWidth   = 14 * w;
  ctx.globalAlpha = 0.22;
  roundRectPath(ctx, i3, i3, W - i3 * 2, H - i3 * 2, Math.max(1, cornerR - 2));
  ctx.stroke();

  ctx.restore();
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
  ctx.font = `bold ${size}px 'Cinzel', serif`;
  while (ctx.measureText(text).width > maxW && size > 8) {
    size--;
    ctx.font = `bold ${size}px 'Cinzel', serif`;
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
    const ab = cardData.type === 'spell' ? spellArtBox : handArtBox;
    roundRectPath(tctx, ab.x, ab.y, ab.w, ab.h, 4);
    tctx.clip();
    const off   = cardData.artOffset ?? { x: 0, y: 0 };
    const zoom  = cardData.artZoom   ?? 1;
    const base  = Math.max(ab.w / artImg.naturalWidth, ab.h / artImg.naturalHeight);
    const total = base * zoom;
    const imgW  = artImg.naturalWidth  * total;
    const imgH  = artImg.naturalHeight * total;
    const imgX  = ab.x + (ab.w - imgW) / 2 + off.x;
    const imgY  = ab.y + (ab.h - imgH) / 2 + off.y;
    tctx.drawImage(artImg, imgX, imgY, imgW, imgH);
    tctx.restore();
  }

  // 2. Card frame
  const _thumb_frame = cardData.type === 'spell' ? cardSpellFrame : cardFrame;
  if (_thumb_frame) tctx.drawImage(_thumb_frame, 0, 0, W, H);

  // 3. Gold name at top
  if (cardData.name) {
    tctx.save();
    tctx.textAlign    = 'center';
    tctx.textBaseline = 'middle';
    let sz = 18;
    tctx.font = `bold ${sz}px 'Cinzel', serif`;
    while (tctx.measureText(cardData.name).width > 190 && sz > 9) {
      sz--;
      tctx.font = `bold ${sz}px 'Cinzel', serif`;
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
  c.font          = "bold 22px 'Cinzel', serif";
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
  syncPosVars();      // switch position pointers to correct layout (spell vs minion)
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
  syncPosVars();
  syncIconSizeSlider();
  markDirty();
  redraw();
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

// Faction icon size slider — sets size for the current effective mode
iconSizeSlider.addEventListener('input', () => {
  const v = Number(iconSizeSlider.value);
  iconSizeVal.textContent = v;
  layout[effectiveMode()].factionIconSize = v;
  saveStatLayout();
  redraw();
});

// Ration icon size slider — sets size for the current effective mode
rationIconSizeSlider.addEventListener('input', () => {
  const v = Number(rationIconSizeSlider.value);
  rationIconSizeVal.textContent = v;
  layout[effectiveMode()].rationIconSize = v;
  saveStatLayout();
  redraw();
});

function syncIconSizeSlider() {
  const eMode = effectiveMode();
  const v = layout[eMode]?.factionIconSize ?? 40;
  iconSizeSlider.value    = v;
  iconSizeVal.textContent = v;
  const rv = layout[eMode]?.rationIconSize ?? 28;
  rationIconSizeSlider.value    = rv;
  rationIconSizeVal.textContent = rv;
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
  // Open the game in the same tab (always loads fresh from files)
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
  // Seed from the bundled collection.json; syncCollectionFromFile will update from the file
  if (Array.isArray(_bundledCollection) && _bundledCollection.length > 0) {
    return _bundledCollection;
  }
  return [];
}

async function saveCollection(cards) {
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

// On startup: fetch the latest collection from file
;(async function syncCollectionFromFile() {
  try {
    const res = await fetch('/CreatedCards/collection.json?t=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        collection = data;
        rebuildGrid();
        return;
      }
    }
  } catch { /* server not available */ }
  // File is empty or unreachable — save what we have so it gets baked in
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
// Load saved layout from file so the editor shows the persisted values
;(async function syncEditorLayoutFromFile() {
  try {
    const res = await fetch('/CreatedCards/layout.json?t=' + Date.now());
    if (!res.ok) return;
    const data = await res.json();
    if (data.statLayout) {
      const load = (mode) => {
        const src = data.statLayout[mode] ?? {};
        const def = MODE_DEFAULTS[mode] ?? MODE_DEFAULTS.hand;
        return {
          attack:  src.attack  ?? { ...def.attack  },
          health:  src.health  ?? { ...def.health  },
          mana:    src.mana    ?? { ...def.mana    },
          name:    src.name    ?? { ...def.name    },
          faction: src.faction ?? { ...def.faction },
          rationIcon: src.rationIcon ?? { ...def.rationIcon },
          factionIconSize: src.factionIconSize ?? def.factionIconSize,
          rationIconSize:  src.rationIconSize  ?? def.rationIconSize,
        };
      };
      layout = { hand: load('hand'), field: load('field'), spell: load('spell') };
      syncPosVars();
    }
    if (data.fieldCircle) Object.assign(fieldCircle, data.fieldCircle);
    if (data.handArtBox)  Object.assign(handArtBox,  data.handArtBox);
    if (data.spellArtBox) Object.assign(spellArtBox, data.spellArtBox);
    if (data.handLayoutConfig) { hlCfg = data.handLayoutConfig; if (_syncHandLayoutUI) _syncHandLayoutUI(); }
    if (data.glowColors)  { glowColors = data.glowColors; }
    if (typeof data.glowInset === 'number') glowInset = data.glowInset;
    if (typeof data.glowWidth === 'number') glowWidth = data.glowWidth;
    redraw();
  } catch { /* server not available — defaults are fine */ }
})();

// ── Hand Layout Editor ────────────────────────────────────────────────────────
// Expose a re-sync hook so file load can push values to the UI
let _syncHandLayoutUI = null;
(function () {
  const HLDEFAULTS = { spacing: 145, angle: 6, arc: 6, hover: 30 };
  const HL_N = 5;

  // Seed module-level hlCfg with defaults on first run
  if (!hlCfg) hlCfg = { ...HLDEFAULTS };

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
    _saveLayoutToFile();  // bake hand-layout-config into layout.json for deployment
    const t = document.getElementById('save-toast');
    t.textContent = '\u2714 Hand layout saved!';
    t.style.opacity = '1'; t.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(20px)'; }, 2200);
  });

  document.getElementById('btn-hand-reset').addEventListener('click', () => {
    hlCfg = { ...HLDEFAULTS };
    syncSliders(); draw();
  });

  syncSliders();
  draw();
  // Expose syncSliders so syncLayoutFromFile can push new values to the UI
  _syncHandLayoutUI = () => { syncSliders(); draw(); };
})();

// ── Glow colour pickers + preview + inset ────────────────────────────────────
(function initGlowColors() {
  const DEFAULTS  = { highlight: '#ffd700', buff: '#22ee66', damage: '#ff3333' };

  // Seed module-level glowColors with defaults if not set
  if (!glowColors) glowColors = { ...DEFAULTS };

  const pHighlight = document.getElementById('glow-highlight');
  const pBuff      = document.getElementById('glow-buff');
  const pDamage    = document.getElementById('glow-damage');
  if (!pHighlight) return;

  pHighlight.value = glowColors.highlight;
  pBuff.value      = glowColors.buff;
  pDamage.value    = glowColors.damage;

  function saveColors() {
    glowColors = { highlight: pHighlight.value, buff: pBuff.value, damage: pDamage.value };
    redraw();
  }
  pHighlight.addEventListener('input', saveColors);
  pBuff.addEventListener('input',      saveColors);
  pDamage.addEventListener('input',    saveColors);

  // Inset slider (glowInset is module-level, default 0)
  const slInset    = document.getElementById('glow-inset');
  const lblInset   = document.getElementById('glow-inset-val');
  if (slInset) {
    slInset.value = glowInset;
    lblInset.textContent = glowInset + ' px';
    slInset.addEventListener('input', () => {
      glowInset = parseFloat(slInset.value);
      lblInset.textContent = glowInset + ' px';
      redraw();
    });
  }

  // Width slider (glowWidth is module-level, default 1.0)
  const slWidth     = document.getElementById('glow-width');
  const lblWidth    = document.getElementById('glow-width-val');
  if (slWidth) {
    slWidth.value = glowWidth;
    lblWidth.textContent = glowWidth.toFixed(1) + '×';
    slWidth.addEventListener('input', () => {
      glowWidth = parseFloat(slWidth.value);
      lblWidth.textContent = glowWidth.toFixed(1) + '×';
      redraw();
    });
  }

  // Preview mode toggle buttons
  const prevBtns = document.querySelectorAll('.glow-prev-btn');
  prevBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      prevBtns.forEach(b => b.style.opacity = '0.55');
      btn.style.opacity = '1';
      glowPreviewMode = btn.dataset.mode;
      redraw();
    });
  });
})();

