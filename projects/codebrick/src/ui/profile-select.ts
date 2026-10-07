import { cfg } from '../config';
import { ui } from './status';

export function refreshProfileSel(): void {
  const sel = ui.profileSel;
  if (!sel) return;
  const list = cfg.profiles || [];
  sel.innerHTML = '';
  if (!list.length) {
    sel.innerHTML = '<option>未配置服务</option>';
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  list.forEach((prof, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = prof.model ? `${prof.name} · ${prof.model}` : prof.name;
    sel.appendChild(o);
  });
  sel.value = String(Math.min(cfg.activeProfile | 0, list.length - 1));
}
