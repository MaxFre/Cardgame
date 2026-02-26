/**
 * CardPreview — fixed-position card detail panels.
 *
 * Panel A (left side): enlarged CardView shown at a fixed screen position.
 * Panel B (bottom centre): card name + description text box.
 *
 * Off-screen incubation: every preloaded node lives at x=-99999 so PIXI
 * renders it every frame and all async texture/text callbacks settle before
 * the player ever hovers, eliminating flicker and layout jumps.
 */

import * as PIXI from 'pixi.js';
import { CardView, CARD_W, CARD_H } from './CardView.js';
import descBoxSrc from '../assets/onFieldEffects/DescriptionBox.png';

// ── Panel A constants ──────────────────────────────────────────────────────
const PREVIEW_SCALE = 2.0;
const PW            = CARD_W * PREVIEW_SCALE;   // 256
const PH            = CARD_H * PREVIEW_SCALE;   // 384
const OFFSCREEN_X   = -99999;

// ── Panel B constants ──────────────────────────────────────────────────────
const DESC_W  = 600;
const DESC_H  = 220;

let _app         = null;
let _current     = null;   // currently visible previewNode (Panel A)
let _descPanel   = null;   // Panel B container (permanent, text updated on hover)
let _descName    = null;
let _descBody    = null;
let _showTimer   = null;
let _hideTimer   = null;
const SHOW_DELAY_MS = 400;
const HIDE_DELAY_MS = 120;   // debounce: ignore transient pointerout from card lift/scale

export const CardPreview = {
  isDragging: false,

  init(app) {
    _app = app;
    app.stage.sortableChildren = true;
    _buildDescPanel(app);
  },

  /**
   * Build the Panel A node for `cardView` once and park it off-screen.
   * Call this when arming the card (not on hover).
   */
  preload(cardView) {
    if (cardView._previewNode) return;
    const snap = cardView._previewSnap;
    if (!snap) return;

    const wrapper = new PIXI.Container();
    wrapper.zIndex     = 9000;
    wrapper.eventMode  = 'none';
    wrapper.sortableChildren = true;

    // Gold border background
    const pad = 10;
    const bg  = new PIXI.Graphics();
    bg.beginFill(0x1a1208, 0.82);
    bg.lineStyle(2, 0xffd700, 0.7);
    bg.drawRoundedRect(-PW / 2 - pad, -PH / 2 - pad, PW + pad * 2, PH + pad * 2, 12);
    bg.endFill();
    bg.zIndex = 0;

    const card = new CardView(snap);
    card.scale.set(PREVIEW_SCALE);
    card.x = 0;
    card.y = 0;
    card.zIndex = 1;
    _sharpText(card, PREVIEW_SCALE);

    wrapper.addChild(bg);
    wrapper.addChild(card);

    // Park off-screen so PIXI resolves textures/fonts before first show
    wrapper.x       = 0;
    wrapper.y       = 0;
    wrapper.alpha   = 0;      // transparent during incubation so nothing visible on screen
    wrapper.visible = true;   // must be visible so PIXI processes textures/fonts
    wrapper._ready  = false;
    wrapper._snap   = snap;   // keep snap reference for Panel B text

    _app.stage.addChild(wrapper);
    cardView._previewNode = wrapper;

    // After 5 ticks textures/fonts are settled — hide until actually needed
    let frames = 5;
    const tick = () => {
      if (--frames > 0) { _app.ticker.addOnce(tick); return; }
      wrapper._ready   = true;
      wrapper.visible  = false;  // hide until hover — zero render cost
      wrapper.alpha    = 1;      // restore alpha for when it becomes visible
    };
    _app.ticker.addOnce(tick);
  },

  show(cardView) {
    if (this.isDragging || !_app) return;
    clearTimeout(_hideTimer);   // cancel any pending hide
    clearTimeout(_showTimer);
    _showTimer = setTimeout(() => this._doShow(cardView), SHOW_DELAY_MS);
  },

  _doShow(cardView) {
    if (this.isDragging || !_app) return;
    const node = cardView._previewNode;
    if (!node || !node._ready) return;

    // Hide previous node
    if (_current && _current !== node) _current.visible = false;
    _current = node;

    // ── Panel A: fixed left side, vertically centred ───────────────────
    const sw = _app.screen.width, sh = _app.screen.height;
    node.x       = sw * 0.18;
    node.y       = sh / 2;
    node.visible = true;

    // ── Panel B: update description text and show ──────────────────────
    const snap = node._snap ?? {};
    _descName.text = snap.name ?? '';
    _descBody.text = snap.description ?? '';
    _positionDescPanel();
    _descPanel.visible = true;
  },

  hide() {
    clearTimeout(_showTimer);
    clearTimeout(_hideTimer);
    _hideTimer = setTimeout(() => {
      if (_current) { _current.visible = false; _current = null; }
      if (_descPanel) _descPanel.visible = false;
    }, HIDE_DELAY_MS);
  },
};

