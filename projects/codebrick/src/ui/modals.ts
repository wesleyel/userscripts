import { writeClipboard, writeClipboardImage, downloadImage } from '../clipboard';
import { escHtml, getTextarea, setValue } from '../dom';
import { mdToHtml } from '../markdown';
import type { QuestionMeta } from '../question';
import { state } from '../state';
import { ui } from './status';

function setTip(tip: HTMLElement, msg: string, kind: 'ok' | 'err'): void {
  tip.textContent = msg;
  tip.className = 'cbocr-status ' + kind;
}

export function showScreenshotModal(blob: Blob, dataUrl: string, meta: QuestionMeta, canvas: HTMLCanvasElement): void {
  const mask = document.createElement('div');
  mask.className = 'cbocr-mask';
  const w = Math.round(canvas.width / 2); // Retina 2x

  mask.innerHTML = `
    <div class="cbocr-modal wide">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
        <h3 style="margin:0">📸 题干智能截图</h3>
        <div style="display:flex; gap:6px;">
          <button class="cbocr-btn cbocr-mini" data-act="toggle-scale" data-scaled="false" title="切换缩放模式">🔍 适应窗口</button>
        </div>
      </div>
      <p class="cbocr-meta">
        ${escHtml(meta.source)} · ${meta.score ? escHtml(meta.score) + ' · ' : ''}${meta.difficulty ? '难度 ' + escHtml(meta.difficulty) + ' · ' : ''}2x 高清题卡 (${canvas.width}×${canvas.height}px · 排版宽 ${w}px)
      </p>
      <div class="cbocr-shot-preview">
        <img src="${dataUrl}" alt="题干截图" style="width:${w}px; max-width:none;" />
      </div>
      <div class="cbocr-actions">
        <button class="cbocr-btn" data-act="copy">📋 复制图片</button>
        <button class="cbocr-btn" data-act="download">💾 下载图片</button>
        <button class="cbocr-btn primary" data-act="close">关闭</button>
      </div>
      <div class="cbocr-status ok" data-role="tip" style="margin-top:8px">
        ✓ 已自动写入系统剪贴板，可直接在 iPad/备忘录/GoodNotes 中 Cmd+V 粘贴
      </div>
    </div>`;
  document.body.appendChild(mask);

  const tip = mask.querySelector<HTMLElement>('[data-role=tip]')!;
  const img = mask.querySelector<HTMLImageElement>('.cbocr-shot-preview img')!;
  const scaleBtn = mask.querySelector<HTMLButtonElement>('[data-act=toggle-scale]')!;
  const close = () => mask.remove();
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });

  const safeName = [meta.qid, meta.source].filter(Boolean).join('-').replace(/[\s·\/:*?"<>|]+/g, '_') + '.png';

  scaleBtn.addEventListener('click', () => {
    const scaled = scaleBtn.dataset.scaled === 'true';
    img.style.maxWidth = scaled ? 'none' : '100%';
    img.style.width = scaled ? w + 'px' : 'auto';
    scaleBtn.textContent = scaled ? '🔍 适应窗口' : '🔍 1:1 原尺寸';
    scaleBtn.dataset.scaled = String(!scaled);
  });

  mask.querySelectorAll<HTMLButtonElement>('.cbocr-actions button').forEach((b) => {
    b.addEventListener('click', async () => {
      const act = b.dataset.act;
      if (act === 'close') return close();
      if (act === 'download') {
        downloadImage(dataUrl, safeName);
        return setTip(tip, '✓ 已触发下载：' + safeName, 'ok');
      }
      if (act === 'copy') {
        try {
          if (!(await writeClipboardImage(blob))) throw new Error('浏览器未允许写入图片到剪贴板，建议点击「下载图片」');
          setTip(tip, '✓ 图片已再次复制到剪贴板', 'ok');
        } catch (e) {
          setTip(tip, '复制失败：' + (e as Error).message, 'err');
        }
      }
    });
  });
}

export function showResult(title: string, body: string, meta?: string): void {
  const mask = document.createElement('div');
  mask.className = 'cbocr-mask';
  mask.innerHTML = `
    <div class="cbocr-modal wide">
      <h3>${title}</h3>
      <p class="cbocr-meta"></p>
      <div class="cbocr-result"></div>
      <div class="cbocr-actions">
        <button class="cbocr-btn" data-act="append">追加到作答</button>
        <button class="cbocr-btn" data-act="copy">复制结果</button>
        <button class="cbocr-btn primary" data-act="close">关闭</button>
      </div>
      <div class="cbocr-status" data-role="tip" style="margin-top:8px"></div>
    </div>`;
  mask.querySelector('.cbocr-meta')!.textContent = meta || '';
  mask.querySelector('.cbocr-result')!.innerHTML = mdToHtml(body);
  document.body.appendChild(mask);

  const tip = mask.querySelector<HTMLElement>('[data-role=tip]')!;
  const copyResult = async (automatic = false) => {
    try {
      await writeClipboard(body);
      setTip(tip, automatic ? '✓ 判分结果已自动复制到剪贴板，关闭后仍可粘贴' : '✓ 已复制到剪贴板', 'ok');
    } catch (e) {
      setTip(tip, (automatic ? '自动复制失败，请点击「复制结果」重试：' : '复制失败：') + (e as Error).message, 'err');
    }
  };
  void copyResult(true);
  const close = () => mask.remove();
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });

  mask.querySelectorAll<HTMLButtonElement>('.cbocr-actions button').forEach((b) => {
    b.addEventListener('click', async () => {
      const act = b.dataset.act;
      if (act === 'close') return close();
      if (act === 'copy') return void (await copyResult());
      if (act === 'append') {
        const ta = getTextarea();
        if (!ta) return;
        state.undoSnapshot = ta.value;
        const sep = ta.value.trim() ? '\n\n' : '';
        setValue(ta, ta.value + sep + '---\n\n' + body);
        if (ui.undoBtn) ui.undoBtn.style.display = '';
        setTip(tip, '✓ 已追加到答题框（面板上可撤销）', 'ok');
      }
    });
  });
}
