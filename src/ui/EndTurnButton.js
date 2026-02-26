import * as PIXI from 'pixi.js';
import { tweenTo } from '../game/Tween.js';

const BTN_W = 130;
const BTN_H = 46;
const RADIUS = 10;

const COLOR_IDLE    = 0xc8952a;
const COLOR_HOVER   = 0xe8b84b;
const COLOR_PRESSED = 0x9a6e18;
const COLOR_LOCKED  = 0x555555;

export class EndTurnButton extends PIXI.Container {
  constructor(onClick) {
    super();
    this._onClick  = onClick;
    this._locked   = false;
    this._hovered  = false;
    this._buildUI();
  }

  // ── Build ────────────────────────────────────────────────────────────────
  _buildUI() {
    this._bg = new PIXI.Graphics();
    this.addChild(this._bg);
    this._drawBg(COLOR_IDLE);

    // Border glow ring (always drawn, just alpha-faded when idle)
    this._ring = new PIXI.Graphics();
    this._ring.lineStyle(2, 0xfff0a0, 0.6);
    this._ring.drawRoundedRect(-BTN_W / 2 - 3, -BTN_H / 2 - 3, BTN_W + 6, BTN_H + 6, RADIUS + 3);
    this.addChild(this._ring);

    const style = new PIXI.TextStyle({
      fontFamily: 'Georgia, serif',
      fontSize: 17,
      fontWeight: 'bold',
      fill: 0xfff5d6,
      dropShadow: true,
      dropShadowDistance: 2,
      dropShadowColor: 0x000000,
      dropShadowAlpha: 0.7,
    });
    this._label = new PIXI.Text('End Turn', style);
    this._label.anchor.set(0.5);
    this._label.y = 0;
    this.addChild(this._label);

    // Interaction
    this.eventMode = 'static';
    this.cursor    = 'pointer';
    this.on('pointerover',  () => this._onHover(true));
    this.on('pointerout',   () => this._onHover(false));
    this.on('pointerdown',  () => this._onPress());
    this.on('pointerup',    () => this._onRelease());
    this.on('pointerupoutside', () => this._onRelease());
  }

  _drawBg(color) {
    const g = this._bg;
    g.clear();
    g.beginFill(color);
    g.lineStyle(2, 0x7a4a00, 0.9);
    g.drawRoundedRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, RADIUS);
    g.endFill();
  }

  // ── Interaction handlers ─────────────────────────────────────────────────
  _onHover(on) {
    if (this._locked) return;
    this._hovered = on;
    this._drawBg(on ? COLOR_HOVER : COLOR_IDLE);
    tweenTo(this.scale, { x: on ? 1.07 : 1, y: on ? 1.07 : 1 }, 120);
    this._ring.alpha = on ? 1 : 0.6;
  }

  _onPress() {
    if (this._locked) return;
    this._drawBg(COLOR_PRESSED);
    tweenTo(this.scale, { x: 0.95, y: 0.95 }, 80);
  }

  _onRelease() {
    if (this._locked) return;
    this._drawBg(this._hovered ? COLOR_HOVER : COLOR_IDLE);
    tweenTo(this.scale, { x: this._hovered ? 1.07 : 1, y: this._hovered ? 1.07 : 1 }, 80);
    this._onClick?.();
  }

  // ── Public API ───────────────────────────────────────────────────────────

  // Lock button during opponent's turn
  setLocked(locked) {
    this._locked = locked;
    this._drawBg(locked ? COLOR_LOCKED : COLOR_IDLE);
    this._label.text  = locked ? "Opponent's Turn" : 'End Turn';
    this.scale.set(1);
    this.cursor = locked ? 'default' : 'pointer';
    this._ring.alpha = locked ? 0.2 : 0.6;
  }
}
