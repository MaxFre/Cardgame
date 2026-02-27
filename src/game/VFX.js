// VFX — visual effects overlay for battlecry / spell animations.
// Mount one instance on top of the stage; call methods to play effects.
import * as PIXI from 'pixi.js';
import { tweenTo } from './Tween.js';
import { SoundManager } from './SoundManager.js';

function rand(min, max) { return min + Math.random() * (max - min); }

// Faction → summon color palette
const FACTION_COLORS = {
  Folk:    { ring: 0x44cc44, burst: 0x88ff66, flash: 0x66ff88 },
  Wild:    { ring: 0xff6600, burst: 0xff9900, flash: 0xffcc44 },
  Magical: { ring: 0x8844ff, burst: 0xcc66ff, flash: 0xaaddff },
};

// Convert a CSS hex string '#rrggbb' or number to a PIXI hex number
export function cssToHex(v) {
  if (typeof v === 'number') return v;
  return parseInt(String(v).replace('#', ''), 16);
}

export class VFX {
  /**
   * @param {PIXI.Application} app
   */
  constructor(app) {
    this._app = app;
    this.container = new PIXI.Container();
    // Must be added to stage by the caller (after all other layers).
    this._presetCache = null; // loaded vfx-presets.json
    // Sync faction→preset map and special preset map; populated on first _loadPresets() call.
    this._factionPresetsSync = {};
    this._specialPresetsSync = {};
    this._active = 0; // count of animations currently running
  }

  /**
   * Wrap a promise so _active is incremented while it runs.
   * All public animation methods should call this.
   */
  _track(promise) {
    this._active++;
    return promise.finally(() => { this._active = Math.max(0, this._active - 1); });
  }

