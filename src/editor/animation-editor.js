import {
  CARD_PLAY_PHASES, COMBAT_PHASES,
  DEFAULT_CARD_PLAY_CONFIG, DEFAULT_COMBAT_CONFIG,
  STORAGE_KEYS,
} from '../game/AnimationSequencer.js';

// ── Sequence definitions ─────────────────────────────────────────────────────
const SEQUENCES = {
  cardPlay: {
    label:    'Card Play',
    phases:   CARD_PLAY_PHASES,
    defaults: DEFAULT_CARD_PLAY_CONFIG,
    key:      STORAGE_KEYS.cardPlay,
    note:     'Runs after the card lands and springs back to normal.',
  },
  combat: {
    label:    'Combat',
    phases:   COMBAT_PHASES,
    defaults: DEFAULT_COMBAT_CONFIG,
    key:      STORAGE_KEYS.combat,
    note:     'Controls the attack sequence when a minion attacks.',
  },
};

const MAX_SLOTS   = 7;   // slots 0 … 6
const PADX        = 60;  // horizontal padding on the timeline
const CENTER_Y    = 96;  // y of the timeline line within #timeline-outer
const STACK_GAP   = 48;  // vertical spacing when dots share a slot

// ── State ─────────────────────────────────────────────────────────────────────
let activeKey  = 'cardPlay';
// Deep-copy configs from localStorage (or defaults)
const configs  = {};
for (const [key, seq] of Object.entries(SEQUENCES)) {
  try {
    const saved = JSON.parse(localStorage.getItem(seq.key));
    if (Array.isArray(saved) && saved.length === seq.phases.length) {
      configs[key] = saved.map(x => ({ ...x }));
      continue;
    }
  } catch { /* ignore */ }
  configs[key] = seq.defaults.map(x => ({ ...x }));
}

let dragState = null; // { id, dotEl, lblEl, startMouseX, startDotX }

// ── Layout helpers ────────────────────────────────────────────────────────────
function getContainerWidth() {
  return document.getElementById('timeline-outer').clientWidth || 800;
}

function slotToX(slot, w) {
  const usable = w - PADX * 2;
  return PADX + slot * (usable / (MAX_SLOTS - 1));
}

function xToSlot(x, w) {
  const usable = w - PADX * 2;
  const raw    = (x - PADX) / (usable / (MAX_SLOTS - 1));
  return Math.max(0, Math.min(MAX_SLOTS - 1, Math.round(raw)));
}

/** Returns { [id]: { x, y, slot } } for all phases in the current config. */
function computeLayout() {
  const w      = getContainerWidth();
  const config = configs[activeKey];

  // Group ids by slot (preserving order within each slot)
  const bySlot = new Map();
  for (const { id, slot } of config) {
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot).push(id);
  }

  const positions = {};
  for (const [slot, ids] of bySlot) {
    const n  = ids.length;
    const cx = slotToX(slot, w);
    ids.forEach((id, i) => {
      const offsetY = (i - (n - 1) / 2) * STACK_GAP;
      positions[id] = { x: cx, y: CENTER_Y + offsetY, slot };
    });
  }
  return positions;
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
function clearTimeline() {
  const outer = document.getElementById('timeline-outer');
  outer.querySelectorAll(
    '.phase-dot, .phase-label, .slot-tick, .par-bracket'
  ).forEach(el => el.remove());
}

function mkEl(tag, cls, styles = {}) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  Object.assign(el.style, styles);
  return el;
}

