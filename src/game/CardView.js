import * as PIXI from 'pixi.js';
import cardSrc         from '../assets/cards/EmptyCard.png';
import fieldFrameSrc   from '../assets/cards/OnFieldFrame.png';
import spellCardSrc    from '../assets/cards/SpellCardEmptyFrame.png';
import cardBackSrc     from '../assets/cards/CardBack.png';
import iconFolkSrc     from '../assets/cards/Icons/FolkIcon.png';
import iconMagicalSrc  from '../assets/cards/Icons/MagicalIcon.png';
import iconWildSrc     from '../assets/cards/Icons/WildIcon.png';
import rationIconSrc   from '../assets/onFieldEffects/RationIcon.png';

export const CARD_W = 128;
export const CARD_H = 192;

// Stat label offsets from card centre — hand view (minion cards)
export let ATTACK_OFFSET       = { x: -15, y: 46 };
export let HEALTH_OFFSET       = { x:  14, y: 46 };
export let NAME_OFFSET         = { x:   0, y: -81 };
export let MANA_OFFSET         = { x: -50, y: -83 };
export let FACTION_OFFSET      = { x:   0, y: -65 };

// Ration icon badge (sits behind the mana number) — mutated by main.js from layout.json
export let RATION_ICON_OFFSET       = { x: -50, y: -83 };
export const RATION_ICON_CFG        = { size: 36 };

// Stat label offsets specifically for spell cards in hand view.
// Independent from minion offsets so the editor can position them separately.
export let SPELL_NAME_OFFSET        = { x:   0, y: -81 };
export let SPELL_MANA_OFFSET        = { x: -50, y: -83 };
export let SPELL_RATION_ICON_OFFSET = { x: -50, y: -83 };
// Stat label offsets from card centre — field view (defaults same, overridden by editor layout)
export let FIELD_ATTACK_OFFSET      = { x: -15, y: 46 };
export let FIELD_HEALTH_OFFSET      = { x:  14, y: 46 };
export let FIELD_FACTION_OFFSET     = { x:   0, y: -65 };
export let FIELD_RATION_ICON_OFFSET = { x: -50, y: -83 };

// Art window in game-scale coords (relative to top-left of card)
// Mutable so main.js can apply the saved hand-art-box from the editor
// Helpers that read the box at call-time
function artCX(box) { return box.x + box.w / 2 - CARD_W / 2; }
function artCY(box) { return box.y + box.h / 2 - CARD_H / 2; }

// Circle mask constants for field frame (game scale 128×192, relative to anchor 0.5)
// PNG circle at 1024×1536: cx=512, cy=624, r=354  →  ÷4 at 256×384 editor → cx=128, cy=156, r=89  →  ÷2 game scale
// Exported as an object so main.js can mutate .cx/.cy/.r after loading layout.json
export const FIELD_CIRCLE = { cx: 0, cy: -18, r: 44 };

// Faction icon size (game scale). Mutated by main.js from saved editor value.
export const FACTION_ICON_CFG = { size: 28 };

// Separate art-window boxes for minion cards and spell cards (hand mode).
// main.js mutates these after loading layout.json.
export const HAND_ART_BOX  = { x: 7, y: 21, w: 114, h: 116 };
export const SPELL_ART_BOX = { x: 7, y: 21, w: 114, h: 116 };

// Glow config — populated by configureGlow() called from main.js after loading layout.json
let _glowConfig = { highlight: 0xffd700, buff: 0x22ee66, damage: 0xff3333, inset: 0, width: 1 };

export function configureGlow(colors, inset, width) {
  const hex = s => parseInt((s || '').replace('#', ''), 16);
  _glowConfig = {
    highlight: hex(colors?.highlight) || 0xffd700,
    buff:      hex(colors?.buff)      || 0x22ee66,
    damage:    hex(colors?.damage)    || 0xff3333,
    inset:     (inset ?? 0) / 2,   // editor scale → game scale
    width:     width ?? 1,
  };
}

const cardTexture       = PIXI.Texture.from(cardSrc);
const spellCardTexture  = PIXI.Texture.from(spellCardSrc);
const fieldFrameTexture = PIXI.Texture.from(fieldFrameSrc);
const backTexture       = PIXI.Texture.from(cardBackSrc);

