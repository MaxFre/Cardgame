import * as PIXI from 'pixi.js';
import cardBackSrc from '../assets/cards/CardBack.png';

const CARD_W = 128, CARD_H = 192;
const MAX_STACK = 8;
const OFFSET    = 2;

// Shared texture loaded once; guaranteed valid by the time setCount() runs
const backTexture = PIXI.Texture.from(cardBackSrc);

export class DeckView extends PIXI.Container {
  constructor(isPlayer) {
    super();
    this.isPlayer = isPlayer;

    // Create the maximum number of layers up front; show only what's needed
    this._layers = [];
    for (let i = 0; i < MAX_STACK; i++) {
      const spr = new PIXI.Sprite(backTexture);
      spr.anchor.set(0.5);
      // Explicitly force card dimensions regardless of the PNG's native aspect ratio
      const applySize = () => { spr.width = CARD_W; spr.height = CARD_H; };
      if (backTexture.baseTexture.valid) applySize();
      else backTexture.baseTexture.once('loaded', applySize);
      // Bottom layers are shifted left/down; top layer sits at origin
      spr.x = (i - (MAX_STACK - 1)) * OFFSET;
      spr.y = -(i - (MAX_STACK - 1)) * OFFSET;
      spr.visible = false;
      this._layers.push(spr);
      this.addChild(spr);
    }

    this._countLabel = new PIXI.Text('0', {
      fontFamily: 'Georgia, serif',
      fontSize: 22,
      fontWeight: 'bold',
      fill: 0xffffff,
      stroke: 0x000000,
      strokeThickness: 4,
    });
    this._countLabel.anchor.set(0.5);
    this._countLabel.y = CARD_H / 2 - 16;
    this.addChild(this._countLabel);

    this.setCount(0);
  }

  setCount(n) {
    this._countLabel.text = String(n);
    // Show between 1 and MAX_STACK layers (at least 1 when deck is non-empty)
    const visible = n <= 0 ? 0 : Math.max(1, Math.min(MAX_STACK, Math.ceil(n / 4)));
    this._layers.forEach((spr, i) => {
      spr.visible = i >= (MAX_STACK - visible);
    });
    this._countLabel.visible = n > 0;
  }
}
