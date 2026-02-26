import { cancelTweens, tweenTo } from './Tween.js';
import { CardPreview } from './CardPreview.js';
import { EFFECTS_BY_ID } from './Effects.js';

let _app, _hand;
let _fields        = [];   // droppable Battlefield instances (player's)
let _allFields     = [];   // all Battlefield instances (player + opponent) — used for target validation
let _dragging      = null;
let _originIndex   = -1;
let _returning     = null; // card currently mid-return-to-hand tween
let _combat        = null; // CombatSystem reference for animation gating
let _rations       = null; // RationsDisplay for the player
let _pendingPlays  = [];   // queued { card, hit, dropPos } during animations

// ── Drag physics ─────────────────────────────────────────────────────────────
let _prevX       = 0;   // pointer x last frame
let _prevY       = 0;   // pointer y last frame
let _velX        = 0;   // smoothed horizontal velocity
let _tiltTarget  = 0;   // rotation we're springing toward (radians)
let _tiltCurrent = 0;   // current spring value
let _tiltVel     = 0;   // spring velocity

const TILT_MAX    = 0.62;  // max tilt ~35°
const TILT_SCALE  = 0.011; // how much velocity maps to tilt
const SPRING_K    = 0.10;  // spring stiffness (lower = more lag)
const SPRING_DAMP = 0.62;  // spring damping (lower = more wobble)

function _tiltTick() {
  if (!_dragging) return;
  // Spring toward target
  const delta = _tiltTarget - _tiltCurrent;
  _tiltVel     = _tiltVel * SPRING_DAMP + delta * SPRING_K;
  _tiltCurrent += _tiltVel;
  _dragging.rotation = _tiltCurrent;
  // Decay target toward 0 when pointer is still
  _tiltTarget *= 0.92;
}

export function setCombatRef(cs) { _combat = cs; }
export function setRationsRef(r)  { _rations = r; }
export function setAllFields(fields) { _allFields = fields; }

let _spellCallback = null;   // (cardView) => void — called when a spell is cast
export function setSpellCallback(fn) { _spellCallback = fn; }

/** Called by CombatSystem after each animation ends to flush queued card plays. */
export function flushPendingPlays() {
  while (_pendingPlays.length > 0 && !_combat?._animating) {
    const { card, hit, slotIndex } = _pendingPlays.shift();
    // Skip if destroyed, already on field, still flying back, or not in hand
    if (card.destroyed || card._isOnField || _returning === card) continue;
    if (!_hand.cards.includes(card)) continue;
    // Pull card out of hand silently
    _hand.removeCard(card);
    if (card.parent) card.parent.removeChild(card);
    // Restore the snapshotted slot index and place
    hit._pendingIndex = Math.min(slotIndex, hit._placed.length);
    hit.placeCard(card, null);
    break; // one card per flush; next comes after that animation
  }
}

export function clearPendingPlays() { _pendingPlays.length = 0; }

export function initDragDrop(app, hand, ...fields) {
  _app    = app;
  _hand   = hand;
  _fields = fields;

  app.stage.eventMode = 'dynamic';
  app.stage.hitArea   = { x: 0, y: 0, width: 10000, height: 10000, contains: () => true };

  app.stage.on('pointermove', _onMove);
  app.stage.on('pointerup',   _onUp);
  app.stage.on('pointerupoutside', _onUp);

  app.ticker.add(_tiltTick);
}

export function makeDraggable(cardView) {
  cardView.eventMode = 'static';
  cardView.cursor    = 'pointer';
  // Reset rations cost label to white (may have been tinted red during drag)
  if (cardView._manaLabel) cardView._manaLabel.style.fill = 0xffffff;
  cardView.off('pointerdown', _onDown); // guard against double-attach on return
  cardView.on('pointerdown', _onDown);
}

// ─── handlers ────────────────────────────────────────────────────────────────

