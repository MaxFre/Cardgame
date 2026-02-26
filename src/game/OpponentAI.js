/**
 * OpponentAI — heuristic AI for the opponent.
 *
 * CARD PLAY — each card is scored before playing:
 *   • Raw card value: attack + health
 *   • Type-advantage bonus: +2 per enemy field card we have advantage over
 *   • On-play effect bonus (see _scoreOnPlayEffect)
 *   Cards are sorted by score and played best-first.
 *
 * ATTACK — each attacker scores every living target:
 *   +5  we kill the target
 *   +3  target has high attack (≥4) — high threat, worth eliminating
 *   +2  type advantage on our attack
 *   +1  target has type disadvantage vs us (less retaliation)
 *   -4  we die without killing the target (pure loss)
 *   -2  we die but kill the target (even trade, still costly)
 *   +continuous tiebreaker: net HP swing / 20
 *
 *   Attackers are sorted so the best-odds ones go first.
 *   Projected target HP is tracked — once a target is doomed, other
 *   attackers skip it and pick the next-best target instead.
 *   Attackers whose best available score is ≤ -3 are skipped entirely
 *   (pure suicidal trade with no reward).
 */

import { Card }           from './Card.js';
import { tweenTo }        from './Tween.js';
import { applyOnPlay, EFFECTS_BY_ID } from './Effects.js';

const THINK_DELAY  = 900;
const ATTACK_DELAY = 600;
const PLAY_STAGGER = 500;   // ms the card hovers above the field before being placed

let _opponentHand    = null;
let _opponentField   = null;
let _playerField     = null;
let _combat          = null;
let _rations         = null;   // RationsDisplay for the opponent
let _vfx             = null;   // VFX overlay
let _opponentMorale  = null;   // MoraleDisplay for the opponent
let _playerMorale    = null;   // MoraleDisplay for the player
let _registerBuff    = null;   // callback(result) to track temporary attack changes
let _drawCard        = null;   // callback() to draw a card into opponent hand

