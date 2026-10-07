import { gradeAnswer } from '../ai';
import { writeClipboard, writeClipboardImage } from '../clipboard';
import { cfg, providerLabel, save } from '../config';
import { getTextarea, setValue } from '../dom';
import { buildDoc, type QuestionKind } from '../question';
import { runOCR } from '../ocr';
import { captureStemCard } from '../screenshot';
import { state } from '../state';
import { showResult, showScreenshotModal } from './modals';
import { openSettings } from './settings';
import { mkFab, setBusy, setFabLabel, setStatus, ui } from './status';

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
    // 静默模式：只写剪贴板；写失败时退回弹窗，免得截图白做
    if (cfg.shotMode === 'silent' && copied) {
      setStatus('✓ 题卡截图已复制到剪贴板，可直接粘贴', 'ok');
    } else {
      setStatus(copied ? '✓ 截图已复制到剪贴板' : '✓ 截图已生成', 'ok');
      showScreenshotModal(blob, dataUrl, meta, canvas);
    }
  } catch (e) {
    console.error('[cbocr] 智能截图失败:', e);
    setStatus('截图失败：' + (e as Error).message, 'err');
  } finally {
    state.busy = false;
    setBusy(false);
  }
}

/** 复制按钮：包一层 disabled + 状态提示 */
function copyFab(icon: string, label: string, cls: string, run: () => Promise<string>): HTMLButtonElement {
  const btn = mkFab(icon, label, cls, async () => {
    btn.disabled = true;
    try {
      setStatus(await run(), 'ok');
    } catch (e) {
      console.error('[cbocr]', e);
      setStatus('复制失败：' + (e as Error).message, 'err');
    } finally {
      btn.disabled = false;
    }
  });
  return btn;
}

function choiceCopyButtons(): HTMLButtonElement[] {
  const quick = copyFab('📋', '复制题目 + 选项 + 我的选择', 'primary', async () => {
    const { text, choice } = await buildDoc({ header: true, reveal: false });
    await writeClipboard(text);
    const mine = choice?.mine.join('、') || '未选择';
    return `✓ 已复制题干 + ${choice?.options.length ?? 0} 个选项 · 我的选择：${mine}`;
  });

  const full = copyFab('📄', '复制全题（含正确答案 / 解析）', '', async () => {
    const { text, choice, hasAnalysis } = await buildDoc({ header: true });
    await writeClipboard(text);
    if (!choice?.revealed) return '已复制，但答案还没揭晓：提交或点「看解析」后再复制才带正确答案';
    return `✓ 已复制 · 我的选择：${choice.mine.join('、') || '未选'} · 正确答案：${choice.correct.join('、') || '未知'}${hasAnalysis ? ' · 含解析' : ''}`;
  });
  return [quick, full];
}

function subjectiveButtons(fileInput: HTMLInputElement): HTMLButtonElement[] {
  const selBtn = mkFab('🖊️', '手写转文字（选图，可多选）', 'primary', () => fileInput.click());

  const pasteLabel = () => (cfg.autoPaste ? '自动识别粘贴：开' : '自动识别粘贴：关');
  const pasteBtn = mkFab('📥', pasteLabel(), 'toggle' + (cfg.autoPaste ? ' on' : ''), () => {
    save('autoPaste', !cfg.autoPaste);
    setFabLabel(pasteBtn, pasteLabel());
    pasteBtn.classList.toggle('on', cfg.autoPaste);
  });

  const undoBtn = mkFab('↩︎', '撤销插入', '', () => {
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

  const copyBtn = copyFab('📄', '复制全题（题干 / 作答 / 解析）', '', async () => {
    const { text } = await buildDoc({ header: true });
    await writeClipboard(text);
    return `✓ 已复制 ${text.length} 字（题干 + 我的作答 + 完整解析）`;
  });

  const gradeBtn = mkFab('🧮', 'AI 判分（对照解析踩分点）', '', async () => {
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
  });

  return [selBtn, pasteBtn, undoBtn, copyBtn, gradeBtn];
}

/** 点一下轮换到下一个识别服务 */
function profileFab(): HTMLButtonElement {
  const label = () => `切换识别服务（当前：${providerLabel()}）`;
  const btn = mkFab('🔁', label(), '', () => {
    const n = cfg.profiles.length;
    if (n < 2) { setStatus(n ? '只配置了一个服务，去 ⚙️ 添加更多' : '还没配置服务，点 ⚙️ 添加'); return; }
    save('activeProfile', ((cfg.activeProfile | 0) + 1) % n);
    setFabLabel(btn, label());
    setStatus('已切换到 ' + providerLabel());
  });
  ui.onProfileChange = () => setFabLabel(btn, label());
  return btn;
}

/** 左侧竖排悬浮按钮。题型变化（SPA 换题）时由 main 重建。 */
export function buildFabs(kind: QuestionKind): HTMLElement {
  const stack = document.createElement('div');
  stack.className = 'cbocr-fabs';
  stack.dataset.cbocr = kind;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.multiple = true;
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', () => {
    if (fileInput.files?.length) runOCR(fileInput.files);
    fileInput.value = '';
  });

  const shotBtn = mkFab('📸', '智能截图（题干 + 选项，写入剪贴板）', '', handleSmartScreenshot);
  const cfgBtn = mkFab('⚙️', '设置', '', openSettings);

  let items: HTMLButtonElement[];
  if (kind === 'choice') {
    const [quick, full] = choiceCopyButtons();
    items = [quick, full, shotBtn];
    ui.actionBtns = [quick, full, shotBtn];
  } else {
    const [selBtn, pasteBtn, undoBtn, copyBtn, gradeBtn] = subjectiveButtons(fileInput);
    items = [selBtn, pasteBtn, undoBtn, shotBtn, copyBtn, gradeBtn, profileFab()];
    ui.actionBtns = [selBtn, undoBtn, shotBtn, copyBtn, gradeBtn];
  }

  stack.append(fileInput, ...items, cfgBtn);
  return stack;
}