export class CardView extends PIXI.Container {
  constructor(card) {
    super();
    this.card = card;
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.sortableChildren = true;
    this._draw();
  }

  _draw() {    this._isField = false;  // set true by useFieldFrame() — read by art loaded callback
    // ── Art layer (behind frame) ──────────────────────────────────────────────
    if (this.card.artDataUrl) {
      const artContainer = new PIXI.Container();
      artContainer.zIndex = 0;
      this._artContainer = artContainer;

      // Choose art box based on card type
      const _isSpell = this.card.type === 'spell';
      const artBox = _isSpell ? SPELL_ART_BOX : HAND_ART_BOX;

      const mask = new PIXI.Graphics();
      mask.beginFill(0xffffff);
      mask.drawRect(artBox.x - CARD_W / 2, artBox.y - CARD_H / 2, artBox.w, artBox.h);
      mask.endFill();
      artContainer.mask = mask;
      artContainer.addChild(mask);
      this._artMask = mask;

      const artTexture = PIXI.Texture.from(this.card.artDataUrl);
      // Enable mipmaps so large source images downsample cleanly at game scale
      artTexture.baseTexture.mipmap    = PIXI.MIPMAP_MODES.ON;
      artTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
      const artSprite  = new PIXI.Sprite(artTexture);
      artSprite.anchor.set(0.5);
      this._artSprite  = artSprite;
      this._artTexture = artTexture;

      // Solid background so transparent pixels in the art don't show the board through
      const artBg = new PIXI.Graphics();
      artBg.beginFill(0x111111, 1);
      artBg.drawRect(artBox.x - CARD_W / 2, artBox.y - CARD_H / 2, artBox.w, artBox.h);
      artBg.endFill();
      artContainer.addChild(artBg);
      this._artBg = artBg;

      // Use a lambda that reads _isField at call-time so it still works
      // correctly when useFieldFrame() is called before the texture loads.
      const applyArt = () => this._reapplyArt(this._isField);

      if (artTexture.baseTexture.valid) applyArt();
      else artTexture.baseTexture.once('loaded', applyArt);

      artContainer.addChild(artSprite);
      this.addChild(artContainer);
    }

    // ── Card frame ────────────────────────────────────────────────────────────
    // Spell cards use SpellCardEmptyFrame; minions use EmptyCard
    const _isSpell     = this.card.type === 'spell';
    const _handTexture = _isSpell ? spellCardTexture : cardTexture;
    this._sprite = new PIXI.Sprite(_handTexture);
    this._sprite.anchor.set(0.5);
    this._sprite.zIndex = 1;

    // Apply dimensions once the texture is confirmed loaded.
    // If it's already loaded (cache hit) do it immediately, otherwise wait.
    const applySize = () => {
      this._sprite.width  = CARD_W;
      this._sprite.height = CARD_H;
    };
    if (_handTexture.baseTexture.valid) {
      applySize();
    } else {
      _handTexture.baseTexture.once('loaded', applySize);
    }

    this.addChild(this._sprite);

    // ── Stat labels ───────────────────────────────────────────────────────────
    const baseStatStyle = {
      fontFamily:      '"Cinzel", serif',
      fontSize:        14,   // editor 28px ÷ 2
      fontWeight:      '700',
      fill:            0xffffff,
      stroke:          0x000000,
      strokeThickness: 3,   // editor 5 ÷ 2
      dropShadow:      true,
      dropShadowDistance: 0,
      dropShadowBlur:  5,   // editor 10 ÷ 2
      dropShadowAlpha: 0.9,
    };
    const attackStyle  = new PIXI.TextStyle({ ...baseStatStyle, dropShadowColor: 0xf97316 });
    const healthStyle  = new PIXI.TextStyle({ ...baseStatStyle, dropShadowColor: 0xef4444 });
    const manaStyle    = new PIXI.TextStyle({ ...baseStatStyle, dropShadowColor: 0xf59e0b });

    // Name label — Georgia serif, gold gradient fill (matches editor)
    const nameStyle = new PIXI.TextStyle({
      fontFamily:       '"Cinzel", serif',
      fontSize:         12,   // editor 24px ÷ 2
      fontWeight:       '700',
      fill:             [0xffe98a, 0xffd700, 0xc8860a],
      fillGradientType: PIXI.TEXT_GRADIENT.LINEAR_VERTICAL,
      stroke:           0x000000,
      strokeThickness:  2,   // editor 4 ÷ 2
      dropShadow:       true,
      dropShadowDistance: 1,
      dropShadowAngle:  Math.PI / 2,
      dropShadowBlur:   3,   // editor 6 ÷ 2
      dropShadowColor:  0x000000,
      dropShadowAlpha:  0.85,
      wordWrap:         true,
      wordWrapWidth:    95,  // editor 190 ÷ 2
      align:            'center',
    });
    this._nameLabel = new PIXI.Text(this.card.name || '', nameStyle);
    this._nameLabel.anchor.set(0.5);
    this._nameLabel.x      = _isSpell ? SPELL_NAME_OFFSET.x : NAME_OFFSET.x;
    this._nameLabel.y      = _isSpell ? SPELL_NAME_OFFSET.y : NAME_OFFSET.y;
    this._nameLabel.zIndex = 2;
    this.addChild(this._nameLabel);

    // Ration icon badge — sits behind the mana number
    const _rationTex = PIXI.Texture.from(rationIconSrc);
    this._rationIcon = new PIXI.Sprite(_rationTex);
    this._rationIcon.anchor.set(0.5);
    const applyRationSize = () => {
      this._rationIcon.width  = RATION_ICON_CFG.size;
      this._rationIcon.height = RATION_ICON_CFG.size;
    };
    if (_rationTex.baseTexture.valid) applyRationSize();
    else _rationTex.baseTexture.once('loaded', applyRationSize);
    this._rationIcon.x      = _isSpell ? SPELL_RATION_ICON_OFFSET.x : RATION_ICON_OFFSET.x;
    this._rationIcon.y      = _isSpell ? SPELL_RATION_ICON_OFFSET.y : RATION_ICON_OFFSET.y;
    this._rationIcon.zIndex = 1;  // behind mana label (zIndex 2)
    this.addChild(this._rationIcon);

    // Mana label
    this._manaLabel = new PIXI.Text(String(this.card.manaCost ?? 0), manaStyle);
    this._manaLabel.anchor.set(0.5);
    this._manaLabel.x      = _isSpell ? SPELL_MANA_OFFSET.x : MANA_OFFSET.x;
    this._manaLabel.y      = _isSpell ? SPELL_MANA_OFFSET.y : MANA_OFFSET.y;
    this._manaLabel.zIndex = 2;
    this.addChild(this._manaLabel);

    // Faction icon — replaces the old text + pill
    const FACTION_ICONS = { Folk: iconFolkSrc, Magical: iconMagicalSrc, Wild: iconWildSrc };
    const iconSrc = FACTION_ICONS[this.card.faction] ?? iconFolkSrc;
    const iconBase = PIXI.BaseTexture.from(iconSrc, {
      scaleMode: PIXI.SCALE_MODES.LINEAR,
      mipmap:    PIXI.MIPMAP_MODES.ON,
    });
    const iconTex = new PIXI.Texture(iconBase);
    this._factionIcon = new PIXI.Sprite(iconTex);
    this._factionIcon.anchor.set(0.5);
    this._factionIcon.roundPixels = false;
    const applyIconSize = () => {
      this._factionIcon.width  = FACTION_ICON_CFG.size;
      this._factionIcon.height = FACTION_ICON_CFG.size;
    };
    if (iconTex.baseTexture.valid) applyIconSize();
    else iconTex.baseTexture.once('loaded', applyIconSize);
    this._factionIcon.x       = FACTION_OFFSET.x;
    this._factionIcon.y       = FACTION_OFFSET.y;
    this._factionIcon.zIndex  = 2;
    this._factionIcon.visible = this.card.type !== 'spell';
    this.addChild(this._factionIcon);

    // Attack — sits in the gray circle (bottom-left)
    this._baseAttack  = this.card.attack;   // baseline for buff/debuff tinting
    this._attackStyle = attackStyle;        // kept so setAttack() can mutate fill
    this._attackLabel = new PIXI.Text(String(this.card.attack), attackStyle);
    this._attackLabel.anchor.set(0.5);
    this._attackLabel.x       = ATTACK_OFFSET.x;
    this._attackLabel.y       = ATTACK_OFFSET.y;
    this._attackLabel.zIndex  =  2;
    this._attackLabel.visible =  true;
    this.addChild(this._attackLabel);

    // Health — sits in the red circle (bottom-right)
    this._maxHealth   = this.card.health;   // baseline for damage tinting
    this._healthStyle = healthStyle;        // kept so setHealth() can mutate fill
    this._healthLabel = new PIXI.Text(String(this.card.health), healthStyle);
    this._healthLabel.anchor.set(0.5);
    this._healthLabel.x       = HEALTH_OFFSET.x;
    this._healthLabel.y       = HEALTH_OFFSET.y;
    this._healthLabel.zIndex  =  2;
    this._healthLabel.visible =  true;
    this.addChild(this._healthLabel);

    // Spells have no attack or health — hide those labels
    if (this.card.type === 'spell') {
      this._attackLabel.visible = false;
      this._healthLabel.visible = false;
    }

    // Highlight overlay (invisible by default)
    this._glow = new PIXI.Graphics();
    this._glow.zIndex = 3;
    this._glow.filters = [new PIXI.BlurFilter(1.8, 4)];
    this._setGlow(false);
    this.addChild(this._glow);

  }

