import * as PIXI from 'pixi.js';
import moraleIconUrl from '../assets/onFieldEffects/MoraleIcon.png';

const STARTING_MORALE = 40;

export class MoraleDisplay extends PIXI.Container {
  constructor(isPlayer) {
    super();
    this._morale   = STARTING_MORALE;
    this._isPlayer = isPlayer;
    this.onDepleted   = null;  // callback() fired when morale hits 0
    this.onTakeDamage = null;  // callback() fired every time damage is taken
    this._build();
  }

  // ── Build ──────────────────────────────────────────────────────────────────
  _build() {
    // Pill background
    this._bg = new PIXI.Graphics();
    this.addChild(this._bg);

    // Morale icon sprite
    const moraleTex  = PIXI.Texture.from(moraleIconUrl);
    this._icon        = new PIXI.Sprite(moraleTex);
    this._icon.anchor.set(0.5);
    this._icon.x      = -62;
    this._icon.y      = 0;
    this._icon.width  = 90;
    this._icon.height = 90;
    this.addChild(this._icon);

    // Number
    this._style = new PIXI.TextStyle({
      fontFamily:       'Georgia, serif',
      fontSize:         42,
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
    this._label.x = 16;
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
    g.drawRoundedRect(-70, -30, 140, 60, 18);
    g.endFill();
    g.lineStyle(2, flash ? 0xff6666 : 0x554466, 0.9);
    g.drawRoundedRect(-70, -30, 140, 60, 18);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  get morale() { return this._morale; }

  /** Subtract 1 from morale and play a red flash animation. */
  takeDamage() {
    this._morale = Math.max(0, this._morale - 1);
    this._label.text = String(this._morale);

    // Red tint on icon when low
    this._icon.tint = this._morale <= 10 ? 0xff4444 : 0xffffff;

    this._flashAndBounce(true);
    this.onTakeDamage?.();

    if (this._morale === 0) this.onDepleted?.();
  }

  /**
   * Subtract n from morale in one go (single flash).
   * @param {number}  n           - Amount to subtract
   * @param {boolean} fromRations - true: amber "ration bleed" style instead of red
   */
  takeDamageMulti(n, fromRations = false) {
    if (n <= 0) return;
    this._morale = Math.max(0, this._morale - n);
    this._label.text = String(this._morale);
    this._icon.tint = this._morale <= 10 ? 0xff4444 : 0xffffff;

    if (fromRations) {
      this._flashRationBleed(n);
    } else {
      this._flashAndBounce(true);
    }
    this.onTakeDamage?.();
    if (this._morale === 0) this.onDepleted?.();
  }

  /**
   * Amber/orange flash used when morale is spent to fund rations.
   * Shows a floating "Ration cost −N" label rising from the pill.
   */
  _flashRationBleed(n) {
    // Amber pill flash
    const g = this._bg;
    g.clear();
    g.beginFill(0x78350f, 0.9);
    g.drawRoundedRect(-70, -30, 140, 60, 18);
    g.endFill();
    g.lineStyle(2, 0xf59e0b, 1);
    g.drawRoundedRect(-70, -30, 140, 60, 18);

    let elapsed = 0;
    const ticker = PIXI.Ticker.shared;
    const onTick = dt => {
      elapsed += (dt / 60) * 1000;
      if (elapsed >= 1200) { this._drawBg(false); ticker.remove(onTick); }
    };
    ticker.add(onTick);

    // Bounce
    this.scale.set(1.22);
    const start  = performance.now();
    const bounce = () => {
      const t = Math.min(1, (performance.now() - start) / 700);
      this.scale.set(1.22 - 0.22 * t);
      if (t < 1) requestAnimationFrame(bounce);
    };
    requestAnimationFrame(bounce);

    // Floating "Ration −N" label in amber
    const style = new PIXI.TextStyle({
      fontFamily:  'Georgia, serif',
      fontSize:    17,
      fontWeight:  'bold',
      fill:        0xfbbf24,
      dropShadow:  true,
      dropShadowColor:    0x000000,
      dropShadowDistance: 2,
      dropShadowBlur:     3,
    });
    const label = new PIXI.Text(`Rations -${n} ♥`, style);
    label.anchor.set(0.5);
    label.x = 0;
    label.y = -30;
    label.alpha = 1;
    this.addChild(label);

    const DURATION = 1200;
    const RISE     = 70;
    const begin    = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - begin) / DURATION);
      label.y     = -30 - RISE * t;
      label.alpha = 1 - t;
      if (t < 1) { requestAnimationFrame(tick); }
      else        { this.removeChild(label); label.destroy(); }
    };
    requestAnimationFrame(tick);
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
      g.drawRoundedRect(-70, -30, 140, 60, 18);
      g.endFill();
      g.lineStyle(2, 0x4ade80, 0.9);
      g.drawRoundedRect(-70, -30, 140, 60, 18);
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
