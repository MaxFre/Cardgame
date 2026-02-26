// Lightweight requestAnimationFrame-based tweening — no external dependencies.

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// Tracks a generation number per target so a new tween cancels the previous one.
const _gen = new WeakMap();

/**
 * Cancel all running tweens on a target by bumping its generation counter.
 */
export function cancelTweens(target) {
  _gen.set(target, (_gen.get(target) ?? 0) + 1);
}

/**
 * Tween numeric properties on any object.
 * Starting a new tween on the same target automatically cancels any prior tween.
 */
export function tweenTo(target, props, duration = 220, easeFn = easeOutCubic) {
  // Bump generation — any previous tween on this target will see a stale id and stop
  const id = (_gen.get(target) ?? 0) + 1;
  _gen.set(target, id);

  const start = {};
  const delta = {};
  for (const key of Object.keys(props)) {
    start[key] = target[key] ?? 0;
    delta[key] = props[key] - start[key];
  }

  const startTime = performance.now();

  return new Promise(resolve => {
    function step(now) {
      // If a newer tween has started on this target, stop silently
      if (_gen.get(target) !== id) { resolve(); return; }
      const t = Math.min((now - startTime) / duration, 1);
      const e = easeFn(t);
      for (const key of Object.keys(props)) {
        target[key] = start[key] + delta[key] * e;
      }
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

// bounce-in ease for card placement
export function tweenToBack(target, props, duration = 320) {
  return tweenTo(target, props, duration, easeOutBack);
}

// accelerating ease (starts slow, ends fast) — used for the drop phase
export function tweenToFast(target, props, duration = 220) {
  return tweenTo(target, props, duration, t => t * t * t);
}
