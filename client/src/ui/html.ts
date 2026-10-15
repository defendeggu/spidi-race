/**
 * HTML templates that escape by default: every value interpolated into html`…` is escaped,
 * unless it is itself the result of html`…` (or explicitly marked with raw()).
 * Arrays are joined, null / undefined / false render as nothing.
 */
export class SafeHtml {
  constructor(readonly value: string) {}
  toString() {
    return this.value;
  }
}

export type HtmlValue = SafeHtml | string | number | boolean | null | undefined | HtmlValue[];

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function render(v: HtmlValue): string {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(render).join('');
  return escapeHtml(String(v));
}

export function html(strings: TemplateStringsArray, ...values: HtmlValue[]): SafeHtml {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** Trusted markup that must not be escaped (static strings only, never user input). */
export function raw(s: string) {
  return new SafeHtml(s);
}

/** Replace the content of an element with a template. */
export function setHtml(el: Element, content: SafeHtml) {
  el.innerHTML = content.value;
}
