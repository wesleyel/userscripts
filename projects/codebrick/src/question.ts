import { cfg } from './config';
import { $, $$, findButton, getTextarea, waitFor } from './dom';
import { domToMd, inlineMd } from './markdown';
import { setStatus } from './ui/status';

export type QuestionKind = 'choice' | 'subjective';

export interface ChoiceOption {
  key: string;
  text: string;
  /** 我选了它（提交前为 .selected，揭晓后为 .wrong / 或 verdict 里的「你选了」） */
  mine: boolean;
  /** 它是正确答案（仅揭晓后可知） */
  correct: boolean;
}

export interface ChoiceInfo {
  options: ChoiceOption[];
  mine: string[];
  correct: string[];
  /** 站点已揭晓答案（出现 .card.verdict 或 .opt.correct） */
  revealed: boolean;
}

export const getKind = (): QuestionKind | null =>
  getTextarea() ? 'subjective' : $('button.opt') ? 'choice' : null;

// ──────────────────────── 选择题 ────────────────────────

const parseKeys = (s?: string): string[] => (s?.match(/[A-Z]/g) || []);

export function readChoice(): ChoiceInfo {
  const verdict = $('.card.verdict');
  const verdictText = verdict?.textContent || '';
  const verdictMine = parseKeys(verdictText.match(/你选了\s*([A-Z、,，\s]+)/)?.[1]);
  const verdictCorrect = parseKeys(verdictText.match(/正确答案(?:是|为|：|:)\s*([A-Z、,，\s]+)/)?.[1]);

  const opts = $$('button.opt').map((b) => {
    const key = $('.opt-key', b)?.textContent?.trim() || '';
    const textEl = $('.opt-text', b);
    return {
      key,
      text: textEl ? inlineMd(textEl).trim() : '',
      cls: b.classList,
    };
  });

  const classCorrect = opts.filter((o) => o.cls.contains('correct')).map((o) => o.key);
  const classMine = opts.filter((o) => o.cls.contains('selected') || o.cls.contains('wrong')).map((o) => o.key);

  const correct = verdictCorrect.length ? verdictCorrect : classCorrect;
  let mine = verdictMine.length ? verdictMine : classMine;
  // 答对时没有 .wrong，我的选择就是正确答案
  if (!mine.length && verdict && !verdict.classList.contains('bad') && correct.length) mine = correct;

  return {
    options: opts.map((o) => ({
      key: o.key,
      text: o.text,
      mine: mine.includes(o.key),
      correct: correct.includes(o.key),
    })),
    mine,
    correct,
    revealed: !!verdict || classCorrect.length > 0,
  };
}

const optLine = (o: ChoiceOption) => `- ${o.key}. ${o.text}`;
const pick = (c: ChoiceInfo, keys: string[]) =>
  keys.map((k) => {
    const o = c.options.find((x) => x.key === k);
    return o ? `${k}. ${o.text}` : k;
  }).join('；');

/** 选择题解析：揭晓后 verdict 之后的所有带 h3.sub 的卡片（「你为什么会选 B」「完整解析」…） */
function choiceAnalysis(): string {
  const parts: string[] = [];
  $$('.card').forEach((card) => {
    if (card.matches('.stem, .verdict, .cause-card') || card.querySelector('button.opt')) return;
    const h = $('h3.sub', card);
    const body = $('.md', card);
    if (!h || !body) return;
    parts.push('### ' + h.textContent!.trim().replace(/[：:]$/, ''), domToMd(body));
  });
  return parts.join('\n\n');
}

// ──────────────────────── 通用 ────────────────────────

export function findAnalysisBody(): Element | null {
  const card = $$('.card').find((c) => {
    const h = $('h3.sub, h2, h1, h4', c);
    return !!h && /完整解析|参考答案|解析/.test(h.textContent!);
  });
  if (!card) return null;
  return $('.md', card) || card;
}