// ── Build the permanent Panel B ────────────────────────────────────────────
function _buildDescPanel(app) {
  _descPanel = new PIXI.Container();
  _descPanel.zIndex    = 9001;
  _descPanel.eventMode = 'none';
  _descPanel.visible   = false;

  // DescriptionBox.png as the backdrop — scaled to fill DESC_W × DESC_H
  const descBoxTex = PIXI.Texture.from(descBoxSrc);
  const bg = new PIXI.Sprite(descBoxTex);
  bg.anchor.set(0);
  const applyBgSize = () => {
    bg.width  = DESC_W;
    bg.height = DESC_H;
  };
  if (descBoxTex.baseTexture.valid) applyBgSize();
  else descBoxTex.baseTexture.once('loaded', applyBgSize);
  _descPanel.addChild(bg);

  _descName = new PIXI.Text('', new PIXI.TextStyle({
    fontFamily:         'Georgia, serif',
    fontSize:           28,
    fontWeight:         'bold',
    fill:               [0xfffbe8, 0xffd700, 0xc8860a],
    fillGradientType:   PIXI.TEXT_GRADIENT.LINEAR_VERTICAL,
    stroke:             0x1a0d00,
    strokeThickness:    5,
    dropShadow:         true,
    dropShadowColor:    0x000000,
    dropShadowBlur:     8,
    dropShadowDistance: 2,
    dropShadowAlpha:    0.9,
  }));
  _descName.x = DESC_W / 2;
  _descName.y = 28;
  _descName.anchor.set(0.5, 0);
  _descPanel.addChild(_descName);

  _descBody = new PIXI.Text('', new PIXI.TextStyle({
    fontFamily:         'Georgia, serif',
    fontSize:           20,
    fontStyle:          'italic',
    fill:               0xf5ead8,
    stroke:             0x1a0d00,
    strokeThickness:    3,
    dropShadow:         true,
    dropShadowColor:    0x000000,
    dropShadowBlur:     6,
    dropShadowDistance: 1,
    dropShadowAlpha:    0.85,
    wordWrap:           true,
    wordWrapWidth:      DESC_W - 80,
    align:              'center',
    lineHeight:         26,
  }));
  _descBody.x = DESC_W / 2;
  _descBody.y = 80;
  _descBody.anchor.set(0.5, 0);
  _descPanel.addChild(_descBody);

  app.stage.addChild(_descPanel);
  window.addEventListener('resize', _positionDescPanel);
}

function _positionDescPanel() {
  if (!_descPanel || !_app) return;
  const sw = _app.screen.width, sh = _app.screen.height;
  // Centre horizontally, fully above the bottom edge
  _descPanel.x = sw / 2 - DESC_W / 2;
  _descPanel.y = sh - DESC_H - 16;
}

/** Recursively sharpen PIXI.Text resolution for a given scale. */
function _sharpText(node, scale) {
  if (node instanceof PIXI.Text) {
    node.resolution = scale * (window.devicePixelRatio || 1);
  }
  if (node.children) node.children.forEach(c => _sharpText(c, scale));
}