  _reapplyArt(isField) {
    const spr = this._artSprite;
    const tex = this._artTexture;
    if (!spr || !tex) return;
    const iw = tex.width, ih = tex.height;
    if (!iw || !ih) return;

    if (isField) {
      // Circle crop window: diameter = FIELD_CIRCLE.r * 2
      const diam = FIELD_CIRCLE.r * 2;
      const baseScale  = Math.max(diam / iw, diam / ih);
      const totalScale = baseScale * (this.card.fieldArtZoom ?? this.card.artZoom ?? 1);
      spr.width  = iw * totalScale;
      spr.height = ih * totalScale;
      const off = this.card.fieldArtOffset ?? this.card.artOffset ?? { x: 0, y: 0 };
      spr.x = FIELD_CIRCLE.cx + off.x / 2;
      spr.y = FIELD_CIRCLE.cy + off.y / 2;
    } else {
      const artBox = this.card.type === 'spell' ? SPELL_ART_BOX : HAND_ART_BOX;
      const baseScale  = Math.max(artBox.w / iw, artBox.h / ih);
      const totalScale = baseScale * (this.card.artZoom ?? 1);
      spr.width  = iw * totalScale;
      spr.height = ih * totalScale;
      const off = this.card.artOffset ?? { x: 0, y: 0 };
      spr.x = artCX(artBox) + off.x / 2;
      spr.y = artCY(artBox) + off.y / 2;
    }
  }

