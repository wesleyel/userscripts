import { cfg } from './config';
import { runOCR } from './ocr';

/** 答题框：拦截粘贴 / 拖拽图片 → OCR */
export function bindTextarea(ta: HTMLTextAreaElement): void {
  if (ta.dataset.cbocrBound) return;
  ta.dataset.cbocrBound = '1';

  ta.addEventListener('paste', (e) => {
    if (!cfg.autoPaste) return;
    const files = [...(e.clipboardData?.items || [])]
      .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
      .map((it) => it.getAsFile())
      .filter((f): f is File => !!f);
    if (!files.length) return;

    if (!cfg.keepImage) {
      e.preventDefault();
      e.stopPropagation();
    }
    setTimeout(() => runOCR(files), cfg.keepImage ? 800 : 0);
  }, true);

  ta.addEventListener('dragover', (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    e.preventDefault();
    ta.classList.add('cbocr-drop');
  });
  ta.addEventListener('dragleave', () => ta.classList.remove('cbocr-drop'));
  ta.addEventListener('drop', (e) => {
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
    ta.classList.remove('cbocr-drop');
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    runOCR(files);
  }, true);
}
