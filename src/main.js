import * as PIXI from 'pixi.js';
import { init }  from './ui/BoardUI.js';
import { Card }  from './game/Card.js';
import { ATTACK_OFFSET, HEALTH_OFFSET, FIELD_ATTACK_OFFSET, FIELD_HEALTH_OFFSET,
         NAME_OFFSET, MANA_OFFSET, FACTION_OFFSET, FIELD_FACTION_OFFSET,
         SPELL_NAME_OFFSET, SPELL_MANA_OFFSET,
         FIELD_CIRCLE, HAND_ART_BOX, SPELL_ART_BOX, FACTION_ICON_CFG, configureGlow } from './game/CardView.js';
import { Stars }  from './game/Stars.js';
import { Leaves } from './game/Leaves.js';
import { Fire }   from './game/Fire.js';
import { SoundManager } from './game/SoundManager.js';
import { configureSequences } from './game/AnimationSequencer.js';
import { configureHand } from './game/Hand.js';
import spaceSrc   from './assets/backgrounds/Space/BoardSpace.png';
import forrestSrc from './assets/backgrounds/Forrest/BoardForrest.png';

// Module-level layout data — populated from layout.json on startup
let _layoutData = null;

// Fetch layout.json and configure all sub-systems from its data
async function syncLayoutFromFile() {
  try {
    const res = await fetch('/CreatedCards/layout.json?t=' + Date.now());
    if (!res.ok) return;
    _layoutData = await res.json();
    // Configure animation sequences
    configureSequences(_layoutData.animCardPlay, _layoutData.animCombat);
    // Configure hand layout (spacing, slot positions)
    configureHand(_layoutData.handLayoutConfig, _layoutData.handSlots, _layoutData.opponentHandSlots);
    // Configure card glow colours and ring dimensions
    configureGlow(_layoutData.glowColors, _layoutData.glowInset, _layoutData.glowWidth);
  } catch { /* file missing — sub-systems use defaults */ }
}

function applyStatLayout() {
  const data = _layoutData ?? {};
  try {
    const saved = data.statLayout ?? null;
    if (saved) {
      const toOffset = (pos, def) => ({
        x: pos ? pos.x / 2 - 64 : def.x,
        y: pos ? pos.y / 2 - 96 : def.y,
      });
      const hand  = saved.hand  ?? saved;
      const field = saved.field ?? saved;
      Object.assign(ATTACK_OFFSET,        toOffset(hand.attack,   ATTACK_OFFSET));
      Object.assign(HEALTH_OFFSET,        toOffset(hand.health,   HEALTH_OFFSET));
      Object.assign(NAME_OFFSET,          toOffset(hand.name,     NAME_OFFSET));
      Object.assign(MANA_OFFSET,          toOffset(hand.mana,     MANA_OFFSET));
      Object.assign(FACTION_OFFSET,       toOffset(hand.faction,  FACTION_OFFSET));
      Object.assign(FIELD_ATTACK_OFFSET,  toOffset(field.attack,  FIELD_ATTACK_OFFSET));
      Object.assign(FIELD_HEALTH_OFFSET,  toOffset(field.health,  FIELD_HEALTH_OFFSET));
      Object.assign(FIELD_FACTION_OFFSET, toOffset(field.faction, FIELD_FACTION_OFFSET));
      if (hand.factionIconSize) FACTION_ICON_CFG.size = hand.factionIconSize / 2;
      // Spell card label positions (hand view, saved under the 'spell' key)
      const spell = saved.spell ?? null;
      if (spell) {
        Object.assign(SPELL_NAME_OFFSET, toOffset(spell.name, SPELL_NAME_OFFSET));
        Object.assign(SPELL_MANA_OFFSET, toOffset(spell.mana, SPELL_MANA_OFFSET));
      }
    }
  } catch { /* use defaults */ }
  try {
    const circ = data.fieldCircle ?? null;
    if (circ) {
      FIELD_CIRCLE.cx = circ.cx / 2 - 64;
      FIELD_CIRCLE.cy = circ.cy / 2 - 96;
      FIELD_CIRCLE.r  = circ.r  / 2;
    }
  } catch { /* use defaults */ }
  try {
    const box = data.handArtBox ?? null;
    if (box) {
      HAND_ART_BOX.x = box.x / 2;
      HAND_ART_BOX.y = box.y / 2;
      HAND_ART_BOX.w = box.w / 2;
      HAND_ART_BOX.h = box.h / 2;
    }
  } catch { /* use defaults */ }
  try {
    const sbox = data.spellArtBox ?? null;
    if (sbox) {
      SPELL_ART_BOX.x = sbox.x / 2;
      SPELL_ART_BOX.y = sbox.y / 2;
      SPELL_ART_BOX.w = sbox.w / 2;
      SPELL_ART_BOX.h = sbox.h / 2;
    }
  } catch { /* use defaults */ }
}

