/** 面板上的可变 UI 引用与状态提示 */
export const ui = {
  statusEl: null as HTMLElement | null,
  undoBtn: null as HTMLButtonElement | null,
  pasteBtn: null as HTMLButtonElement | null,
  profileSel: null as HTMLSelectElement | null,
  actionBtns: [] as HTMLButtonElement[],
};

export function setStatus(msg: string, kind?: 'ok' | 'err'): void {
  const el = ui.statusEl;
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'cbocr-status' + (kind ? ' ' + kind : '');
}

export function setBusy(v: boolean): void {
  ui.actionBtns.forEach((b) => { b.disabled = v; });
}

export function mkBtn(label: string, cls: string, onClick: (e: MouseEvent) => void, title?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'cbocr-btn' + (cls ? ' ' + cls : '');
  b.textContent = label;
  if (title) b.title = title;
  b.addEventListener('click', onClick);
  return b;
}
