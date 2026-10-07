import { probe } from '../ai';
import {
  blankProfile, cfg, defaults, DEFAULT_MAX_TOKENS, DEFAULT_SHOT_WIDTH, providerLabel, profileMaxTokens,
  profileThinking, save, THINKING_EFFORTS, type InsertMode, type Profile, type Thinking,
} from '../config';
import { DEFAULT_GRADE_PROMPT, DEFAULT_PROMPT } from '../prompts';
import { refreshProfileSel } from './profile-select';
import { setStatus } from './status';

const PRESETS: [string, string, string][] = [
  ['OpenAI', 'https://api.openai.com/v1/chat/completions', 'gpt-4o'],
  ['xAI Grok', 'https://api.x.ai/v1/chat/completions', 'grok-4'],
  ['DeepSeek', 'https://api.deepseek.com/v1/chat/completions', 'deepseek-chat'],
  ['通义千问', 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', 'qwen-vl-max'],
];

type ProfileCard = HTMLDivElement & { _read: () => Profile };

function profileCard(prof: Profile, isActive: boolean): ProfileCard {
  const el = document.createElement('div') as ProfileCard;
  el.className = 'cbocr-prof';
  el.innerHTML = `
    <div class="cbocr-prof-head">
      <label class="cbocr-radio"><input type="radio" name="cbocr-active"> 当前使用</label>
      <span style="flex:1"></span>
      <button type="button" class="cbocr-btn cbocr-mini" data-act="test">测试</button>
      <button type="button" class="cbocr-btn cbocr-mini" data-act="del">删除</button>
    </div>
    <div class="row">
      <div><label>名称</label><input type="text" data-f="name" placeholder="自建中转"></div>
      <div><label>模型</label><input type="text" data-f="model" placeholder="gpt-4o"></div>
    </div>
    <label>Endpoint（OpenAI 兼容，通常以 /v1/chat/completions 结尾）</label>
    <input type="text" data-f="endpoint" placeholder="https://api.openai.com/v1/chat/completions">
    <label>API Key</label>
    <input type="password" data-f="key" placeholder="sk-...">
    <div class="row">
      <div>
        <label>Thinking（reasoning.effort）</label>
        <select data-f="thinking">
          <option value="none">none（关闭推理）</option>
          <option value="minimal">minimal</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="xhigh">xhigh</option>
          <option value="max">max</option>
        </select>
      </div>
      <div>
        <label>max_tokens</label>
        <input type="text" data-f="maxTokens" placeholder="4096">
      </div>
    </div>
    <div class="cbocr-hint">Thinking 按 OpenRouter 写入 <code>reasoning.effort</code>，默认 none。</div>
    <div class="cbocr-status" data-role="tip" style="margin-top:6px; word-break:break-all;"></div>`;

  const f = (n: string) => el.querySelector<HTMLInputElement & HTMLSelectElement>(`[data-f=${n}]`)!;
  f('name').value = prof.name || '';
  f('model').value = prof.model || '';
  f('endpoint').value = prof.endpoint || '';
  f('key').value = prof.key || '';
  f('thinking').value = profileThinking(prof);
  f('maxTokens').value = String(profileMaxTokens(prof));
  el.querySelector<HTMLInputElement>('input[type=radio]')!.checked = !!isActive;

  const readSelf = (): Profile => {
    const th = f('thinking').value as Thinking;
    return {
      name: f('name').value.trim() || '未命名',
      model: f('model').value.trim(),
      endpoint: f('endpoint').value.trim(),
      key: f('key').value.trim(),
      thinking: THINKING_EFFORTS.includes(th) ? th : 'none',
      maxTokens: Math.max(256, parseInt(f('maxTokens').value, 10) || DEFAULT_MAX_TOKENS),
    };
  };

  const tip = el.querySelector<HTMLElement>('[data-role=tip]')!;
  el.querySelector('[data-act=del]')!.addEventListener('click', () => {
    const wasActive = el.querySelector<HTMLInputElement>('input[type=radio]')!.checked;
    const box = el.parentElement!;
    el.remove();
    if (wasActive) box.querySelector('.cbocr-prof input[type=radio]')?.setAttribute('checked', 'checked');
    const first = box.querySelector<HTMLInputElement>('.cbocr-prof input[type=radio]');
    if (wasActive && first) first.checked = true;
  });

  el.querySelector('[data-act=test]')!.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    btn.disabled = true;
    tip.className = 'cbocr-status';
    tip.textContent = '正在连接…';
    try {
      tip.textContent = '✓ ' + await probe(readSelf());
      tip.className = 'cbocr-status ok';
    } catch (err) {
      tip.textContent = '✗ ' + (err as Error).message;
      tip.className = 'cbocr-status err';
    } finally {
      btn.disabled = false;
    }
  });

  el._read = readSelf;
  return el;
}

