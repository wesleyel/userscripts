/** 浮动面板的可变 UI 引用、Snackbar 提示与按钮工厂 */
export const ui = {
  undoBtn: null as HTMLButtonElement | null,
  actionBtns: [] as HTMLButtonElement[],
  /** 服务档案被设置面板改动后，刷新「切换服务」按钮标签 */
  onProfileChange: null as (() => void) | null,
};

let toast: HTMLElement | null = null;
let toastTimer = 0;

/** Material Snackbar：左下角，几秒后自动消失；空串立即收起 */
export function setStatus(msg: string, kind?: 'ok' | 'err'): void {
  if (!toast || !toast.isConnected) {
    toast = document.createElement('div');
    toast.className = 'cbocr-toast';
    document.body.appendChild(toast);
  }
  window.clearTimeout(toastTimer);
  if (!msg) { toast.classList.remove('show'); return; }
  toast.textContent = msg;
  toast.className = 'cbocr-toast show' + (kind ? ' ' + kind : '');
  toastTimer = window.setTimeout(() => toast?.classList.remove('show'), kind === 'err' ? 9000 : 4500);
}

export function setBusy(v: boolean): void {
  ui.actionBtns.forEach((b) => { b.disabled = v; });
}

/** Material 迷你悬浮按钮：圆形图标，悬停展开文字标签 */
export function mkFab(icon: string, label: string, cls: string, onClick: (e: MouseEvent) => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'cbocr-fab' + (cls ? ' ' + cls : '');
  b.setAttribute('aria-label', label);
  b.innerHTML = '<span class="cbocr-fab-ic"></span><span class="cbocr-fab-label"></span>';
  b.firstElementChild!.textContent = icon;
  b.lastElementChild!.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

export function setFabLabel(b: HTMLElement, label: string): void {
  b.setAttribute('aria-label', label);
  const el = b.querySelector('.cbocr-fab-label');
  if (el) el.textContent = label;
}
