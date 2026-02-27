import * as PIXI from 'pixi.js';
import rationIconUrl from '../assets/onFieldEffects/RationIcon.png';

const MAX_RATIONS       = 10;
const RATION_POOL_START = 200;

export class RationsDisplay extends PIXI.Container {
  constructor() {
    super();
    this._maxThisTurn = 1;              // grows by 1 each turn, capped at MAX_RATIONS
    this._rations     = 1;              // current spendable rations this turn
    this._pool        = RATION_POOL_START - 1;  // pool after initial turn-1 deduction
    this._build();
  }

  _build() {
    // Pill background
    this._bg = new PIXI.Graphics();
    this.addChild(this._bg);

    // Icon — RationIcon sprite
    const rationTex  = PIXI.Texture.from(rationIconUrl);
    this._icon        = new PIXI.Sprite(rationTex);
    this._icon.anchor.set(0.5);
    this._icon.x      = -58;
    this._icon.y      = -10;
    this._icon.width  = 84;
    this._icon.height = 84;
    this.addChild(this._icon);

    // Number label  e.g. "3 / 10"
    this._style = new PIXI.TextStyle({
      fontFamily:       'Georgia, serif',
      fontSize:         26,
      fontWeight:       'bold',
      fill:             [0xfde68a, 0xf59e0b],
      fillGradientType: PIXI.TEXT_GRADIENT.LINEAR_VERTICAL,
      dropShadow:       true,
      dropShadowColor:  0x000000,
      dropShadowDistance: 2,
      dropShadowBlur:   3,
    });
    this._label = new PIXI.Text(this._text(), this._style);
    this._label.anchor.set(0.5);
    this._label.x = 16;
    this._label.y = -10;
    this.addChild(this._label);

    // Pool label  e.g. "Pool: 87"
    this._poolStyle = new PIXI.TextStyle({
      fontFamily:  'Georgia, serif',
      fontSize:    15,
      fontWeight:  'bold',
      fill:        0xd6b97b,
      dropShadow:  true,
      dropShadowColor:    0x000000,
      dropShadowDistance: 1,
      dropShadowBlur:     2,
    });
    this._poolLabel = new PIXI.Text(this._poolText(), this._poolStyle);
    this._poolLabel.anchor.set(0.5);
    this._poolLabel.x = -4;
    this._poolLabel.y = 20;
    this.addChild(this._poolLabel);

    this._drawBg(false);
  }

  _text() {
    return `${this._rations} / ${this._maxThisTurn}`;
  }

  _poolText() {
    return `Pool: ${this._pool}`;
  }

