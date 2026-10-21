import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { contrast, palettes, separation } from './colour-math.mjs';
const modes = palettes(readFileSync(new URL('../public/theme-tokens.css', import.meta.url), 'utf8'));

test('every palette retains AA contrast for primary financial text and essential chart lines on dark surfaces', () => {
  for (const [mode, tokens] of Object.entries(modes)) {
    for (const surface of ['background', 'surface', 'surface-raised']) {
      for (const foreground of ['text', 'text-muted', 'gain', 'loss', 'warning']) {
        assert.ok(contrast(tokens[foreground], tokens[surface]) >= 4.5, `${mode}: ${foreground} / ${surface}`);
      }
      for (const line of ['chart-gain', 'chart-loss', 'chart-1', 'chart-2', 'chart-3', 'chart-4']) {
        assert.ok(contrast(tokens[line], tokens[surface]) >= 3, `${mode}: ${line} graphical contrast`);
      }
    }
    for (const fill of ['buy', 'buy-light', 'buy-deep']) {
      assert.ok(contrast(tokens['category-tone-07'], tokens[fill]) >= 4.5, `${mode}: Buy label / ${fill}`);
    }
    for (const fill of ['link-ink', 'link-ink-hover']) {
      assert.ok(contrast(tokens.white, tokens[fill]) >= 4.5, `${mode}: legacy Retry label / ${fill}`);
    }
    assert.ok(contrast(tokens['loss-ink'], tokens['surface-paper']) >= 4.5, `${mode}: legacy quote error`);
  }
});

test('both safe palettes keep gain/loss well separated under all three full-severity simulations', () => {
  for (const mode of ['red-green', 'blue-yellow']) {
    for (const deficiency of ['protanopia', 'deuteranopia', 'tritanopia']) {
      const delta = separation(modes[mode].gain, modes[mode].loss, deficiency);
      assert.ok(delta >= 20, `${mode} / ${deficiency}: ΔE76 ${delta.toFixed(2)} (engineering threshold 20, not a WCAG conformance metric)`);
    }
  }
});

test('Off preserves the established performance and blue action palette', () => {
  assert.equal(modes.off.gain, '#94c973');
  assert.equal(modes.off.loss, '#ff7a6e');
  assert.equal(modes.off['chart-gain'], '#22c55e');
  assert.equal(modes.off.buy, '#779ce8');
  assert.equal(modes.off['buy-light'], '#91b1f1');
  assert.equal(modes.off['buy-deep'], '#678bdb');
});