  /** Draw a faction pill background centred at (0,0) on the given Graphics object */
  _drawFactionPill(g, color, label) {
    // Approximate text width: Impact 9px ≈ 5px/char at game scale
    const approxW = Math.max(label.length * 5, 20);
    const padX = 5, padH = 11;  // editor: padX=12, padH=30 → ÷2
    const bw = approxW + padX * 2, bh = padH;
    const bx = -bw / 2, by = -bh / 2;
    const r  = bh / 2;
    g.clear();
    g.beginFill(color, 0.27);
    g.lineStyle(1, color, 1);  // editor lineWidth=2 → 1
    g.drawRoundedRect(bx, by, bw, bh, r);
    g.endFill();
  }

  // Return per-event glow colours + ring inset + width from the file-based config
  static _loadGlowColors() {
    return { ..._glowConfig };
  }

  // Shared glow ring painter — adapts to hand (rounded rect) vs field (circle)
  _drawGlowRings(color) {
    const g = this._glow;
    const { inset: k, width: w } = CardView._loadGlowColors();
    const opt = (width, alpha) => ({ width: width * w, color, alpha, join: PIXI.LINE_JOIN.ROUND, cap: PIXI.LINE_CAP.ROUND });

    if (this._isField) {
      // Circle glow matching the OnFieldFrame circular art window
      const { cx, cy, r } = FIELD_CIRCLE;
      const effR = Math.max(1, r - k);
      g.lineStyle(opt(2, 1.0));
      g.drawCircle(cx, cy, effR);
      g.lineStyle(opt(4, 0.55));
      g.drawCircle(cx, cy, Math.max(1, effR - 1));
      g.lineStyle(opt(7, 0.22));
      g.drawCircle(cx, cy, Math.max(1, effR - 3));
    } else {
      // Rounded rect glow for hand cards
      const bx = -CARD_W / 2 + k, by = -CARD_H / 2 + k;
      const bw = CARD_W - k * 2,  bh = CARD_H - k * 2;
      const r  = Math.max(2, 8 - k * 0.4);
      g.lineStyle(opt(2, 1.0));
      g.drawRoundedRect(bx, by, bw, bh, r);
      g.lineStyle(opt(4, 0.55));
      g.drawRoundedRect(bx + 1, by + 1, bw - 2, bh - 2, Math.max(1, r - 1));
      g.lineStyle(opt(7, 0.22));
      g.drawRoundedRect(bx + 3, by + 3, bw - 6, bh - 6, Math.max(1, r - 2));
    }
    g.lineStyle(0);
  }

