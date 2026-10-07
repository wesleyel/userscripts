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
 *  左侧悬浮按钮提供「复制题目+选项」（含我当前的选择）和「复制全题」
 *  （含正确答案与解析，需答案揭晓后）。
 *
 * @connect * 是为了支持任意自建中转 / 代理 Endpoint；想收紧就在 header.txt 里改成自己的域名。
 */
import { bindTextarea } from './bind';
import { $ , getTextarea } from './dom';
import { getKind } from './question';
import { buildFabs } from './ui/fabs';
import { CSS } from './ui/styles';

GM_addStyle(CSS);

/** 左侧悬浮按钮：题型变化才重建；离开题目页则移除 */
function mount(): void {
  const kind = getKind();
  const cur = $('.cbocr-fabs');
  if (!kind) { cur?.remove(); return; }
  if (kind === 'subjective') bindTextarea(getTextarea()!);
  if (cur?.dataset.cbocr === kind) return;
  cur?.remove();
  document.body.appendChild(buildFabs(kind));
}

// SPA 换题会重建 DOM，用 observer 盯着
mount();
new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
