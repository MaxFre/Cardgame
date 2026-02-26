import { Arrow }       from './Arrow.js';
import { tweenTo, cancelTweens } from './Tween.js';
import { Card }        from './Card.js';
import { CardPreview } from './CardPreview.js';
import { flushPendingPlays, clearPendingPlays } from './DragDrop.js';
import { SoundManager } from './SoundManager.js';

// Easing for the lunge forward and snap back
function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }
function easeInQuad(t)  { return t * t; }

export class CombatSystem {
  constructor(app, playerField, opponentField) {
    this._app           = app;
    this._playerField   = playerField;
    this._opponentField = opponentField;
    this._targeting     = false;
    this._animating     = false;     // true while an attack animation is running
    this._attacker      = null;
    this._exhausted     = new Set(); // cards that have attacked this turn
    this._isPlayerTurn  = true;      // only the active side may initiate attacks
    this._queue         = [];        // queued { attacker, target, attackerField, targetField }

    this._arrow = new Arrow();
    app.stage.addChild(this._arrow);
    app.stage.sortableChildren = true;
    this._attackerField = null; // field the current attacker belongs to
    this._targetField   = null; // field being attacked this turn

    app.stage.on('pointermove',      e => this._onMove(e));
    app.stage.on('pointerup',        e => this._onUp(e));
    app.stage.on('pointerupoutside', e => this._onUp(e));

    // Apply initial turn tint once fields are populated
    // (called after cards are placed in BoardUI)
    app.ticker.addOnce(() => this._applyTurnTint());
    this._vfx = null; // set via setVFX() after construction
  }

  setVFX(vfx) { this._vfx = vfx; }

  // Call this for every card placed on the player's field
  // summoningSick=true: card was played this turn and cannot attack immediately
  armCard(cardView, summoningSick = false) {
    cardView.removeAllListeners('pointerdown');
    cardView.removeAllListeners('pointerover');
    cardView.removeAllListeners('pointerout');
    cardView.eventMode = 'static';
    cardView._isOnField = true;
    // Snapshot original card data for the preview (before any ATK/HP changes in combat)
    if (!cardView._previewSnap) {
      cardView._previewSnap = { ...cardView.card };
    }
    CardPreview.preload(cardView);
    cardView.on('pointerdown', e => this._onAttackerDown(e, cardView, this._playerField, this._opponentField));
    cardView.on('pointerover', () => {
      if (!CardPreview.isDragging && !this._targeting) CardPreview.show(cardView);
    });
    cardView.on('pointerout', () => CardPreview.hide());
    if (summoningSick) {
      // Card cannot attack the turn it is played
      this._exhausted.add(cardView);
      cardView._sprite.tint = 0x888888;
      cardView.cursor = 'default';
    } else {
      cardView._sprite.tint = this._isPlayerTurn ? 0xffffff : 0x888888;
      cardView.cursor = this._isPlayerTurn ? 'crosshair' : 'default';
    }
  }

