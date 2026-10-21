// WCAG relative luminance, sRGB transfer functions and CIE Lab (D65).
export const linear = channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
export function rgb(value) {
  if (value.startsWith('#')) {
    let hex = value.slice(1);
    if (hex.length < 5) hex = [...hex].map(c => c + c).join('');
    return [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  }
  return value.match(/[\d.]+/g).slice(0, 3).map(channel => Number(channel) / 255);
}
export function contrast(a, b) {
  const luminance = colour => rgb(colour).map(linear).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
  const [low, high] = [luminance(a), luminance(b)].sort((a, b) => a - b);
  return (high + .05) / (low + .05);
}
// Full-severity Machado, Oliveira & Fernandes simulation matrices in linear sRGB.
// Published data: https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
// Reference implementation: colour-science/colour, blindness/datasets/machado2010.py (BSD-3-Clause).
const matrices = {
  protanopia: [[.152286, 1.052583, -.204868], [.114503, .786281, .099216], [-.003882, -.048116, 1.051998]],
  deuteranopia: [[.367322, .860646, -.227968], [.280085, .672501, .047413], [-.011820, .042940, .968881]],
  tritanopia: [[1.255528, -.076749, -.178779], [-.078411, .930809, .147602], [.004733, .691367, .303900]],
};
export function simulate(colour, deficiency) {
  const channels = rgb(colour).map(linear);
  return matrices[deficiency].map(row => Math.max(0, Math.min(1, row.reduce((sum, c, i) => sum + c * channels[i], 0))));
}
function lab(channels) {
  const xyz = [[.4124564, .3575761, .1804375], [.2126729, .7151522, .0721750], [.0193339, .1191920, .9503041]]
    .map((row, index) => row.reduce((sum, c, i) => sum + c * channels[i], 0) / [.95047, 1, 1.08883][index]);
  const [x, y, z] = xyz.map(c => c > 216 / 24389 ? Math.cbrt(c) : (24389 / 27 * c + 16) / 116);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function separation(a, b, deficiency) {
  const first = lab(simulate(a, deficiency)), second = lab(simulate(b, deficiency));
  return Math.hypot(...first.map((value, i) => value - second[i]));
}

export function palettes(css) {
  const rules = [...css.matchAll(/(:root(?:\[data-colour-mode="([\w-]+)"\])?)\s*\{([^}]+)\}/g)];
  const parse = text => Object.fromEntries([...text.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));
  const base = parse(rules[0][3]);
  return Object.fromEntries(['off', 'red-green', 'blue-yellow'].map(mode => {
    const tokens = { ...base, ...parse(rules.find(rule => rule[2] === mode)?.[3] ?? '') };
    const resolve = (name, seen = new Set()) => {
      if (seen.has(name)) throw new Error('Cyclic token: ' + name);
      seen.add(name);
      return tokens[name]?.replace(/var\(--([\w-]+)\)/g, (_match, alias) => resolve(alias, new Set(seen)));
    };
    return [mode, Object.fromEntries(Object.keys(tokens).map(name => [name, resolve(name)]))];
  }));
}
