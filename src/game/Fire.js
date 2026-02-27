// Procedural fire effect — rising flame particles.
// Position is expressed as a fraction of screen (anchorX, anchorY).
import * as PIXI from 'pixi.js';

const PARTICLE_COUNT = 48;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

// Flame colour ramp: base (hot white/yellow) → mid (orange) → tip (dark red → transparent)
function flameColor(life) {
  // life goes from 1 (birth) → 0 (death)
  if (life > 0.75) {
    // white-yellow core
    return { r: 255, g: 230, b: 80, a: life };
  } else if (life > 0.45) {
    // orange
    const t = (life - 0.45) / 0.30;
    return { r: 255, g: Math.round(120 * t + 60), b: 0, a: life };
  } else if (life > 0.15) {
    // red
    return { r: 200, g: 20, b: 0, a: life * 0.8 };
  } else {
    // dark smoke-red → transparent
    return { r: 80, g: 10, b: 0, a: life * 0.5 };
  }
}

function colorToHex({ r, g, b }) {
  return (r << 16) | (g << 8) | b;
}

export class Fire extends PIXI.Container {
  /**
   * @param {PIXI.Application} app
   * @param {number} anchorX  0–1 fraction of screen width  (default 0.82)
   * @param {number} anchorY  0–1 fraction of screen height (default 0.88)
   */
  constructor(app, anchorX = 0.82, anchorY = 0.88) {
    super();
    this._app     = app;
    this._anchorX = anchorX;
    this._anchorY = anchorY;
    this._pool    = [];
    this._build();
    this._reposition();
    app.ticker.add(this._tick, this);
  }

  _reposition() {
    this.x = this._app.screen.width  * this._anchorX;
    this.y = this._app.screen.height * this._anchorY;
  }

  // Call this on window resize
  resize() {
    this._reposition();
  }

  _build() {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = this._makeParticle();
      // Stagger birth so the fire appears fully alive immediately
      p._life    = rand(0, 1);
      p._maxLife = rand(0.6, 1.4);
      this._pool.push(p);
      this.addChild(p);
    }
  }

  _makeParticle() {
    const g = new PIXI.Graphics();
    g._life    = 1;
    g._maxLife = 1;
    g._vx      = 0;
    g._vy      = 0;
    g._radius  = 1;
    g.x = 0;
    g.y = 0;
    return g;
  }

  _resetParticle(p) {
    p._maxLife = rand(0.7, 1.5);
    p._life    = p._maxLife;
    // Spawn in a small horizontal spread at the flame base
    p.x   = rand(-14, 14);
    p.y   = 0;
    p._vx = rand(-0.6, 0.6);   // gentle horizontal drift
    p._vy = rand(-1.6, -0.8);  // upward
    p._radius = rand(5, 13);
  }

  _drawParticle(p) {
    const life01 = Math.max(0, p._life / p._maxLife); // 1 → 0
    const c = flameColor(life01);
    const r = p._radius * (0.3 + 0.7 * life01);       // shrink as it rises

    p.clear();
    p.beginFill(colorToHex(c), c.a);
    p.drawEllipse(0, 0, r * 0.65, r); // taller than wide = flame teardrop
    p.endFill();
    p.alpha = c.a;
  }

  _tick(delta) {
    // Keep fire anchored if screen has been resized
    this.x = this._app.screen.width  * this._anchorX;
    this.y = this._app.screen.height * this._anchorY;

    for (const p of this._pool) {
      p._life -= 0.012 * delta;

      if (p._life <= 0) {
        this._resetParticle(p);
      }

      // Add slight turbulence
      p._vx += rand(-0.06, 0.06);
      p._vx  = Math.max(-0.7, Math.min(0.7, p._vx)); // clamp drift

      p.x += p._vx * delta;
      p.y += p._vy * delta;

      this._drawParticle(p);
    }
  }

  destroy() {
    this._app.ticker.remove(this._tick, this);
    super.destroy({ children: true });
  }
}