// ── Board definitions ─────────────────────────────────────────────────────────
const BOARDS = [
  { label: 'Space',   src: spaceSrc,   hasStars: true,  hasLeaves: false, hasFire: false },
  { label: 'Forrest', src: forrestSrc, hasStars: false, hasLeaves: true,  hasFire: true  },
];
let _boardIndex = 1;

// ── Fixed design resolution — everything is authored for this size ───────────
const DESIGN_W = 1280;
const DESIGN_H = 720;

const app = new PIXI.Application({
  backgroundColor: 0x000000,
  antialias: true,
  // Force 2× internal resolution so cards and text look sharp on every display,
  // including standard 1080p external monitors (DPR=1).
  resolution: 2,
  autoDensity: true,
  width:  DESIGN_W,
  height: DESIGN_H,
});

// Canvas is letterboxed via CSS width/height — PIXI coords always stay at 1280×720.
// This is better than CSS transform because PIXI's event system uses
// getBoundingClientRect(), which automatically handles the CSS-size difference.
const canvas = app.view;
canvas.style.position = 'fixed';
canvas.style.top      = '0';
canvas.style.left     = '0';
document.getElementById('app').appendChild(canvas);

// ── Board background ──────────────────────────────────────────────────────────
const boardBg = new PIXI.Sprite(PIXI.Texture.from(BOARDS[1].src));
boardBg.anchor.set(0, 0);
app.stage.addChildAt(boardBg, 0);

// ── Ambient layers (created once, shown/hidden per board) ───────────────────────
const stars  = new Stars(app);
const leaves = new Leaves(app);
const fire   = new Fire(app, 0.836, 0.789);
app.stage.addChildAt(stars,  1);
app.stage.addChildAt(leaves, 2);
app.stage.addChildAt(fire,   3);
stars.visible  = BOARDS[1].hasStars;
leaves.visible = BOARDS[1].hasLeaves;
fire.visible   = BOARDS[1].hasFire;

// ── Board switcher button (DOM overlay, top-right) ────────────────────────────
const switchBtn = document.createElement('button');
switchBtn.textContent = '🌍 Change Board';
Object.assign(switchBtn.style, {
  position:     'fixed',
  top:          '14px',
  right:        '14px',
  zIndex:       '999',
  padding:      '8px 16px',
  background:   'rgba(20,20,40,0.82)',
  color:        '#f0e6c0',
  border:       '1px solid rgba(255,220,100,0.5)',
  borderRadius: '8px',
  fontSize:     '14px',
  fontFamily:   'Georgia, serif',
  cursor:       'pointer',
  backdropFilter: 'blur(4px)',
  transition:   'background 0.15s',
});
switchBtn.addEventListener('mouseover', () => {
  switchBtn.style.background = 'rgba(60,50,10,0.92)';
});
switchBtn.addEventListener('mouseout', () => {
  switchBtn.style.background = 'rgba(20,20,40,0.82)';
});
switchBtn.addEventListener('click', () => {
  _boardIndex = (_boardIndex + 1) % BOARDS.length;
  const board = BOARDS[_boardIndex];
  boardBg.texture   = PIXI.Texture.from(board.src);
  stars.visible     = board.hasStars;
  leaves.visible    = board.hasLeaves;
  fire.visible      = board.hasFire;
  switchBtn.textContent = '🌍 Change Board';
});

const editorBtn = document.createElement('button');
editorBtn.textContent = '✏️ Card Editor';
const btnStyle = {
  padding:        '8px 16px',
  background:     'rgba(20,20,40,0.82)',
  color:          '#f0e6c0',
  border:         '1px solid rgba(255,220,100,0.5)',
  borderRadius:   '8px',
  fontSize:       '14px',
  fontFamily:     'Georgia, serif',
  cursor:         'pointer',
  backdropFilter: 'blur(4px)',
  transition:     'background 0.15s',
};
Object.assign(editorBtn.style, btnStyle);
editorBtn.addEventListener('mouseover', () => {
  editorBtn.style.background = 'rgba(60,50,10,0.92)';
});
editorBtn.addEventListener('mouseout', () => {
  editorBtn.style.background = 'rgba(20,20,40,0.82)';
});
editorBtn.addEventListener('click', () => {
  window.location.href = '/card-editor.html';
});

