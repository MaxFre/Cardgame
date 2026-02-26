import * as PIXI from 'pixi.js';
import { tweenToBack, tweenTo, tweenToFast, cancelTweens } from './Tween.js';
import { SoundManager } from './SoundManager.js';

const CARD_W    = 130;
const CARD_H    = 182;
const SLOT_GAP  = 40;
const MAX_CARDS = 5;
const FIELD_W   = 1000;
const FIELD_H   = 210;

export class Battlefield extends PIXI.Container {
  constructor() {
    super();
    this.sortableChildren = true;
    this._placed = [];           // { cardView } in left→right order
    this._pendingIndex = 0;      // insert index chosen during drag
    this._lastPendingIndex = -1; // tracks last spread index to avoid re-tweening
    this.onCardPlaced  = null;    // optional callback(cardView) after placement
    this.onCardRemoved = null;    // optional callback(cardView) after removal
    this._vfx = null;             // set via setVFX() to suppress ring burst for faction presets
    this._buildHitArea();
  }

  get isFull() { return this._placed.length >= MAX_CARDS; }

  setVFX(vfx) { this._vfx = vfx; }

  // ── Hit area & ghost ───────────────────────────────────────────────────────
  _buildHitArea() {
    const zone = new PIXI.Graphics();
    zone.beginFill(0xffffff, 0.01);
    zone.drawRoundedRect(-FIELD_W / 2, -FIELD_H / 2, FIELD_W, FIELD_H, 10);
    zone.endFill();
    this.addChild(zone);

    // Ghost kept as a no-op object so the rest of the logic doesn't need to change
    this._ghost = { visible: false, x: 0, y: 0 };
  }

  // ── Layout helpers ─────────────────────────────────────────────────────────

  // X positions for a group of n cards, centered at 0
  _positions(n) {
    const totalW = n * CARD_W + (n - 1) * SLOT_GAP;
    const startX = -totalW / 2 + CARD_W / 2;
    return Array.from({ length: n }, (_, i) => startX + i * (CARD_W + SLOT_GAP));
  }

  // Re-center all placed cards at their current indices
  _relayout() {
    const positions = this._positions(this._placed.length);
    this._placed.forEach(({ cardView }, i) => {
      cardView.x = positions[i];
      cardView.y = 0;
      cardView.rotation = 0;
    });
  }

  // Fade card out while playing death VFX, then remove it.
  async removeCardAnimated(cardView, vfx) {
    if (!vfx) { this.removeCard(cardView); return; }
    const idx = this._placed.findIndex(p => p.cardView === cardView);
    if (idx === -1) return;
    // Capture world position before any async gap
    const worldPos = cardView.toGlobal({ x: 0, y: 0 });
    // Fade out and play VFX simultaneously
    SoundManager.play('death');
    await Promise.all([
      tweenTo(cardView, { alpha: 0 }, 350),
      vfx.playDeathEffect(cardView.card, worldPos.x, worldPos.y),
    ]);
    cardView.alpha = 1; // reset before removeCard destroys the view
    this.removeCard(cardView);
  }

  // Remove a card from the field and tween remaining cards to fill the gap
  removeCard(cardView) {
    const idx = this._placed.findIndex(p => p.cardView === cardView);
    if (idx === -1) return;
    // Fire deathrattle before the card is destroyed so card data is still readable
    this.onCardKilled?.(cardView);
    this._placed.splice(idx, 1);
    // Cancel any in-flight tweens (shake, hover, etc.) before destroying
    cancelTweens(cardView);
    cancelTweens(cardView.scale);
    this.removeChild(cardView);
    cardView.destroy({ children: true });
    // Notify listener (e.g. morale damage)
    this.onCardRemoved?.(cardView);
    // Animate remaining cards into their new positions
    const positions = this._positions(this._placed.length);
    this._placed.forEach(({ cardView: cv }, i) => {
      tweenTo(cv, { x: positions[i], y: 0 }, 300);
    });
  }