  _setGlow(on) {
    const g = this._glow;
    g.clear();
    if (on) this._drawGlowRings(CardView._loadGlowColors().highlight);
  }

  setHighlight(on) {
    this._setGlow(on);
    this._sprite.tint = 0xffffff;
  }

  /**
   * Show a coloured targeting glow + multiplier badge on this card.
   * mult > 1 → green + "2×", mult < 1 → red + "½×", null/1 → clear.
   */
  setTargetGlow(mult, badgeLabel = null) {
    // Avoid rebuilding PIXI objects when the displayed value hasn't changed.
    if (mult === this._currentTargetMult && !badgeLabel) return;
    this._currentTargetMult = mult;

    const g = this._glow;
    g.clear();
    if (this._targetBadge) { this.removeChild(this._targetBadge); this._targetBadge = null; }
    if (!mult || mult === 0) return;

    const isGood  = mult > 0;
    const gc      = CardView._loadGlowColors();
    const color   = isGood ? gc.buff : gc.damage;
    const label   = badgeLabel ?? (isGood ? '+1' : '-1');

    // Layered coloured border glow (tight, inward)
    this._drawGlowRings(color);

    // Badge pill
    const badge = new PIXI.Container();
    badge.zIndex = 10;

    const pill = new PIXI.Graphics();
    const bw = 26, bh = 14, br = 7;
    pill.beginFill(color, 0.85);
    pill.drawRoundedRect(-bw / 2, -bh / 2, bw, bh, br);
    pill.endFill();
    badge.addChild(pill);

    const txt = new PIXI.Text(label, new PIXI.TextStyle({
      fontFamily:      '"Cinzel", serif',
      fontSize:        10,
      fontWeight:      '700',
      fill:            0xffffff,
      stroke:          0x000000,
      strokeThickness: 2,
    }));
    txt.anchor.set(0.5);
    badge.addChild(txt);

    // Centre of card
    badge.x = 0;
    badge.y = 0;
    this.addChild(badge);
    this._targetBadge = badge;
  }

  /** Update attack value — green when buffed above base, red when debuffed below base */
  setAttack(value) {
    this.card.attack = value;
    if (this._attackLabel) {
      this._attackLabel.text = String(value);
      const base = this._baseAttack;
      if (value > base) {
        this._attackStyle.fill             = 0x44ff88;
        this._attackStyle.dropShadowColor  = 0x006622;
      } else if (value < base) {
        this._attackStyle.fill             = 0xff4444;
        this._attackStyle.dropShadowColor  = 0x880000;
      } else {
        this._attackStyle.fill             = 0xffffff;
        this._attackStyle.dropShadowColor  = 0xf97316;
      }
    }
  }

  /** Update HP value and tint the label red when damaged */
  setHealth(value) {
    this.card.health = value;
    if (this._healthLabel) {
      this._healthLabel.text = String(value);
      const damaged = value < this._maxHealth;
      this._healthStyle.fill        = damaged ? 0xff3333 : 0xffffff;
      this._healthStyle.dropShadowColor = damaged ? 0x880000 : 0xef4444;
    }
  }

