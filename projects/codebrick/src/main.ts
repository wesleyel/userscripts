/*
 * ── iPad → Mac 的推荐工作流（主观题手写 OCR）──────────────────
 *  1. iPad（GoodNotes / Notability / 备忘录）用套索圈选手写内容 → 拷贝
 *     或：截屏 → 编辑裁剪 → 拷贝
 *  2. Mac 上点进答题框，Cmd+V（需「通用剪贴板」）
 *  3. 脚本拦到图片 → 调模型识别 → 文字追加进答题框
 *  没有通用剪贴板：隔空投送后拖图到答题框 / 面板上「选图」按钮。
 *  首次使用：点 ⚙️ 添加一个识别服务（Endpoint + Key + 模型）。
 *
 * ── 选择题 ──────────────────────────────────────────────────
 *  面板提供「复制题目+选项」（含我当前的选择）和「复制全题」
 *  （含正确答案与解析，需答案揭晓后）。
 *
 * @connect * 是为了支持任意自建中转 / 代理 Endpoint；想收紧就在 header.txt 里改成自己的域名。
 */
import { bindTextarea } from './bind';
import { $ , getTextarea } from './dom';
import { getKind } from './question';
import { buildBar } from './ui/bar';
import { CSS } from './ui/styles';

GM_addStyle(CSS);

/** 找到面板挂载点；选择题挂在选项卡片之后 */
function anchorFor(kind: 'choice' | 'subjective'): Element | null {
  if (kind === 'subjective') {
    const ta = getTextarea()!;
    bindTextarea(ta);
    return $('.ca-diagram-tools') || ta.parentElement?.querySelector('.ca-tools') || ta;
  }
  return $('button.opt')?.closest('section.card, .card') || null;
}

function mount(): void {
  const kind = getKind();
  if (!kind) return;
  const anchor = anchorFor(kind);
  if (!anchor) return;
  if ((anchor.nextElementSibling as HTMLElement | null)?.dataset?.cbocr === '1') return;
  buildBar(anchor, kind);
}

// SPA 换题会重建 DOM，用 observer 盯着
mount();
new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
