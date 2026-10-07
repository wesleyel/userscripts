import { DEFAULT_GRADE_PROMPT, DEFAULT_PROMPT } from './prompts';

/** OpenRouter `reasoning.effort` 允许值。https://openrouter.ai/docs/guides/best-practices/reasoning-tokens */
export const THINKING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Thinking = (typeof THINKING_EFFORTS)[number];

export const DEFAULT_MAX_TOKENS = 4096;
/** 最佳题卡宽度（px），2x 导出为 1520px，匹配 iPad/GoodNotes A4 页面 */
export const DEFAULT_SHOT_WIDTH = 760;

export interface Profile {
  name: string;
  endpoint: string;
  key: string;
  model: string;
  thinking?: Thinking;
  maxTokens?: number;
}

export type InsertMode = 'append' | 'cursor' | 'replace';
export type ShotMode = 'modal' | 'silent';

export interface Config {
  profiles: Profile[];
  activeProfile: number;
  prompt: string;
  gradePrompt: string;
  useStem: boolean;
  autoPaste: boolean;
  keepImage: boolean;
  insertMode: InsertMode;
  maxEdge: number;
  shotWidth: number;
  /** 智能截图完成后：弹窗预览 / 静默（只写剪贴板 + 提示） */
  shotMode: ShotMode;
  /** 旧配置兜底，已迁到每张服务卡片 */
  maxTokens: number;
  thinking: Thinking;
  autoOpenAnalysis: boolean;
}

export const blankProfile = (): Profile => ({
  name: '新服务',
  endpoint: 'https://api.openai.com/v1/chat/completions',
  key: '',
  model: 'gpt-4o',
  thinking: 'none',
  maxTokens: DEFAULT_MAX_TOKENS,
});

const DEFAULTS: Config = {
  profiles: [],
  activeProfile: 0,
  prompt: DEFAULT_PROMPT,
  gradePrompt: DEFAULT_GRADE_PROMPT,
  useStem: true,        // 把题干作为上下文一起发过去，提升专业术语识别率
  autoPaste: true,      // 拦截 Cmd+V 里的图片自动识别
  keepImage: true,      // 同时让站点保存原图
  insertMode: 'append',
  maxEdge: 1600,        // 发送前把长边压到这个像素，省 token
  shotWidth: DEFAULT_SHOT_WIDTH,
  shotMode: 'modal',
  maxTokens: DEFAULT_MAX_TOKENS,
  thinking: 'none',
  autoOpenAnalysis: true, // 复制全题时，主观题解析没展开就自动点「查看解析」
};

export const cfg = {} as Config;
for (const k of Object.keys(DEFAULTS) as (keyof Config)[]) {
  const v = GM_getValue(k);
  (cfg as any)[k] = v === undefined ? DEFAULTS[k] : v;
}

export function save<K extends keyof Config>(k: K, v: Config[K]): void {
  cfg[k] = v;
  GM_setValue(k, v);
}

export function defaults(): Config { return DEFAULTS; }

// 从 1.x 的 claude/grok 双服务配置迁移。
if (!Array.isArray(cfg.profiles) || !cfg.profiles.length) {
  const legacy: Profile[] = [];
  const push = (name: string, ep: string | undefined, key: string | undefined, model: string) => {
    if (key && /\/chat\/completions\s*$/.test(ep || '')) legacy.push({ name, endpoint: ep!, key, model });
  };
  push('Grok', GM_getValue('grokEndpoint'), GM_getValue('grokKey'), GM_getValue('grokModel') || 'grok-4');
  push('Claude', GM_getValue('claudeEndpoint'), GM_getValue('claudeKey'), GM_getValue('claudeModel') || '');
  if (legacy.length) {
    save('profiles', legacy);
    save('activeProfile', 0);
    console.info('[cbocr] 已从旧版配置迁移 ' + legacy.length + ' 个服务');
  }
}

export function activeProfile(): Profile | null {
  const list = cfg.profiles || [];
  if (!list.length) return null;
  return list[Math.min(Math.max(0, cfg.activeProfile | 0), list.length - 1)];
}

export function profileThinking(profile?: Profile | null): Thinking {
  const v = profile?.thinking;
  if (v && THINKING_EFFORTS.includes(v)) return v;
  return THINKING_EFFORTS.includes(cfg.thinking) ? cfg.thinking : 'none';
}

export function profileMaxTokens(profile?: Profile | null): number {
  const n = parseInt(String(profile?.maxTokens), 10);
  if (n >= 256) return n;
  const g = parseInt(String(cfg.maxTokens), 10);
  return g >= 256 ? g : DEFAULT_MAX_TOKENS;
}

export function providerLabel(): string {
  const p = activeProfile();
  return p ? `${p.name}（${p.model}）` : '未配置服务';
}
