/**
 * Targeting.js
 * Shows a "pick a target" UI over a set of CardViews and returns
 * a Promise that resolves with whichever card the player clicks.
 */

let _active = false;

/**
 * @param {CardView[]} candidates  – cards the player can choose from
 * @param {boolean}    isPositive  – true → green glow, false → red glow
 * @param {string}     badgeLabel  – text shown on the glow badge, e.g. "+3" or "-2"
 * @returns {Promise<CardView|null>}  resolves with chosen card, or null if cancelled
 */
export function pickTarget(candidates, isPositive, badgeLabel) {
  if (_active || candidates.length === 0) return Promise.resolve(null);
  _active = true;

  return new Promise(resolve => {
    const cleanUp = (winner) => {
      _active = false;
      for (const cv of candidates) {
        cv.setTargetGlow(null);
        cv.off('pointerdown', cv._targetHandler);
        delete cv._targetHandler;
      }
      resolve(winner);
    };

    for (const cv of candidates) {
      // Show coloured glow + custom label
      cv.setTargetGlow(isPositive ? 1 : -1, badgeLabel);

      const handler = () => cleanUp(cv);
      cv._targetHandler = handler;
      cv.on('pointerdown', handler);
    }
  });
}
