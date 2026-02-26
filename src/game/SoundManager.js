/**
 * SoundManager — procedural Web Audio API sound effects.
 * No audio files required; all sounds are synthesised in real time.
 * Drop-in real files later by replacing individual _play* methods.
 *
 * Usage:
 *   SoundManager.play('hit');
 *   SoundManager.setVolume(0.5);   // 0‒1
 *   SoundManager.mute(true/false);
 */

let _ctx   = null;  // AudioContext — created lazily on first play
let _master = null; // GainNode    — master volume
let _muted  = false;
let _volume = 1.0;

/** Lazily boot AudioContext and unlock on first user gesture. */
function _getCtx() {
  if (_ctx) return _ctx;
  _ctx    = new (window.AudioContext || window.webkitAudioContext)();
  _master = _ctx.createGain();
  _master.gain.value = _volume;
  _master.connect(_ctx.destination);

  // Resume on any user interaction (browser autoplay policy)
  const unlock = () => {
    if (_ctx.state === 'suspended') _ctx.resume();
  };
  ['pointerdown', 'keydown'].forEach(e => window.addEventListener(e, unlock, { once: false }));
  return _ctx;
}

/** Route a node through master gain and auto-disconnect after `dur` seconds. */
function _out(node, dur) {
  node.connect(_master);
  node.disconnect.bind(node);
  setTimeout(() => { try { node.disconnect(); } catch {} }, (dur + 0.3) * 1000);
}

// ── Sound recipes ─────────────────────────────────────────────────────────────

function _playHit() {
  const ctx  = _getCtx();
  const t    = ctx.currentTime;
  // White noise burst
  const buf  = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  // High-pass to make it crisp
  const hp = ctx.createBiquadFilter();
  hp.type            = 'highpass';
  hp.frequency.value = 1200;
  src.connect(hp);
  // Envelope gain
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.55, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  hp.connect(g);
  _out(g, 0.14);
  src.start(t);
  src.stop(t + 0.14);
}

function _playSpell() {
  const ctx = _getCtx();
  const t   = ctx.currentTime;
  // Sweeping sine — glide up then fade
  const osc = ctx.createOscillator();
  osc.type  = 'sine';
  osc.frequency.setValueAtTime(280, t);
  osc.frequency.linearRampToValueAtTime(880, t + 0.25);
  osc.frequency.linearRampToValueAtTime(440, t + 0.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.35, t + 0.05);
  g.gain.linearRampToValueAtTime(0.28, t + 0.25);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  osc.connect(g);
  _out(g, 0.6);
  osc.start(t);
  osc.stop(t + 0.6);
}

function _playDraw() {
  const ctx  = _getCtx();
  const t    = ctx.currentTime;
  // Soft whoosh
  const buf  = ctx.createBuffer(1, ctx.sampleRate * 0.35, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type            = 'bandpass';
  bp.frequency.value = 600;
  bp.Q.value         = 0.8;
  src.connect(bp);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.3, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  bp.connect(g);
  _out(g, 0.4);
  src.start(t);
  src.stop(t + 0.4);
}

function _playDeath() {
  const ctx = _getCtx();
  const t   = ctx.currentTime;
  // Low drop thud
  const osc = ctx.createOscillator();
  osc.type  = 'sine';
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(35, t + 0.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.6, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  osc.connect(g);
  // Layer a noise thud
  const buf  = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const lp = ctx.createBiquadFilter();
  lp.type            = 'lowpass';
  lp.frequency.value = 300;
  src.connect(lp);
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0.45, t);
  gn.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  lp.connect(gn);
  _out(g,  0.6);
  _out(gn, 0.2);
  osc.start(t); osc.stop(t + 0.6);
  src.start(t); src.stop(t + 0.2);
}

function _playBattlecry() {
  const ctx = _getCtx();
  const t   = ctx.currentTime;
  // Sharp rising stab
  const osc = ctx.createOscillator();
  osc.type  = 'square';
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(660, t + 0.08);
  osc.frequency.exponentialRampToValueAtTime(550, t + 0.2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.3, t);
  g.gain.linearRampToValueAtTime(0.2, t + 0.1);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  osc.connect(g);
  _out(g, 0.4);
  osc.start(t); osc.stop(t + 0.4);
}

function _playMorale() {
  const ctx = _getCtx();
  const t   = ctx.currentTime;
  // Bell chime
  [523, 659, 784].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type  = 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    const st = t + i * 0.07;
    g.gain.setValueAtTime(0, st);
    g.gain.linearRampToValueAtTime(0.28, st + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, st + 0.5);
    osc.connect(g);
    _out(g, 0.6);
    osc.start(st); osc.stop(st + 0.6);
  });
}

function _playEndTurn() {
  const ctx = _getCtx();
  const t   = ctx.currentTime;
  // Two-tone soft click
  [440, 330].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type  = 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    const st = t + i * 0.08;
    g.gain.setValueAtTime(0.22, st);
    g.gain.exponentialRampToValueAtTime(0.001, st + 0.12);
    osc.connect(g);
    _out(g, 0.25);
    osc.start(st); osc.stop(st + 0.25);
  });
}

