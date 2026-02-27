import { Card }           from '../game/Card.js';
import { CardView }        from '../game/CardView.js';
import { Hand }            from '../game/Hand.js';
import { DeckView }        from '../game/DeckView.js';
import { Battlefield }     from '../game/Battlefield.js';
import { initDragDrop, makeDraggable, setCombatRef, setRationsRef, setSpellCallback, setAllFields } from '../game/DragDrop.js';
import { CombatSystem }    from '../game/CombatSystem.js';
import { CardPreview }     from '../game/CardPreview.js';
import { OpponentAI }      from '../game/OpponentAI.js';
import { tweenTo, tweenToBack } from '../game/Tween.js';
import { applyOnPlay, applyDeathEffect, EFFECTS_BY_ID } from '../game/Effects.js';
import { pickTarget }      from '../game/Targeting.js';
import { VFX }             from '../game/VFX.js';
import { MoraleDisplay }   from './MoraleDisplay.js';
import { RationsDisplay }  from './RationsDisplay.js';
import * as PIXI           from 'pixi.js';
import { SoundManager }    from '../game/SoundManager.js';
import { AnimationSequencer } from '../game/AnimationSequencer.js';

export function init(app) {
  const { stage, screen } = app;

  // ── Opponent battlefield (upper half) ────────────────────────────────────
  const opponentField = new Battlefield();
  opponentField.x = screen.width  / 2;
  opponentField.y = screen.height * 0.37;
  stage.addChild(opponentField);

  // ── Player battlefield (lower half) ──────────────────────────────────────
  const playerField = new Battlefield();
  playerField.x = screen.width  / 2;
  playerField.y = screen.height * 0.63;
  stage.addChild(playerField);

  // ── Opponent hand at the top ───────────────────────────────────────────
  const opponentHand = new Hand();
  opponentHand.isOpponent = true;
  opponentHand.x = screen.width  * 0.30;
  opponentHand.y = screen.height * 0.13;
  opponentHand.scale.y = -1; // flip so cards fan downward from top edge
  opponentHand.slotKey = 'hand-slot-positions-opponent';
  stage.addChild(opponentHand);
  // ── Player hand at the bottom ─────────────────────────────────────────────
  const hand = new Hand();
  hand.x = screen.width  * 0.30;
  hand.y = screen.height * 0.88;
  stage.addChild(hand);

  // ── Decks (visuals) ──────────────────────────────────────────────────────
  const playerDeckView = new DeckView(true);
  playerDeckView.x = app.screen.width - 85;
  playerDeckView.y = app.screen.height - 90;
  stage.addChild(playerDeckView);

  const opponentDeckView = new DeckView(false);
  opponentDeckView.x = app.screen.width - 85;
  opponentDeckView.y = 90;
  stage.addChild(opponentDeckView);

  // ── Decks (data) ─────────────────────────────────────────────────────────
  // Both decks: 2 copies of every card in the collection, shuffled
  let playerDeck   = Card.loadFromStorage();
  let opponentDeck = Card.loadFromStorage();
  playerDeckView.setCount(playerDeck.length);
  opponentDeckView.setCount(opponentDeck.length);

  // ── Wire up drag-and-drop (player field only) ────────────────────────────
  initDragDrop(app, hand, playerField);
  setAllFields([playerField, opponentField]);
  // ── Card preview on hover ─────────────────────────────────────────────────
  CardPreview.init(app);

  // ── Combat system ──────────────────────────────────────────────────────
  const combat = new CombatSystem(app, playerField, opponentField);
  setCombatRef(combat);

  // ── VFX overlay ─────────────────────────────────────────────────────────
  const vfx = new VFX(app);
  stage.addChild(vfx.container);  // must sit on top of all other layers
  combat.setVFX(vfx);  // enable floating damage numbers
  playerField.setVFX(vfx);
  opponentField.setVFX(vfx);

  // ── Morale + Rations — side-by-side, centred horizontally ──────────
  const opponentRations = new RationsDisplay();
  opponentRations.x = screen.width / 2 - 78;
  opponentRations.y = 38;
  stage.addChild(opponentRations);

  const opponentMorale = new MoraleDisplay(false);
  opponentMorale.x = screen.width / 2 + 78;
  opponentMorale.y = 38;
  stage.addChild(opponentMorale);

  const playerRations = new RationsDisplay();
  playerRations.x = screen.width / 2 - 78;
  playerRations.y = screen.height - 38;
  stage.addChild(playerRations);

  const playerMorale = new MoraleDisplay(true);
  playerMorale.x = screen.width / 2 + 78;
  playerMorale.y = screen.height - 38;
  stage.addChild(playerMorale);
  setRationsRef(playerRations);  // wire rations cost enforcement into drag-drop

  // Track temporary attack buffs so we can revert them at end of turn.
  // Map<cardView, { attack, health, maxHealth }> — only first entry per card is kept.
  // health/maxHealth are null for attack-only buffs.
  const _turnBuffs = new Map();

  // Spell cast callback — fires the card's on-play effect when player casts a spell
  const _playerDrawCb = { drawCard: () => { drawCardToHand(playerDeck, hand); playerDeckView.setCount(playerDeck.length); }, targetRations: opponentRations };
  setSpellCallback(async cv => {
    const eff = cv.card.onPlayEffect;
    if (!eff?.id) return;
    const meta = EFFECTS_BY_ID[eff.id];
    if (meta?.requiresTarget) {
      // Pool all minions from both fields (targetAny), or restrict to one side
      const pool = meta.targetAny
        ? [
            ...playerField._placed.map(p => p.cardView),
            ...opponentField._placed.map(p => p.cardView),
          ]
        : (meta.targetFriendly ? playerField : opponentField)._placed.map(p => p.cardView);
      if (pool.length === 0) return;  // no valid targets — spell fizzles
      const isPositive = meta.isPositive ?? !!meta.targetFriendly;
      const label = meta.targetLabel ?? (isPositive ? `+${eff.value ?? 1}` : `-${eff.value ?? 1}`);
      const chosen = await pickTarget(pool, isPositive, label);
      if (!chosen) return;
      const result = await applyOnPlay(eff.id, eff.value ?? 1, playerField, opponentField, combat, playerMorale, opponentMorale, playerRations, chosen, vfx, null, _playerDrawCb);
      if (result?.cardView && !_turnBuffs.has(result.cardView)) {
        _turnBuffs.set(result.cardView, {
          attack:    result.originalAttack,
          health:    result.originalHealth    ?? null,
          maxHealth: result.originalMaxHealth ?? null,
        });
      }
    } else {
      applyOnPlay(eff.id, eff.value ?? 1, playerField, opponentField, combat, playerMorale, opponentMorale, playerRations, null, vfx, null, _playerDrawCb);
    }
  });

  // Returns true when a battlecry effect has at least one valid target / something to do.
  function _canUseBattlecry(eff, cardView, sourceField, targetField) {
    if (!eff?.id) return false;
    const meta = EFFECTS_BY_ID[eff.id];
    if (!meta) return false;
    // Target-requiring effects need a non-empty pool
    if (meta.requiresTarget) {
      const pool = (meta.targetAny
        ? [...sourceField._placed.map(p => p.cardView), ...targetField._placed.map(p => p.cardView)]
        : (meta.targetFriendly ? sourceField : targetField)._placed.map(p => p.cardView)
      ).filter(cv => cv !== cardView);
      return pool.length > 0;
    }
    // Damage effects need living enemies
    if (eff.id === 'deal_damage_random_enemy' || eff.id === 'deal_damage_all_enemies') {
      return targetField._placed.some(p => !p.cardView.destroyed && p.cardView.card.health > 0);
    }
    // Heal effect needs a damaged friendly
    if (eff.id === 'heal_random_friendly') {
      return sourceField._placed.some(p =>
        p.cardView !== cardView && !p.cardView.destroyed &&
        p.cardView.card.health > 0 && p.cardView.card.health < p.cardView._maxHealth
      );
    }
    // Everything else (morale, draw, rations…) always fires
    return true;
  }

  // Each time a card is removed from a field, the owner loses 1 morale
  playerField.onCardRemoved   = () => playerMorale.takeDamage();
  opponentField.onCardRemoved = () => opponentMorale.takeDamage();
  // Deathrattle — fires when a minion dies, before it is destroyed
  playerField.onCardKilled  = cv => { const de = cv.card?.deathEffect; if (de?.id) applyDeathEffect(de.id, de.value ?? 1, playerField,   opponentField, vfx); };
  opponentField.onCardKilled = cv => { const de = cv.card?.deathEffect; if (de?.id) applyDeathEffect(de.id, de.value ?? 1, opponentField, playerField,   vfx); };
  // Arm each player card as it lands on the field and swap to field frame
  // onCardLanded: fires at impact, runs in parallel with spring animation — summon VFX fires here
  playerField.onCardLanded = cardView => {
    cardView.useFieldFrame();
    combat.armCard(cardView, true);
    const faction = cardView.card?.faction ?? null;
    const preset  = cardView.card?.summonVfxPreset;
    if (preset)                            vfx.playPreset(preset, cardView).catch(() => {});
    else if (vfx.hasFactionPreset(faction)) vfx.playFactionPreset(faction, cardView).catch(() => {});
    else                                    vfx.summonFlash(cardView, faction).catch(() => {});
  };
  // onCardPlaced: fires after spring finishes — battlecry routed through the timeline sequencer
  playerField.onCardPlaced = async cardView => {
    const faction = cardView.card?.faction ?? null;
    const eff     = cardView.card.onPlayEffect;
    await AnimationSequencer.runCardPlay({
      summon_vfx: async () => { /* fired in onCardLanded */ },
      battlecry_burst: async () => {
        if (eff?.id) {
          const meta = EFFECTS_BY_ID[eff.id];
          if (meta?.requiresTarget) {
            // Fire and don't await — targets appear while burst is still playing
            vfx.battlecryBurst(cardView, faction).catch(() => {});
            await new Promise(r => setTimeout(r, 180));
          } else {
            await vfx.battlecryBurst(cardView, faction).catch(() => {});
          }
        }
      },
      on_play: async () => {
        if (!eff?.id) return;
        const meta = EFFECTS_BY_ID[eff.id];
        if (meta?.requiresTarget) {
          const pool = (meta.targetAny
            ? [
                ...playerField._placed.map(p => p.cardView),
                ...opponentField._placed.map(p => p.cardView),
              ]
            : (meta.targetFriendly ? playerField : opponentField)._placed.map(p => p.cardView)
          ).filter(cv => cv !== cardView);
          if (pool.length > 0) {
            const isPositive = meta.isPositive ?? !!meta.targetFriendly;
            const label = meta.targetLabel ?? (isPositive ? `+${eff.value ?? 1}` : `-${eff.value ?? 1}`);
            const chosen = await pickTarget(pool, isPositive, label);
            if (chosen) {
              await applyOnPlay(eff.id, eff.value ?? 1, playerField, opponentField, combat, playerMorale, opponentMorale, playerRations, chosen, vfx, cardView, _playerDrawCb);
            }
          }
        } else {
          await applyOnPlay(eff.id, eff.value ?? 1, playerField, opponentField, combat, playerMorale, opponentMorale, playerRations, null, vfx, cardView, _playerDrawCb);
        }
      },
    });
  };

  opponentField.onCardLanded = cardView => {
    combat.armOpponentCard(cardView, true);
    const faction = cardView.card?.faction ?? null;
    const preset  = cardView.card?.summonVfxPreset;
    if (preset)                            vfx.playPreset(preset, cardView).catch(() => {});
    else if (vfx.hasFactionPreset(faction)) vfx.playFactionPreset(faction, cardView).catch(() => {});
    else                                    vfx.summonFlash(cardView, faction).catch(() => {});
  };
  opponentField.onCardPlaced = async cardView => {
    const faction = cardView.card?.faction ?? null;
    const eff     = cardView.card.onPlayEffect;
    await AnimationSequencer.runCardPlay({
      summon_vfx: async () => { /* fired in onCardLanded */ },
      battlecry_burst: async () => {
        if (eff?.id) {
          const meta = EFFECTS_BY_ID[eff.id];
          if (meta?.requiresTarget) {
            vfx.battlecryBurst(cardView, faction).catch(() => {});
            await new Promise(r => setTimeout(r, 180));
          } else {
            await vfx.battlecryBurst(cardView, faction).catch(() => {});
          }
        }
      },
      on_play: async () => {
        if (!eff?.id) return;
        const meta = EFFECTS_BY_ID[eff.id];
        let chosenTarget = null;
        if (meta?.requiresTarget) {
          const pool = (meta.targetAny
            ? [
                ...opponentField._placed.map(p => p.cardView),
                ...playerField._placed.map(p => p.cardView),
              ]
            : (meta.targetFriendly ? opponentField : playerField)._placed.map(p => p.cardView)
          ).filter(cv => cv !== cardView);
          if (pool.length > 0) chosenTarget = pool[Math.floor(Math.random() * pool.length)];
        }
        if (!meta?.requiresTarget || chosenTarget) {
          await applyOnPlay(eff.id, eff.value ?? 1, opponentField, playerField, combat, opponentMorale, playerMorale, opponentRations, chosenTarget, vfx, cardView, { drawCard: () => { drawCardToOpponentHand(opponentDeck); opponentDeckView.setCount(opponentDeck.length); }, targetRations: playerRations });
        }
      },
    });
  };

  // ── Draw initial hand for player ─────────────────────────────────────────
  // ── Animate a card flying from deck to its resting position in a hand ──────
  function animateDraw(view, deckView, targetHand) {
    // Card has already been added to targetHand and laid out — capture final pos
    const finalX = view.x;
    const finalY = view.y;
    // Convert deck centre to hand-local space
    const deckGlobal = deckView.toGlobal({ x: 0, y: 0 });
    const deckLocal  = targetHand.toLocal(deckGlobal);
    // Start card at deck position, invisible and small
    view.x = deckLocal.x;
    view.y = deckLocal.y;
    view.scale.set(0.3);
    view.alpha = 0;
    // Block hover events for the duration of the fly animation
    view._isFlying = true;
    // Slow, dramatic fly to hand — fade in + position over 700ms
    // alpha is included here; if layout() cancels this tween it restores alpha:1 itself
    SoundManager.play('draw');
    Promise.all([
      tweenTo(view,           { x: finalX, y: finalY, alpha: 1 }, 700),
      tweenToBack(view.scale, { x: 1, y: 1 }, 700),
    ]).then(() => { view._isFlying = false; });
  }

  const MAX_HAND = 8;

  function drawCardToHand(deck, hand) {
    if (deck.length === 0) return;
    const card = deck.shift();
    if (hand.cards.length >= MAX_HAND) return; // discard — hand is full
    const view = new CardView(card);
    hand.addCard(view);
    makeDraggable(view);
    animateDraw(view, playerDeckView, hand);
  }

  for (let i = 0; i < 4; ++i) {
    drawCardToHand(playerDeck, hand);
  }
  playerDeckView.setCount(playerDeck.length);

  // ── Draw a card to opponent hand ──────────────────────────────────────────
  function drawCardToOpponentHand(deck) {
    if (deck.length === 0) return;
    const card = deck.shift();
    if (opponentHand.cards.length >= MAX_HAND) return; // discard — hand is full
    const view = new CardView(card);
    view.useBackFace();
    opponentHand.addCard(view);
    animateDraw(view, opponentDeckView, opponentHand);
  }

  for (let i = 0; i < 4; ++i) {
    drawCardToOpponentHand(opponentDeck);
  }
  opponentDeckView.setCount(opponentDeck.length);

  // ── Opponent AI ───────────────────────────────────────────────────────────
  OpponentAI.init({
    hand:           opponentHand,
    field:          opponentField,
    playerField:    playerField,
    combat,
    rations:        opponentRations,
    playerRations:  playerRations,
    vfx,
    opponentMorale,
    playerMorale,
    registerBuff: result => {
      if (result?.cardView && !_turnBuffs.has(result.cardView))
        _turnBuffs.set(result.cardView, {
          attack:    result.originalAttack,
          health:    result.originalHealth    ?? null,
          maxHealth: result.originalMaxHealth ?? null,
        });
    },
    drawCard: () => { drawCardToOpponentHand(opponentDeck); opponentDeckView.setCount(opponentDeck.length); },
  });

  // ── End Turn button ───────────────────────────────────────────────────────
  const btn = new PIXI.Graphics();
  const BTN_W = 130, BTN_H = 44;
  function drawBtn(hover) {
    btn.clear();
    btn.beginFill(hover ? 0xf0a500 : 0xc47f00, 1);
    btn.drawRoundedRect(0, 0, BTN_W, BTN_H, 10);
    btn.endFill();
  }
  drawBtn(false);
  btn.eventMode = 'static';
  btn.cursor = 'pointer';
  const btnLabel = new PIXI.Text('End Turn', new PIXI.TextStyle({
    fontSize: 18, fill: 0xffffff, fontWeight: 'bold',
  }));
  btnLabel.anchor.set(0.5);
  btnLabel.x = BTN_W / 2;
  btnLabel.y = BTN_H / 2;
  btn.addChild(btnLabel);
  btn.on('pointerover',  () => drawBtn(true));
  btn.on('pointerout',   () => drawBtn(false));
  btn.on('pointerdown',  () => {
    if (btn._endTurnPending) return;
    btn._endTurnPending = true;
    btn.interactive = false;
    btn.alpha = 0.5;
    SoundManager.play('endTurn');
    setTimeout(() => {
      btn._endTurnPending = false;
      btn.interactive = true;
      btn.alpha = 1;
      combat.endTurn();
    }, 1000);
  });

  // ── Restart button ────────────────────────────────────────────────────────
  const restartBtn = new PIXI.Graphics();
  function drawRestartBtn(hover) {
    restartBtn.clear();
    restartBtn.beginFill(hover ? 0x5a8a3a : 0x3d6b24, 1);
    restartBtn.drawRoundedRect(0, 0, BTN_W, BTN_H, 10);
    restartBtn.endFill();
  }
  drawRestartBtn(false);
  restartBtn.eventMode = 'static';
  restartBtn.cursor = 'pointer';
  const restartLabel = new PIXI.Text('Restart', new PIXI.TextStyle({
    fontSize: 18, fill: 0xffffff, fontWeight: 'bold',
  }));
  restartLabel.anchor.set(0.5);
  restartLabel.x = BTN_W / 2;
  restartLabel.y = BTN_H / 2;
  restartBtn.addChild(restartLabel);
  restartBtn.on('pointerover',  () => drawRestartBtn(true));
  restartBtn.on('pointerout',   () => drawRestartBtn(false));
  restartBtn.on('pointerdown',  () => window.location.reload());

  function positionBtnAndDecks() {
    btn.x = app.screen.width  - BTN_W - 20;
    btn.y = app.screen.height / 2 - BTN_H - 6;
    restartBtn.x = app.screen.width - BTN_W - 20;
    restartBtn.y = app.screen.height / 2 + 6;
    playerDeckView.x = app.screen.width - 85;
    playerDeckView.y = app.screen.height - 90;
    opponentDeckView.x = app.screen.width - 85;
    opponentDeckView.y = 90;
  }
  positionBtnAndDecks();
  stage.addChild(btn);
  stage.addChild(restartBtn);

  // ── Game-over overlay ──────────────────────────────────────────────────
  function showGameOver(playerWon) {
    // Block all further input by stopping the combat and AI
    combat._isPlayerTurn = false;

    const W = app.screen.width;
    const H = app.screen.height;

    // Dark translucent backdrop
    const backdrop = new PIXI.Graphics();
    backdrop.beginFill(0x000000, 0.72);
    backdrop.drawRect(0, 0, W, H);
    backdrop.endFill();
    backdrop.eventMode = 'static'; // swallow all clicks
    backdrop.hitArea = { contains: () => true };
    stage.addChild(backdrop);

    // Panel
    const PW = 420, PH = 240;
    const panel = new PIXI.Graphics();
    panel.beginFill(playerWon ? 0x1a3a1a : 0x3a1a1a, 0.97);
    panel.drawRoundedRect(0, 0, PW, PH, 22);
    panel.endFill();
    panel.lineStyle(3, playerWon ? 0x6ee060 : 0xff5555, 1);
    panel.drawRoundedRect(0, 0, PW, PH, 22);
    panel.x = (W - PW) / 2;
    panel.y = (H - PH) / 2;
    stage.addChild(panel);

    // Title
    const title = new PIXI.Text(
      playerWon ? '⚔️  Victory!' : '💀  Defeat',
      new PIXI.TextStyle({
        fontFamily:  'Georgia, serif',
        fontSize:    52,
        fontWeight:  'bold',
        fill:        playerWon ? [0xaaffaa, 0x44dd44] : [0xff9999, 0xff3333],
        fillGradientType: PIXI.TEXT_GRADIENT.LINEAR_VERTICAL,
        dropShadow:  true,
        dropShadowColor: 0x000000,
        dropShadowDistance: 3,
        dropShadowBlur: 6,
      })
    );
    title.anchor.set(0.5, 0);
    title.x = panel.x + PW / 2;
    title.y = panel.y + 28;
    stage.addChild(title);

    // Sub-text
    const sub = new PIXI.Text(
      playerWon ? 'The enemy has lost their will to fight.' : 'Your forces have been broken.',
      new PIXI.TextStyle({ fontFamily: 'Georgia, serif', fontSize: 16, fill: 0xdddddd,
        dropShadow: true, dropShadowDistance: 1, dropShadowBlur: 3, dropShadowColor: 0x000000 })
    );
    sub.anchor.set(0.5, 0);
    sub.x = panel.x + PW / 2;
    sub.y = panel.y + 100;
    stage.addChild(sub);

    // Play again button
    const btnG = new PIXI.Graphics();
    const BW = 180, BH = 46;
    function drawPlayAgain(hover) {
      btnG.clear();
      btnG.beginFill(hover ? 0xf0a500 : 0xc47f00, 1);
      btnG.drawRoundedRect(0, 0, BW, BH, 12);
      btnG.endFill();
    }
    drawPlayAgain(false);
    btnG.x = panel.x + (PW - BW) / 2;
    btnG.y = panel.y + 158;
    btnG.eventMode = 'static';
    btnG.cursor = 'pointer';
    btnG.on('pointerover', () => drawPlayAgain(true));
    btnG.on('pointerout',  () => drawPlayAgain(false));
    btnG.on('pointerdown', () => window.location.reload());
    const btnLabel = new PIXI.Text('Play Again', new PIXI.TextStyle({
      fontFamily: 'Georgia, serif', fontSize: 20, fontWeight: 'bold', fill: 0xffffff,
    }));
    btnLabel.anchor.set(0.5);
    btnLabel.x = BW / 2;
    btnLabel.y = BH / 2;
    btnG.addChild(btnLabel);
    stage.addChild(btnG);
  }

  playerMorale.onDepleted  = () => showGameOver(false);
  opponentMorale.onDepleted = () => showGameOver(true);

  // ── Keep things centred on window resize ─────────────────────────────────
  window.addEventListener('resize', () => {
    opponentField.x = app.screen.width  / 2;
    opponentField.y = app.screen.height * 0.37;
    playerField.x   = app.screen.width  / 2;
    playerField.y   = app.screen.height * 0.63;
    opponentHand.x  = app.screen.width  * 0.30;
    opponentHand.y  = app.screen.height * 0.13;
    hand.x          = app.screen.width  * 0.30;
    hand.y          = app.screen.height * 0.88;
    opponentRations.x = app.screen.width / 2 - 78;
    opponentRations.y = 38;
    opponentMorale.x  = app.screen.width / 2 + 78;
    opponentMorale.y  = 38;
    playerRations.x   = app.screen.width / 2 - 78;
    playerRations.y   = app.screen.height - 38;
    playerMorale.x    = app.screen.width / 2 + 78;
    playerMorale.y    = app.screen.height - 38;
    positionBtnAndDecks();
  });

  // ── Draw card at start of each turn ─────────────────────────────────────-
  const origEndTurn = combat.endTurn.bind(combat);
  combat.endTurn = async function() {
    // Capture attacker data now, before state changes
    let moraleBleedFn = null;
    if (combat._isPlayerTurn) {
      const attackers = playerField._placed.map(p => p.cardView);
      if (attackers.length > 0 && opponentField._placed.length === 0)
        moraleBleedFn = () => vfx.moraleBleed(attackers, opponentMorale);
    } else {
      const attackers = opponentField._placed.map(p => p.cardView);
      if (attackers.length > 0 && playerField._placed.length === 0)
        moraleBleedFn = () => vfx.moraleBleed(attackers, playerMorale);
    }

    // Wait for any in-flight battlecry / summon animations to finish first
    if (moraleBleedFn) await vfx.waitIdle(1500);

    // Fire morale bleed now that the board is visually clear
    moraleBleedFn?.();

    // Revert temporary attack buffs/debuffs from this turn
    for (const [cardView, saved] of _turnBuffs) {
      if (!cardView.destroyed) {
        cardView.setAttack(saved.attack);
        if (saved.health !== null) {
          cardView._maxHealth = saved.maxHealth;
          cardView.setHealth(Math.min(saved.health, cardView.card.health)); // don't heal damage taken
        }
      }
    }
    _turnBuffs.clear();

    origEndTurn();
    if (combat._isPlayerTurn) {
      // Player's turn just started — draw a card and increment rations
      const playerMoraleCost = playerRations.nextTurn();
      if (playerMoraleCost > 0) playerMorale.takeDamageMulti(playerMoraleCost, true);
      drawCardToHand(playerDeck, hand);
      playerDeckView.setCount(playerDeck.length);
    } else {
      // Opponent's turn just started — draw a card, increment rations, run AI
      const opponentMoraleCost = opponentRations.nextTurn();
      if (opponentMoraleCost > 0) opponentMorale.takeDamageMulti(opponentMoraleCost, true);
      drawCardToOpponentHand(opponentDeck);
      opponentDeckView.setCount(opponentDeck.length);
      OpponentAI.onOpponentTurnStart();
    }
  };
}