function _onDown(e) {
  e.stopPropagation();
  if (_dragging) return;

  const card = e.currentTarget;

  // Ignore cards that have been placed on the field
  if (card._isOnField) return;

  // Kill any in-flight hover tween and strip hover listeners so
  // the pointerout that fires on reparent doesn't tween y→0 on the stage
  cancelTweens(card);
  cancelTweens(card.scale);
  card.removeAllListeners('pointerover');
  card.removeAllListeners('pointerout');
  card.scale.set(1);

  // If the card is mid-return-tween it lives on the stage already and
  // card.x/y are already in stage/global space — skip the reparent.
  if (_returning === card) {
    _returning = null;
    // card.x/y are already correct global coords — just start dragging
    card.rotation = 0;
    _originIndex = 0; // will be re-inserted at front if dropped off field
    _dragging = card;
    return;
  }

  card.y = card._baseY ?? card.y;

  // Tint rations label red if the card costs more than available rations
  if (card._manaLabel) {
    const cost = card.card?.manaCost ?? 0;
    const affordable = !_rations || _rations.rations >= cost;
    card._manaLabel.style.fill = affordable ? 0xfde68a : 0xff4444;
  }

  // Remember position in hand so we can return the card if the drop misses.
  _originIndex = _hand.cards.indexOf(card);

  // Convert card's local-origin to global position before reparenting.
  const global = _hand.toGlobal({ x: card.x, y: card.y });

  _hand.removeCard(card);

  // Place card on top of everything in the stage.
  _app.stage.addChild(card);
  card.x        = global.x;
  card.y        = global.y;
  card.rotation = 0;

  CardPreview.isDragging = true;
  CardPreview.hide();
  // Seed physics so first delta is 0
  _prevX = global.x; _prevY = global.y;
  _velX = 0; _tiltTarget = 0; _tiltCurrent = 0; _tiltVel = 0;
  _dragging = card;
}

function _onMove(e) {
  if (!_dragging) return;

  // Compute smoothed horizontal velocity for tilt
  const dx = e.global.x - _prevX;
  _velX   = _velX * 0.45 + dx * 0.55;
  _tiltTarget = Math.max(-TILT_MAX, Math.min(TILT_MAX, _velX * TILT_SCALE));
  _prevX  = e.global.x;
  _prevY  = e.global.y;

  _dragging.x = e.global.x;
  _dragging.y = e.global.y;
  const isSpell = _dragging.card?.type === 'spell';

  // Check whether the card is over an opponent field (not in _fields)
  const opponentFields = _allFields.filter(f => !_fields.includes(f));
  const overOpponent   = opponentFields.find(f =>
    isSpell ? f.isOverFieldIgnoreFull(e.global.x, e.global.y)
            : f.isOverField(e.global.x, e.global.y)
  );

  if (overOpponent) {
    // Mirror the x position onto the player field so the insertion slot highlights there.
    // Works for both minions (shows gap indicator) and spells (shows field glow).
    _fields.forEach(f => {
      const mirrorGlobal = f.toGlobal({ x: 0, y: 0 });
      f.updateHighlight(e.global.x, mirrorGlobal.y);
    });
    // Clear any lingering highlights on opponent fields
    opponentFields.forEach(f => f.clearHighlights());
  } else {
    _fields.forEach(f => {
      // For spells, highlight even over a full field
      if (isSpell && f.isOverFieldIgnoreFull(e.global.x, e.global.y)) {
        f._lastPendingIndex = -1; // suppress spread animation
      } else {
        f.updateHighlight(e.global.x, e.global.y);
      }
    });
  }
}

