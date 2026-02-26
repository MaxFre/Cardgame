import * as PIXI from 'pixi.js';

const ARROW_SRC = new URL('../assets/Combat/AttackArrow.png', import.meta.url).href;

// The arrow is rendered as a sprite anchored at the left-center (tail).
// Height is fixed at ARROW_H so it never looks squashed or bloated.
// Width is stretched to the distance between attacker and target.
const ARROW_H = 200;

export class Arrow extends PIXI.Container {
  constructor() {
    super();
    this.visible = false;
    this.zIndex  = 1000;

    const tex = PIXI.Texture.from(ARROW_SRC);
    this._sprite = new PIXI.Sprite(tex);
    this._sprite.anchor.set(0, 0.5); // tail at origin
    this._sprite.height = ARROW_H;
    this.addChild(this._sprite);

    // If texture isn't ready yet, set height once it loads
    if (!tex.baseTexture.valid) {
      tex.baseTexture.once('loaded', () => {
        this._sprite.height = ARROW_H;
      });
    }
  }

  update(x1, y1, x2, y2) {
    const dx  = x2 - x1;
    const dy  = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 10) return;

    this.visible  = true;
    this.x        = x1;
    this.y        = y1;
    this.rotation = Math.atan2(dy, dx);

    // Stretch width to fill the distance; height stays fixed at ARROW_H
    this._sprite.width  = len;
    this._sprite.height = ARROW_H; // width= resets scale, so restore height
  }

  hide() {
    this.visible = false;
  }
}