  // Given a local x coordinate, return the best insert index (0…n).
  // Uses the (n+1)-slot spread layout so the result always matches what
  // the user visually sees during the drag preview.
  _insertIndexAt(localX) {
    const n = this._placed.length;
    if (n === 0) return 0;
    // Positions of all (n+1) slots — same layout used by updateHighlight
    const positions = this._positions(n + 1);
    for (let i = 0; i < n; i++) {
      const midpoint = (positions[i] + positions[i + 1]) / 2;
      if (localX < midpoint) return i;
    }
    return n; // drop is to the right of all existing cards
  }

  // Ghost x position if inserting at index into a (n+1)-card group
  _ghostX(insertIndex) {
    return this._positions(this._placed.length + 1)[insertIndex];
  }

  // ── Drop detection ─────────────────────────────────────────────────────────
  _localPos(globalX, globalY) {
    return this.toLocal({ x: globalX, y: globalY });
  }

  isOverField(globalX, globalY) {
    if (this.isFull) return false;
    const l = this._localPos(globalX, globalY);
    return l.x >= -FIELD_W / 2 && l.x <= FIELD_W / 2 &&
           l.y >= -FIELD_H / 2 && l.y <= FIELD_H / 2;
  }

  /** Same as isOverField but ignores isFull — used for spell drop detection. */
  isOverFieldIgnoreFull(globalX, globalY) {
    const l = this._localPos(globalX, globalY);
    return l.x >= -FIELD_W / 2 && l.x <= FIELD_W / 2 &&
           l.y >= -FIELD_H / 2 && l.y <= FIELD_H / 2;
  }

  updateHighlight(globalX, globalY) {
    if (!this.isOverField(globalX, globalY)) {
      this._ghost.visible = false;
      this._collapseCards();
      this._lastPendingIndex = -1;
      return;
    }

    const localX = this._localPos(globalX, globalY).x;
    const idx = this._insertIndexAt(localX);

    // ghost intentionally hidden
    this._ghost.visible = false;

    // Only re-spread if the target slot changed
    if (idx === this._lastPendingIndex) return;
    this._lastPendingIndex = idx;
    this._pendingIndex = idx;

    // Spread existing cards as if the ghost occupies slot idx in an (n+1) group
    const spreadPositions = this._positions(this._placed.length + 1);
    this._placed.forEach(({ cardView }, i) => {
      // Cards before ghost stay left, cards from ghost onward shift right
      const targetX = spreadPositions[i < idx ? i : i + 1];
      tweenTo(cardView, { x: targetX, y: 0 }, 350);
    });
  }

  clearHighlights() {
    this._ghost.visible = false;
    this._collapseCards();
    this._lastPendingIndex = -1;
  }

  // Tween all placed cards back to their natural centered positions
  _collapseCards() {
    if (this._placed.length === 0) return;
    const positions = this._positions(this._placed.length);
    this._placed.forEach(({ cardView }, i) => {
      tweenTo(cardView, { x: positions[i], y: 0 }, 350);
    });
  }

  getSlotAt(globalX, globalY) {
    return this.isOverField(globalX, globalY) ? this : null;
  }