function _playSummon() {
  const ctx = _getCtx();
  const t   = ctx.currentTime;
  // Quick rising pop
  const osc = ctx.createOscillator();
  osc.type  = 'triangle';
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.exponentialRampToValueAtTime(700, t + 0.18);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.35, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  osc.connect(g);
  _out(g, 0.25);
  osc.start(t); osc.stop(t + 0.25);
}

function _playHeal() {
  const ctx = _getCtx();
  const t   = ctx.currentTime;
  // Soft ascending chime
  [330, 415, 523].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type  = 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    const st = t + i * 0.06;
    g.gain.setValueAtTime(0.18, st);
    g.gain.exponentialRampToValueAtTime(0.001, st + 0.4);
    osc.connect(g);
    _out(g, 0.5);
    osc.start(st); osc.stop(st + 0.5);
  });
}

function _playDestroy() {
  const ctx = _getCtx();
  const t   = ctx.currentTime;
  // Descending dissonant crunch
  [220, 185].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type  = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.3, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25 - i * 0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(g);
    _out(g, 0.45);
    osc.start(t); osc.stop(t + 0.45);
  });
}

// ── Registry ─────────────────────────────────────────────────────────────────

// Custom AudioBuffers loaded from localStorage data URLs (set via sound editor)
const _customBuffers = {};

/** Decode a data URL into an AudioBuffer and cache it under `key`. */
async function _loadCustomBuffer(key, dataUrl) {
  try {
    const ctx = _getCtx();
    const res  = await fetch(dataUrl);
    const ab   = await res.arrayBuffer();
    _customBuffers[key] = await ctx.decodeAudioData(ab);
  } catch { delete _customBuffers[key]; }
}

/** Play a cached AudioBuffer through the master gain at a given volume. */
function _playBuffer(buf, volume = 1) {
  const ctx = _getCtx();
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = volume;
  src.connect(g);
  g.connect(_master);
  src.start(ctx.currentTime);
}

export const SOUND_KEYS = ['hit','death','summon','draw','endTurn','battlecry','morale','heal','destroy','spell'];

const _sounds = {
  hit:       _playHit,
  spell:     _playSpell,
  draw:      _playDraw,
  death:     _playDeath,
  battlecry: _playBattlecry,
  morale:    _playMorale,
  endTurn:   _playEndTurn,
  summon:    _playSummon,
  heal:      _playHeal,
  destroy:   _playDestroy,
};

// Per-key volume overrides (set by editor)
const _keyVolumes = {};

export const SoundManager = {
  /** Play a sound by key. Custom file takes priority over procedural. */
  play(key) {
    if (_muted) return;
    const vol = _keyVolumes[key] ?? 1;
    if (_customBuffers[key]) {
      try { _playBuffer(_customBuffers[key], vol); } catch {}
      return;
    }
    const fn = _sounds[key];
    if (!fn) return;
    try { fn(); } catch {}
  },

  /** Master volume 0–1. */
  setVolume(v) {
    _volume = Math.min(1, Math.max(0, v));
    if (_master) _master.gain.value = _muted ? 0 : _volume;
  },

  /** Mute or unmute all sounds. */
  mute(on) {
    _muted = on;
    if (_master) _master.gain.value = on ? 0 : _volume;
  },

  get isMuted() { return _muted; },

  // ── Editor API ────────────────────────────────────────────────────────────

  /** Assign a data URL for a key and immediately decode it. Called by the editor. */
  async setCustom(key, dataUrl, volume = 1) {
    localStorage.setItem(`sound-custom-${key}`, dataUrl);
    _keyVolumes[key] = volume;
    localStorage.setItem(`sound-volume-${key}`, String(volume));
    await _loadCustomBuffer(key, dataUrl);
  },

  /** Remove custom sound for a key, reverting to the procedural fallback. */
  clearCustom(key) {
    localStorage.removeItem(`sound-custom-${key}`);
    delete _customBuffers[key];
  },

  /** Set per-key volume without changing the file. */
  setKeyVolume(key, v) {
    _keyVolumes[key] = v;
    localStorage.setItem(`sound-volume-${key}`, String(v));
  },

  /** Load all custom sounds stored in localStorage. Call once on game start. */
  async loadAllCustom() {
    await Promise.all(SOUND_KEYS.map(async key => {
      const vol = parseFloat(localStorage.getItem(`sound-volume-${key}`) ?? '1');
      if (!isNaN(vol)) _keyVolumes[key] = vol;
      const url = localStorage.getItem(`sound-custom-${key}`);
      if (url) await _loadCustomBuffer(key, url);
    }));
  },

  /** Returns info about current custom sounds (for the editor). */
  getCustomInfo() {
    return Object.fromEntries(SOUND_KEYS.map(key => [key, {
      hasCustom: !!localStorage.getItem(`sound-custom-${key}`),
      volume:    _keyVolumes[key] ?? 1,
    }]));
  },
};
