import { escHtml, $ } from './dom';
import { cfg, DEFAULT_SHOT_WIDTH } from './config';
import { getQuestionMeta, type QuestionMeta } from './question';

declare global {
  interface Window { html2canvas?: (el: HTMLElement, opts?: Record<string, unknown>) => Promise<HTMLCanvasElement> }
}

let loading: Promise<NonNullable<Window['html2canvas']>> | null = null;

export function ensureHtml2Canvas() {
  if (typeof window.html2canvas === 'function') return Promise.resolve(window.html2canvas);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    s.onload = () => {
      if (typeof window.html2canvas === 'function') resolve(window.html2canvas);
      else reject(new Error('html2canvas 未能成功初始化'));
    };
    s.onerror = () => reject(new Error('无法从 CDN 加载 html2canvas，请检查网络'));
    document.head.appendChild(s);
  });
  return loading;
}

export interface Shot { canvas: HTMLCanvasElement; blob: Blob; dataUrl: string; meta: QuestionMeta }

export async function captureStemCard(): Promise<Shot> {
  const stem = $('.card.stem');
  if (!stem) throw new Error('未找到题干卡片（.card.stem）');

  const html2canvas = await ensureHtml2Canvas();
  const meta = getQuestionMeta();

  const header = document.createElement('div');
  header.className = 'cbocr-shot-header';
  header.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px;">
      <span class="cbocr-shot-badge">🏷️ ${escHtml(meta.source)}</span>
      ${meta.qid ? `<span class="cbocr-shot-qid">${escHtml(meta.qid)}</span>` : ''}
    </div>
    <div class="cbocr-shot-meta-right">
      ${meta.score ? `<span class="cbocr-shot-score"><span style="color:#d97706">💯</span> ${escHtml(meta.score)}</span>` : ''}
      ${meta.difficulty ? `<span class="cbocr-shot-diff"><span>难度</span> <span class="stars">${escHtml(meta.difficulty)}</span></span>` : ''}
    </div>`;
  stem.prepend(header);

  // 约束排版宽度：防止大图把题卡撑得过宽，导入 iPad/GoodNotes 时被等比缩小成微雕
  const targetWidth = Math.max(500, parseInt(String(cfg.shotWidth), 10) || DEFAULT_SHOT_WIDTH);
  const prev = { w: stem.style.width, mw: stem.style.maxWidth, bs: stem.style.boxSizing };
  stem.style.width = targetWidth + 'px';
  stem.style.maxWidth = targetWidth + 'px';
  stem.style.boxSizing = 'border-box';

  const extraStyle = document.createElement('style');
  extraStyle.textContent = '.card.stem img, .card.stem svg { max-width: 100% !important; height: auto !important; }';
  document.head.appendChild(extraStyle);

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(stem, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      scrollY: -window.scrollY,
      scrollX: 0,
    });
  } finally {
    header.remove();
    extraStyle.remove();
    stem.style.width = prev.w;
    stem.style.maxWidth = prev.mw;
    stem.style.boxSizing = prev.bs;
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('生成截图图片失败'));
      resolve({ canvas, blob, dataUrl: canvas.toDataURL('image/png'), meta });
    }, 'image/png');
  });
}
