import * as PIXI from 'pixi.js';

const STAR_COUNT = 320;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

// Returns an x position biased toward the left and right edges.
// The middle 40% of the screen gets far fewer stars.
function sideBiasedX(w) {
  const sideWidth = w * 0.30; // each side band is 30% of screen width
  if (Math.random() < 0.5) {
    // left side
    return rand(0, sideWidth);
  } else {
    // right side
    return rand(w - sideWidth, w);
  }
}

export class Stars extends PIXI.Container {
  constructor(app) {
    super();
    this._app   = app;
    this._stars = [];
    this._build();
    app.ticker.add(this._tick, this);
  }

  _build() {
    const w = this._app.screen.width;
    const h = this._app.screen.height;

    for (let i = 0; i < STAR_COUNT; i++) {
      const g = new PIXI.Graphics();
      const radius = rand(0.5, 2.2);
      const alpha  = rand(0.3, 1.0);
      const speed  = rand(0.08, 0.45);   // px per frame
      const twinkleSpeed = rand(0.005, 0.022);
      const twinkleOffset = rand(0, Math.PI * 2);

      // Slight blue/white tint variety
      const colors = [0xffffff, 0xd6eaff, 0xfff4cc, 0xc8d8ff];
      const color  = colors[Math.floor(Math.random() * colors.length)];

      g.beginFill(color, alpha);
      g.drawCircle(0, 0, radius);
      g.endFill();

      g.x = sideBiasedX(w);
      g.y = rand(0, h);

      g._speed        = speed;
      g._baseAlpha    = alpha;
      g._twinkleSpeed = twinkleSpeed;
      g._twinkleOff   = twinkleOffset;
      g._t            = twinkleOffset;

      this.addChild(g);
      this._stars.push(g);
    }
  }

  _tick(delta) {
    const h = this._app.screen.height;
    const w = this._app.screen.width;

    for (const s of this._stars) {
      // Drift downward slowly
      s.y += s._speed * delta;
      if (s.y > h + 4) {
        s.y = -4;
        s.x = sideBiasedX(w);
      }

      // Twinkle: vary alpha with a sin wave
      s._t += s._twinkleSpeed * delta;
      s.alpha = s._baseAlpha * (0.6 + 0.4 * Math.sin(s._t));
    }
  }

  destroy() {
    this._app.ticker.remove(this._tick, this);
    super.destroy({ children: true });
  }
}
