/**
 * AnimationSequencer — reads the timeline config saved by animation-editor
 * and executes animation phases in the configured order.
 *
 * Config format (stored in localStorage):
 *   [ { id: 'summon_vfx', slot: 0 }, { id: 'battlecry_burst', slot: 1 }, ... ]
 *
 * Phases with identical slot numbers run in parallel.
 * Lower slot number = earlier in sequence.
 */

export const CARD_PLAY_PHASES = [
  { id: 'summon_vfx',       label: 'Summon VFX',       desc: 'Faction flash / preset particles',      icon: '✨', color: '#4a9eff' },
  { id: 'battlecry_burst',  label: 'Battlecry Burst',  desc: 'Burst ring VFX + build-up cue',         icon: '💥', color: '#ff9f43' },
  { id: 'on_play',          label: 'On-Play Effect',   desc: 'The actual effect (damage, heal…)',      icon: '⚡', color: '#ff6b6b' },
];

export const COMBAT_PHASES = [
  { id: 'lunge',      label: 'Lunge',         desc: 'Attacker moves toward target',          icon: '⚔️',  color: '#e17055' },
  { id: 'clash_vfx',  label: 'Clash VFX',    desc: 'Impact particles at midpoint',          icon: '💢',  color: '#ff9f43' },
  { id: 'damage',     label: 'Apply Damage', desc: 'HP values update + float numbers',      icon: '🩸',  color: '#ee5a24' },
  { id: 'snap_back',  label: 'Snap Back',    desc: 'Attacker returns home',                 icon: '↩️',  color: '#a29bfe' },
  { id: 'death_vfx',  label: 'Death VFX',   desc: 'Fade out + death particles',            icon: '💀',  color: '#636e72' },
];

export const DEFAULT_CARD_PLAY_CONFIG = [
  { id: 'summon_vfx',      slot: 0 },
  { id: 'battlecry_burst', slot: 1 },
  { id: 'on_play',         slot: 2 },
];

export const DEFAULT_COMBAT_CONFIG = [
  { id: 'lunge',     slot: 0 },
  { id: 'clash_vfx', slot: 1 },
  { id: 'damage',    slot: 1 },
  { id: 'snap_back', slot: 2 },
  { id: 'death_vfx', slot: 3 },
];

export const STORAGE_KEYS = {
  cardPlay: 'anim-sequence-cardplay',
  combat:   'anim-sequence-combat',
};

function loadConfig(storageKey, defaultConfig) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(saved) && saved.length > 0) return saved;
  } catch { /* ignore */ }
  return defaultConfig.map(x => ({ ...x }));
}

/**
 * Run animation phases in the order specified by the timeline config.
 * phaseMap: { [id: string]: () => Promise<void> }
 * Each function should resolve when its animation is done.
 */
async function runSequence(storageKey, defaultConfig, phaseMap) {
  const config = loadConfig(storageKey, defaultConfig);

  // Group phase ids by slot number
  const groups = new Map();
  for (const { id, slot } of config) {
    if (!groups.has(slot)) groups.set(slot, []);
    groups.get(slot).push(id);
  }

  // Execute each slot-group sequentially; phases within a group run in parallel
  const sortedSlots = [...groups.keys()].sort((a, b) => a - b);
  for (const slot of sortedSlots) {
    const ids = groups.get(slot);
    await Promise.all(
      ids.map(id => {
        const fn = phaseMap[id];
        return fn ? fn().catch(() => {}) : Promise.resolve();
      })
    );
  }
}

export const AnimationSequencer = {
  runCardPlay: (phaseMap) =>
    runSequence(STORAGE_KEYS.cardPlay, DEFAULT_CARD_PLAY_CONFIG, phaseMap),
  runCombat: (phaseMap) =>
    runSequence(STORAGE_KEYS.combat, DEFAULT_COMBAT_CONFIG, phaseMap),

  getCardPlayConfig:  () => loadConfig(STORAGE_KEYS.cardPlay, DEFAULT_CARD_PLAY_CONFIG),
  getCombatConfig:    () => loadConfig(STORAGE_KEYS.combat,   DEFAULT_COMBAT_CONFIG),
};
