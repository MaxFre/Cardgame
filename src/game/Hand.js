import * as PIXI      from 'pixi.js';
import { tweenTo }   from './Tween.js';
import { CardPreview } from './CardPreview.js';

const DEFAULTS = { spacing: 145, angle: 6, arc: 6, hover: 30 };

// Module-level layout data — set by main.js after loading layout.json
let _handLayoutCfg       = null;
let _playerSlotPositions = {};
let _opponentSlotPositions = {};

/** Called from main.js once layout.json has been fetched. */
export function configureHand(cfg, playerSlots, opponentSlots) {
  if (cfg)           _handLayoutCfg           = cfg;
  if (playerSlots)   _playerSlotPositions     = playerSlots;
  if (opponentSlots) _opponentSlotPositions   = opponentSlots;
  _cfg = getCfg(); // refresh cached config
}

function getCfg() {
  if (_handLayoutCfg) return { ...DEFAULTS, ..._handLayoutCfg };
  return { ...DEFAULTS };
}
let _cfg = getCfg();

// ── Custom per-size slot positions (set via hand layout editor) ───────────────
const SLOT_KEY = 'hand-slot-positions';
const OPPONENT_SLOT_KEY = 'hand-slot-positions-opponent';
function getSlotPositions(n, key = SLOT_KEY) {
  const all = key === OPPONENT_SLOT_KEY ? _opponentSlotPositions : _playerSlotPositions;
  const slots = all?.[String(n)];
  if (Array.isArray(slots) && slots.length === n) return slots;
  return null;
}
const HOVER_LIFT_PX = () => _cfg.hover;
const FAN_ANGLE_DEG = () => _cfg.angle;
const ARC_DROP_PX   = () => _cfg.arc;
const CARD_SPACING  = () => _cfg.spacing;
const MAX_SPREAD    = 870;

export class Hand extends PIXI.Container {
  constructor() {
    super();
    this.cards = [];
    this.sortableChildren = true;
    /** Set to OPPONENT_SLOT_KEY for the opponent hand slot positions. */
    this.slotKey = 'hand-slot-positions';
    /** Set true for the opponent hand — disables card preview on hover */
    this.isOpponent = false;
  }

  addCard(cardView) {
    this.cards.push(cardView);
    this.addChild(cardView);
    this._preloadPreview(cardView);
    this._attachHover(cardView);
    this.layout();
  }

  _preloadPreview(cardView) {
    if (this.isOpponent) return;   // never reveal opponent card data
    if (!cardView._previewSnap && cardView.card) {
      cardView._previewSnap = { ...cardView.card };
    }
    CardPreview.preload(cardView);
  }

  _attachHover(cardView) {
    cardView.on('pointerover', () => {
      if (cardView._isOnField) return;
      if (cardView._isFlying)  return;  // don't interrupt draw animation
      tweenTo(cardView,       { y: (cardView._baseY ?? cardView.y) - HOVER_LIFT_PX() }, 120);
      tweenTo(cardView.scale, { x: 1.2, y: 1.2 }, 120);
      if (!this.isOpponent && !CardPreview.isDragging) CardPreview.show(cardView);
    });
    cardView.on('pointerout', () => {
      if (cardView._isOnField) return;
      if (cardView._isFlying)  return;  // don't interrupt draw animation
      tweenTo(cardView,       { y: cardView._baseY ?? cardView.y }, 150);
      tweenTo(cardView.scale, { x: 1.0, y: 1.0 }, 150);
      if (!this.isOpponent) CardPreview.hide();
    });
  }

  insertCard(cardView, index) {
    const i = Math.max(0, Math.min(index, this.cards.length));
    this.cards.splice(i, 0, cardView);
    this.addChild(cardView);
    this._preloadPreview(cardView);
    this._attachHover(cardView);
    this.layout();
  }

  removeCard(cardView) {
    const idx = this.cards.indexOf(cardView);
    if (idx === -1) return;
    this.cards.splice(idx, 1);
    this.removeChild(cardView);
    cardView._laid = false;  // reset so re-entry is treated as new
    this.layout();
  }

  layout() {
    _cfg = getCfg(); // pick up any changes saved from the editor
    const n = this.cards.length;
    if (n === 0) return;

    // ── Custom layout (hand layout editor) ───────────────────────────────────
    const slots = getSlotPositions(n, this.slotKey);
    if (slots) {
      this.cards.forEach((card, i) => {
        const p    = slots[i] ?? { x: 0, y: 0, r: 0 };
        const isNew = !card._laid;
        card._laid   = true;
        card.zIndex  = i;
        card._baseY  = p.y ?? 0;
        if (isNew) {
          card.x        = p.x;
          card.y        = card._baseY;
          card.rotation = p.r ?? 0;
        } else {
          tweenTo(card, { x: p.x, y: card._baseY, rotation: p.r ?? 0, alpha: 1 }, 180);
        }
      });
      return;
    }

    // ── Auto layout ──────────────────────────────────────────────────────────
    const spacing = Math.min(CARD_SPACING(), MAX_SPREAD / Math.max(n - 1, 1));
    const mid = (n - 1) / 2;

    this.cards.forEach((card, i) => {
      const t     = i - mid;
      const isNew = !card._laid;
      card._laid   = true;
      card.zIndex  = i;
      card._baseY  = Math.abs(t) * ARC_DROP_PX();
      const targetX = t * spacing;
      const targetR = (t * FAN_ANGLE_DEG() * Math.PI) / 180;
      if (isNew) {
        card.x        = targetX;
        card.y        = card._baseY;
        card.rotation = targetR;
      } else {
        tweenTo(card, { x: targetX, y: card._baseY, rotation: targetR, alpha: 1 }, 180);
      }
    });
  }
}