  useFieldFrame() {
    this._isField = true;   // flag read by the art loaded callback
    this._sprite.texture = fieldFrameTexture;
    // Glow renders behind the frame in field mode (between art layer and frame layer)
    this._glow.zIndex = 0.5;
    this.sortChildren();
    const applySize = () => {
      this._sprite.width  = CARD_W;
      this._sprite.height = CARD_H;
    };
    if (fieldFrameTexture.baseTexture.valid) applySize();
    else fieldFrameTexture.baseTexture.once('loaded', applySize);

    // Hide hand-only labels
    if (this._nameLabel)    this._nameLabel.visible    = false;
    if (this._manaLabel)    this._manaLabel.visible    = false;
    if (this._rationIcon)   this._rationIcon.visible   = false;

    // Show faction icon at field-specific position (not for spells)
    if (this._factionIcon) {
      this._factionIcon.visible = this.card.type !== 'spell';
      this._factionIcon.x = FIELD_FACTION_OFFSET.x;
      this._factionIcon.y = FIELD_FACTION_OFFSET.y;
    }

    // Re-show everything that useBackFace() may have hidden
    if (this._artContainer) this._artContainer.visible = true;
    // Spells have no attack/health — keep them hidden
    const isSpell = this.card.type === 'spell';
    if (this._attackLabel)  this._attackLabel.visible  = !isSpell;
    if (this._healthLabel)  this._healthLabel.visible  = !isSpell;

    // Switch art mask from rectangle to circle matching the OnFieldFrame window
    if (this._artMask) {
      this._artMask.clear();
      this._artMask.beginFill(0xffffff);
      this._artMask.drawCircle(FIELD_CIRCLE.cx, FIELD_CIRCLE.cy, FIELD_CIRCLE.r);
      this._artMask.endFill();
    }

    // Re-apply art using field-specific offset / zoom
    this._reapplyArt(true);

    // Apply field-specific stat label positions
    if (this._attackLabel) {
      this._attackLabel.x = FIELD_ATTACK_OFFSET.x;
      this._attackLabel.y = FIELD_ATTACK_OFFSET.y;
    }
    if (this._healthLabel) {
      this._healthLabel.x = FIELD_HEALTH_OFFSET.x;
      this._healthLabel.y = FIELD_HEALTH_OFFSET.y;
    }
  }

  useBackFace() {
    // Reset scale before switching texture so no residual scale from the
    // previous texture (which has a different aspect ratio) bleeds through.
    this._sprite.scale.set(1, 1);
    this._sprite.texture = backTexture;
    const applySize = () => {
      this._sprite.width  = CARD_W;
      this._sprite.height = CARD_H;
    };
    if (backTexture.baseTexture.valid) applySize();
    else backTexture.baseTexture.once('loaded', applySize);
    this._attackLabel.visible  = false;
    this._healthLabel.visible  = false;
    if (this._nameLabel)    this._nameLabel.visible    = false;
    if (this._manaLabel)    this._manaLabel.visible    = false;
    if (this._factionIcon)  this._factionIcon.visible  = false;
    if (this._artContainer) this._artContainer.visible = false;
  }

  /**
   * Flip back to the hand (front) face — reverses useBackFace().
   */
  useFrontFace() {
    this._sprite.scale.set(1, 1);
    // Restore the correct frame depending on card type
    const _isSpell = this.card.type === 'spell';
    const _tex = _isSpell ? spellCardTexture : cardTexture;
    this._sprite.texture = _tex;
    // Glow returns to top layer in hand mode
    this._glow.zIndex = 3;
    this.sortChildren();
    const applySize = () => {
      this._sprite.width  = CARD_W;
      this._sprite.height = CARD_H;
    };
    if (_tex.baseTexture.valid) applySize();
    else _tex.baseTexture.once('loaded', applySize);
    // Restore spell-specific or minion label positions
    if (this._nameLabel) {
      this._nameLabel.x = _isSpell ? SPELL_NAME_OFFSET.x : NAME_OFFSET.x;
      this._nameLabel.y = _isSpell ? SPELL_NAME_OFFSET.y : NAME_OFFSET.y;
    }
    if (this._manaLabel) {
      this._manaLabel.x = _isSpell ? SPELL_MANA_OFFSET.x : MANA_OFFSET.x;
      this._manaLabel.y = _isSpell ? SPELL_MANA_OFFSET.y : MANA_OFFSET.y;
    }
    const isSpell = this.card.type === 'spell';
    this._attackLabel.visible  = !isSpell;
    this._healthLabel.visible  = !isSpell;
    if (this._nameLabel)    this._nameLabel.visible    = true;
    if (this._manaLabel)    this._manaLabel.visible    = true;
    if (this._factionIcon)  this._factionIcon.visible  = !isSpell;
    if (this._artContainer) this._artContainer.visible = true;
  }
}
