import * as PIXI from 'pixi.js';

const STARTING_MORALE = 40;

export class MoraleDisplay extends PIXI.Container {
  constructor(isPlayer) {
    super();
    this._morale   = STARTING_MORALE;
    this._isPlayer = isPlayer;
    this.onDepleted = null;  // callback() fired when morale hits 0
    this._build();
  }

  // ── Build ──────────────────────────────────────────────────────────────────
  _build() {
    // Pill background
    this._bg = new PIXI.Graphics();
    this.addChild(this._bg);

    // Heart / skull icon label
    const iconStyle = new PIXI.TextStyle({
      fontFamily: 'serif',
      fontSize:   22,
      fill:       0xe0e0f0,
    });
    this._icon = new PIXI.Text('♥', iconStyle);
    this._icon.anchor.set(0.5);
    this._icon.x = -28;
    this._icon.y = 0;
    this.addChild(this._icon);

    // Number
    this._style = new PIXI.TextStyle({
      fontFamily:       'Georgia, serif',
      fontSize:         28,
      fontWeight:       'bold',
      fill:             [0xffffff, 0xffcccc],
      fillGradientType: PIXI.TEXT_GRADIENT.LINEAR_VERTICAL,
      dropShadow:       true,
      dropShadowColor:  0x000000,
      dropShadowDistance: 2,
      dropShadowBlur:   4,
    });
    this._label = new PIXI.Text(String(this._morale), this._style);
    this._label.anchor.set(0.5);
    this._label.x = 10;
    this._label.y = 0;
    this.addChild(this._label);

    this._drawBg(false);
  }

  _drawBg(flash) {
    const g = this._bg;
    g.clear();
    const fill  = flash  ? 0x7f1d1d : 0x1e1e30;
    const alpha = 0.82;
    g.beginFill(fill, alpha);
    g.drawRoundedRect(-52, -22, 104, 44, 14);
    g.endFill();
    g.lineStyle(1.5, flash ? 0xff6666 : 0x554466, 0.9);
    g.drawRoundedRect(-52, -22, 104, 44, 14);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  get morale() { return this._morale; }

  /** Subtract 1 from morale and play a red flash animation. */
  takeDamage() {
    this._morale = Math.max(0, this._morale - 1);
    this._label.text = String(this._morale);

    // Red tint on icon when low
    this._icon.style.fill = this._morale <= 10 ? 0xff4444 : 0xe0e0f0;

    this._flashAndBounce(true);

    if (this._morale === 0) this.onDepleted?.();
  }

  /** Add amount to morale and play a green flash animation. */
  gainMorale(amount) {
    this._morale += amount;
    this._label.text = String(this._morale);
    this._flashAndBounce(false);
  }

  _flashAndBounce(isDamage) {
    this._drawBg(isDamage);
    // For heals, briefly tint the pill green instead of red
    if (!isDamage) {
      const g = this._bg;
      g.clear();
      g.beginFill(0x14532d, 0.85);
      g.drawRoundedRect(-52, -22, 104, 44, 14);
      g.endFill();
      g.lineStyle(1.5, 0x4ade80, 0.9);
      g.drawRoundedRect(-52, -22, 104, 44, 14);
    }
    let elapsed = 0;
    const FLASH_MS = 500;
    const ticker = PIXI.Ticker.shared;
    const onTick = (dt) => {
      elapsed += (dt / 60) * 1000;
      if (elapsed >= FLASH_MS) {
        this._drawBg(false);
        ticker.remove(onTick);
      }
    };
    ticker.add(onTick);

    // Bounce scale down then back up
    this.scale.set(1.25);
    const start      = performance.now();
    const BOUNCE     = 300;
    const tickBounce = () => {
      const t = Math.min(1, (performance.now() - start) / BOUNCE);
      const s = 1.25 - 0.25 * t;   // 1.25 → 1.0
      this.scale.set(s);
      if (t < 1) requestAnimationFrame(tickBounce);
    };
    requestAnimationFrame(tickBounce);
  }
}
