export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null =>
  root.querySelector<T>(sel);

export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] =>
  [...root.querySelectorAll<T>(sel)];

export const getTextarea = () => $<HTMLTextAreaElement>('textarea.ca-textarea');

/** Vue 的 v-model 监听 input 事件，改完值必须派发才会被记录 / 触发自动保存 */
export function setValue(ta: HTMLTextAreaElement, val: string): void {
  ta.value = val;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.dispatchEvent(new Event('change', { bubbles: true }));
}

export function getStem(): string {
  const el = $('.card.stem');
  return el ? el.innerText.trim().slice(0, 3000) : '';
}

export function escHtml(s: unknown): string {
  return String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
}

export function waitFor<T>(fn: () => T | null | undefined | false, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      const v = fn();
      if (v) return resolve(v);
      if (Date.now() - t0 > ms) return resolve(null);
      setTimeout(tick, 200);
    };
    tick();
  });
}

export function findButton(text: string): HTMLButtonElement | undefined {
  return $$<HTMLButtonElement>('button').find((b) => b.textContent!.trim() === text);
}
