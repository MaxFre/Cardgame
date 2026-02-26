import * as PIXI from 'pixi.js';

const LEAF_COUNT = 55;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

// Bias spawn positions to the left and right side bands (same idea as Stars)
function sideBiasedX(w) {
  const band = w * 0.22; // each side band is 22% of screen width
  return Math.random() < 0.5
    ? rand(0, band)
    : rand(w - band, w);
}

// Draw a simple leaf shape (elongated teardrop / oval)
function makeLeaf(color, alpha, size) {
  const g = new PIXI.Graphics();

  // Outer leaf
  g.beginFill(color, alpha);
  // Draw an ellipse tilted slightly — we'll rotate the container after
  g.drawEllipse(0, 0, size * 0.45, size);
  g.endFill();

  // Central vein
  g.lineStyle(0.8, darken(color), alpha * 0.8);
  g.moveTo(0, -size);
  g.lineTo(0,  size);

  return g;
}

function darken(hex) {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8)  & 0xff;
  const b =  hex        & 0xff;
  return ((r >> 1) << 16) | ((g >> 1) << 8) | (b >> 1);
}

export class Leaves extends PIXI.Container {
  constructor(app) {
    super();
    this._app    = app;
    this._leaves = [];
    this._build();
    app.ticker.add(this._tick, this);
  }

  _build() {
    const w = this._app.screen.width;
    const h = this._app.screen.height;

    // Autumnal forest palette: various greens, yellows, oranges, reds, browns
    const colors = [
      0x4a7c3f, // mid green
      0x78a832, // bright green
      0xa8c240, // yellow-green
      0xd4a820, // golden yellow
      0xe07b20, // orange
      0xc04020, // red-orange
      0x8b3a10, // brown-red
      0x5a8c28, // forest green
    ];

    for (let i = 0; i < LEAF_COUNT; i++) {
      const color = colors[Math.floor(Math.random() * colors.length)];
      const alpha = rand(0.55, 0.90);
      const size  = rand(5, 13);

      const leaf = makeLeaf(color, alpha, size);

      leaf.x = sideBiasedX(w);
      leaf.y = rand(-h, h); // start scattered including above screen

      leaf._fallSpeed   = rand(0.4, 1.1);     // px per frame downward
      leaf._swayAmp     = rand(8, 28);        // horizontal sway amplitude
      leaf._swaySpeed   = rand(0.008, 0.022);  // sway frequency
      leaf._swayOffset  = rand(0, Math.PI * 2);
      leaf._rotSpeed    = rand(-0.012, 0.012); // rotation per frame
      leaf._t           = leaf._swayOffset;
      leaf._baseX       = leaf.x; // sway around the side-biased spawn x
      leaf.rotation     = rand(0, Math.PI * 2);

      this.addChild(leaf);
      this._leaves.push(leaf);
    }
  }

  _tick(delta) {
    const h = this._app.screen.height;
    const w = this._app.screen.width;

    for (const leaf of this._leaves) {
      // Fall downward
      leaf.y += leaf._fallSpeed * delta;

      // Lazy horizontal sway
      leaf._t += leaf._swaySpeed * delta;
      leaf.x   = leaf._baseX + Math.sin(leaf._t) * leaf._swayAmp;

      // Gentle tumble
      leaf.rotation += leaf._rotSpeed * delta;

      // Reset when gone off-screen bottom
      if (leaf.y > h + 20) {
        leaf.y      = rand(-40, -10);
        leaf._baseX = sideBiasedX(w);
        leaf.x      = leaf._baseX;
      }

      // Wrap horizontally if sway pushes it too far
      if (leaf.x > w + 20)  leaf._baseX -= w + 40;
      if (leaf.x < -20)     leaf._baseX += w + 40;
    }
  }

  destroy() {
    this._app.ticker.remove(this._tick, this);
    super.destroy({ children: true });
  }
}
