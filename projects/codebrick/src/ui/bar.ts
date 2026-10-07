import { gradeAnswer } from '../ai';
import { writeClipboard, writeClipboardImage } from '../clipboard';
import { cfg, providerLabel, save } from '../config';
import { getTextarea, setValue } from '../dom';
import { buildDoc, type QuestionKind } from '../question';
import { runOCR } from '../ocr';
import { captureStemCard } from '../screenshot';
import { state } from '../state';
import { showResult, showScreenshotModal } from './modals';
import { refreshProfileSel } from './profile-select';
import { openSettings } from './settings';
import { mkBtn, setBusy, setStatus, ui } from './status';

async function handleSmartScreenshot(): Promise<void> {
  if (state.busy) { setStatus('还在处理中，稍等…'); return; }
  state.busy = true;
  setBusy(true);
  setStatus('正在生成题干截图…');
  try {
    const { canvas, blob, dataUrl, meta } = await captureStemCard();
    let copied = false;
    try {
      copied = await writeClipboardImage(blob);
    } catch (err) {
      console.warn('[cbocr] 写入剪贴板异常:', err);
    }
    setStatus(copied ? '✓ 截图已复制到剪贴板' : '✓ 截图已生成', 'ok');
    showScreenshotModal(blob, dataUrl, meta, canvas);
  } catch (e) {
    console.error('[cbocr] 智能截图失败:', e);
    setStatus('截图失败：' + (e as Error).message, 'err');
  } finally {
    state.busy = false;
    setBusy(false);
  }
}

/** 复制按钮：包一层 disabled + 状态提示 */
function copyButton(label: string, title: string, run: () => Promise<string>): HTMLButtonElement {
  const btn = mkBtn(label, '', async () => {
    btn.disabled = true;
    try {
      setStatus(await run(), 'ok');
    } catch (e) {
      console.error('[cbocr]', e);
      setStatus('复制失败：' + (e as Error).message, 'err');
    } finally {
      btn.disabled = false;
    }
  }, title);
  return btn;
}

function choiceCopyButtons(): HTMLButtonElement[] {
  const quick = copyButton('📋 复制题目+选项', '复制题干、全部选项和我当前选的答案（不含正确答案，刷题途中可放心用）', async () => {
    const { text, choice } = await buildDoc({ header: true, reveal: false });
    await writeClipboard(text);
    const mine = choice?.mine.join('、') || '未选择';
    return `✓ 已复制题干 + ${choice?.options.length ?? 0} 个选项 · 我的选择：${mine}`;
  });

  const full = copyButton('📄 复制全题', '复制题干、选项、我的选择、正确答案和解析（答案揭晓后可用）', async () => {
    const { text, choice, hasAnalysis } = await buildDoc({ header: true });
    await writeClipboard(text);
    if (!choice?.revealed) return '已复制，但答案还没揭晓：提交或点「看解析」后再复制才带正确答案';
    return `✓ 已复制 · 我的选择：${choice.mine.join('、') || '未选'} · 正确答案：${choice.correct.join('、') || '未知'}${hasAnalysis ? ' · 含解析' : ''}`;
  });
  return [quick, full];
}

