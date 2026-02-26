import { tweenTo, cancelTweens } from './Tween.js';
import { SoundManager } from './SoundManager.js';

// ── Effect registry ────────────────────────────────────────────────────────────
// Each entry has: id, label, hasValue (whether a numeric param is needed), defaultValue
export const EFFECT_REGISTRY = [
  {
    id:           'deal_damage_random_enemy',
    label:        'Battlecry: Deal damage to a random enemy',
    hasValue:     true,
    defaultValue: 3,
  },
  {
    id:           'deal_damage_all_enemies',
    label:        'Battlecry: Deal X damage to ALL enemies',
    hasValue:     true,
    defaultValue: 2,
  },
  {
    id:           'draw_a_card',
    label:        'Battlecry: Draw X cards',
    hasValue:     true,
    defaultValue: 1,
  },
  {
    id:           'heal_random_friendly',
    label:        'Battlecry: Heal a random friendly for X',
    hasValue:     true,
    defaultValue: 3,
  },
  {
    id:           'gain_morale',
    label:        'Battlecry: Gain X Morale',
    hasValue:     true,
    defaultValue: 3,
  },
  {
    id:           'drain_morale',
    label:        'Battlecry: Drain X Morale from opponent',
    hasValue:     true,
    defaultValue: 3,
  },
  {
    id:           'gain_ration_this_turn',
    label:        'Spell: Gain X extra Rations this turn',
    hasValue:     true,
    defaultValue: 2,
  },
  {
    id:           'spell_gain_morale',
    label:        'Spell: Gain X Morale',
    hasValue:     true,
    defaultValue: 5,
  },
  {
    id:           'spell_drain_morale',
    label:        'Spell: Drain X Morale from opponent',
    hasValue:     true,
    defaultValue: 5,
  },
  {
    id:           'spell_attack_buff',
    label:        'Spell: Give any minion +X Attack this turn',
    hasValue:     true,
    defaultValue: 3,
    requiresTarget: true,
    targetAny:    true,
    isPositive:   true,
  },
  {
    id:           'spell_attack_debuff',
    label:        'Spell: Give any minion -X Attack this turn',
    hasValue:     true,
    defaultValue: 3,
    requiresTarget: true,
    targetAny:    true,
    isPositive:   false,
  },
  {
    id:           'spell_stat_buff',
    label:        'Spell: Give any minion +X Attack and +X Health this turn',
    hasValue:     true,
    defaultValue: 2,
    requiresTarget: true,
    targetAny:    true,
    isPositive:   true,
  },
  {
    id:           'spell_stat_buff_perm',
    label:        'Spell: Permanently give any minion +X Attack and +X Health',
    hasValue:     true,
    defaultValue: 2,
    requiresTarget: true,
    targetAny:    true,
    isPositive:   true,
  },
  {
    id:           'spell_stat_debuff_perm',
    label:        'Spell: Permanently reduce any minion by -X Attack and -X Health',
    hasValue:     true,
    defaultValue: 2,
    requiresTarget: true,
    targetAny:    true,
    isPositive:   false,
  },
  {
    id:           'spell_damage_all_enemies',
    label:        'Spell: Deal X damage to ALL enemies',
    hasValue:     true,
    defaultValue: 2,
  },
  {
    id:           'spell_draw_a_card',
    label:        'Spell: Draw X cards',
    hasValue:     true,
    defaultValue: 1,
  },
  {
    id:           'destroy_a_minion',
    label:        'Battlecry: Destroy any minion',
    hasValue:     false,
    defaultValue: 1,
    requiresTarget: true,
    targetAny:    true,
    isPositive:   false,
    targetLabel:  '\u2620',
  },
  {
    id:           'spell_destroy_a_minion',
    label:        'Spell: Destroy any minion',
    hasValue:     false,
    defaultValue: 1,
    requiresTarget: true,
    targetAny:    true,
    isPositive:   false,
    targetLabel:  '\u2620',
  },
];

// Convenience map by id
export const EFFECTS_BY_ID = Object.fromEntries(EFFECT_REGISTRY.map(e => [e.id, e]));

// ── Death effect registry ──────────────────────────────────────────────────────
export const DEATH_EFFECT_REGISTRY = [
  {
    id:           'deathrattle_damage_all_enemies',
    label:        'Deathrattle: Deal X damage to all enemies',
    hasValue:     true,
    defaultValue: 2,
  },
  {
    id:           'deathrattle_buff_random_friendly',
    label:        'Deathrattle: Give a random friendly minion +X Attack and +X Health',
    hasValue:     true,
    defaultValue: 2,
  },
];
export const DEATH_EFFECTS_BY_ID = Object.fromEntries(DEATH_EFFECT_REGISTRY.map(e => [e.id, e]));