  _drawBg(flash) {
    const g = this._bg;
    g.clear();
    g.beginFill(flash ? 0x78350f : 0x1c1a10, 0.82);
    g.drawRoundedRect(-70, -30, 140, 60, 12);
    g.endFill();
    g.lineStyle(1.5, flash ? 0xfcd34d : 0x92400e, 0.9);
    g.drawRoundedRect(-70, -30, 140, 60, 12);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  get rations() { return this._rations; }
  get pool()    { return this._pool; }

  /** Called at the start of each new turn for this side.
   *  Increases the per-turn maximum by 1 (up to MAX_RATIONS),
   *  deducts that amount from the pool (regardless of how much was spent),
   *  and sets current rations to the full turn max.
   *  Returns the morale cost — how many rations had to be funded by morale
   *  because the pool ran dry.
   */
  nextTurn() {
    if (this._maxThisTurn < MAX_RATIONS) this._maxThisTurn++;
    // Take from pool — no matter if last turn's rations were fully spent
    const taken      = Math.min(this._maxThisTurn, this._pool);
    this._pool      -= taken;
    const moraleCost = this._maxThisTurn - taken;  // shortfall paid by morale
    this._rations    = this._maxThisTurn;           // always full rations this turn
    this._label.text     = this._text();
    this._poolLabel.text = this._poolText();

    if (moraleCost > 0) {
      // Pool is dry — signal the morale bleed with a crimson flash
      this._flashMoraleCost(moraleCost);
    } else {
      // Normal pool drain — gold flash + float
      this._flashPoolDrain(taken);
    }
    return moraleCost;
  }

  /** Subtract n directly from the pool (opponent effect). */
  drainPool(n) {
    this._pool = Math.max(0, this._pool - n);
    this._poolLabel.text = this._poolText();
    // Crimson flash
    const g = this._bg;
    g.clear();
    g.beginFill(0x7f1d1d, 0.92);
    g.drawRoundedRect(-70, -30, 140, 60, 12);
    g.endFill();
    g.lineStyle(1.5, 0xff6666, 1);
    g.drawRoundedRect(-70, -30, 140, 60, 12);
    let e1 = 0;
    const t1 = PIXI.Ticker.shared;
    const h1 = dt => { e1 += (dt / 60) * 1000; if (e1 >= 1200) { this._drawBg(false); t1.remove(h1); } };
    t1.add(h1);
    this.scale.set(1.22);
    const s1 = performance.now();
    const b1 = () => { const t = Math.min(1, (performance.now() - s1) / 700); this.scale.set(1.22 - 0.22 * t); if (t < 1) requestAnimationFrame(b1); };
    requestAnimationFrame(b1);
    this._floatText(`Pool -${n}`, 0xff6b6b, 20);
  }

  /** Add n directly to the pool (friendly spell). */
  gainPool(n) {
    this._pool += n;
    this._poolLabel.text = this._poolText();
    // Green flash
    const g = this._bg;
    g.clear();
    g.beginFill(0x14532d, 0.9);
    g.drawRoundedRect(-70, -30, 140, 60, 12);
    g.endFill();
    g.lineStyle(1.5, 0x4ade80, 1);
    g.drawRoundedRect(-70, -30, 140, 60, 12);
    let e2 = 0;
    const t2 = PIXI.Ticker.shared;
    const h2 = dt => { e2 += (dt / 60) * 1000; if (e2 >= 1200) { this._drawBg(false); t2.remove(h2); } };
    t2.add(h2);
    this.scale.set(1.22);
    const s2 = performance.now();
    const b2 = () => { const t = Math.min(1, (performance.now() - s2) / 700); this.scale.set(1.22 - 0.22 * t); if (t < 1) requestAnimationFrame(b2); };
    requestAnimationFrame(b2);
    this._floatText(`Pool +${n}`, 0x86efac, 20);
  }

  /** Deduct cost from current rations. */
  spend(n) {
    this._rations = Math.max(0, this._rations - n);
    this._label.text = this._text();
  }

  /** Add extra rations available this turn only (doesn't affect next-turn max or pool). */
  gainThisTurn(n) {
    this._rations += n;
    this._label.text = this._text();
    this._flashPoolDrain(n);
  }

  // ── Animations ─────────────────────────────────────────────────────────────

  /** Normal turn: amber pill flash + gold floating "−N" rising from pool label. */
  _flashPoolDrain(taken) {
    this._drawBg(true);
    let elapsed = 0;
    const ticker = PIXI.Ticker.shared;
    const onTick = dt => {
      elapsed += (dt / 60) * 1000;
      if (elapsed >= 1200) { this._drawBg(false); ticker.remove(onTick); }
    };
    ticker.add(onTick);

    // Bounce
    this.scale.set(1.18);
    const start = performance.now();
    const bounce = () => {
      const t = Math.min(1, (performance.now() - start) / 700);
      this.scale.set(1.18 - 0.18 * t);
      if (t < 1) requestAnimationFrame(bounce);
    };
    requestAnimationFrame(bounce);

    // Floating "−N" in gold
    this._floatText(`-${taken}`, 0xfcd34d, 20);
  }

  /** Morale-cost turn: crimson pill flash + red floating "−N ♥" from pool label. */
  _flashMoraleCost(moraleCost) {
    // Crimson background
    const g = this._bg;
    g.clear();
    g.beginFill(0x7f1d1d, 0.92);
    g.drawRoundedRect(-70, -30, 140, 60, 12);
    g.endFill();
    g.lineStyle(1.5, 0xff6666, 1);
    g.drawRoundedRect(-70, -30, 140, 60, 12);

    let elapsed = 0;
    const ticker = PIXI.Ticker.shared;
    const onTick = dt => {
      elapsed += (dt / 60) * 1000;
      if (elapsed >= 1200) { this._drawBg(false); ticker.remove(onTick); }
    };
    ticker.add(onTick);

    // Bigger bounce to signal severity
    this.scale.set(1.28);
    const start = performance.now();
    const bounce = () => {
      const t = Math.min(1, (performance.now() - start) / 700);
      this.scale.set(1.28 - 0.28 * t);
      if (t < 1) requestAnimationFrame(bounce);
    };
    requestAnimationFrame(bounce);

    // Floating red "−N ♥"
    this._floatText(`-${moraleCost} ♥`, 0xff6b6b, 20);
  }

  /**
   * Spawns a floating text label that rises 50px and fades out.
   * @param {string} text   - Label text
   * @param {number} color  - Hex fill colour
   * @param {number} startY - Local Y to start from
   */
  _floatText(text, color, startY) {
    const style = new PIXI.TextStyle({
      fontFamily:  'Georgia, serif',
      fontSize:    19,
      fontWeight:  'bold',
      fill:        color,
      dropShadow:  true,
      dropShadowColor:    0x000000,
      dropShadowDistance: 2,
      dropShadowBlur:     3,
    });
    const label = new PIXI.Text(text, style);
    label.anchor.set(0.5);
    label.x = 0;
    label.y = startY;
    label.alpha = 1;
    this.addChild(label);

    const DURATION = 1200;
    const RISE     = 70;
    const begin    = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - begin) / DURATION);
      label.y     = startY - RISE * t;
      label.alpha = 1 - t;
      if (t < 1) { requestAnimationFrame(tick); }
      else        { this.removeChild(label); label.destroy(); }
    };
    requestAnimationFrame(tick);
  }
}