  // Call this for opponent cards (attacks player field)
  // summoningSick=true: card was played this turn and cannot attack immediately
  armOpponentCard(cardView, summoningSick = false) {
    cardView.removeAllListeners('pointerdown');
    cardView.removeAllListeners('pointerover');
    cardView.removeAllListeners('pointerout');
    cardView.eventMode = 'static';
    cardView._isOnField = true;
    if (!cardView._previewSnap) {
      cardView._previewSnap = { ...cardView.card };
    }
    CardPreview.preload(cardView);
    cardView.on('pointerdown', e => this._onAttackerDown(e, cardView, this._opponentField, this._playerField));
    cardView.on('pointerover', () => {
      if (!CardPreview.isDragging && !this._targeting) CardPreview.show(cardView);
    });
    cardView.on('pointerout', () => CardPreview.hide());
    if (summoningSick) {
      this._exhausted.add(cardView);
      cardView._sprite.tint = 0x888888;
      cardView.cursor = 'default';
    } else {
      cardView._sprite.tint = this._isPlayerTurn ? 0x888888 : 0xffffff;
      cardView.cursor = this._isPlayerTurn ? 'default' : 'crosshair';
    }
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  _onAttackerDown(e, cardView, attackerField, targetField) {
    e.stopPropagation();
    if (this._targeting) return;   // already drawing an arrow
    if (this._exhausted.has(cardView)) return;
    if (cardView.card.attack <= 0) return;  // 0-attack minions cannot attack
    // Only allow the side whose turn it is to attack
    const isPlayerCard = attackerField === this._playerField;
    if (isPlayerCard !== this._isPlayerTurn) return;

    CardPreview.hide(); // dismiss preview when starting an attack drag

    cancelTweens(cardView);
    cancelTweens(cardView.scale);
    cardView.y = 0;
    cardView.scale.set(1);

    this._targeting     = true;
    this._attacker      = cardView;
    this._attackerField = attackerField;
    this._targetField   = targetField;

    cardView.setHighlight(true);
  }

  _onMove(e) {
    if (!this._targeting || !this._attacker) return;

    const from = this._cardGlobalCenter(this._attacker);
    this._arrow.update(from.x, from.y, e.global.x, e.global.y);

    for (const { cardView } of this._targetField._placed) {
      const over = this._pointerOverCard(e.global, cardView);
      const mult = over
        ? Card.typeMultiplier(this._attacker.card.faction, cardView.card.faction)
        : null;
      // Only update when the value actually changes — avoids creating PIXI
      // objects at 60 fps while the cursor sits still over the same card.
      if (cardView._lastTargetMult !== mult) {
        cardView._lastTargetMult = mult;
        cardView.setTargetGlow(mult);
        if (mult === null) cardView._sprite.tint = 0x888888;
      }
    }
  }

  _onUp(e) {
    if (!this._targeting) return;

    // Clear highlights and arrow
    this._arrow.hide();
    this._attacker.setHighlight(false);
    for (const { cardView } of this._targetField._placed) {
      cardView._lastTargetMult = undefined;
      cardView.setTargetGlow(null);
      cardView._sprite.tint = 0x888888; // restore inactive tint
    }

    const target = this._targetField._placed
      .map(p => p.cardView)
      .find(cv => this._pointerOverCard(e.global, cv));

    if (target) {
      this._enqueue(this._attacker, target, this._attackerField, this._targetField);
    }

    this._targeting     = false;
    this._attacker      = null;
    this._attackerField = null;
    this._targetField   = null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _cardGlobalCenter(cardView) {
    return cardView.parent.toGlobal({ x: cardView.x, y: cardView.y });
  }

  _pointerOverCard(global, cardView) {
    const local = cardView.parent.toLocal(global);
    const hw = 65, hh = 91; // half card dimensions with small hitbox tolerance
    return (
      local.x >= cardView.x - hw && local.x <= cardView.x + hw &&
      local.y >= cardView.y - hh && local.y <= cardView.y + hh
    );
  }

  // ── Attack animation ──────────────────────────────────────────────────────

  async _playAttackAnimation(attacker, target, attackerField, targetField) {
    this._animating = true;

    cancelTweens(attacker);
    cancelTweens(attacker.scale);
    attacker.eventMode = 'none';
    attacker.y = 0;
    attacker.scale.set(1);

    const attackerHome = { x: attacker.x, y: 0 }; // in attackerField local space

    // ── Reparent attacker to stage so it renders above ALL containers ──────
    const stage = this._app.stage;
    const globalPos = attackerField.toGlobal({ x: attacker.x, y: attacker.y });
    attackerField.removeChild(attacker);
    stage.addChild(attacker);
    attacker.x = globalPos.x;
    attacker.y = globalPos.y;
    attacker.zIndex = 999;

    try {
      // Target position in stage (global) space
      const targetGlobal = targetField.toGlobal({ x: target.x, y: target.y });

      // Attacker start in stage space
      const startGX = globalPos.x;
      const startGY = globalPos.y;

      // Lunge 70% toward target in global space
      const lungeGX = startGX + (targetGlobal.x - startGX) * 0.70;
      const lungeGY = startGY + (targetGlobal.y - startGY) * 0.70;

      // 1. Lunge
      await tweenTo(attacker, { x: lungeGX, y: lungeGY }, 420, easeInQuad);

      // 2. Impact — clash VFX at the midpoint between lunge tip and target
      const clashX = (lungeGX + targetGlobal.x) * 0.5;
      const clashY = (lungeGY + targetGlobal.y) * 0.5;
      const clashAngle = Math.atan2(targetGlobal.y - startGY, targetGlobal.x - startGX);
      if (this._vfx) this._vfx.clashAt(clashX, clashY, clashAngle).catch(() => {});
      SoundManager.play('hit');
      this._shakeCard(target);
      await this._wait(200);

      // Damage: attacker's output is modified by faction matchup (+1/-1 flat bonus, min 1).
      // Retaliation is always the defender's raw attack — type advantage only affects the attacker.
      const attackerAtk = attacker.card.attack;
      const targetAtk   = target.card.attack;
      const atkBonus    = Card.typeMultiplier(attacker.card.faction, target.card.faction);
      const dmgToTarget   = Math.max(1, attackerAtk + atkBonus);
      const dmgToAttacker = Math.max(0, targetAtk);

      target.setHealth(  target.card.health   - dmgToTarget);
      attacker.setHealth(attacker.card.health - dmgToAttacker);

      // Floating damage numbers
      if (this._vfx) {
        const tg = targetField.toGlobal({x: target.x, y: target.y});
        const ag = attackerField.toGlobal({x: attacker.x, y: attacker.y});
        this._vfx.floatNumber(tg.x, tg.y, `-${dmgToTarget}`,   0xff4444).catch(() => {});
        this._vfx.floatNumber(ag.x, ag.y, `-${dmgToAttacker}`, 0xff8888).catch(() => {});
      }

      // 3. Snap back to home position
      await tweenTo(attacker, { x: startGX, y: startGY }, 600, easeOutQuad);
    } finally {
      // ── Always reparent back — even if an error occurs mid-animation ──────
      if (attacker.parent === stage) stage.removeChild(attacker);
      if (!attacker.destroyed) {
        attackerField.addChild(attacker);
        attacker.x         = attackerHome.x;
        attacker.y         = 0;
        attacker.zIndex    = 0;
        attacker.eventMode = 'static';
        attacker._setGlow(false);
      }
      if (!target.destroyed) {
        target._setGlow(false);
        target.y = 0;
      }
      this._animating = false;
    }

    // ── Remove dead cards (health <= 0) ────────────────────────────────────
    const targetDead   = target.card.health   <= 0;
    const attackerDead = attacker.card.health <= 0;

    const anyDied = targetDead || attackerDead;

    if (targetDead)   await targetField.removeCardAnimated(target, this._vfx);
    if (attackerDead) {
      this._exhausted.delete(attacker);
      await attackerField.removeCardAnimated(attacker, this._vfx);
      this._applyTurnTint();
      // Wait for the 300ms relayout tween to finish before the next attack
      setTimeout(() => this._processQueue(), 320);
      return;
    }

    // Mark exhausted
    this._exhausted.add(attacker);
    attacker._sprite.tint = 0x777777;
    attacker.cursor = 'default';

    this._applyTurnTint();
    // If the target died its field is mid-relayout — wait for it to settle
    if (anyDied) {
      setTimeout(() => this._processQueue(), 320);
    } else {
      this._processQueue();
    }
  }

  // Reset all exhausted cards at start of next player turn
  endTurn() {
    this._isPlayerTurn = !this._isPlayerTurn;
    this._queue.length = 0; // discard any queued actions on turn change
    clearPendingPlays();
    for (const card of this._exhausted) {
      card._sprite.tint = 0xffffff;
      card.cursor = 'crosshair';
    }
    this._exhausted.clear();
    this._applyTurnTint();
  }

  // Gray out the side that cannot act this turn
  _applyTurnTint() {
    const activeTint   = 0xffffff;
    const inactiveTint = 0x888888;
    for (const { cardView } of this._playerField._placed) {
      if (this._exhausted.has(cardView)) continue; // keep exhausted tint
      cardView._sprite.tint = this._isPlayerTurn ? activeTint : inactiveTint;
      cardView.cursor       = this._isPlayerTurn ? 'crosshair' : 'default';
    }
    for (const { cardView } of this._opponentField._placed) {
      if (this._exhausted.has(cardView)) continue;
      cardView._sprite.tint = this._isPlayerTurn ? inactiveTint : activeTint;
      cardView.cursor       = this._isPlayerTurn ? 'default' : 'crosshair';
    }
  }

  _enqueue(attacker, target, attackerField, targetField) {
    this._queue.push({ attacker, target, attackerField, targetField });
    this._processQueue();
  }

  /**
   * Public entry point for AI-driven attacks.
   * Validates that it is the opponent's turn, the attacker is not exhausted,
   * and both cards are still alive, then queues the attack.
   */
  aiAttack(attacker, target) {
    if (this._isPlayerTurn) return;
    if (this._exhausted.has(attacker)) return;
    if (!this._opponentField._placed.find(p => p.cardView === attacker)) return;
    if (!this._playerField._placed.find(p => p.cardView === target)) return;
    this._enqueue(attacker, target, this._opponentField, this._playerField);
  }

  _processQueue() {
    if (this._animating) return;
    // Flush any pending card-play actions first (card dropped during animation)
    flushPendingPlays();
    if (this._queue.length === 0) return;
    // Drain invalid entries first (dead cards, exhausted, wrong turn, off-field)
    while (this._queue.length > 0) {
      const next = this._queue[0];
      const { attacker, target, attackerField, targetField } = next;
      const attackerAlive = !attacker.destroyed && attackerField._placed.some(p => p.cardView === attacker);
      const targetAlive   = !target.destroyed   && targetField._placed.some(p  => p.cardView === target);
      const notExhausted  = !this._exhausted.has(attacker);
      const isRightTurn   = (attackerField === this._playerField) === this._isPlayerTurn;
      if (attackerAlive && targetAlive && notExhausted && isRightTurn) break;
      this._queue.shift(); // skip invalid action
    }
    if (this._queue.length === 0) return;
    const { attacker, target, attackerField, targetField } = this._queue.shift();
    this._playAttackAnimation(attacker, target, attackerField, targetField);
  }

  async _shakeCard(card) {
    // Cancel any prior shake so they don't stack
    cancelTweens(card);
    const homeX = card.x;
    for (const dx of [14, -14, 9, -9, 5, -5, 0]) {
      await tweenTo(card, { x: homeX + dx }, 90);
    }
    card.x = homeX;
  }

  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
