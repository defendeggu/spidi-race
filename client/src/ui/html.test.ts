import { describe, expect, it } from 'vitest';
import { html, raw } from './html';

describe('html template', () => {
  it('escapes interpolated text, but not nested templates', () => {
    const name = '<img src=x onerror=alert(1)>"\'&';
    const out = html`<b title="${name}">${name}</b>${html`<i>ok</i>`}${raw('<br />')}`.value;
    expect(out).toBe('<b title="&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;">&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;</b><i>ok</i><br />');
  });

  it('joins arrays and skips empty values', () => {
    expect(html`${[1, 2].map((n) => html`<li>${n}</li>`)}${null}${undefined}${false}${0}`.value).toBe('<li>1</li><li>2</li>0');
  });
});