// ── Render ───────────────────────────────────────────────────────────────────
function render() {
  clearTimeline();

  const outer  = document.getElementById('timeline-outer');
  const w      = getContainerWidth();
  const seq    = SEQUENCES[activeKey];
  const config = configs[activeKey];
  const layout = computeLayout();

  // Slot tick marks (skip 0 and last — those are the end labels)
  for (let s = 1; s < MAX_SLOTS - 1; s++) {
    const tick = mkEl('div', 'slot-tick', { left: slotToX(s, w) + 'px' });
    outer.appendChild(tick);
  }

  // Parallel bracket: vertical line between stacked dots of the same slot
  const bySlot = new Map();
  for (const { id, slot } of config) {
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot).push(id);
  }
  for (const [, ids] of bySlot) {
    if (ids.length < 2) continue;
    const ys  = ids.map(id => layout[id].y);
    const top = Math.min(...ys);
    const bot = Math.max(...ys);
    const x   = layout[ids[0]].x;
    const brk = mkEl('div', 'par-bracket', {
      left:   x + 'px',
      top:    top + 'px',
      height: (bot - top) + 'px',
    });
    outer.appendChild(brk);
  }

  // Phase dots + labels
  for (const { id } of config) {
    const phase = seq.phases.find(p => p.id === id);
    if (!phase) continue;
    const pos = layout[id];

    // ── Dot ──────────────────────────────────────────────────────────────────
    const dot = mkEl('div', 'phase-dot', {
      left:       pos.x + 'px',
      top:        pos.y + 'px',
      background: phase.color + 'cc',
      boxShadow:  `0 0 14px ${phase.color}55`,
    });
    dot.dataset.id = id;
    dot.title      = phase.desc;
    dot.textContent = phase.icon;

    // slot badge
    const badge = mkEl('div', 'dot-badge');
    badge.textContent = pos.slot;
    dot.appendChild(badge);

    dot.addEventListener('mousedown', e => {
      e.preventDefault();
      dot.classList.add('dragging');
      dragState = {
        id,
        dotEl:      dot,
        lblEl:      document.querySelector(`.phase-label[data-id="${id}"]`),
        startMouseX: e.clientX,
        startDotX:  pos.x,
      };
    });

    outer.appendChild(dot);

    // ── Label (below dot) ────────────────────────────────────────────────────
    const lbl = mkEl('div', 'phase-label', {
      left: pos.x + 'px',
      top:  (pos.y + 25) + 'px',
    });
    lbl.dataset.id = id;
    const nameEl = mkEl('div', 'lbl-name', { color: phase.color });
    nameEl.textContent = phase.label;
    lbl.appendChild(nameEl);
    outer.appendChild(lbl);
  }

  renderLegend();
}

function renderLegend() {
  const legend = document.getElementById('legend');
  legend.innerHTML = '';

  const seq    = SEQUENCES[activeKey];
  const config = [...configs[activeKey]].sort((a, b) => a.slot - b.slot);

  for (const { id, slot } of config) {
    const phase = seq.phases.find(p => p.id === id);
    if (!phase) continue;

    // who else shares this slot?
    const siblings = config
      .filter(c => c.slot === slot && c.id !== id)
      .map(c => seq.phases.find(p => p.id === c.id)?.label ?? c.id);

    const slotTxt = siblings.length
      ? `Slot ${slot} — parallel with ${siblings.join(', ')}`
      : `Slot ${slot}`;

    const card = mkEl('div', 'legend-card', {
      borderColor: phase.color + '55',
    });
    card.innerHTML = `
      <div class="legend-card-head">
        <span>${phase.icon}</span>
        <span style="color:${phase.color}">${phase.label}</span>
      </div>
      <div class="legend-card-desc">${phase.desc}</div>
      <div class="legend-card-slot">${slotTxt}</div>
    `;
    legend.appendChild(card);
  }
}

// ── Document-level drag handlers ─────────────────────────────────────────────
document.addEventListener('mousemove', e => {
  if (!dragState) return;
  const { dotEl, lblEl, startMouseX, startDotX } = dragState;
  const w      = getContainerWidth();
  const newX   = Math.max(PADX, Math.min(w - PADX, startDotX + (e.clientX - startMouseX)));
  const preSlot = xToSlot(newX, w);

  dotEl.style.left = newX + 'px';
  if (lblEl) lblEl.style.left = newX + 'px';

  // Update badge on the fly
  const badge = dotEl.querySelector('.dot-badge');
  if (badge) badge.textContent = preSlot;
});

document.addEventListener('mouseup', e => {
  if (!dragState) return;
  const { id, dotEl } = dragState;
  dotEl.classList.remove('dragging');

  const w       = getContainerWidth();
  const finalX  = parseFloat(dotEl.style.left);
  const newSlot = xToSlot(finalX, w);

  // Commit to config
  const entry = configs[activeKey].find(c => c.id === id);
  if (entry) entry.slot = newSlot;

  dragState = null;
  render();
});

// ── Tabs ─────────────────────────────────────────────────────────────────────
document.getElementById('tabs').addEventListener('click', e => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  activeKey = btn.dataset.seq;
  render();
});

// ── Save ─────────────────────────────────────────────────────────────────────
document.getElementById('save-btn').addEventListener('click', () => {
  for (const [key, seq] of Object.entries(SEQUENCES)) {
    localStorage.setItem(seq.key, JSON.stringify(configs[key]));
  }

  // Also persist to layout.json so it survives deploys
  const payload = {
    animCardPlay: configs.cardPlay,
    animCombat:   configs.combat,
  };
  fetch('/api/save-layout', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  }).catch(() => { /* dev server not running — localStorage is enough */ });

  const toast = document.getElementById('toast');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
});