function _onUp(e) {
  if (!_dragging) return;

  const card = _dragging;
  _dragging  = null;
  CardPreview.isDragging = false;

  _fields.forEach(f => f.clearHighlights());
  _allFields.filter(f => !_fields.includes(f)).forEach(f => f.clearHighlights());

  // Reset tilt physics
  _tiltTarget  = 0;
  _tiltCurrent = 0;
  _tiltVel     = 0;
  card.rotation = 0;

  const isSpellCard = card.card?.type === 'spell';

  // Check whether the drop was over an opponent field
  const opponentFields = _allFields.filter(f => !_fields.includes(f));
  const overOpponentField = opponentFields.find(f =>
    isSpellCard ? f.isOverFieldIgnoreFull(e.global.x, e.global.y)
                : f.isOverField(e.global.x, e.global.y)
  );

  // If dropped onto opponent field, reroute:
  //   spells  → treat as if dropped on a player field (same spell activation)
  //   minions → place on player field at the matching x-slot
  let redirectHit = null;
  if (overOpponentField) {
    if (isSpellCard) {
      // Use the first player field for spell activation
      redirectHit = _fields[0] ?? null;
    } else {
      // Find a non-full player field
      const pf = _fields.find(f => !f.isFull);
      if (pf) {
        // Mirror x from the drop position, y from the player field centre
        const pfGlobal = pf.toGlobal({ x: 0, y: 0 });
        pf.updateHighlight(e.global.x, pfGlobal.y);
        redirectHit = pf;
      }
    }
  }

  // Normal slot-based hit (respects isFull for minions)
  let hit = redirectHit ?? _fields.find(f => f.getSlotAt(e.global.x, e.global.y));
  // Spells don't occupy a slot — allow drop anywhere over the field even when full
  if (!hit && isSpellCard) {
    hit = _fields.find(f => f.isOverFieldIgnoreFull(e.global.x, e.global.y));
  }

  if (hit) {
    // Check rations cost before allowing the drop
    const cost = card.card?.manaCost ?? 0;
    if (_rations && _rations.rations < cost) {
      // Can't afford — return card to hand the same way as a miss
      hit.clearHighlights();
      const dragGlobalX = card.x;
      const dragGlobalY = card.y;
      _app.stage.removeChild(card);
      _hand.insertCard(card, _originIndex);
      makeDraggable(card);
      const slotLocalX = card.x;
      const slotLocalY = card.y;
      const slotR      = card.rotation;
      const slotGlobal = _hand.toGlobal({ x: slotLocalX, y: slotLocalY });
      card._laid = false;
      _hand.removeCard(card);
      _app.stage.addChild(card);
      card.x = dragGlobalX; card.y = dragGlobalY; card.rotation = 0; card.scale.set(1);
      _returning = card;
      // Shake the rations display to signal "can't afford"
      if (_rations) { _rations.scale.set(1.2); setTimeout(() => _rations.scale.set(1), 200); }
      tweenTo(card, { x: slotGlobal.x, y: slotGlobal.y, rotation: slotR }, 400)
        .then(() => {
          if (_returning !== card) return;
          _returning = null;
          _app.stage.removeChild(card);
          card.x = slotLocalX; card.y = slotLocalY; card.rotation = slotR;
          card._laid = true;
          _hand.insertCard(card, _originIndex);
          makeDraggable(card);
        });
      return;
    }

    // ── Spell: cast effect then destroy the card (don't place on field) ──────
    if (card.card?.type === 'spell') {
      // Target-requiring spells need at least one valid target on the board.
      // targetAny effects (e.g. destroy) target both fields; others target only the hit field.
      const effId      = card.card?.onPlayEffect?.id;
      const meta       = effId && EFFECTS_BY_ID[effId];
      const needsTarget = meta?.requiresTarget;
      if (needsTarget) {
        const validFields = meta.targetAny ? _allFields : [hit];
        const totalTargets = validFields.reduce((n, f) => n + f._placed.length, 0);
        if (totalTargets === 0) {
          _returnToHand(card, e);
          return;
        }
      }
      hit.clearHighlights();
      if (_rations) _rations.spend(cost);
      // Fly to centre of the hit field and burst
      const fieldCentre = hit.toGlobal({ x: 0, y: 0 });
      tweenTo(card, { x: fieldCentre.x, y: fieldCentre.y }, 220)
        .then(() => {
          // Scale-up burst then fade
          card.alpha = 1;
          const start = performance.now();
          const burst = () => {
            const t = Math.min(1, (performance.now() - start) / 350);
            card.scale.set(1 + t * 1.2);
            card.alpha = 1 - t;
            if (t < 1) requestAnimationFrame(burst);
            else {
              if (card.parent) card.parent.removeChild(card);
              card.destroy({ children: true });
            }
          };
          requestAnimationFrame(burst);
          _spellCallback?.(card);
        });
      return;
    }

    // Refresh _pendingIndex from the exact drop coordinates before placing.
    // When redirected from an opponent-field drop, the real drop y is outside
    // the player field, so we substitute the player field's own centre y so
    // isOverField passes and _pendingIndex is computed correctly.
    const hitCentreY = redirectHit ? hit.toGlobal({ x: 0, y: 0 }).y : e.global.y;
    hit.updateHighlight(e.global.x, hitCentreY);
    const dropPos = { x: e.global.x, y: e.global.y };

    if (_combat?._animating) {
      // Snapshot the target slot now; immediately return card to hand so
      // nothing floats on screen during the animation.
      const slotIndex = hit._pendingIndex ?? 0;
      hit.clearHighlights();

      // Return card to its original hand slot smoothly
      const dragGlobalX = card.x;
      const dragGlobalY = card.y;
      _app.stage.removeChild(card);
      _hand.insertCard(card, _originIndex);
      makeDraggable(card);
      const slotLocalX = card.x;
      const slotLocalY = card.y;
      const slotR      = card.rotation;
      const slotGlobal = _hand.toGlobal({ x: slotLocalX, y: slotLocalY });
      card._laid = false;
      _hand.removeCard(card);
      _app.stage.addChild(card);
      card.x = dragGlobalX; card.y = dragGlobalY; card.rotation = 0; card.scale.set(1);
      _returning = card;
      tweenTo(card, { x: slotGlobal.x, y: slotGlobal.y, rotation: slotR }, 300)
        .then(() => {
          if (_returning !== card) return;
          _returning = null;
          _app.stage.removeChild(card);
          card.x = slotLocalX; card.y = slotLocalY; card.rotation = slotR;
          card._laid = true;
          _hand.insertCard(card, _originIndex);
          makeDraggable(card);
        });

      _pendingPlays.push({ card, hit, slotIndex });
    } else {
      _app.stage.removeChild(card);
      hit.placeCard(card, dropPos);
      // Spend rations on successful play
      if (_rations) _rations.spend(card.card?.manaCost ?? 0);
      // Clear highlights on any other fields that may still be spread
      _fields.forEach(f => { if (f !== hit) f.clearHighlights(); });
    }
  } else {
    // Missed — animate the card smoothly back to its hand slot from its current
    // stage (global) position, without any teleporting.

    // 1. Save the current drag position BEFORE insertCard clobbers x/y via layout().
    const dragGlobalX = card.x;
    const dragGlobalY = card.y;

    // 2. Insert into hand so layout() computes the correct final slot position.
    _app.stage.removeChild(card);
    _hand.insertCard(card, _originIndex);
    makeDraggable(card);

    // 3. Capture the hand-local slot coords layout() just assigned.
    const slotLocalX = card.x;
    const slotLocalY = card.y;
    const slotR      = card.rotation;

    // 4. Convert the slot to global/stage coords for the tween target.
    const slotGlobal = _hand.toGlobal({ x: slotLocalX, y: slotLocalY });

    // 5. Remove card from hand; remaining cards settle to n-1 positions.
    card._laid = false;
    _hand.removeCard(card);

    // 6. Re-add to stage and restore the saved drag position (before layout clobbered it).
    _app.stage.addChild(card);
    card.x        = dragGlobalX;
    card.y        = dragGlobalY;
    card.rotation = 0;
    card.scale.set(1);
    _returning    = card;

    // 7. Tween from drag position to the global slot position.
    tweenTo(card, { x: slotGlobal.x, y: slotGlobal.y, rotation: slotR }, 400)
      .then(() => {
        // Guard: if the card was grabbed mid-tween, _returning was cleared — don't reparent.
        if (_returning !== card) return;
        _returning = null;
        // Reparent into hand at the pre-calculated local slot position.
        // Mark _laid = true so layout() uses tweenTo (zero-distance) instead of
        // direct-assigning, which would cause a one-frame snap.
        _app.stage.removeChild(card);
        card.x        = slotLocalX;
        card.y        = slotLocalY;
        card.rotation = slotR;
        card._laid    = true;
        _hand.insertCard(card, _originIndex);
        makeDraggable(card);
      });
  }
}
// Return a card (currently on stage) back to its original hand slot.
function _returnToHand(card, e) {
  const dragGlobalX = card.x;
  const dragGlobalY = card.y;
  _app.stage.removeChild(card);
  _hand.insertCard(card, _originIndex);
  makeDraggable(card);
  const slotLocalX = card.x;
  const slotLocalY = card.y;
  const slotR      = card.rotation;
  const slotGlobal = _hand.toGlobal({ x: slotLocalX, y: slotLocalY });
  card._laid = false;
  _hand.removeCard(card);
  _app.stage.addChild(card);
  card.x = dragGlobalX; card.y = dragGlobalY; card.rotation = 0; card.scale.set(1);
  _returning = card;
  tweenTo(card, { x: slotGlobal.x, y: slotGlobal.y, rotation: slotR }, 400)
    .then(() => {
      if (_returning !== card) return;
      _returning = null;
      _app.stage.removeChild(card);
      card.x = slotLocalX; card.y = slotLocalY; card.rotation = slotR;
      card._laid = true;
      _hand.insertCard(card, _originIndex);
      makeDraggable(card);
    });
}