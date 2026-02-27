// Bundled at build time — this is the source-of-truth card collection.
// The editor writes to this file via /api/save-collection so it stays current.
import _bundledCollection from '../assets/cards/CreatedCards/collection.json';
// ── Type chart (faction triangle) ─────────────────────────────────────────────
// Magical > Folk, Wild > Magical, Folk > Wild
// Returns a flat damage bonus: +1 (advantage), 0 (neutral), -1 (disadvantage)
function _calcMultiplier(atk, def) {
  if (atk === def) return 0;
  if (
    (atk === 'Magical' && def === 'Folk')    ||
    (atk === 'Wild'    && def === 'Magical') ||
    (atk === 'Folk'    && def === 'Wild')
  ) return 1;
  return -1;
}

export class Card {
  constructor(id, manaCost = 0, attack = 0, health = 0, extras = {}) {
    this.id          = id;
    this.manaCost    = manaCost;
    this.attack      = attack;
    this.health      = health;
    // Fields from the card editor (optional)
    this.name        = extras.name        ?? '';
    this.type        = extras.type        ?? 'minion';
    this.faction     = extras.faction     ?? 'Folk';   // 'Magical' | 'Wild' | 'Folk'
    this.rarity      = extras.rarity      ?? 'common';
    this.description = extras.description ?? '';
    this.artDataUrl  = extras.artDataUrl  ?? null;
    this.artOffset   = extras.artOffset   ?? { x: 0, y: 0 };
    this.artZoom     = extras.artZoom     ?? 1;
    this.fieldArtOffset = extras.fieldArtOffset ?? null;  // null = fall back to artOffset
    this.fieldArtZoom   = extras.fieldArtZoom   ?? null;  // null = fall back to artZoom
    this.onPlayEffect   = extras.onPlayEffect   ?? null;  // { id, value } | null
    this.deathEffect    = extras.deathEffect    ?? null;  // { id, value } | null
    this.summonVfxPreset = extras.summonVfxPreset ?? null; // VFX preset name string | null
    this.deathVfxPreset  = extras.deathVfxPreset  ?? null; // VFX preset name string | null
  }

  /** Load the card collection — uses the bundled collection.json (baked at build/dev time). */
  static loadFromStorage(n = 15) {
    try {
      const raw = _bundledCollection.length > 0 ? _bundledCollection : [];
      if (raw.length === 0) return Card.createTestCards(n);
      // Build a deck of exactly 2 copies of every card in the collection, then shuffle
      const deck = [...raw, ...raw].sort(() => Math.random() - 0.5);
      return deck.map((d, i) =>
        new Card(d.id ?? i, d.manaCost ?? 1, d.attack ?? 1, d.health ?? 1, d));
    } catch {
      return Card.createTestCards(n);
    }
  }

  /**
   * No-op kept for backwards-compat.
   * Collection is now loaded via the static bundle import; no localStorage needed.
   */
  static async syncFromFile() {}

  /**
   * Returns the damage multiplier when a card of `attackerFaction` attacks
   * a card of `defenderFaction`.
   * x2  : Magical→Folk, Wild→Magical, Folk→Wild
   * x0.5: Folk→Magical, Magical→Wild, Wild→Folk
   * x1  : same faction
   */
  static typeMultiplier(attackerFaction, defenderFaction) {
    return _calcMultiplier(attackerFaction ?? 'Folk', defenderFaction ?? 'Folk');
  }

  static createTestCards(n) {
    const factions = ['Magical', 'Wild', 'Folk'];
    return Array.from({ length: n }, (_, i) => new Card(
      i,
      Math.ceil(Math.random() * 10),
      Math.ceil(Math.random() * 10),
      Math.ceil(Math.random() * 10),
      { faction: factions[i % 3] },
    ));
  }
}
