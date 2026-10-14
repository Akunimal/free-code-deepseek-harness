import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../../..');
const CONVERSATION_CSS = join(
  ROOT,
  'vendor/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css',
);

function cssBlock(css: string, selector: string): string {
  // For a single pseudo selector prefer its dedicated rule after the shared
  // pseudo-element block (notably `.root::after`), but ignore later keyframes
  // and reduced-motion overrides when reading the base style.
  const keyframes = css.indexOf('@keyframes');
  const baseRules = keyframes < 0 ? css : css.slice(0, keyframes);
  const start = baseRules.lastIndexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing CSS rule: ${selector}`);
  const open = css.indexOf('{', start);
  let depth = 1;
  for (let index = open + 1; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') depth -= 1;
    if (depth === 0) return css.slice(open + 1, index);
  }
  throw new Error(`unterminated CSS rule: ${selector}`);
}

function effectiveMixAlpha(rule: string): number {
  const mixPercent = rule.match(/(\d+(?:\.\d+)?)%\s*,\s*transparent\)/)?.[1];
  const opacity = rule.match(/\bopacity:\s*(\d*\.?\d+)/)?.[1];
  if (mixPercent === undefined || opacity === undefined) {
    throw new Error('ambient gradient must declare a color-mix alpha and layer opacity');
  }
  return Number(mixPercent) / 100 * Number(opacity);
}

function reducedMotionBlock(css: string): string {
  const start = css.indexOf('@media (prefers-reduced-motion: reduce)');
  if (start < 0) throw new Error('missing reduced-motion rule');
  return cssBlock(css.slice(start), '@media (prefers-reduced-motion: reduce)');
}

describe('ConversationRoot ambient background visibility', () => {
  const css = readFileSync(CONVERSATION_CSS, 'utf8');

  it('keeps both gradient hotspots visibly colored instead of barely tinting the base', () => {
    for (const selector of ['.root::before', '.root::after']) {
      expect(effectiveMixAlpha(cssBlock(css, selector)), selector).toBeGreaterThanOrEqual(0.25);
    }
  });

  it('retains the static ambient wash when reduced motion disables animation', () => {
    const reduced = reducedMotionBlock(css);
    expect(reduced).toMatch(/animation:\s*none/);
    expect(reduced).not.toMatch(/\bopacity\s*:/);
  });

  it('stacks the ambient layers above the opaque root base and below conversation content', () => {
    expect(cssBlock(css, '.root')).toMatch(/isolation:\s*isolate/);
    const layers = cssBlock(css, '.root::before,\n.root::after');
    expect(layers).toMatch(/z-index:\s*0/);
    expect(layers).toMatch(/pointer-events:\s*none/);
    expect(cssBlock(css, '.root > *')).toMatch(/z-index:\s*1/);
  });
});
