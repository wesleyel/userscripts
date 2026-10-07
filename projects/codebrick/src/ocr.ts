import { chat, toBase64 } from './ai';
import { cfg, providerLabel } from './config';
import { getStem, getTextarea, setValue } from './dom';
import { state } from './state';
import { setBusy, setStatus, ui } from './ui/status';

export function insertText(ta: HTMLTextAreaElement, text: string): void {
  const cur = ta.value;
  if (cfg.insertMode === 'replace') {
    setValue(ta, text);
  } else if (cfg.insertMode === 'cursor') {
    const s = ta.selectionStart ?? cur.length;
    const e = ta.selectionEnd ?? cur.length;
    setValue(ta, cur.slice(0, s) + text + cur.slice(e));
    ta.focus();
    ta.setSelectionRange(s + text.length, s + text.length);
  } else {
    const sep = cur.trim() ? (cur.endsWith('\n') ? '\n' : '\n\n') : '';
    setValue(ta, cur + sep + text);
    ta.scrollTop = ta.scrollHeight;
  }
}

export async function runOCR(files: Iterable<File>): Promise<void> {
  const ta = getTextarea();
  if (!ta) return;
  if (state.busy) { setStatus('还在识别上一张，稍等…'); return; }

  const imgs = [...files].filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) { setStatus('没找到图片', 'err'); return; }

  state.busy = true;
  setBusy(true);
  try {
    setStatus(`压缩 ${imgs.length} 张图…`);
    const payload = [];
    for (const f of imgs) payload.push(await toBase64(f, cfg.maxEdge));

    let contextText = imgs.length > 1
      ? `以上 ${imgs.length} 张图按顺序是同一份作答的连续页面，请连贯地转录成一份完整答案。`
      : '请转录上面这张图里的手写内容。';

    if (cfg.useStem) {
      const stem = getStem();
      if (stem) {
        contextText += `\n\n以下是这道题的题干，仅供你识别专业术语、符号和小问编号时参考，**不要作答、不要把题干抄进输出**：\n\n<题干>\n${stem}\n</题干>`;
      }
    }

    setStatus(`${providerLabel()} 识别中…`);
    const t0 = Date.now();
    const text = await chat(cfg.prompt, contextText, payload);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (!text) throw new Error('模型返回了空结果，换张更清晰的图或换个模型试试');

    state.undoSnapshot = ta.value;
    insertText(ta, text);
    setStatus(`✓ 已插入 ${text.length} 字（${secs}s）`, 'ok');
    if (ui.undoBtn) ui.undoBtn.style.display = '';
  } catch (e) {
    console.error('[cbocr]', e);
    setStatus((e as Error).message, 'err');
  } finally {
    state.busy = false;
    setBusy(false);
  }
}
