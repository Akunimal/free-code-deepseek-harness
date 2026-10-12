import { describe, expect, it } from 'vitest';
import { renderUpdateIndicatorHtml } from '../src/main/update-indicator-html.js';

describe('update indicator HTML', () => {
  it('renders the 34px action as a circular, reset native button', () => {
    const html = renderUpdateIndicatorHtml('Update available');

    expect(html).toContain('width:34px;height:34px');
    expect(html).toContain('padding:0');
    expect(html).toContain('-webkit-appearance:none');
    expect(html).toContain('appearance:none');
    expect(html).toContain('border-radius:50%');
    expect(html).toContain('background:transparent');
    expect(html).toContain('transform="rotate(180 8 8)"');
    expect(html).not.toContain('transform:translateY(-2px)');
  });

  it('escapes the localized label before interpolating it into HTML', () => {
    const html = renderUpdateIndicatorHtml('Update <available> & "ready"');

    expect(html).toContain('aria-label="Update &lt;available&gt; &amp; &quot;ready&quot;"');
    expect(html).not.toContain('aria-label="Update <available>');
  });
});