// ── Resize ───────────────────────────────────────────────────────────────────
window.addEventListener('resize', render);

// ── Tab switch also resets preview ───────────────────────────────────────────
document.getElementById('tabs').addEventListener('click', () => {
  // resetPreview is defined below — called after DOM is ready
  if (typeof resetPreview === 'function') resetPreview();
});

// ── Init ─────────────────────────────────────────────────────────────────────
render();

// ════════════════════════════════════════════════════════════════════════════
// PREVIEW SYSTEM
// ════════════════════════════════════════════════════════════════════════════

const PREVIEW_CANVAS = document.getElementById('preview-canvas');
const PX = PREVIEW_CANVAS.getContext('2d');
const PW = PREVIEW_CANVAS.width, PH = PREVIEW_CANVAS.height;

const CARD_W = 56, CARD_H = 80, CARD_R = 7;
const LUNGE_OFF = 50; // px attacker travels forward

const PHASE_DURATIONS = {
  summon_vfx:      740,
  battlecry_burst: 640,
  on_play:         820,
  lunge:           470,
  clash_vfx:       510,
  damage:          600,
  snap_back:       460,
  death_vfx:       690,
};
const SLOT_GAP_MS = 210;

// ── Easing ───────────────────────────────────────────────────────────────────
const easeOut = t => 1 - (1-t)**2;
const easeIn  = t => t*t;

// ── Scene factory ─────────────────────────────────────────────────────────────
function makeScene(key) {
  if (key === 'cardPlay') return {
    main:  { x:105, y:148, color:'#4a7eff', dx:0, alpha:1, label:'PLAY',  atk:3, hp:4 },
    enemy: { x:218, y:116, color:'#882222', dx:0, alpha:1, label:'ENEMY', atk:2, hp:5 },
  };
  return {
    attacker: { x:70,  y:162, color:'#44aa55', dx:0, alpha:1, label:'ATTKR', atk:4, hp:3 },
    defender: { x:218, y:128, color:'#bb4444', dx:0, alpha:1, label:'DEFND', atk:2, hp:6 },
  };
}

// ── Draw helpers ──────────────────────────────────────────────────────────────
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

function drawCard(card) {
  if ((card.alpha ?? 1) <= 0) return;
  const cx = card.x + (card.dx ?? 0), cy = card.y;
  const x = cx - CARD_W/2, y = cy - CARD_H/2;
  PX.save();
  PX.globalAlpha = card.alpha ?? 1;
  // body
  PX.fillStyle = '#131524'; PX.shadowBlur = 10; PX.shadowColor = card.color + '44';
  rrect(PX,x,y,CARD_W,CARD_H,CARD_R); PX.fill(); PX.shadowBlur = 0;
  // color stripe clip
  PX.save(); PX.beginPath(); PX.rect(x,y,CARD_W,22); PX.clip();
  PX.globalAlpha = (card.alpha ?? 1) * 0.65; PX.fillStyle = card.color;
  rrect(PX,x,y,CARD_W,CARD_H,CARD_R); PX.fill(); PX.restore();
  // border
  PX.globalAlpha = (card.alpha ?? 1) * 0.38; PX.strokeStyle = card.color; PX.lineWidth = 1.5;
  rrect(PX,x,y,CARD_W,CARD_H,CARD_R); PX.stroke();
  // labels
  PX.globalAlpha = card.alpha ?? 1;
  PX.fillStyle = '#ccc'; PX.font = 'bold 8px monospace';
  PX.textAlign = 'center'; PX.textBaseline = 'middle';
  PX.fillText(card.label, cx, cy+14);
  PX.font = '9px monospace';
  PX.fillStyle = '#ff8888'; PX.textAlign = 'left';  PX.fillText(card.atk, x+4, y+CARD_H-8);
  PX.fillStyle = '#88ff88'; PX.textAlign = 'right'; PX.fillText(card.hp,  x+CARD_W-4, y+CARD_H-8);
  PX.restore();
}

function drawBase(scene) {
  PX.fillStyle = '#060810'; PX.fillRect(0,0,PW,PH);
  PX.strokeStyle = '#0b0d1a'; PX.lineWidth = 1;
  for (let gx=0; gx<PW; gx+=28) { PX.beginPath(); PX.moveTo(gx,0); PX.lineTo(gx,PH); PX.stroke(); }
  for (let gy=0; gy<PH; gy+=28) { PX.beginPath(); PX.moveTo(0,gy); PX.lineTo(PW,gy); PX.stroke(); }
  for (const c of Object.values(scene)) drawCard(c);
}