function questionHeader(): string[] {
  const badge = $('.qhead .source-badge')?.textContent?.trim() || $('.qhead .ctx-crumb')?.innerText.replace(/\s+/g, ' ').trim();
  const meta = $('.qhead-right')?.innerText.split('\n')[0].trim();
  const parts = ['# ' + (badge || document.title)];
  if (meta) parts.push(meta);
  parts.push('来源：' + location.href.split('?')[0]);
  return parts;
}

export interface DocOptions {
  header: boolean;
  /** 选择题：false 时不带正确答案和解析（刷题途中想先拷贝题目 + 选项） */
  reveal?: boolean;
}

export interface Doc {
  text: string;
  hasAnalysis: boolean;
  /** 主观题：我的作答（文本） */
  mine: string;
  kind: QuestionKind | null;
  choice?: ChoiceInfo;
}

export async function buildDoc({ header, reveal = true }: DocOptions): Promise<Doc> {
  const kind = getKind();
  const parts: string[] = header ? questionHeader() : [];
  const stemEl = $('.card.stem .md-seg') || $('.card.stem');
  parts.push('## 题干', stemEl ? domToMd(stemEl) : '_（未找到题干）_');

  if (kind === 'choice') {
    const c = readChoice();
    parts.push('## 选项', c.options.map(optLine).join('\n'));
    parts.push('## 我的选择', c.mine.length ? pick(c, c.mine) : '_（未选择）_');
    if (!reveal) return { text: parts.join('\n\n'), hasAnalysis: false, mine: '', kind, choice: c };
    parts.push('## 正确答案', c.correct.length ? pick(c, c.correct) : '_（尚未揭晓：提交或点「看解析」后再复制）_');
    const analysis = c.revealed ? choiceAnalysis() : '';
    if (analysis) parts.push('## 解析', analysis);
    return { text: parts.join('\n\n'), hasAnalysis: !!analysis, mine: '', kind, choice: c };
  }

  const mine = (getTextarea()?.value || '').trim();
  parts.push('## 我的作答', mine || '_（未作答）_');

  let body = findAnalysisBody();
  if (!body && cfg.autoOpenAnalysis) {
    const btn = findButton('查看解析');
    if (btn) {
      setStatus('正在展开解析…');
      btn.click();
      body = await waitFor(findAnalysisBody, 8000);
    }
  }
  parts.push('## 完整解析', body ? domToMd(body) : '_（解析未展开，先点「查看解析」）_');
  return { text: parts.join('\n\n'), hasAnalysis: !!body, mine, kind };
}

export function getQuestionMeta() {
  const badgeEl = $('.qhead .source-badge, .source-badge');
  const qmetaEl = $('.qhead .qmeta, .qmeta');
  const diffEl = $('.difficulty, .qhead .difficulty');

  let source = badgeEl?.textContent?.trim() || badgeEl?.getAttribute('title')?.trim() || '';
  if (!source) source = $('.qhead .ctx-crumb')?.innerText.replace(/\s+/g, ' ').trim() || '';
  if (!source && qmetaEl) {
    const m = qmetaEl.textContent!.match(/(?:真题|统考|模拟|期末|练习)[^·\n]*/);
    if (m) source = m[0].trim();
  }
  if (!source) source = document.title.replace(/ - CodeBrick.*|CodeBrick.*$/i, '').trim() || '题目';

  let score = '';
  if (qmetaEl) {
    const m = qmetaEl.textContent!.match(/(?:(?:大题|单选|多选|综合题|简答题|计算题)\s*)?(\d+(?:\.\d+)?)\s*分/);
    if (m) score = m[0].replace(/\s+/g, ' ').trim();
  }

  let difficulty = diffEl?.textContent?.trim() || '';
  if (!difficulty && qmetaEl) {
    const m = qmetaEl.textContent!.match(/难度\s*([★☆]+|\S+)/);
    if (m) difficulty = m[1].trim();
  }

  const qid = location.pathname.match(/\/q\/([^/?#]+)/)?.[1] || '';
  return { source, score, difficulty, qid };
}

export type QuestionMeta = ReturnType<typeof getQuestionMeta>;
