import * as PIXI from 'pixi.js';

const MAX_RATIONS = 10;

export class RationsDisplay extends PIXI.Container {
  constructor() {
    super();
    this._maxThisTurn = 1;   // grows by 1 each turn, capped at MAX_RATIONS
    this._rations     = 1;   // current spendable rations this turn
    this._build();
  }

  _build() {
    // Pill background
    this._bg = new PIXI.Graphics();
    this.addChild(this._bg);

    // Icon
    const iconStyle = new PIXI.TextStyle({
      fontFamily: 'serif',
      fontSize:   18,
      fill:       0xfbbf24,
    });
    this._icon = new PIXI.Text('⚡', iconStyle);
    this._icon.anchor.set(0.5);
    this._icon.x = -28;
    this._icon.y = 0;
    this.addChild(this._icon);

    // Number label  e.g. "3 / 10"
    this._style = new PIXI.TextStyle({
      fontFamily:       'Georgia, serif',
      fontSize:         18,
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
    this._label.x = 10;
    this._label.y = 0;
    this.addChild(this._label);

    this._drawBg(false);
  }

  _text() {
    return `${this._rations} / ${this._maxThisTurn}`;
  }

  _drawBg(flash) {
    const g = this._bg;
    g.clear();
    g.beginFill(flash ? 0x78350f : 0x1c1a10, 0.82);
    g.drawRoundedRect(-52, -16, 104, 32, 10);
    g.endFill();
    g.lineStyle(1.2, flash ? 0xfcd34d : 0x92400e, 0.9);
    g.drawRoundedRect(-52, -16, 104, 32, 10);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  get rations() { return this._rations; }

  /** Called at the start of each new turn for this side.
   *  Increases the per-turn maximum by 1 (up to MAX_RATIONS)
   *  and refills current rations to that new maximum.
   */
  nextTurn() {
    if (this._maxThisTurn < MAX_RATIONS) this._maxThisTurn++;
    this._rations = this._maxThisTurn;   // always refill to max, ignoring leftover
    this._label.text = this._text();
    this._flash();
  }

  /** Deduct cost from current rations. */
  spend(n) {
    this._rations = Math.max(0, this._rations - n);
    this._label.text = this._text();
  }

  /** Add extra rations available this turn only (doesn't affect next-turn max). */
  gainThisTurn(n) {
    this._rations += n;
    this._label.text = this._text();
    this._flash();
  }

  _flash() {
    this._drawBg(true);
    let elapsed  = 0;
    const ticker = PIXI.Ticker.shared;
    const onTick = dt => {
      elapsed += (dt / 60) * 1000;
      if (elapsed >= 500) {
        this._drawBg(false);
        ticker.remove(onTick);
      }
    };
    ticker.add(onTick);

    // Small bounce
    this.scale.set(1.18);
    const start = performance.now();
    const tick  = () => {
      const t = Math.min(1, (performance.now() - start) / 280);
      this.scale.set(1.18 - 0.18 * t);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