export const OpponentAI = {
  init({ hand, field, playerField, combat, rations, vfx, opponentMorale, playerMorale, registerBuff, drawCard }) {
    _opponentHand   = hand;
    _opponentField  = field;
    _playerField    = playerField;
    _combat         = combat;
    _rations        = rations        ?? null;
    _vfx            = vfx            ?? null;
    _opponentMorale = opponentMorale ?? null;
    _playerMorale   = playerMorale   ?? null;
    _registerBuff   = registerBuff   ?? null;
    _drawCard       = drawCard       ?? null;
  },

  onOpponentTurnStart() {
    console.log('%c[AI] ── Opponent turn start ──', 'color:#a78bfa;font-weight:bold');
    setTimeout(() => this._act(), THINK_DELAY);
  },

  _act() {
    this._playCard().then(() => {
      setTimeout(() => {
        this._attack();
        this._waitForQueueThenEndTurn();
      }, ATTACK_DELAY);
    });
  },

  _waitForQueueThenEndTurn() {
    const check = () => {
      if (_combat._animating || _combat._queue.length > 0) {
        setTimeout(check, 100);
        return;
      }
      if (!_combat._isPlayerTurn) _combat.endTurn();
    };
    setTimeout(check, 150);
  },

  // ── Card play ────────────────────────────────────────────────────────────

  /** Score a hand card for how good it is to play right now. */
  _scoreCardPlay(cardView) {
    const c = cardView.card;
    let score = c.attack + c.health;  // raw stat value
    // Bonus for each enemy field card we have type advantage over
    for (const { cardView: enemy } of (_playerField?._placed ?? [])) {
      if (Card.typeMultiplier(c.faction, enemy.card.faction) === 1) score += 2;
    }
    // On-play effect adds immediate value
    const eff = c.onPlayEffect;
    if (eff?.id) score += this._scoreOnPlayEffect(eff);
    // Deathrattle value — matters even if the card dies later
    const de = c.deathEffect;
    if (de?.id) score += this._scoreDeathEffect(de);
    return score;
  },

  /**
   * Estimate the immediate board value of an on-play effect.
   *   deal_damage_random_enemy — +1 per damage point, +3 per enemy likely killed
   *   heal_random_friendly     — +1 per 2 heal points when a damaged friendly exists
   */
  _scoreOnPlayEffect(eff) {
    switch (eff.id) {
      case 'deal_damage_random_enemy': {
        const enemies = (_playerField?._placed ?? []).map(p => p.cardView)
          .filter(cv => cv.card.health > 0);
        if (enemies.length === 0) return 0;   // no targets — effect is wasted
        const kills = enemies.filter(cv => cv.card.health <= eff.value).length;
        return eff.value + kills * 3;         // raw damage + kill bonus
      }
      case 'deal_damage_all_enemies': {
        const enemies = (_playerField?._placed ?? []).map(p => p.cardView)
          .filter(cv => cv.card.health > 0);
        if (enemies.length === 0) return 0;
        const kills = enemies.filter(cv => cv.card.health <= eff.value).length;
        return eff.value * enemies.length + kills * 3;
      }
      case 'spell_damage_all_enemies': {
        const enemies = (_playerField?._placed ?? []).map(p => p.cardView)
          .filter(cv => cv.card.health > 0);
        if (enemies.length === 0) return 0;
        const kills = enemies.filter(cv => cv.card.health <= eff.value).length;
        return eff.value * enemies.length + kills * 3;
      }
      case 'draw_a_card':
      case 'spell_draw_a_card':
        return eff.value * 4;  // each draw is worth ~4
      case 'destroy_a_minion':
      case 'spell_destroy_a_minion': {
        const enemies = (_playerField?._placed ?? []).length;
        return enemies > 0 ? 10 : 0;  // destroying a minion is very strong
      }
      case 'heal_random_friendly': {
        const damaged = (_opponentField?._placed ?? []).map(p => p.cardView)
          .filter(cv => cv.card.health > 0 && cv.card.health < cv._maxHealth);
        if (damaged.length === 0) return 0;   // everyone at full HP — wasted
        return Math.ceil(eff.value / 2);      // healing worth ~half its face value
      }
      case 'gain_morale':
        return Math.ceil(eff.value / 2);      // morale gain worth ~half face value
      case 'drain_morale':
        return eff.value;                     // draining enemy morale = full face value
      case 'gain_ration_this_turn':
        return eff.value;                     // extra rations = very good
      case 'spell_gain_morale':
        return Math.ceil(eff.value / 2);
      case 'spell_drain_morale':
        return eff.value;
      case 'spell_attack_buff': {
        const allies = (_opponentField?._placed ?? []).map(p => p.cardView)
          .filter(cv => cv.card.health > 0);
        return allies.length > 0 ? eff.value * 2 : 0;
      }
      case 'spell_attack_debuff': {
        const enemies = (_playerField?._placed ?? []).map(p => p.cardView)
          .filter(cv => cv.card.health > 0);
        return enemies.length > 0 ? eff.value * 2 : 0;
      }
      case 'spell_stat_buff': {
        const friendly = (_opponentField?._placed ?? []).length;
        return friendly > 0 ? eff.value * 2 : 0;
      }
      case 'spell_stat_buff_perm': {
        const friendly = (_opponentField?._placed ?? []).length;
        return friendly > 0 ? eff.value * 3 : 0;
      }
      case 'spell_stat_debuff_perm': {
        const enemy = (_playerField?._placed ?? []).length;
        return enemy > 0 ? eff.value * 3 : 0;
      }
      default:
        return 0;
    }
  },

  /**
   * Estimate value of a deathrattle effect.
   */
  _scoreDeathEffect(de) {
    switch (de.id) {
      case 'deathrattle_damage_all_enemies': {
        const enemies = (_playerField?._placed ?? []).length;
        return de.value * Math.max(1, enemies); // scales with board presence
      }
      case 'deathrattle_buff_random_friendly': {
        const allies = (_opponentField?._placed ?? []).length;
        return allies > 0 ? de.value * 2 : de.value; // still worth playing for later
      }
      default: return 0;
    }
  },

  // Returns a Promise that resolves once all cards have been placed.
  _playCard() {
    if (!_opponentHand || !_opponentField) return Promise.resolve();

    // Collect and sort before touching the hand
    const toPlay = [];
    const slotsAvailable = 5 - _opponentField._placed.length;  // MAX_CARDS = 5
    const available = _rations ? _rations.rations : Infinity;
    let rationsBudget = available;
    let minionCount = 0;
    const handCopy = _opponentHand.cards.slice()
      .sort((a, b) => this._scoreCardPlay(b) - this._scoreCardPlay(a));

    for (const card of handCopy) {
      const isSpell = card.card?.type === 'spell';
      // Spells don't occupy field slots
      if (!isSpell && minionCount >= slotsAvailable) continue;
      // Target-requiring spells (buff/debuff) need at least one friendly minion on field
      if (isSpell) {
        const effId = card.card?.onPlayEffect?.id;
        const needsTarget = effId && EFFECTS_BY_ID[effId]?.requiresTarget;
        if (needsTarget && _opponentField._placed.length === 0 && minionCount === 0) continue;
      }
      const cost = card.card?.manaCost ?? 0;
      if (cost > rationsBudget) continue;   // can't afford — skip
      toPlay.push(card);
      rationsBudget -= cost;
      if (!isSpell) minionCount++;
    }
    if (toPlay.length === 0) return Promise.resolve();

    console.log(`%c[AI] Playing ${toPlay.length} card(s) from hand:`, 'color:#34d399');
    toPlay.forEach((cv, i) => {
      const score = this._scoreCardPlay(cv);
      const eff   = cv.card.onPlayEffect;
      const effStr = eff?.id ? `  effect:${eff.id}(${eff.value}) +${this._scoreOnPlayEffect(eff)}` : '';
      console.log(`  ${i + 1}. "${cv.card.name || cv.card.id}" [${cv.card.faction}] ATK:${cv.card.attack} HP:${cv.card.health}  play-score=${score}${effStr}`);
    });

    // Place them one-by-one — each card stays in hand until its animation starts
    let chain = Promise.resolve();
    for (const cardView of toPlay) {
      const fn = cardView.card?.type === 'spell'
        ? () => this._castSpell(cardView)
        : () => this._animatePlace(cardView);
      chain = chain.then(fn);
    }
    return chain;
  },

  /**
   * Cast a spell from the opponent's hand:
   * fly card to field centre, burst-dissolve, fire effect.
   */
  _castSpell(cardView) {
    return new Promise(resolve => {
      const stage = _opponentField.parent;
      _opponentHand.removeCard(cardView);

      // Spend rations
      if (_rations) _rations.spend(cardView.card?.manaCost ?? 0);

      const handGlobal  = _opponentHand.toGlobal({ x: 0, y: 0 });
      const fieldCentre = _opponentField.toGlobal({ x: 0, y: 0 });

      stage.addChild(cardView);
      cardView.x        = handGlobal.x;
      cardView.y        = handGlobal.y;
      cardView.scale.set(1);
      cardView.rotation = 0;

      const eff = cardView.card.onPlayEffect;
      // Flip the card face-up so the player can see what spell is being cast
      tweenTo(cardView, { x: fieldCentre.x, y: fieldCentre.y }, 400)
        .then(() => tweenTo(cardView.scale, { x: 0 }, 120))   // fold to thin edge
        .then(() => { cardView.useFrontFace(); return tweenTo(cardView.scale, { x: 1 }, 140); }) // reveal face
        .then(() => tweenTo(cardView, { x: fieldCentre.x, y: fieldCentre.y - 30 }, 180))  // small lift
        .then(() => new Promise(r => setTimeout(r, 1000)))  // hold so player can read it
        .then(async () => {
          // Trigger effect
          if (eff?.id) {
            // Resolve a target card for spells that require one
            let targetCard = null;
            if (eff.id === 'spell_attack_buff' || eff.id === 'spell_stat_buff' || eff.id === 'spell_stat_buff_perm') {
              const allies = _opponentField._placed.map(p => p.cardView)
                .filter(cv => !cv.destroyed && cv.card.health > 0);
              if (allies.length > 0)
                targetCard = allies.reduce((a, b) => b.card.attack > a.card.attack ? b : a);
            } else if (eff.id === 'spell_attack_debuff' || eff.id === 'spell_stat_debuff_perm') {
              // Debuff enemy's strongest minion
              const enemies = _playerField._placed.map(p => p.cardView)
                .filter(cv => !cv.destroyed && cv.card.health > 0);
              if (enemies.length > 0)
                targetCard = enemies.reduce((a, b) => b.card.attack > a.card.attack ? b : a);
            } else if (eff.id === 'destroy_a_minion' || eff.id === 'spell_destroy_a_minion') {
              // Destroy enemy's most threatening (highest attack) minion
              const enemies = _playerField._placed.map(p => p.cardView)
                .filter(cv => !cv.destroyed && cv.card.health > 0);
              if (enemies.length > 0)
                targetCard = enemies.reduce((a, b) => b.card.attack > a.card.attack ? b : a);
            }
            const result = await applyOnPlay(
              eff.id, eff.value ?? 1,
              _opponentField, _playerField, _combat,
              _opponentMorale, _playerMorale, _rations,
              targetCard, _vfx, cardView,
              { drawCard: _drawCard }
            );
            if (result?.cardView && _registerBuff) _registerBuff(result);
          }
          // Burst-dissolve
          const start = performance.now();
          const burst = () => {
            const t = Math.min(1, (performance.now() - start) / 320);
            cardView.scale.set(1 + t * 1.2);
            cardView.alpha = 1 - t;
            if (t < 1) requestAnimationFrame(burst);
            else {
              if (cardView.parent) cardView.parent.removeChild(cardView);
              cardView.destroy({ children: true });
              resolve();
            }
          };
          requestAnimationFrame(burst);
        });
    });
  },

  /**
   * Visually:  hand centre → hover above field centre (back-face) →
   *            flip to field frame → placeCard drop animation.
   */
  _animatePlace(cardView) {
    return new Promise(resolve => {
      // Safety guard: field may have filled up while waiting in the chain
      if (_opponentField.isFull) {
        // Card never left hand visually, nothing to clean up
        resolve();
        return;
      }

      const stage = _opponentField.parent;

      // Remove from hand right as this card's animation starts
      _opponentHand.removeCard(cardView);

      // Start position: centre of opponent hand in stage coords
      const handGlobal  = _opponentHand.toGlobal({ x: 0, y: 0 });
      // Hover target: centre of field, 110px above it, in stage coords
      const hoverGlobal = _opponentField.toGlobal({ x: 0, y: -110 });

      // Keep as back-face while flying out of the hand
      stage.addChild(cardView);
      cardView.x        = handGlobal.x;
      cardView.y        = handGlobal.y;
      cardView.scale.set(1);
      cardView.rotation = 0;

      // 1. Fly from hand to hover point
      tweenTo(cardView, { x: hoverGlobal.x, y: hoverGlobal.y }, 500)
        .then(() => {
          // 2. Flip to field-frame while hovering
          cardView.useFieldFrame();
          // 3. Brief pause — AI "holds" the card above the field
          return new Promise(r => setTimeout(r, PLAY_STAGGER));
        })
        .then(() => {
          // 4. Drop it — placeCard reparents to field and runs the squash animation
          if (!_opponentField.isFull) {
            _opponentField._pendingIndex = _opponentField._placed.length;
            _opponentField.placeCard(cardView, null);
            // Spend rations for the AI
            if (_rations) _rations.spend(cardView.card?.manaCost ?? 0);
          }
          // Wait for the drop + spring animation (~500ms) before the next card
          setTimeout(resolve, 520);
        });
    });
  },

  // ── Attack ───────────────────────────────────────────────────────────────

  /** Score a single (attacker, target) pair. Higher = better for the AI. */
  _scoreMatchup(attacker, target, projectedTargetHP) {
    const aCard = attacker.card;
    const tCard = target.card;

    const atkBonus       = Card.typeMultiplier(aCard.faction, tCard.faction);
    const defBonus       = Card.typeMultiplier(tCard.faction, aCard.faction);
    const dealtDmg       = Math.max(1, aCard.attack + atkBonus);
    const retaliationDmg = Math.max(0, tCard.attack);

    // Use projected HP so we don't pile onto an already-doomed target
    const hpAfterAttack   = projectedTargetHP - dealtDmg;
    const weKill          = hpAfterAttack <= 0;
    const weDie           = aCard.health - retaliationDmg <= 0;
    const netHP           = dealtDmg - retaliationDmg;  // positive = we profit

    let score = 0;
    if (weKill)                        score += 5;
    if (weKill && tCard.attack >= 4)   score += 3;   // eliminated a high-attack threat
    if (atkBonus === 1)                score += 2;
    if (defBonus === -1)               score += 1;
    if (weDie && !weKill)              score -= 4;   // die without reward
    if (weDie && weKill)               score -= 2;   // even trade: we get the kill but lose the card
    score += netHP / 20;                              // small continuous tiebreaker
    // Deathrattle penalty: killing a minion with deathrattle_damage_all_enemies hurts our field
    if (weKill && tCard.deathEffect?.id === 'deathrattle_damage_all_enemies') {
      const friendlyCount = _opponentField?._placed.length ?? 0;
      score -= tCard.deathEffect.value * friendlyCount;  // potential damage to our field
    }
    // Deathrattle bonus: killing a minion with deathrattle_buff_random_friendly denies enemy buff
    if (weKill && tCard.deathEffect?.id === 'deathrattle_buff_random_friendly') {
      const enemiesLeft = (_playerField?._placed.length ?? 1) - 1;
      if (enemiesLeft > 0) score -= tCard.deathEffect.value; // bad for us if they still have targets
    }
    return score;
  },

  _attack() {
    if (!_opponentField || !_playerField) return;

    const attackers = _opponentField._placed.map(p => p.cardView)
      .filter(cv => !_combat._exhausted.has(cv) && cv.card.attack > 0);
    if (attackers.length === 0) {
      console.log('%c[AI] No available attackers.', 'color:#94a3b8');
      return;
    }

    const initialTargets = _playerField._placed.map(p => p.cardView);
    if (initialTargets.length === 0) {
      console.log('%c[AI] No targets on player field.', 'color:#94a3b8');
      return;
    }

    console.log(`%c[AI] Evaluating attacks — ${attackers.length} attacker(s), ${initialTargets.length} target(s)`, 'color:#a78bfa');

    // Build projected HP map for targets so double-targeting is avoided
    const projectedHP = new Map();
    for (const { cardView } of _playerField._placed) {
      projectedHP.set(cardView, cardView.card.health);
    }

    // Pre-score each attacker's best available target to sort attack order
    // (best-odds attackers go first — safer trades before risky ones)
    const rankedAttackers = attackers
      .map(attacker => {
        const { best } = this._pickBestTarget(attacker, projectedHP);
        return { attacker, bestScore: best?.score ?? -Infinity };
      })
      .sort((a, b) => b.bestScore - a.bestScore);

    for (const { attacker } of rankedAttackers) {
      const livingTargets = [...projectedHP.entries()]
        .filter(([, hp]) => hp > 0)
        .map(([cv]) => cv);
      if (livingTargets.length === 0) break;

      const liveMap = new Map([...projectedHP].filter(([, hp]) => hp > 0));
      const { best } = this._pickBestTarget(attacker, liveMap);
      if (!best) continue;

      // Skip purely losing trades (die without killing, no advantage)
      if (best.score <= -3) {
        console.log(`%c[AI] SKIP  "${attacker.card.name || attacker.card.id}" — best score ${best.score.toFixed(2)} is a losing trade`, 'color:#f87171');
        continue;
      }

      // Commit the attack and mark the projected damage
      const aC = attacker.card, tC = best.target.card;
      const atkBonus  = Card.typeMultiplier(aC.faction, tC.faction);
      const defBonus  = Card.typeMultiplier(tC.faction, aC.faction);
      const dealtDmg  = Math.max(1, aC.attack  + atkBonus);
      const retailDmg = Math.max(1, tC.attack  + defBonus);
      const weKill    = (projectedHP.get(best.target) - dealtDmg) <= 0;
      const weDie     = aC.health - retailDmg <= 0;
      const typeLabel = atkBonus === 1 ? '✅ advantage' : atkBonus === -1 ? '❌ disadvantage' : '➖ neutral';
      const tradeLabel = weKill && !weDie ? 'WIN TRADE'
                       : weKill && weDie  ? 'EVEN TRADE'
                       : !weKill && weDie ? 'LOSING TRADE'
                       : 'CHIP';
      console.log(
        `%c[AI] ATTACK "${aC.name || aC.id}" [${aC.faction}] → "${tC.name || tC.id}" [${tC.faction}]` +
        `  dmg:${dealtDmg}  ret:${retailDmg}  score:${best.score.toFixed(2)}  ${typeLabel}  ${tradeLabel}`,
        'color:#fbbf24'
      );
      _combat.aiAttack(attacker, best.target);
      projectedHP.set(best.target, (projectedHP.get(best.target) ?? 0) - dealtDmg);
    }
  },

  /** Returns { best: { target, score } } from projectedHP map. */
  _pickBestTarget(attacker, projectedHP) {
    let bestScore = -Infinity;
    let bestTargets = [];
    for (const [target, hp] of projectedHP) {
      if (hp <= 0) continue;
      const s = this._scoreMatchup(attacker, target, hp);
      if (s > bestScore)       { bestScore = s; bestTargets = [target]; }
      else if (s === bestScore)  bestTargets.push(target);
    }
    if (bestTargets.length === 0) return { best: null };
    const target = bestTargets[Math.floor(Math.random() * bestTargets.length)];
    return { best: { target, score: bestScore } };
  },
};