// ── Per-phase state mutations ─────────────────────────────────────────────────
function applyPhaseState(id, scene, t) {
  if (id === 'lunge')     { if (scene.attacker) scene.attacker.dx = easeOut(Math.min(1, t/0.75)) * LUNGE_OFF; }
  if (id === 'snap_back') { if (scene.attacker) scene.attacker.dx = (1 - easeOut(t)) * LUNGE_OFF; }
  if (id === 'death_vfx') { if (scene.defender) scene.defender.alpha = Math.max(0, 1 - easeOut(Math.min(1, t/0.8))); }
}

// ── Phase visual overlays ─────────────────────────────────────────────────────
function drawOverlay(id, scene, t) {
  const mainCard = scene.main ?? scene.attacker; // card that "acts"
  const dstCard  = scene.enemy ?? scene.defender; // card that "receives"

  switch (id) {

    case 'summon_vfx': {
      const cx = mainCard.x, cy = mainCard.y;
      for (let ri = 0; ri < 2; ri++) {
        const delay = ri * 0.12, span = 0.72;
        const ringT = easeOut(Math.max(0, (t-delay)/span));
        const r = ringT * 72;
        const a = Math.max(0, 1 - easeOut(Math.max(0, (t - delay - 0.18)/0.6)));
        PX.save(); PX.globalAlpha = a * (ri===0 ? 0.85 : 0.5);
        PX.strokeStyle = mainCard.color; PX.lineWidth = ri===0 ? 2.5 : 1.5;
        PX.shadowBlur = 10; PX.shadowColor = mainCard.color;
        PX.beginPath(); PX.arc(cx, cy, Math.max(0.5,r), 0, Math.PI*2); PX.stroke();
        PX.restore();
      }
      break;
    }

    case 'battlecry_burst': {
      const cx = mainCard.x, cy = mainCard.y;
      for (let ri = 0; ri < 3; ri++) {
        const delay = ri * 0.17;
        const rT = easeOut(Math.max(0, (t-delay)/(1-delay)));
        const r = rT * 65;
        const a = Math.max(0, 1 - rT);
        PX.save(); PX.globalAlpha = a * 0.72;
        PX.strokeStyle = '#ff9f43'; PX.lineWidth = 1.8 + ri*0.5;
        PX.shadowBlur = 7; PX.shadowColor = '#ff9f43';
        PX.beginPath(); PX.arc(cx, cy, Math.max(0.5,r), 0, Math.PI*2); PX.stroke();
        PX.restore();
      }
      if (t > 0.28) {
        const sT = (t-0.28)/0.72;
        for (let i = 0; i < 8; i++) {
          const ang = (i/8)*Math.PI*2 + 0.4;
          const d = easeOut(sT) * 55;
          PX.save(); PX.globalAlpha = (1-sT)*0.9;
          PX.fillStyle = '#ffcc44';
          PX.beginPath(); PX.arc(cx+Math.cos(ang)*d, cy+Math.sin(ang)*d, 2.5, 0, Math.PI*2); PX.fill();
          PX.restore();
        }
      }
      break;
    }

    case 'on_play': {
      if (!dstCard) break;
      const sx = mainCard.x+(mainCard.dx??0), sy = mainCard.y;
      const dx = dstCard.x+(dstCard.dx??0), dy = dstCard.y;
      if (t < 0.55) {
        const lineT = easeOut(t/0.5);
        const ex = sx+(dx-sx)*lineT, ey = sy+(dy-sy)*lineT;
        PX.save(); PX.globalAlpha = 0.85; PX.strokeStyle = '#ff6b6b'; PX.lineWidth = 2;
        PX.shadowBlur = 6; PX.shadowColor = '#ff6b6b'; PX.setLineDash([6,4]);
        PX.beginPath(); PX.moveTo(sx,sy); PX.lineTo(ex,ey); PX.stroke(); PX.restore();
      }
      const flashT = Math.max(0, Math.min(1, (t-0.5)/0.22));
      if (flashT > 0 && flashT < 1) {
        PX.save(); PX.globalAlpha = (1-flashT)*0.48; PX.fillStyle = '#ff3333';
        rrect(PX, dx-CARD_W/2, dy-CARD_H/2, CARD_W, CARD_H, CARD_R); PX.fill(); PX.restore();
      }
      if (t > 0.52) {
        const nT = (t-0.52)/0.48;
        PX.save(); PX.globalAlpha = Math.min(1,nT*2.5)*(1-Math.max(0,(nT-0.55)/0.45));
        PX.fillStyle = '#ff6666'; PX.font = 'bold 15px Georgia';
        PX.textAlign = 'center'; PX.textBaseline = 'middle';
        PX.shadowBlur = 6; PX.shadowColor = '#ff2222';
        PX.fillText('-3', dx, dy - 28 - easeOut(nT)*24); PX.restore();
      }
      break;
    }

    case 'lunge': {
      if (!scene.attacker) break;
      const a = scene.attacker;
      if ((a.dx ?? 0) > 3) {
        PX.save(); PX.globalAlpha = 0.15; PX.fillStyle = a.color;
        rrect(PX, a.x+(a.dx??0)*0.4-CARD_W/2, a.y-CARD_H/2, CARD_W, CARD_H, CARD_R); PX.fill(); PX.restore();
      }
      break;
    }

    case 'clash_vfx': {
      if (!scene.attacker || !scene.defender) break;
      const mx = (scene.attacker.x+(scene.attacker.dx??0) + scene.defender.x)/2;
      const my = (scene.attacker.y + scene.defender.y)/2;
      for (let i=0; i<10; i++) {
        const ang = (i/10)*Math.PI*2;
        const len = easeOut(Math.min(1,t/0.4))*28;
        const a   = Math.max(0, 1-easeOut(Math.max(0,(t-0.28)/0.72)));
        PX.save(); PX.globalAlpha = a*0.9;
        PX.strokeStyle = i%2===0 ? '#ffcc44':'#ff9f43'; PX.lineWidth = 2.2;
        PX.shadowBlur = 6; PX.shadowColor = '#ffcc44';
        PX.beginPath(); PX.moveTo(mx+Math.cos(ang)*3, my+Math.sin(ang)*3);
        PX.lineTo(mx+Math.cos(ang)*(3+len), my+Math.sin(ang)*(3+len)); PX.stroke(); PX.restore();
      }
      const fr = easeOut(Math.min(1,t/0.22))*14;
      const fa = Math.max(0, 1-easeOut(Math.min(1,t/0.28)));
      PX.save(); PX.globalAlpha = fa*0.7; PX.fillStyle = '#ffffaa';
      PX.shadowBlur = 14; PX.shadowColor = '#fff';
      PX.beginPath(); PX.arc(mx, my, Math.max(0.1,fr), 0, Math.PI*2); PX.fill(); PX.restore();
      break;
    }

    case 'damage': {
      if (!scene.attacker || !scene.defender) break;
      const ax = scene.attacker.x+(scene.attacker.dx??0), ay = scene.attacker.y;
      const dex = scene.defender.x, dey = scene.defender.y;
      const fa = Math.max(0, 1-easeOut(t/0.38));
      if (fa > 0) {
        PX.save(); PX.globalAlpha = fa*0.52; PX.fillStyle = '#ff2222';
        rrect(PX, dex-CARD_W/2, dey-CARD_H/2, CARD_W, CARD_H, CARD_R); PX.fill(); PX.restore();
      }
      const nT = easeOut(Math.min(1,t/0.9));
      const na = 1-Math.max(0,(t-0.68)/0.32);
      PX.save(); PX.globalAlpha = na; PX.fillStyle = '#ff5555'; PX.font = 'bold 16px Georgia';
      PX.textAlign = 'center'; PX.textBaseline = 'middle';
      PX.shadowBlur = 6; PX.shadowColor = '#ff0000';
      PX.fillText('-3', dex, dey-26-nT*22);
      PX.globalAlpha = na*0.75; PX.fillStyle = '#ff9988'; PX.font = 'bold 12px Georgia';
      PX.fillText('-1', ax, ay-22-nT*16); PX.restore();
      break;
    }

    case 'snap_back': {
      if (!scene.attacker) break;
      const a = scene.attacker;
      if ((a.dx ?? 0) > 3) {
        PX.save(); PX.globalAlpha = 0.12; PX.fillStyle = a.color;
        rrect(PX, a.x+(a.dx??0)+CARD_W*0.35-CARD_W/2, a.y-CARD_H/2, CARD_W, CARD_H, CARD_R); PX.fill(); PX.restore();
      }
      break;
    }

    case 'death_vfx': {
      if (!scene.defender) break;
      const dcx = scene.defender.x, dcy = scene.defender.y;
      const ringT = easeOut(Math.min(1,t/0.68));
      const ra = Math.max(0, 1-ringT);
      PX.save(); PX.globalAlpha = ra*0.65; PX.strokeStyle = '#888'; PX.lineWidth = 2;
      PX.shadowBlur = 7; PX.shadowColor = '#aaa';
      PX.beginPath(); PX.arc(dcx, dcy, Math.max(0.1, ringT*62), 0, Math.PI*2); PX.stroke(); PX.restore();
      if (t > 0.1) {
        const pT = Math.min(1,(t-0.1)/0.65);
        for (let i=0; i<8; i++) {
          const ang = (i/8)*Math.PI*2+0.3;
          const d = easeOut(pT)*42;
          PX.save(); PX.globalAlpha = (1-pT)*0.8; PX.fillStyle = '#888';
          PX.beginPath(); PX.arc(dcx+Math.cos(ang)*d, dcy+Math.sin(ang)*d, 2.5, 0, Math.PI*2); PX.fill(); PX.restore();
        }
      }
      break;
    }
  }
}