function subjectiveButtons(fileInput: HTMLInputElement): HTMLButtonElement[] {
  const selBtn = mkBtn('🖊️ 手写转文字', 'primary', () => fileInput.click(),
    '选择 iPad 导出的手写图片（可多选，按顺序拼接）');

  const label = () => (cfg.autoPaste ? '📋 自动识别粘贴：开' : '📋 自动识别粘贴：关');
  const pasteBtn = mkBtn(label(), 'cbocr-toggle' + (cfg.autoPaste ? ' on' : ''), () => {
    save('autoPaste', !cfg.autoPaste);
    pasteBtn.textContent = label();
    pasteBtn.className = 'cbocr-btn cbocr-toggle' + (cfg.autoPaste ? ' on' : '');
  }, '开启后，在答题框里 Cmd+V 粘贴图片会自动送去识别');
  ui.pasteBtn = pasteBtn;

  const undoBtn = mkBtn('↩︎ 撤销插入', '', () => {
    const ta = getTextarea();
    if (ta && state.undoSnapshot !== null) {
      setValue(ta, state.undoSnapshot);
      state.undoSnapshot = null;
      undoBtn.style.display = 'none';
      setStatus('已撤销');
    }
  });
  undoBtn.style.display = 'none';
  ui.undoBtn = undoBtn;

  const copyBtn = copyButton('📄 复制全题', '把题干、我的作答、完整解析拼成 Markdown 复制到剪贴板（解析没展开会自动点开）', async () => {
    const { text } = await buildDoc({ header: true });
    await writeClipboard(text);
    return `✓ 已复制 ${text.length} 字（题干 + 我的作答 + 完整解析）`;
  });

  const gradeBtn = mkBtn('🧮 AI 判分', '', async () => {
    if (state.busy) { setStatus('还在忙，稍等…'); return; }
    state.busy = true; setBusy(true); gradeBtn.disabled = true;
    try {
      const { result, secs } = await gradeAnswer();
      const score = result.match(/总分[：:]\s*\*{0,2}\s*([\d.]+)\s*\/\s*([\d.]+)/);
      setStatus(score ? `✓ 判分完成：${score[1]} / ${score[2]} 分（${secs}s）` : `✓ 判分完成（${secs}s）`, 'ok');
      showResult('AI 判分结果', result, `${providerLabel()} · 耗时 ${secs}s · 对照站点解析的踩分点，仅供参考`);
    } catch (e) {
      console.error('[cbocr]', e);
      setStatus((e as Error).message, 'err');
    } finally {
      state.busy = false; setBusy(false); gradeBtn.disabled = false;
    }
  }, '把题干 + 我的作答 + 完整解析发给模型，对照踩分点逐点判分（用你自己的 API Key，不消耗站点积分）');

  return [selBtn, ui.pasteBtn, undoBtn, copyBtn, gradeBtn];
}

export function buildBar(anchor: Element, kind: QuestionKind): void {
  const bar = document.createElement('div');
  bar.className = 'cbocr-bar';
  bar.dataset.cbocr = '1';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.multiple = true;
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', () => {
    if (fileInput.files?.length) runOCR(fileInput.files);
    fileInput.value = '';
  });

  const shotBtn = mkBtn('📸 智能截图', '', handleSmartScreenshot,
    '截取题干高清题卡（顶部条自动标注题源、分值、难度，黄金宽度排版防止图片缩放文字过小）');

  const cfgBtn = mkBtn('⚙️', '', openSettings, '管理识别服务 / 提示词 / 截图排版');
  ui.statusEl = document.createElement('span');
  ui.statusEl.className = 'cbocr-status';

  const items: HTMLElement[] = [];
  const actions: HTMLButtonElement[] = [shotBtn];

  if (kind === 'choice') {
    const copies = choiceCopyButtons();
    items.push(...copies, shotBtn);
    actions.push(...copies);
  } else {
    const [selBtn, pasteBtn, undoBtn, copyBtn, gradeBtn] = subjectiveButtons(fileInput);
    const sel = document.createElement('select');
    sel.className = 'cbocr-select';
    sel.title = '切换识别服务';
    sel.addEventListener('change', () => {
      save('activeProfile', Number(sel.value));
      setStatus('已切换到 ' + providerLabel());
    });
    ui.profileSel = sel;
    refreshProfileSel();
    items.push(selBtn, pasteBtn, undoBtn, shotBtn, copyBtn, gradeBtn, sel);
    actions.push(selBtn, undoBtn, copyBtn, gradeBtn);
  }

  ui.actionBtns = actions;
  bar.append(fileInput, ...items, cfgBtn, ui.statusEl);
  anchor.after(bar);
}
