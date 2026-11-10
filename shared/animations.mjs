// Numeric IDs from Trimlight Edge API documentation, Appendix [5].
// https://trimlight.com/hubfs/Manuals/Trimlight_Edge_API_Documentation%208192022.pdf
// Do not infer newer firmware IDs from the mobile picker's display order.
export const CUSTOM_ANIMATIONS = Object.freeze([
  [0, 'Static'], [1, 'Chase forward'], [2, 'Chase backward'],
  [3, 'Chase middle to out'], [4, 'Chase out to middle'],
  [5, 'Stars (twinkle fade)'], [6, 'Breath (fade)'],
  [7, 'Comet forward'], [8, 'Comet backward'],
  [9, 'Comet middle to out'], [10, 'Comet out to middle'],
  [11, 'Wave forward'], [12, 'Wave backward'],
  [13, 'Wave middle to out'], [14, 'Wave out to middle'],
  [15, 'Strobe'], [16, 'Solid fade'],
].map(([mode, label]) => Object.freeze({mode, label})));

export function animationOptions(effect) {
  if (effect.category === 0) return [{mode: effect.mode, label: 'Built-in controller effect (' + effect.mode + ')'}];
  if (CUSTOM_ANIMATIONS.some(a => a.mode === effect.mode)) return CUSTOM_ANIMATIONS;
  return [{mode: effect.mode, label: 'Imported controller animation (' + effect.mode + ')'}, ...CUSTOM_ANIMATIONS];
}