// ── Phase log ─────────────────────────────────────────────────────────────────
function initPhaseLog() {
  const seq    = SEQUENCES[activeKey];
  const config = [...configs[activeKey]].sort((a,b) => a.slot-b.slot);
  const el     = document.getElementById('phase-log');
  el.innerHTML = '';
  let lastSlot = -1;
  for (const { id, slot } of config) {
    const phase = seq.phases.find(p => p.id === id);
    if (!phase) continue;
    const isParallel = slot === lastSlot;
    const row = document.createElement('div');
    row.className  = 'log-row pending' + (isParallel ? ' parallel' : '');
    row.dataset.pid = id;
    row.style.setProperty('--pc', phase.color);
    row.innerHTML = `<span class="log-slot">${slot}</span><span class="log-icon">${phase.icon}</span><span class="log-name" style="color:${phase.color}">${phase.label}</span><span class="log-status"></span>`;
    el.appendChild(row);
    lastSlot = slot;
  }
}

function setLogStatus(ids, status) {
  for (const id of ids) {
    const row = document.querySelector(`.log-row[data-pid="${id}"]`);
    if (row) {
      row.className = row.className.replace(/\b(pending|playing|done)\b/g, '').trim() + ' ' + status;
      const s = row.querySelector('.log-status');
      if (s) s.textContent = status === 'done' ? '✓' : status === 'playing' ? '●' : '';
    }
    const dot = document.querySelector(`.phase-dot[data-id="${id}"]`);
    if (dot) {
      if (status === 'playing') dot.classList.add('playing');
      else dot.classList.remove('playing');
    }
  }
}

