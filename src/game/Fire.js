// Procedural fire effect — multi-layer flame with embers, glow bloom, and sparks.
import * as PIXI from 'pixi.js';

// ── Utilities ─────────────────────────────────────────────────────────────────
function rand(min, max) { return min + Math.random() * (max - min); }
function lerp(a, b, t)  { return a + (b - a) * t; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Simple pseudo-noise: sum of sines — cheap turbulence for flame drift
let _noiseSeed = Math.random() * 1000;
function noise1(t) {
  return Math.sin(t * 1.7 + _noiseSeed) * 0.5
       + Math.sin(t * 3.1 + _noiseSeed * 0.7) * 0.3
       + Math.sin(t * 5.3 + _noiseSeed * 1.3) * 0.2;
}

// ── Colour ramps ──────────────────────────────────────────────────────────────
function coreColor(life01) {
  if (life01 > 0.78) {
    const t = (life01 - 0.78) / 0.22;
    return { r: 255, g: lerp(240, 255, t), b: lerp(40, 220, t), a: 0.85 };
  } else if (life01 > 0.50) {
    const t = (life01 - 0.50) / 0.28;
    return { r: 255, g: lerp(90, 240, t), b: 0, a: life01 };
  } else if (life01 > 0.22) {
    const t = (life01 - 0.22) / 0.28;
    return { r: lerp(170, 255, t), g: lerp(10, 90, t), b: 0, a: life01 * 0.85 };
  } else {
    return { r: 100, g: 15, b: 0, a: life01 * 0.6 };
  }
}

function embersColor(life01) {
  const bright = life01 > 0.5 ? 1 : life01 * 2;
  return { r: 255, g: lerp(120, 255, bright), b: lerp(0, 180, bright), a: clamp(life01 * 2.2, 0, 1) };
}

function glowColor(life01) {
  return { r: 255, g: lerp(30, 130, life01), b: 0, a: life01 * 0.22 };
}

function colorToHex({ r, g, b }) { return (r << 16) | (g << 8) | b; }

// ── Particle configs ──────────────────────────────────────────────────────────
const CONFIGS = {
  core: {
    count: 90,
    maxLifeLo: 0.8, maxLifeHi: 1.8,
    spawnX: 18, spawnYLo: -4, spawnYHi: 4,
    vyLo: -2.8, vyHi: -1.4,
    vxRange: 0.8,
    radiusLo: 7, radiusHi: 18,
    turbStrength: 0.14, widen: 0.6,
    blendMode: PIXI.BLEND_MODES.ADD,
  },
  wisp: {
    count: 40,
    maxLifeLo: 0.5, maxLifeHi: 1.1,
    spawnX: 10, spawnYLo: -25, spawnYHi: -8,
    vyLo: -1.2, vyHi: -0.5,
    vxRange: 1.2,
    radiusLo: 3, radiusHi: 9,
    turbStrength: 0.22, widen: 0.5,
    blendMode: PIXI.BLEND_MODES.ADD,
  },
  ember: {
    count: 28,
    maxLifeLo: 0.7, maxLifeHi: 2.2,
    spawnX: 20, spawnYLo: -5, spawnYHi: 5,
    vyLo: -3.5, vyHi: -1.0,
    vxRange: 2.0,
    radiusLo: 1.5, radiusHi: 3.5,
    turbStrength: 0.18, widen: 1.0,
    blendMode: PIXI.BLEND_MODES.ADD,
  },
  glow: {
    count: 14,
    maxLifeLo: 1.0, maxLifeHi: 2.0,
    spawnX: 26, spawnYLo: -10, spawnYHi: 8,
    vyLo: -0.8, vyHi: -0.2,
    vxRange: 0.4,
    radiusLo: 28, radiusHi: 52,
    turbStrength: 0.06, widen: 0.8,
    blendMode: PIXI.BLEND_MODES.ADD,
  },
};

// ── Particle ─────────────────────────────────────────────────────────────────
class FlameParticle {
  constructor(type, cfg) {
    this.type   = type;
    this.cfg    = cfg;
    this.g      = new PIXI.Graphics();
    this.g.blendMode = cfg.blendMode;
    this._noiseOffset = Math.random() * 1000;
    this.reset(true);
  }

  reset(stagger = false) {
    const c = this.cfg;
    this._maxLife = rand(c.maxLifeLo, c.maxLifeHi);
    this._life    = stagger ? rand(0, this._maxLife) : this._maxLife;
    this.g.x      = rand(-c.spawnX, c.spawnX);
    this.g.y      = rand(c.spawnYLo, c.spawnYHi);
    this._vx      = rand(-c.vxRange, c.vxRange);
    this._vy      = rand(c.vyLo, c.vyHi);
    this._radius  = rand(c.radiusLo, c.radiusHi);
  }

  tick(delta, globalTime) {
    this._life -= 0.013 * delta;
    if (this._life <= 0) { this.reset(); return; }

    const t    = globalTime * 0.018 + this._noiseOffset;
    const turb = noise1(t) * this.cfg.turbStrength * this._radius;
    this._vx  += rand(-this.cfg.turbStrength, this.cfg.turbStrength) + turb * 0.04;
    this._vx   = clamp(this._vx, -this.cfg.vxRange * 1.6, this.cfg.vxRange * 1.6);

    this.g.x += this._vx * delta;
    this.g.y += this._vy * delta;
    this.draw();
  }

  draw() {
    const life01 = clamp(this._life / this._maxLife, 0, 1);
    let c;
    if      (this.type === 'glow')  c = glowColor(life01);
    else if (this.type === 'ember') c = embersColor(life01);
    else                            c = coreColor(life01);

    const r = this._radius * lerp(this.cfg.widen, 1.2, life01);

    this.g.clear();
    this.g.beginFill(colorToHex(c), clamp(c.a, 0, 1));
    if      (this.type === 'ember') this.g.drawCircle(0, 0, r);
    else if (this.type === 'glow')  this.g.drawEllipse(0, 0, r, r * 0.75);
    else                            this.g.drawEllipse(0, 0, r * 0.55, r);
    this.g.endFill();
    this.g.alpha = clamp(c.a, 0, 1);
  }
}

// ── Fire container ────────────────────────────────────────────────────────────
export class Fire extends PIXI.Container {
  /**
   * @param {PIXI.Application} app
   * @param {number} anchorX  0-1 fraction of screen width
   * @param {number} anchorY  0-1 fraction of screen height
   */
  constructor(app, anchorX = 0.82, anchorY = 0.88) {
    super();
    this._app       = app;
    this._anchorX   = anchorX;
    this._anchorY   = anchorY;
    this._time      = 0;
    this._particles = [];

    this._buildLayers();
    this._reposition();
    app.ticker.add(this._tick, this);
  }

  _buildLayers() {
    // Render order: glow (underneath) -> core -> wisp -> embers (on top)
    for (const [type, cfg] of [
      ['glow',  CONFIGS.glow],
      ['core',  CONFIGS.core],
      ['wisp',  CONFIGS.wisp],
      ['ember', CONFIGS.ember],
    ]) {
      const layer = new PIXI.Container();
      this.addChild(layer);
      for (let i = 0; i < cfg.count; i++) {
        const p = new FlameParticle(type, cfg);
        layer.addChild(p.g);
        this._particles.push(p);
      }
    }
  }

  _reposition() {
    this.x = this._app.screen.width  * this._anchorX;
    this.y = this._app.screen.height * this._anchorY;
  }

  resize() { this._reposition(); }

  _tick(delta) {
    this._time += delta;
    this.x = this._app.screen.width  * this._anchorX;
    this.y = this._app.screen.height * this._anchorY;
    for (const p of this._particles) p.tick(delta, this._time);
  }

  destroy() {
    this._app.ticker.remove(this._tick, this);
    super.destroy({ children: true });
  }
}