export function openSettings(): void {
  const mask = document.createElement('div');
  mask.className = 'cbocr-mask';
  mask.innerHTML = `
    <div class="cbocr-modal">
      <h3>手写 OCR 设置</h3>

      <label>识别服务（全部走 OpenAI 兼容的 chat/completions）</label>
      <div id="o-profiles"></div>
      <div style="display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap;">
        <button type="button" class="cbocr-btn" id="o-add">+ 添加服务</button>
        <select id="o-preset" style="width:auto; flex:0 0 auto;">
          <option value="">按预设添加…</option>
        </select>
      </div>
      <div class="cbocr-hint">
        可以配置多个，用答题区面板上的下拉框随时切换。用于 OCR 的服务需要支持图片输入。
      </div>

      <label>插入位置</label>
      <select id="o-mode">
        <option value="append">追加到答题框末尾</option>
        <option value="cursor">插入到光标处</option>
        <option value="replace">替换全部内容</option>
      </select>

      <div class="cbocr-check"><input type="checkbox" id="o-stem"><label for="o-stem" style="margin:0;font-weight:400">把题干一起发给模型（提升专业术语识别率）</label></div>
      <div class="cbocr-check"><input type="checkbox" id="o-keep"><label for="o-keep" style="margin:0;font-weight:400">粘贴时同时保留原图（站点照常上传手写件）</label></div>
      <div class="cbocr-check"><input type="checkbox" id="o-autoana"><label for="o-autoana" style="margin:0;font-weight:400">「复制全题」时自动展开解析（会触发站点的自评卡片）</label></div>

      <div class="row">
        <div>
          <label>OCR 图片长边上限 (px)</label>
          <input type="number" id="o-edge">
        </div>
        <div>
          <label>智能截图卡片宽度 (px)</label>
          <input type="number" id="o-shotwidth" placeholder="760">
        </div>
      </div>
      <div class="cbocr-hint">
        智能截图默认约束排版宽度为 760px（2x 导出 1520px），防止题干含大图时横向撑宽画布，导致导入 iPad 笔记等比放缩时文字缩得太小。
      </div>

      <label>OCR 提示词（转写手写图时用）</label>
      <textarea id="o-prompt"></textarea>

      <label>判分提示词（AI 判分时用）</label>
      <textarea id="o-gprompt"></textarea>

      <div class="cbocr-hint">
        Key 存在油猴的本地存储里，只会发往你填的 Endpoint。<br>
        用自建中转时，Tampermonkey 首次会弹窗问是否允许访问该域名，选「始终允许」。
      </div>

      <div class="cbocr-actions">
        <button type="button" class="cbocr-btn" id="o-reset">恢复默认提示词</button>
        <button type="button" class="cbocr-btn" id="o-cancel">取消</button>
        <button type="button" class="cbocr-btn primary" id="o-save">保存</button>
      </div>
    </div>`;
  document.body.appendChild(mask);

  const g = (id: string) => mask.querySelector('#' + id) as HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement;
  const box = g('o-profiles') as unknown as HTMLElement;

  const list = (cfg.profiles || []).length ? cfg.profiles : [blankProfile()];
  list.forEach((prof, idx) => box.appendChild(profileCard(prof, idx === (cfg.activeProfile | 0))));
  if (!box.querySelector('input[type=radio]:checked')) {
    const first = box.querySelector<HTMLInputElement>('input[type=radio]');
    if (first) first.checked = true;
  }

  PRESETS.forEach(([name, ep, model], i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = name;
    g('o-preset').appendChild(o);
  });

  g('o-add').addEventListener('click', () => box.appendChild(profileCard(blankProfile(), false)));
  g('o-preset').addEventListener('change', (e) => {
    const sel = e.target as HTMLSelectElement;
    const i = sel.value;
    if (i === '') return;
    const [name, endpoint, model] = PRESETS[Number(i)];
    box.appendChild(profileCard({ ...blankProfile(), name, endpoint, model, key: '' }, false));
    sel.value = '';
  });

  g('o-mode').value = cfg.insertMode;
  g('o-stem').checked = cfg.useStem;
  g('o-keep').checked = cfg.keepImage;
  g('o-autoana').checked = cfg.autoOpenAnalysis;
  g('o-edge').value = String(cfg.maxEdge);
  g('o-shotwidth').value = String(cfg.shotWidth || DEFAULT_SHOT_WIDTH);
  g('o-prompt').value = cfg.prompt;
  g('o-gprompt').value = cfg.gradePrompt;

  const close = () => mask.remove();
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
  g('o-cancel').addEventListener('click', close);
  g('o-reset').addEventListener('click', () => {
    g('o-prompt').value = DEFAULT_PROMPT;
    g('o-gprompt').value = DEFAULT_GRADE_PROMPT;
  });

  g('o-save').addEventListener('click', () => {
    const cards = [...box.querySelectorAll<ProfileCard>('.cbocr-prof')];
    const profiles = cards.map((c) => c._read());
    let active = cards.findIndex((c) => c.querySelector<HTMLInputElement>('input[type=radio]')!.checked);
    if (active < 0) active = 0;

    save('profiles', profiles);
    save('activeProfile', active);
    save('insertMode', g('o-mode').value as InsertMode);
    save('useStem', g('o-stem').checked);
    save('keepImage', g('o-keep').checked);
    save('autoOpenAnalysis', g('o-autoana').checked);
    save('maxEdge', Math.max(400, parseInt(g('o-edge').value, 10) || defaults().maxEdge));
    save('shotWidth', Math.max(500, parseInt(g('o-shotwidth').value, 10) || DEFAULT_SHOT_WIDTH));
    save('prompt', g('o-prompt').value || DEFAULT_PROMPT);
    save('gradePrompt', g('o-gprompt').value || DEFAULT_GRADE_PROMPT);

    refreshProfileSel();
    close();
    setStatus(`设置已保存 · 当前使用 ${providerLabel()}`, 'ok');
  });
}