function resetPreview() {
  drawBase(makeScene(activeKey));
  initPhaseLog();
}

// ── Preview runner ─────────────────────────────────────────────────────────────
let previewRunning = false;

async function runPreview() {
  if (previewRunning) return;
  previewRunning = true;
  document.getElementById('play-btn').disabled = true;

  const config = configs[activeKey];
  const scene  = makeScene(activeKey);
  initPhaseLog();

  // Group by slot
  const bySlot = new Map();
  for (const { id, slot } of config) {
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot).push(id);
  }
  const sortedSlots = [...bySlot.keys()].sort((a,b) => a-b);

  for (let si = 0; si < sortedSlots.length; si++) {
    const ids = bySlot.get(sortedSlots[si]);
    setLogStatus(ids, 'playing');

    const maxDur = Math.max(...ids.map(id => PHASE_DURATIONS[id] ?? 600));

    await new Promise(resolve => {
      const start = performance.now();
      const frame = () => {
        const elapsed = performance.now() - start;
        for (const id of ids) {
          const t = Math.min(1, elapsed / (PHASE_DURATIONS[id] ?? 600));
          applyPhaseState(id, scene, t);
        }
        drawBase(scene);
        for (const id of ids) {
          const t = Math.min(1, elapsed / (PHASE_DURATIONS[id] ?? 600));
          drawOverlay(id, scene, t);
        }
        if (elapsed < maxDur) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });

    setLogStatus(ids, 'done');
    if (si < sortedSlots.length - 1) await new Promise(r => setTimeout(r, SLOT_GAP_MS));
  }

  previewRunning = false;
  document.getElementById('play-btn').disabled = false;
}

document.getElementById('play-btn').addEventListener('click', runPreview);

// ── Initial preview draw ──────────────────────────────────────────────────────
resetPreview();