const vfxEditorBtn = document.createElement('button');
vfxEditorBtn.textContent = '✨ VFX Editor';
Object.assign(vfxEditorBtn.style, btnStyle);
vfxEditorBtn.addEventListener('mouseover', () => { vfxEditorBtn.style.background = 'rgba(60,50,10,0.92)'; });
vfxEditorBtn.addEventListener('mouseout',  () => { vfxEditorBtn.style.background = 'rgba(20,20,40,0.82)'; });
vfxEditorBtn.addEventListener('click', () => { window.location.href = '/vfx-editor.html'; });

const soundEditorBtn = document.createElement('button');
soundEditorBtn.textContent = '🔊 Sounds';
Object.assign(soundEditorBtn.style, btnStyle);
soundEditorBtn.addEventListener('mouseover', () => { soundEditorBtn.style.background = 'rgba(10,40,60,0.92)'; });
soundEditorBtn.addEventListener('mouseout',  () => { soundEditorBtn.style.background = 'rgba(20,20,40,0.82)'; });
soundEditorBtn.addEventListener('click', () => { window.location.href = '/sound-editor.html'; });

const animEditorBtn = document.createElement('button');
animEditorBtn.textContent = '⏱ Timeline';
Object.assign(animEditorBtn.style, btnStyle);
animEditorBtn.addEventListener('mouseover', () => { animEditorBtn.style.background = 'rgba(10,40,60,0.92)'; });
animEditorBtn.addEventListener('mouseout',  () => { animEditorBtn.style.background = 'rgba(20,20,40,0.82)'; });
animEditorBtn.addEventListener('click', () => { window.location.href = '/animation-editor.html'; });

const muteBtn = document.createElement('button');
SoundManager.mute(true);
muteBtn.textContent = '🔇';
muteBtn.title = 'Mute / Unmute sounds';
Object.assign(muteBtn.style, { ...btnStyle, padding: '6px 10px', minWidth: '36px', background: 'rgba(80,10,10,0.92)' });
muteBtn.addEventListener('mouseover', () => { muteBtn.style.background = 'rgba(40,10,10,0.92)'; });
muteBtn.addEventListener('mouseout',  () => { muteBtn.style.background = SoundManager.isMuted ? 'rgba(80,10,10,0.92)' : 'rgba(20,20,40,0.82)'; });
muteBtn.addEventListener('click', () => {
  SoundManager.mute(!SoundManager.isMuted);
  muteBtn.textContent = SoundManager.isMuted ? '🔇' : '🔊';
  muteBtn.style.background = SoundManager.isMuted ? 'rgba(80,10,10,0.92)' : 'rgba(20,20,40,0.82)';
});

// Wrap both buttons in a flex row
const btnRow = document.createElement('div');
Object.assign(btnRow.style, {
  position:  'fixed',
  top:       '14px',
  right:     '14px',
  zIndex:    '999',
  display:   'flex',
  gap:       '8px',
});
// Remove the absolute positioning from switchBtn now that it lives in the row
switchBtn.style.position = 'static';
btnRow.appendChild(editorBtn);
btnRow.appendChild(vfxEditorBtn);
btnRow.appendChild(soundEditorBtn);
btnRow.appendChild(animEditorBtn);
btnRow.appendChild(muteBtn);
btnRow.appendChild(switchBtn);
document.body.appendChild(btnRow);

function resize() {
  const scaleX = window.innerWidth  / DESIGN_W;
  const scaleY = window.innerHeight / DESIGN_H;
  const scale  = Math.min(scaleX, scaleY);
  const cssW   = Math.round(DESIGN_W * scale);
  const cssH   = Math.round(DESIGN_H * scale);
  const offsetX = Math.round((window.innerWidth  - cssW) / 2);
  const offsetY = Math.round((window.innerHeight - cssH) / 2);
  // Set CSS size so PIXI's event system (getBoundingClientRect) stays correct
  canvas.style.width  = cssW  + 'px';
  canvas.style.height = cssH  + 'px';
  canvas.style.left   = offsetX + 'px';
  canvas.style.top    = offsetY + 'px';
  boardBg.width  = DESIGN_W;
  boardBg.height = DESIGN_H;
  fire.resize();
}

window.addEventListener('resize', resize);
resize();

// Sync layout + cards from files, then start the game
Promise.all([
  syncLayoutFromFile(),
  Card.syncFromFile(),
  SoundManager.loadAllCustom(),
]).finally(() => {
  applyStatLayout();
  init(app);
});