  /**
   * Resolves when all tracked animations are done, or after maxMs, whichever comes first.
   */
  waitIdle(maxMs = 1500) {
    if (this._active === 0) return Promise.resolve();
    return new Promise(resolve => {
      const deadline = Date.now() + maxMs;
      const poll = () => {
        if (this._active === 0 || Date.now() >= deadline) resolve();
        else requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
  }

  /** Fetch vfx-presets.json once and cache it. */
  async _loadPresets() {
    if (this._presetCache) return this._presetCache;
    try {
      const res = await fetch('/CreatedCards/vfx-presets.json');
      if (res.ok) {
        this._presetCache = await res.json();
        // Update sync maps from file (more authoritative than localStorage)
        if (this._presetCache._factionPresets) {
          this._factionPresetsSync = this._presetCache._factionPresets;
        }
        if (this._presetCache._specialPresets) {
          this._specialPresetsSync = this._presetCache._specialPresets;
        }
      } else { this._presetCache = {}; }
    } catch { this._presetCache = {}; }
    return this._presetCache;
  }

  /**
   * Play a special preset (key = 'battlecry' | 'damageBolt' | 'moraleBolt')
   * at exact world coords. Returns true if a preset was found and played.
   */
  async _playSpecialPreset(key, wx, wy) {
    const presetId = this._specialPresetsSync[key];
    if (!presetId) return false;
    const all    = await this._loadPresets();
    const preset = all[presetId];
    if (!preset?.steps?.length) return false;
    await this.playCustomEffect(preset.steps, wx, wy);
    return true;
  }

  /** Sync check — true if a special preset ID is assigned for this key. */
  _hasSpecialPreset(key) {
    return !!(this._specialPresetsSync[key]);
  }

  /** Read bolt appearance config for 'damageBolt' or 'moraleBolt'. */
  _getBoltConfig(prefix) {
    const sp = this._specialPresetsSync;
    return {
      color:       sp[prefix + 'Color']       ? cssToHex(sp[prefix + 'Color'])        : null,
      size:        sp[prefix + 'Size']        ? Number(sp[prefix + 'Size'])            : null,
      speed:       sp[prefix + 'Speed']       ? Number(sp[prefix + 'Speed'])           : null,
      sprite:      sp[prefix + 'Sprite']      || null,
      spriteScale: sp[prefix + 'SpriteScale'] ? Number(sp[prefix + 'SpriteScale'])     : 1,
    };
  }

  /** Returns true if this faction has a custom summon preset assigned. Sync, no await. */
  hasFactionPreset(faction) {
    return !!(faction && this._factionPresetsSync[faction]);
  }

  /** Play the faction-default summon preset. Captures position before any await. */
  async playFactionPreset(faction, cardView) {
    if (!faction) return;
    const pos = cardView.toGlobal({ x: 0, y: 0 });
    const presets  = await this._loadPresets();
    const presetId = presets._factionPresets?.[faction];
    if (!presetId) return;
    const preset = presets[presetId];
    if (!preset?.steps?.length) return;
    return this._track(this.playCustomEffect(preset.steps, pos.x, pos.y));
  }

  async playPreset(name, cardView) {
    if (!name) return;
    const pos = cardView.toGlobal({ x: 0, y: 0 });
    const presets = await this._loadPresets();
    const preset  = presets[name];
    if (!preset?.steps?.length) return;
    return this._track(this.playCustomEffect(preset.steps, pos.x, pos.y));
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  /**
   * Clash impact animation played at the point two cards meet.
   * @param {number} wx  world x
   * @param {number} wy  world y
   * @param {number} [angle]  0-2π direction from attacker to target (for slash streaks)
   */
  async clashAt(wx, wy, angle = -Math.PI / 2) {
    // 1. Bright white flash disc
    const flash = new PIXI.Graphics();
    flash.beginFill(0xffffff, 0.92);
    flash.drawCircle(0, 0, 48);
    flash.endFill();
    flash.x = wx; flash.y = wy;
    this.container.addChild(flash);
    tweenTo(flash, { alpha: 0 }, 180).then(() => this._remove(flash));

    // 2. Four slash streaks forming an X cross at the impact point
    const SLASH_LEN = 90;
    for (let i = 0; i < 4; i++) {
      const a = angle + (i * Math.PI / 2) + rand(-0.18, 0.18);
      const streak = new PIXI.Graphics();
      streak.lineStyle(rand(2, 4), 0xffffff, 1);
      streak.moveTo(0, 0);
      streak.lineTo(Math.cos(a) * SLASH_LEN * rand(0.7, 1.3),
                    Math.sin(a) * SLASH_LEN * rand(0.7, 1.3));
      streak.x = wx; streak.y = wy;
      this.container.addChild(streak);
      tweenTo(streak, { alpha: 0 }, rand(180, 280)).then(() => this._remove(streak));
    }

    // 3. Radial spark burst — mix of white and warm yellow
    const sparks = [];
    for (let i = 0; i < 28; i++) {
      const a    = (i / 28) * Math.PI * 2 + rand(-0.25, 0.25);
      const dist = rand(40, 110);
      const col  = i % 3 === 0 ? 0xffd700 : (i % 3 === 1 ? 0xff8833 : 0xffffff);
      const g    = this._dot(rand(2, 6), col);
      g.x = wx; g.y = wy;
      this.container.addChild(g);
      sparks.push(g);
      tweenTo(g, { x: wx + Math.cos(a) * dist, y: wy + Math.sin(a) * dist, alpha: 0 },
              rand(260, 480));
    }

    // 4. Shockwave ring + subtle screen shake (concurrent)
    this._shockwave(wx, wy, 0xffd700, 70, 200);
    this.screenShake(5, 180).catch(() => {});

    await _wait(500);
    for (const s of sparks) this._remove(s);
  }
  /**
   * Radial burst of sparks at a world position.
   */
  async burstAt(wx, wy, color = 0xffcc00, count = 18) {
    const sparks = [];
    for (let i = 0; i < count; i++) {
      const r     = rand(3, 6);
      const g     = this._dot(r, color);
      g.x = wx;
      g.y = wy;
      this.container.addChild(g);
      sparks.push(g);
      const angle = (i / count) * Math.PI * 2 + rand(-0.3, 0.3);
      const dist  = rand(28, 65);
      tweenTo(g, { x: wx + Math.cos(angle) * dist, y: wy + Math.sin(angle) * dist, alpha: 0 },
              rand(380, 560));
    }
    await _wait(600);
    for (const s of sparks) this._remove(s);
  }

  /**
   * Floating damage / number text that rises and fades from a world position.
   */
  async floatNumber(wx, wy, text, color = 0xff4444) {
    const label = new PIXI.Text(String(text), {
      fontFamily:      '"Impact", sans-serif',
      fontSize:        36,
      fontWeight:      'bold',
      fill:            color,
      stroke:          0x000000,
      strokeThickness: 5,
      dropShadow:      true,
      dropShadowBlur:  8,
      dropShadowColor: 0x000000,
      dropShadowAlpha: 0.85,
      dropShadowDistance: 0,
    });
    label.anchor.set(0.5);
    label.x = wx + rand(-12, 12);
    label.y = wy;
    label.alpha = 1;
    label.scale.set(0.6);
    this.container.addChild(label);
    const t0 = Date.now();
    const DURATION = 900;
    return new Promise(resolve => {
      const tick = () => {
        const p = Math.min(1, (Date.now() - t0) / DURATION);
        const bounce = p < 0.18 ? p / 0.18 : 1;
        label.scale.set(0.6 + bounce * 0.6);
        label.y = wy - p * 75;
        label.alpha = p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45;
        if (p < 1) requestAnimationFrame(tick);
        else { this._remove(label); resolve(); }
      };
      requestAnimationFrame(tick);
    });
  }

  /**
   * Play a custom effect descriptor (steps array) at a world position.
   * Steps can be created in the VFX Editor. Each step runs after its `delay` ms.
   */
  async playCustomEffect(steps, wx, wy) {
    if (!steps?.length) return;
    await Promise.all(steps.map(step =>
      _wait(step.delay ?? 0).then(() => this._runStep(step, wx, wy))
    ));
  }

  /** Interpret a single effect step descriptor */
  async _runStep(step, wx, wy) {
    const color = cssToHex(step.color ?? '#ffd700');

    switch (step.type) {
      case 'burst': {
        const count = step.count ?? 18;
        const sparks = [];
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + rand(-0.4, 0.4);
          const dist  = rand(step.minDist ?? 30, step.maxDist ?? 80);
          const g = this._dot(rand(step.minSize ?? 3, step.maxSize ?? 7), color);
          g.x = wx; g.y = wy;
          this.container.addChild(g);
          sparks.push(g);
          tweenTo(g, { x: wx + Math.cos(angle) * dist, y: wy + Math.sin(angle) * dist, alpha: 0 },
                  step.duration ?? 600);
        }
        await _wait((step.duration ?? 600) + 60);
        for (const s of sparks) this._remove(s);
        break;
      }
      case 'ring':
        await this._shockwave(wx, wy, color, step.radius ?? 80, step.duration ?? 280);
        break;

      case 'shake':
        await this.screenShake(step.intensity ?? 8, step.duration ?? 300);
        break;

      case 'flash': {
        const g = new PIXI.Graphics();
        g.beginFill(color, step.alpha ?? 0.6);
        g.drawRoundedRect(-66, -99, 132, 198, 10);
        g.endFill();
        g.x = wx; g.y = wy;
        this.container.addChild(g);
        await tweenTo(g, { alpha: 0 }, step.duration ?? 300);
        this._remove(g);
        break;
      }
      case 'text': {
        const label = new PIXI.Text(step.content ?? '!', {
          fontFamily: '"Impact", sans-serif',
          fontSize:   step.size ?? 58,
          fontWeight: 'bold',
          fill:       color,
          stroke:     0x000000,
          strokeThickness: 6,
          dropShadow: true,
          dropShadowBlur: 12,
          dropShadowColor: 0x000000,
          dropShadowAlpha: 1,
          dropShadowDistance: 0,
        });
        label.anchor.set(0.5);
        label.x = wx;
        label.y = wy;
        label.alpha = 0;
        label.scale.set(0.3);
        this.container.addChild(label);
        const dur    = step.duration ?? 700;
        const riseY  = step.riseY ?? 80;
        const fadeIn = Math.min(200, dur * 0.25);
        const hold   = dur * 0.4;
        const fadeOut = dur - fadeIn - hold;
        const t0 = Date.now();
        await new Promise(resolve => {
          const tick = () => {
            const elapsed = Date.now() - t0;
            const t = Math.min(1, elapsed / dur);
            label.y = wy - riseY * t;
            if (elapsed < fadeIn) {
              label.alpha = elapsed / fadeIn;
              label.scale.set(0.3 + 0.7 * (elapsed / fadeIn));
            } else if (elapsed < fadeIn + hold) {
              label.alpha = 1;
              label.scale.set(1.0);
            } else {
              const fo = (elapsed - fadeIn - hold) / fadeOut;
              label.alpha = Math.max(0, 1 - fo);
              label.scale.set(1.0 + fo * 0.3);
            }
            if (t < 1) requestAnimationFrame(tick);
            else { this._remove(label); resolve(); }
          };
          requestAnimationFrame(tick);
        });
        break;
      }
      case 'rise': {
        const count = step.count ?? 24;
        const sparks = [];
        for (let i = 0; i < count; i++) {
          const g = this._dot(rand(step.minSize ?? 3, step.maxSize ?? 8), color);
          g.x = wx + rand(-50, 50);
          g.y = wy + rand(-20, 20);
          this.container.addChild(g);
          sparks.push(g);
          tweenTo(g, { y: g.y - rand(80, step.riseHeight ?? 160), alpha: 0 },
                  rand(800, step.duration ?? 1400));
        }
        await _wait(step.duration ?? 1400);
        for (const s of sparks) this._remove(s);
        break;
      }
      case 'fire': {
        const count    = step.count    ?? 40;
        const duration = step.duration ?? 900;
        const height   = step.height   ?? 110;
        const spread   = step.spread   ?? 28;
        const particles = [];
        const _fireNoise = (t, o) =>
          Math.sin(t * 1.7 + o) * 0.5 + Math.sin(t * 3.1 + o * 0.7) * 0.3 + Math.sin(t * 5.3 + o * 1.3) * 0.2;
        const _spawnFireLayer = (cfg) => {
          const spawnWindow = duration * 0.62;
          for (let i = 0; i < cfg.n; i++) {
            const spawnDelay = (i / cfg.n) * spawnWindow;
            const lifespan   = rand(duration * cfg.lifeLo, duration * cfg.lifeHi);
            setTimeout(() => {
              const g = new PIXI.Graphics();
              g.blendMode = PIXI.BLEND_MODES.ADD;
              g.x = wx + rand(-spread * cfg.spreadMul, spread * cfg.spreadMul);
              g.y = wy + rand(cfg.spawnYLo, cfg.spawnYHi);
              const startX = g.x;
              const startY = g.y;
              let vx = rand(-cfg.vxRange, cfg.vxRange);
              const noiseOff = Math.random() * 1000;
              const radius   = rand(cfg.rLo, cfg.rHi);
              this.container.addChild(g);
              particles.push(g);
              const t0 = Date.now();
              const tick = () => {
                const p    = Math.min(1, (Date.now() - t0) / lifespan);
                const life = 1 - p;
                vx += (_fireNoise(p * 8 + noiseOff, noiseOff) * cfg.turb);
                vx  = Math.max(-cfg.vxRange * 2, Math.min(cfg.vxRange * 2, vx));
                let r, gv, bv, a;
                if (cfg.type === 'glow') {
                  r = 255; gv = Math.round(40 + 90 * life); bv = 0; a = life * 0.18;
                } else if (cfg.type === 'ember') {
                  const bright = life > 0.5 ? 1 : life * 2;
                  r = 255; gv = Math.round(120 + 135 * bright); bv = Math.round(180 * bright); a = Math.min(1, life * 2.2);
                } else {
                  // core / wisp colour ramp
                  if (p < 0.22)      { r=255; gv=Math.round(230+25*(1-p/0.22)); bv=Math.round(200*(1-p/0.22)); a=0.85; }
                  else if (p < 0.45) { r=255; gv=Math.round(230*(1-(p-0.22)/0.23)); bv=0; a=life; }
                  else if (p < 0.70) { r=255; gv=Math.round(90*(1-(p-0.45)/0.25)); bv=0; a=life; }
                  else if (p < 0.85) { r=Math.round(255-70*((p-0.70)/0.15)); gv=0; bv=0; a=life*0.85; }
                  else               { r=Math.round(185-85*((p-0.85)/0.15)); gv=0; bv=0; a=life*0.5; }
                }
                const hex = ((r&0xff)<<16)|((gv&0xff)<<8)|(bv&0xff);
                const rScaled = radius * (cfg.widenBase + (1 - cfg.widenBase) * life);
                g.clear();
                g.beginFill(hex, Math.max(0, a));
                if      (cfg.type === 'glow')  g.drawEllipse(0, 0, rScaled, rScaled * 0.7);
                else if (cfg.type === 'ember') g.drawCircle(0, 0, rScaled);
                else                           g.drawEllipse(0, 0, rScaled * 0.52, rScaled);
                g.endFill();
                g.alpha = Math.max(0, a);
                g.x = startX + vx * (p * lifespan / 16);
                g.y = startY  - p * height * cfg.heightMul * rand(0.88, 1.12);
                if (p < 1) requestAnimationFrame(tick);
                else       this._remove(g);
              };
              requestAnimationFrame(tick);
            }, spawnDelay);
          }
        };
        // Layer order: glow → core → wisps → embers
        _spawnFireLayer({ type:'glow',  n:Math.round(count*0.18), lifeLo:0.55, lifeHi:1.0,  spreadMul:1.4,  spawnYLo:-8,  spawnYHi:10, vyRange:0, vxRange:0.3, rLo:spread*0.9, rHi:spread*1.8, turb:0.04, widenBase:0.7,  heightMul:0.45 });
        _spawnFireLayer({ type:'core',  n:Math.round(count*1.0),  lifeLo:0.38, lifeHi:0.85, spreadMul:1.0,  spawnYLo:-5,  spawnYHi:8,  vyRange:0, vxRange:0.7, rLo:5,           rHi:14,         turb:0.12, widenBase:0.55, heightMul:1.0  });
        _spawnFireLayer({ type:'wisp',  n:Math.round(count*0.45), lifeLo:0.25, lifeHi:0.60, spreadMul:0.65, spawnYLo:-20, spawnYHi:-6, vyRange:0, vxRange:1.1, rLo:2,           rHi:7,          turb:0.20, widenBase:0.45, heightMul:0.7  });
        _spawnFireLayer({ type:'ember', n:Math.round(count*0.30), lifeLo:0.35, lifeHi:1.1,  spreadMul:1.1,  spawnYLo:-4,  spawnYHi:6,  vyRange:0, vxRange:1.8, rLo:1.2,         rHi:3.2,        turb:0.15, widenBase:1.0,  heightMul:1.35 });
        await _wait(duration + 120);
        for (const p of particles) this._remove(p);
        break;
      }
      default: break;
    }
  }

  /**
   * Editor preview — fly a bolt between two raw world positions using current config.
   * @param {number} fromX
   * @param {number} fromY
   * @param {number} toX
   * @param {number} toY
   * @param {'damageBolt'|'moraleBolt'} boltKey
   */
  async testBolt(fromX, fromY, toX, toY, boltKey = 'damageBolt') {
    const cfg    = this._getBoltConfig(boltKey);
    const bColor = cfg.color ?? (boltKey === 'moraleBolt' ? 0xcc1111 : 0xff6600);
    const bSize  = cfg.size  ?? (boltKey === 'moraleBolt' ? 7 : 10);
    const bSpeed = cfg.speed ?? (boltKey === 'moraleBolt' ? 380 : 320);

    let orb;
    if (cfg.sprite) {
      orb = new PIXI.Sprite(PIXI.Texture.from(cfg.sprite));
      orb.anchor.set(0.5);
      orb.scale.set(cfg.spriteScale);
      orb.rotation = Math.atan2(toY - fromY, toX - fromX);
    } else {
      orb = new PIXI.Graphics();
      orb.beginFill(bColor, 0.95);
      orb.drawCircle(0, 0, bSize);
      orb.endFill();
      orb.lineStyle(2, 0xffffff, 0.45);
      orb.drawCircle(0, 0, Math.round(bSize * 1.5));
    }
    orb.x = fromX; orb.y = fromY;
    this.container.addChild(orb);

    const trail = cfg.sprite ? null : this._attachTrail(orb, bColor, Math.max(3, Math.round(bSize * 0.6)));
    await tweenTo(orb, { x: toX, y: toY }, bSpeed);
    if (trail) clearInterval(trail);
    this._remove(orb);

    if (this._hasSpecialPreset(boltKey)) {
      await this._playSpecialPreset(boltKey, toX, toY);
    } else {
      this._shockwave(toX, toY, bColor, 55, 200);
      this.screenShake(6, 240).catch(() => {});
      await this.burstAt(toX, toY, bColor, 20);
    }
  }

  /**
   * Glowing orb flying from one CardView to another, then a burst on impact.
   */
  async projectile(fromCard, toCard, color = 0xff6600) {
    const from = _cardWorld(fromCard);
    const to   = _cardWorld(toCard);

    const cfg    = this._getBoltConfig('damageBolt');
    const bColor = cfg.color ?? color;
    const bSize  = cfg.size  ?? 10;
    const bSpeed = cfg.speed ?? 320;

    let orb;
    if (cfg.sprite) {
      orb = new PIXI.Sprite(PIXI.Texture.from(cfg.sprite));
      orb.anchor.set(0.5);
      orb.scale.set(cfg.spriteScale);
      orb.rotation = Math.atan2(to.y - from.y, to.x - from.x);
    } else {
      orb = new PIXI.Graphics();
      orb.beginFill(bColor, 0.95);
      orb.drawCircle(0, 0, bSize);
      orb.endFill();
      orb.lineStyle(2, 0xffffff, 0.45);
      orb.drawCircle(0, 0, Math.round(bSize * 1.5));
    }
    orb.x = from.x;
    orb.y = from.y;
    this.container.addChild(orb);

    const trail = cfg.sprite ? null : this._attachTrail(orb, bColor, Math.max(3, Math.round(bSize * 0.6)));

    await tweenTo(orb, { x: to.x, y: to.y }, bSpeed);
    if (trail) clearInterval(trail);
    this._remove(orb);

    // Impact: custom preset if set, otherwise hardcoded shockwave + burst
    if (this._hasSpecialPreset('damageBolt')) {
      await this._playSpecialPreset('damageBolt', to.x, to.y);
    } else {
      this._shockwave(to.x, to.y, bColor, 55, 200);
      this.screenShake(6, 240).catch(() => {});
      await this.burstAt(to.x, to.y, bColor, 20);
    }
  }

  /**
   * Rising green sparkles on a card (heal effect).
   */
  async healSparkles(card) {
    const c = _cardWorld(card);
    // Use custom preset if assigned
    if (this._hasSpecialPreset('healing')) {
      await this._playSpecialPreset('healing', c.x, c.y);
      return;
    }
    const sparks = [];

    for (let i = 0; i < 22; i++) {
      const angle = (i / 22) * Math.PI * 2;
      const dist  = rand(20, 55);
      const g = this._dot(rand(4, 9), i % 3 === 0 ? 0xaaffcc : 0x44ff88);
      g.x = c.x; g.y = c.y;
      this.container.addChild(g);
      sparks.push(g);
      tweenTo(g, { x: c.x + Math.cos(angle) * dist, y: c.y + Math.sin(angle) * dist, alpha: 0 },
              rand(600, 950));
    }

    for (let i = 0; i < 36; i++) {
      const delay = i < 18 ? 0 : 300;
      const g = this._dot(rand(3, 8), i % 4 === 0 ? 0xffffff : i % 2 === 0 ? 0xaaffcc : 0x44ff88);
      g.x = c.x + rand(-55, 55);
      g.y = c.y + rand(-30, 30);
      g.alpha = 1;
      this.container.addChild(g);
      sparks.push(g);
      setTimeout(() => {
        tweenTo(g, { y: g.y - rand(110, 200), alpha: 0 }, rand(1100, 1800));
      }, delay);
    }

    await _wait(2200);
    for (const s of sparks) this._remove(s);
  }

  /**
   * Fire staggered red bolts from each card in cardViews to moraleDisplay.
   */
  moraleBleed(cardViews, moraleDisplay) {
    const cfg    = this._getBoltConfig('moraleBolt');
    const bColor = cfg.color ?? 0xcc1111;
    const bSize  = cfg.size  ?? 7;
    const bSpeed = cfg.speed ?? 380;

    cardViews.forEach((card, i) => {
      setTimeout(() => {
        const from = _cardWorld(card);
        const to   = moraleDisplay.toGlobal({ x: 0, y: 0 });

        let orb;
        if (cfg.sprite) {
          orb = new PIXI.Sprite(PIXI.Texture.from(cfg.sprite));
          orb.anchor.set(0.5);
          orb.scale.set(cfg.spriteScale);
          orb.rotation = Math.atan2(to.y - from.y, to.x - from.x);
        } else {
          orb = new PIXI.Graphics();
          orb.beginFill(bColor, 0.92);
          orb.drawCircle(0, 0, bSize);
          orb.endFill();
          orb.lineStyle(1.5, 0xff6666, 0.5);
          orb.drawCircle(0, 0, Math.round(bSize * 1.57));
        }
        orb.x = from.x;
        orb.y = from.y;
        this.container.addChild(orb);

        const trail = cfg.sprite ? null : this._attachTrail(orb, bColor, Math.max(2, Math.round(bSize * 0.57)));
        tweenTo(orb, { x: to.x, y: to.y }, bSpeed).then(() => {
          if (trail) clearInterval(trail);
          this._remove(orb);
          moraleDisplay.takeDamage();
          // Custom impact preset if set, otherwise default burst
          if (this._hasSpecialPreset('moraleBolt')) {
            this._playSpecialPreset('moraleBolt', to.x, to.y).catch(() => {});
          } else {
            this.burstAt(to.x, to.y, bColor, 10).catch(() => {});
          }
        });
      }, i * 160);
    });
  }

  /**
   * Golden radial burst centred on a PIXI display object (e.g. morale display).
   */
  async moraleRadial(displayObj, color = 0xffcc00) {
    const pos = displayObj.toGlobal({ x: 0, y: 0 });
    await this.burstAt(pos.x, pos.y, color, 26);
  }

  /**
   * Dark purple orb draining from one display object to another.
   */
  async drainOrb(fromDisplay, toDisplay) {
    const from = fromDisplay.toGlobal({ x: 0, y: 0 });
    const to   = toDisplay.toGlobal({ x: 0, y: 0 });

    const orb = new PIXI.Graphics();
    orb.beginFill(0x660099, 0.88);
    orb.drawCircle(0, 0, 9);
    orb.endFill();
    orb.lineStyle(2, 0xcc55ff, 0.55);
    orb.drawCircle(0, 0, 14);
    orb.x = from.x;
    orb.y = from.y;
    this.container.addChild(orb);

    const trail = this._attachTrail(orb, 0xaa44ff, 5);
    await tweenTo(orb, { x: to.x, y: to.y }, 480);
    clearInterval(trail);
    this._remove(orb);
    await this.burstAt(to.x, to.y, 0x9900ff, 10);
  }

  /**
   * Vertical streak sweep on a card for attack buff / debuff.
   */
  async attackBuff(card, isPositive = true) {
    const c = _cardWorld(card);
    const presetKey = isPositive ? 'positivBuff' : 'negativBuff';
    if (this._hasSpecialPreset(presetKey)) {
      await this._playSpecialPreset(presetKey, c.x, c.y);
      return;
    }
    const color  = isPositive ? 0xffaa00 : 0xff2200;
    const sparks = [];
    for (let i = 0; i < 18; i++) {
      const h  = rand(8, 18);
      const g  = new PIXI.Graphics();
      g.beginFill(color, rand(0.7, 1));
      g.drawRect(-2, -h, 4, h);
      g.endFill();
      g.x = c.x + rand(-40, 40);
      g.y = c.y + rand(10, 30);
      g.alpha = 1;
      this.container.addChild(g);
      sparks.push(g);
      tweenTo(g, { y: g.y - rand(60, 100), alpha: 0 }, rand(450, 700));
    }
    await _wait(750);
    for (const s of sparks) this._remove(s);
  }

  /**
   * Dramatic summon entrance — colour is faction-aware.
   * @param {import('./CardView.js').CardView} cardView
   * @param {string} [faction]  'Folk' | 'Wild' | 'Magical' — defaults to gold
   */
  async summonFlash(cardView, faction = null) {
    return this._track(this._summonFlash(cardView, faction));
  }
  async _summonFlash(cardView, faction = null) {
    const c       = _cardWorld(cardView);
    const palette = FACTION_COLORS[faction] ?? { ring: 0xffd700, burst: 0xffd700, flash: 0xffffff };

    // 1 — card overflash
    const flash = new PIXI.Graphics();
    flash.beginFill(palette.flash, 0.65);
    flash.drawRoundedRect(-66, -99, 132, 198, 10);
    flash.endFill();
    flash.x = c.x; flash.y = c.y; flash.alpha = 0.65;
    this.container.addChild(flash);
    tweenTo(flash, { alpha: 0 }, 140).then(() => this._remove(flash));

    // 2 — shockwave ring
    await this._shockwave(c.x, c.y, palette.ring, 85, 130);

    // 3 — radial burst
    const sparks = [];
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2 + rand(-0.2, 0.2);
      const dist  = rand(38, 100);
      const g = this._dot(rand(3, 8), i % 3 === 0 ? 0xffffff : palette.burst);
      g.x = c.x; g.y = c.y;
      this.container.addChild(g);
      sparks.push(g);
      tweenTo(g, { x: c.x + Math.cos(angle) * dist, y: c.y + Math.sin(angle) * dist, alpha: 0 },
              rand(200, 340));
    }
    await _wait(380);
    for (const s of sparks) this._remove(s);
  }

  /**
   * Expanding ring shockwave at world position.
   */
  async _shockwave(wx, wy, color = 0xffffff, maxRadius = 80, duration = 240) {
    const g = new PIXI.Graphics();
    g.x = wx; g.y = wy;
    this.container.addChild(g);
    const startT = Date.now();
    return new Promise(resolve => {
      const tick = () => {
        const t = Math.min(1, (Date.now() - startT) / duration);
        const r = maxRadius * t;
        g.clear();
        g.lineStyle(3 * (1 - t) + 1, color, 1 - t);
        g.drawCircle(0, 0, r);
        if (t < 1) requestAnimationFrame(tick);
        else { this._remove(g); resolve(); }
      };
      requestAnimationFrame(tick);
    });
  }

  /**
   * Battlecry burst — faction-coloured "!" stamp + ring + heavy particle shower.
   * @param {import('./CardView.js').CardView} cardView
   * @param {string} [faction]
   */
  async battlecryBurst(cardView, faction = null) {
    return this._track(this._battlecryBurst(cardView, faction));
  }
  async _battlecryBurst(cardView, faction = null) {
    const c = _cardWorld(cardView);
    SoundManager.play('battlecry');
    // Custom battlecry preset overrides the whole animation
    if (this._hasSpecialPreset('battlecry')) {
      await this._playSpecialPreset('battlecry', c.x, c.y);
      return;
    }

    const palette = FACTION_COLORS[faction] ?? { ring: 0xffaa00, burst: 0xffd700, flash: 0xffd700 };

    this._shockwave(c.x, c.y, palette.ring, 115, 330);

    const label = new PIXI.Text('!', {
      fontFamily:      '"Impact", sans-serif',
      fontSize:        68,
      fontWeight:      'bold',
      fill:            palette.burst,
      stroke:          0x000000,
      strokeThickness: 6,
      dropShadow:      true,
      dropShadowBlur:  12,
      dropShadowColor: 0x000000,
      dropShadowAlpha: 1,
      dropShadowDistance: 0,
    });
    label.anchor.set(0.5);
    label.x = c.x; label.y = c.y - 20;
    label.alpha = 0; label.scale.set(0.3);
    this.container.addChild(label);
    tweenTo(label, { alpha: 1, y: c.y - 70 }, 160);
    const t0 = Date.now();
    const growTick = () => {
      const p = Math.min(1, (Date.now() - t0) / 160);
      label.scale.set(0.3 + 0.7 * p);
      if (p < 1) requestAnimationFrame(growTick);
    };
    requestAnimationFrame(growTick);

    await _wait(270);
    tweenTo(label, { alpha: 0, y: c.y - 125 }, 420).then(() => this._remove(label));

    const sparks = [];
    for (let i = 0; i < 42; i++) {
      const g = this._dot(rand(2, 7), i % 4 === 0 ? 0xffffff : i % 2 === 0 ? palette.ring : palette.burst);
      const angle = (i / 42) * Math.PI * 2 + rand(-0.4, 0.4);
      const dist  = rand(50, 125);
      g.x = c.x; g.y = c.y;
      this.container.addChild(g);
      sparks.push(g);
      tweenTo(g, { x: c.x + Math.cos(angle) * dist, y: c.y + Math.sin(angle) * dist + rand(0, 40), alpha: 0 },
              rand(500, 820));
    }
    await _wait(880);
    for (const s of sparks) this._remove(s);
  }

  /**
   * Shake the stage briefly.
   */
  async screenShake(intensity = 10, duration = 320) {
    const stage = this._app.stage;
    const origX = stage.x, origY = stage.y;
    const startT = Date.now();
    return new Promise(resolve => {
      const tick = () => {
        const elapsed = Date.now() - startT;
        const t = elapsed / duration;
        if (t >= 1) { stage.x = origX; stage.y = origY; resolve(); return; }
        const power = intensity * (1 - t);
        stage.x = origX + rand(-power, power);
        stage.y = origY + rand(-power, power);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /**
   * AOE damage: shockwave + screen shake + heavy burst on every target simultaneously.
   */
  async aoeBlast(cardViews, color = 0xff4400) {
    this.screenShake(8, 300);
    await Promise.all(cardViews.map(async (cv, i) => {
      await _wait(i * 60);
      const c = _cardWorld(cv);
      this._shockwave(c.x, c.y, color, 70, 250);
      // Fire particles rising from each hit target (runs in parallel with burst)
      this._fireAt(c.x, c.y);
      return this.burstAt(c.x, c.y, color, 22);
    }));
  }

  /**
   * Internal: spawn rising flame particles at a world position.
   * Used by aoeBlast to show fire on damaged targets.
   */
  _fireAt(wx, wy, count = 38, height = 100, spread = 22, duration = 820) {
    const _noise = (t, o) =>
      Math.sin(t * 1.7 + o) * 0.5 + Math.sin(t * 3.1 + o * 0.7) * 0.3 + Math.sin(t * 5.3 + o * 1.3) * 0.2;
    const _layer = (cfg) => {
      const spawnWindow = duration * 0.55;
      for (let i = 0; i < cfg.n; i++) {
        const spawnDelay = (i / cfg.n) * spawnWindow;
        const lifespan   = rand(duration * cfg.lifeLo, duration * cfg.lifeHi);
        setTimeout(() => {
          const g = new PIXI.Graphics();
          g.blendMode = PIXI.BLEND_MODES.ADD;
          g.x = wx + rand(-spread * cfg.spreadMul, spread * cfg.spreadMul);
          g.y = wy + rand(cfg.spawnYLo, cfg.spawnYHi);
          const startX = g.x, startY = g.y;
          let vx = rand(-cfg.vxRange, cfg.vxRange);
          const noiseOff = Math.random() * 1000;
          const radius   = rand(cfg.rLo, cfg.rHi);
          this.container.addChild(g);
          const t0 = Date.now();
          const tick = () => {
            const p    = Math.min(1, (Date.now() - t0) / lifespan);
            const life = 1 - p;
            vx += _noise(p * 8 + noiseOff, noiseOff) * cfg.turb;
            vx  = Math.max(-cfg.vxRange * 2, Math.min(cfg.vxRange * 2, vx));
            let r, gv, bv, a;
            if (cfg.type === 'glow') {
              r=255; gv=Math.round(40+90*life); bv=0; a=life*0.18;
            } else if (cfg.type === 'ember') {
              const b=life>0.5?1:life*2; r=255; gv=Math.round(120+135*b); bv=Math.round(180*b); a=Math.min(1,life*2.2);
            } else {
              if      (p<0.22) { r=255; gv=Math.round(230+25*(1-p/0.22)); bv=Math.round(200*(1-p/0.22)); a=0.85; }
              else if (p<0.45) { r=255; gv=Math.round(230*(1-(p-0.22)/0.23)); bv=0; a=life; }
              else if (p<0.70) { r=255; gv=Math.round(90*(1-(p-0.45)/0.25)); bv=0; a=life; }
              else if (p<0.85) { r=Math.round(255-70*((p-0.70)/0.15)); gv=0; bv=0; a=life*0.85; }
              else             { r=Math.round(185-85*((p-0.85)/0.15)); gv=0; bv=0; a=life*0.5; }
            }
            const hex    = ((r&0xff)<<16)|((gv&0xff)<<8)|(bv&0xff);
            const rScaled = radius * (cfg.widenBase + (1 - cfg.widenBase) * life);
            g.clear();
            g.beginFill(hex, Math.max(0, a));
            if      (cfg.type === 'glow')  g.drawEllipse(0, 0, rScaled, rScaled * 0.7);
            else if (cfg.type === 'ember') g.drawCircle(0, 0, rScaled);
            else                           g.drawEllipse(0, 0, rScaled * 0.52, rScaled);
            g.endFill();
            g.alpha = Math.max(0, a);
            g.x = startX + vx * (p * lifespan / 16);
            g.y = startY  - p * height * cfg.heightMul * rand(0.88, 1.12);
            if (p < 1) requestAnimationFrame(tick);
            else       this._remove(g);
          };
          requestAnimationFrame(tick);
        }, spawnDelay);
      }
    };
    _layer({ type:'glow',  n:Math.round(count*0.2),  lifeLo:0.5, lifeHi:1.0,  spreadMul:1.4,  spawnYLo:-8,  spawnYHi:10, vxRange:0.3, rLo:spread*0.8, rHi:spread*1.6, turb:0.04, widenBase:0.7,  heightMul:0.45 });
    _layer({ type:'core',  n:count,                   lifeLo:0.38,lifeHi:0.85, spreadMul:1.0,  spawnYLo:-5,  spawnYHi:8,  vxRange:0.7, rLo:4,           rHi:12,         turb:0.12, widenBase:0.55, heightMul:1.0  });
    _layer({ type:'wisp',  n:Math.round(count*0.4),   lifeLo:0.25,lifeHi:0.55, spreadMul:0.6,  spawnYLo:-18, spawnYHi:-5, vxRange:1.0, rLo:2,           rHi:6,          turb:0.20, widenBase:0.45, heightMul:0.7  });
    _layer({ type:'ember', n:Math.round(count*0.28),  lifeLo:0.3, lifeHi:1.0,  spreadMul:1.1,  spawnYLo:-4,  spawnYHi:6,  vxRange:1.6, rLo:1.2,         rHi:3.0,        turb:0.15, widenBase:1.0,  heightMul:1.3  });
  }

  /**
   * Play the death VFX for a card at raw world coords.
   * Checks card's own deathVfxPreset, then global 'death' special preset, then falls back.
   * @param {import('./Card.js').Card} card
   * @param {number} wx
   * @param {number} wy
   */
  async playDeathEffect(card, wx, wy) {
    const presetId = card?.deathVfxPreset || this._specialPresetsSync['death'];
    if (presetId) {
      const all    = await this._loadPresets();
      const preset = all[presetId];
      if (preset?.steps?.length) {
        await this.playCustomEffect(preset.steps, wx, wy);
        return;
      }
    }
    await this._destroyEffectAt(wx, wy);
  }

  /**
   * Destroy effect at raw world coords.
   */
  async _destroyEffectAt(wx, wy) {
    this.screenShake(12, 380);
    this._shockwave(wx, wy, 0x220000, 50, 140);
    await _wait(120);
    const sparks = [];
    for (let i = 0; i < 36; i++) {
      const g = this._dot(rand(3, 10), i % 3 === 0 ? 0x111111 : i % 2 === 0 ? 0xff2200 : 0xff8800);
      const angle = (i / 36) * Math.PI * 2 + rand(-0.3, 0.3);
      const dist  = rand(50, 130);
      g.x = wx; g.y = wy;
      this.container.addChild(g);
      sparks.push(g);
      tweenTo(g, { x: wx + Math.cos(angle) * dist, y: wy + Math.sin(angle) * dist + rand(10, 45), alpha: 0 },
              rand(500, 900));
    }
    this._shockwave(wx, wy, 0xff3300, 110, 350);
    await _wait(960);
    for (const s of sparks) this._remove(s);
  }

  /**
   * Destroy effect — dark implosion then explosion with debris.
   */
  async destroyEffect(cardView) {
    const c = _cardWorld(cardView);
    await this._destroyEffectAt(c.x, c.y);
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  _dot(radius, color) {
    const g = new PIXI.Graphics();
    g.beginFill(color, 1);
    g.drawCircle(0, 0, radius);
    g.endFill();
    return g;
  }

  _attachTrail(orb, color, radius) {
    return setInterval(() => {
      if (!orb.parent) return;
      const ghost = this._dot(radius, color);
      ghost.x = orb.x; ghost.y = orb.y; ghost.alpha = 0.5;
      this.container.addChild(ghost);
      tweenTo(ghost, { alpha: 0 }, 180).then(() => this._remove(ghost));
    }, 40);
  }

  _remove(obj) {
    if (obj.parent) obj.parent.removeChild(obj);
    obj.destroy();
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function _cardWorld(cardView) {
  return cardView.toGlobal({ x: 0, y: 0 });
}

function _wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