// ── applyOnPlay ────────────────────────────────────────────────────────────────
// Called right after a card is placed on the field.
//   effectId     – string id from EFFECT_REGISTRY
//   value        – numeric param (damage amount, heal amount, etc.)
//   sourceField  – Battlefield the card was placed on
//   targetField  – Battlefield that may be affected (enemy field)
//   combat       – CombatSystem (used for exhausted bookkeeping if needed)
//   vfx          – VFX instance (optional); drives visual animations
//   sourceCard   – CardView that triggered this effect (optional)
//
// Returns a Promise so callers can await the animation if desired.
export async function applyOnPlay(effectId, value, sourceField, targetField, combat, sourceMorale = null, targetMorale = null, sourceRations = null, targetCard = null, vfx = null, sourceCard = null, callbacks = {}) {
  switch (effectId) {
    case 'deal_damage_random_enemy':
      return _dealDamageRandomEnemy(value, targetField, vfx, sourceCard);
    case 'deal_damage_all_enemies':
      return _dealDamageAllEnemies(value, targetField, vfx, sourceCard);
    case 'heal_random_friendly':
      return _healRandomFriendly(value, sourceField, vfx);
    case 'gain_morale':
      SoundManager.play('morale');
      if (vfx && sourceMorale) vfx.moraleRadial(sourceMorale, 0xffcc00).catch(() => {});
      if (sourceMorale) sourceMorale.gainMorale(value);
      return;
    case 'drain_morale':
      SoundManager.play('morale');
      if (vfx && targetMorale && sourceMorale) vfx.drainOrb(targetMorale, sourceMorale).catch(() => {});
      if (targetMorale) for (let i = 0; i < value; i++) targetMorale.takeDamage();
      return;
    case 'gain_ration_this_turn':
      if (vfx && sourceMorale) vfx.burstAt(..._displayPos(sourceMorale), 0xffee88, 14).catch(() => {});
      if (sourceRations) sourceRations.gainThisTurn(value);
      return;
    case 'spell_gain_morale':
      SoundManager.play('morale');
      if (vfx && sourceMorale) vfx.moraleRadial(sourceMorale, 0xffcc00).catch(() => {});
      if (sourceMorale) sourceMorale.gainMorale(value);
      return;
    case 'spell_drain_morale':
      SoundManager.play('morale');
      if (vfx && targetMorale && sourceMorale) vfx.drainOrb(targetMorale, sourceMorale).catch(() => {});
      if (targetMorale) for (let i = 0; i < value; i++) targetMorale.takeDamage();
      return;
    case 'spell_attack_buff':
      SoundManager.play('spell');
      if (targetCard) {
        if (vfx) vfx.attackBuff(targetCard, true).catch(() => {});
        const original = targetCard.card.attack;
        targetCard.setAttack(original + value);
        return { cardView: targetCard, originalAttack: original, originalHealth: null };
      }
      return;
    case 'spell_attack_debuff':
      if (targetCard) {
        if (vfx) vfx.attackBuff(targetCard, false).catch(() => {});
        const original = targetCard.card.attack;
        targetCard.setAttack(Math.max(0, original - value));
        return { cardView: targetCard, originalAttack: original, originalHealth: null };
      }
      return;
    case 'spell_stat_buff':
      if (targetCard) {
        if (vfx) vfx.attackBuff(targetCard, true).catch(() => {});
        const origAtk = targetCard.card.attack;
        const origHp  = targetCard.card.health;
        const origMax = targetCard._maxHealth;
        targetCard.setAttack(origAtk + value);
        targetCard._maxHealth = origMax + value;  // raise ceiling so display shows full
        targetCard.setHealth(origHp + value);
        return { cardView: targetCard, originalAttack: origAtk, originalHealth: origHp, originalMaxHealth: origMax };
      }
      return;
    case 'spell_stat_buff_perm':
      if (targetCard) {
        if (vfx) vfx.attackBuff(targetCard, true).catch(() => {});
        targetCard.setAttack(targetCard.card.attack + value);
        targetCard._maxHealth += value;
        targetCard.setHealth(targetCard.card.health + value);
      }
      return;
    case 'spell_stat_debuff_perm':
      if (targetCard) {
        if (vfx) vfx.attackBuff(targetCard, false).catch(() => {});
        const newAtk = Math.max(0, targetCard.card.attack - value);
        const newHp  = Math.max(1, targetCard.card.health - value);
        const newMax = Math.max(1, targetCard._maxHealth  - value);
        targetCard.setAttack(newAtk);
        targetCard._maxHealth = newMax;
        targetCard.setHealth(newHp);
      }
      return;
    case 'spell_damage_all_enemies':
      return _dealDamageAllEnemies(value, targetField, vfx, sourceCard);
    case 'draw_a_card':
    case 'spell_draw_a_card':
      if (vfx && sourceMorale) vfx.burstAt(..._displayPos(sourceMorale), 0x88ddff, 10).catch(() => {});
      if (callbacks.drawCard) for (let i = 0; i < value; i++) callbacks.drawCard();
      return;
    case 'destroy_a_minion':
    case 'spell_destroy_a_minion':
      SoundManager.play('destroy');
      if (targetCard) await _destroyMinion(targetCard, sourceField, targetField, vfx);
      return;
    default:
      console.warn(`[Effects] Unknown effect id: "${effectId}"`);
  }
}