  // ── Place card at the pending insert index ─────────────────────────────────
  // fromGlobal: { x, y } global position where the card was released
  placeCard(cardView, fromGlobal) {
    this._ghost.visible = false;
    this._lastPendingIndex = -1;
    cardView.eventMode  = 'static';
    cardView._isOnField = true;
    SoundManager.play('summon');

    this._placed.splice(this._pendingIndex, 0, { cardView });
    this.addChild(cardView);

    // Cancel ALL in-flight tweens (spread / collapse) so they don't fight placement
    this._placed.forEach(({ cardView: cv }) => {
      cancelTweens(cv);
      cancelTweens(cv.scale);
      cv.y = 0;
      cv.scale.set(1, 1);   // reset any mid-overshoot scale from spring-back animation
    });

    // Compute final positions
    const finalPositions = this._positions(this._placed.length);
    const destX = finalPositions[this._pendingIndex];

    // Animate existing cards smoothly into new slots
    this._placed.forEach(({ cardView: cv }, i) => {
      if (cv === cardView) return;
      tweenTo(cv, { x: finalPositions[i], y: 0 }, 280);
    });

    // ── Drop-on animation ─────────────────────────────────────────────────────
    // 1. Snap card to slightly above the destination slot, upright, normal scale
    cardView.x        = destX;
    cardView.y        = -160;
    cardView.rotation = 0;
    cardView.scale.set(1);

    // Golden ring burst at destination — skip if card has a custom or faction VFX preset
    const hasCustomVfx = cardView.card?.summonVfxPreset ||
      this._vfx?.hasFactionPreset(cardView.card?.faction);
    if (!hasCustomVfx) this._spawnRingBurst(destX, 0);

    // 2. Fast fall onto the slot (accelerating ease)
    return tweenToFast(cardView, { x: destX, y: 12 }, 160)
      .then(async () => {
        // 3. Squash on impact
        cardView.y = 0;
        cardView.scale.set(1.22, 0.72);
        // Notify listener and await it — summon VFX + battlecry are async
        if (this.onCardPlaced) await this.onCardPlaced(cardView);
        // 4. Spring scale back to normal, then attach hover
        return tweenToBack(cardView.scale, { x: 1, y: 1 }, 280);
      })
      .then(() => this._attachHover(cardView));
  }

  // Expanding golden ring that fades out, driven by PIXI.Ticker so it
  // respects the render loop and stops automatically when done.
  _spawnRingBurst(x, y) {
    const STEPS = 30;
    let frame = 0;

    const ring = new PIXI.Graphics();
    ring.x = x;
    ring.y = y;
    ring.zIndex = 50;
    this.addChild(ring);

    const sparks = Array.from({ length: 8 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 2.5;
      const g = new PIXI.Graphics();
      g.beginFill(0xfff0a0, 1);
      g.drawCircle(0, 0, 2.5);
      g.endFill();
      g.x = x; g.y = y;
      g._vx = Math.cos(angle) * speed;
      g._vy = Math.sin(angle) * speed;
      this.addChild(g);
      return g;
    });

    const tick = () => {
      // Stop if this field has been removed from the stage
      if (this.destroyed || !this.parent) {
        PIXI.Ticker.shared.remove(tick);
        return;
      }
      frame++;
      const t = frame / STEPS;

      const radius = t * 90;
      const alpha  = 1 - t;
      ring.clear();
      ring.lineStyle(3 * (1 - t * 0.7), 0xffd700, alpha);
      ring.drawCircle(0, 0, radius);

      sparks.forEach(s => {
        s.x   += s._vx;
        s.y   += s._vy;
        s._vx *= 0.92;
        s._vy *= 0.92;
        s.alpha = 1 - t;
      });

      if (frame >= STEPS) {
        PIXI.Ticker.shared.remove(tick);
        if (!this.destroyed) {
          this.removeChild(ring);
          sparks.forEach(s => this.removeChild(s));
        }
        ring.destroy();
        sparks.forEach(s => s.destroy());
      }
    };
    PIXI.Ticker.shared.add(tick);
  }

  _attachHover(cardView) {
    const LIFT   = 20;
    const SCALE  = 1.15;
    cardView.on('pointerover', () => {
      tweenTo(cardView,       { y: -LIFT }, 120);
      tweenTo(cardView.scale, { x: SCALE, y: SCALE }, 120);
    });
    cardView.on('pointerout', () => {
      tweenTo(cardView,       { y: 0 }, 150);
      tweenTo(cardView.scale, { x: 1.0, y: 1.0 }, 150);
    });
  }
}