// ── applyDeathEffect ──────────────────────────────────────────────────────────
// Called when a minion dies. ownField = field the dead card belonged to.
export async function applyDeathEffect(effectId, value, ownField, enemyField, vfx = null) {
  switch (effectId) {
    case 'deathrattle_damage_all_enemies':
      return _dealDamageAllEnemies(value, enemyField, vfx, null);
    case 'deathrattle_buff_random_friendly': {
      const alive = ownField._placed
        .map(p => p.cardView)
        .filter(cv => !cv.destroyed && cv.card.health > 0);
      if (alive.length === 0) return;
      const target = alive[Math.floor(Math.random() * alive.length)];
      if (vfx) await vfx.healSparkles(target);
      target.setAttack(target.card.attack + value);
      target._maxHealth += value;
      target.setHealth(Math.min(target._maxHealth, target.card.health + value));
      return;
    }
    default:
      console.warn(`[Effects] Unknown death effect id: "${effectId}"`);
  }
}

// ── Individual effect implementations ─────────────────────────────────────────

async function _dealDamageRandomEnemy(damage, enemyField, vfx = null, sourceCard = null) {
  const alive = enemyField._placed
    .map(p => p.cardView)
    .filter(cv => !cv.destroyed && cv.card.health > 0);

  if (alive.length === 0) return;                      // no targets

  // Pick a random target
  const target = alive[Math.floor(Math.random() * alive.length)];

  // Projectile animation — await so impact lands before damage numbers update
  if (vfx && sourceCard) {
    await vfx.projectile(sourceCard, target, 0xff6600);
  } else {
    // Fallback: plain red flash
    _flashRed(target);
  }

  // Shake
  await _shake(target);

  // Apply damage
  const newHP = target.card.health - damage;
  target.setHealth(newHP);

  // Remove if dead
  if (target.card.health <= 0) {
    await enemyField.removeCardAnimated(target, vfx);
  }
}

async function _destroyMinion(targetCard, sourceField, targetField, vfx = null) {
  _flashRed(targetCard);
  const ownerField = sourceField._placed.some(p => p.cardView === targetCard)
    ? sourceField
    : targetField;
  if (!targetCard.destroyed) {
    await ownerField.removeCardAnimated(targetCard, vfx);
  }
}

async function _dealDamageAllEnemies(damage, enemyField, vfx = null, sourceCard = null) {
  const alive = enemyField._placed
    .map(p => p.cardView)
    .filter(cv => !cv.destroyed && cv.card.health > 0);

  if (alive.length === 0) return;

  // Use the dramatic AOE blast (shockwave + screen shake on all targets)
  if (vfx) {
    await vfx.aoeBlast(alive, 0xff4400);
  } else {
    await Promise.all(alive.map(target => {
      _flashRed(target);
      return _shake(target);
    }));
  }

  // Apply damage to all after animations complete
  await Promise.all(alive.map(async target => {
    if (target.destroyed) return;
    target.setHealth(target.card.health - damage);
    if (target.card.health <= 0) {
      await enemyField.removeCardAnimated(target, vfx);
    }
  }));
}

async function _healRandomFriendly(amount, friendlyField, vfx = null) {
  SoundManager.play('heal');
  // Only cards that are actually damaged
  const damaged = friendlyField._placed
    .map(p => p.cardView)
    .filter(cv => !cv.destroyed && cv.card.health > 0 && cv.card.health < cv._maxHealth);

  if (damaged.length === 0) return;   // everyone is full health

  const target = damaged[Math.floor(Math.random() * damaged.length)];

  if (vfx) {
    await vfx.healSparkles(target);
  } else {
    _flashGreen(target);
  }

  // Heal, capped at max health
  const healed = Math.min(target._maxHealth, target.card.health + amount);
  target.setHealth(healed);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _flashRed(card) {
  if (!card._sprite) return;
  const prevTint = card._sprite.tint;
  card._sprite.tint = 0xff4444;
  setTimeout(() => {
    if (!card.destroyed) card._sprite.tint = prevTint;
  }, 260);
}

function _flashGreen(card) {
  if (!card._sprite) return;
  const prevTint = card._sprite.tint;
  card._sprite.tint = 0x44ff88;
  setTimeout(() => {
    if (!card.destroyed) card._sprite.tint = prevTint;
  }, 900);
}

/** Get world XY from a display object (for non-CardView objects like morale displays). */
function _displayPos(obj) {
  const g = obj.toGlobal({ x: 0, y: 0 });
  return [g.x, g.y];
}

async function _shake(card) {
  cancelTweens(card);
  const homeX = card.x;
  for (const dx of [12, -12, 8, -8, 4, -4, 0]) {
    await tweenTo(card, { x: homeX + dx }, 80);
  }
  card.x = homeX;
}
