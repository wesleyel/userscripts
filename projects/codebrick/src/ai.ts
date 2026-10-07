import { activeProfile, cfg, profileMaxTokens, profileThinking, providerLabel, type Profile } from './config';
import { getTextarea } from './dom';
import { buildDoc } from './question';
import { setStatus } from './ui/status';

export interface ImagePayload { mime: string; b64: string; dataUrl: string; w: number; h: number }

/** 缩放 + 转 base64。iPad 截图动辄 3000px 宽，压一下能省一半以上 token。 */
export async function toBase64(file: Blob, maxEdge: number): Promise<ImagePayload> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error(`无法解码这张图（${file.type || '未知格式'}）。HEIC 请先在「照片」里导出成 PNG/JPEG。`);
  }
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  return { mime: 'image/jpeg', b64: dataUrl.split(',')[1], dataUrl, w, h };
}

function request(opts: { url: string; headers: Record<string, string>; data: string }): Promise<Tampermonkey.Response<unknown>> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'POST',
      timeout: 180000,
      ...opts,
      onload: (r) => resolve(r),
      onerror: (r) => {
        const bits = [r?.error, r?.statusText, r?.status ? 'status=' + r.status : ''].filter(Boolean).join(' · ');
        let host = '';
        try { host = new URL(opts.url).host; } catch { host = opts.url; }
        reject(new Error(
          `请求 ${host} 失败${bits ? '：' + bits : ''}。`
          + `依次排查：① Tampermonkey 是否弹过域名授权（脚本设置里把该域名设为「始终允许」）`
          + `② Endpoint 拼写与协议 ③ 该地址在本机浏览器里是否可达（内网/代理）`
        ));
      },
      ontimeout: () => reject(new Error('请求超时（180s），换更小的图或更快的模型试试')),
    });
  });
}

function parseErr(res: Tampermonkey.Response<unknown>): Error {
  let detail = res.responseText || '';
  try {
    const j = JSON.parse(detail);
    detail = j.error?.message || j.message || detail;
  } catch { /* 原样返回 */ }
  return new Error(`HTTP ${res.status}: ${String(detail).slice(0, 400)}`);
}

function chatBody(profile: Profile, system: string, text: string, images?: ImagePayload[]) {
  const content: unknown[] = (images || []).map((im) => ({
    type: 'image_url',
    image_url: { url: im.dataUrl, detail: 'high' },
  }));
  content.push({ type: 'text', text });
  return {
    model: profile.model,
    max_tokens: profileMaxTokens(profile),
    reasoning: { effort: profileThinking(profile) },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content },
    ],
  };
}

const chatHeaders = (profile: Profile) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${profile.key}`,
});

const pickReply = (json: any): string => (json.choices?.[0]?.message?.content || '').trim();

export async function chat(system: string, text: string, images?: ImagePayload[]): Promise<string> {
  const p = activeProfile();
  if (!p) throw new Error('还没配置识别服务，点 ⚙️ 添加一个');
  if (!p.key) throw new Error(`服务「${p.name}」还没填 API Key，点 ⚙️ 补上`);
  if (!p.endpoint) throw new Error(`服务「${p.name}」还没填 Endpoint`);

  const res = await request({
    url: p.endpoint,
    headers: chatHeaders(p),
    data: JSON.stringify(chatBody(p, system, text, images)),
  });
  if (res.status < 200 || res.status >= 300) throw parseErr(res);
  return pickReply(JSON.parse(res.responseText));
}

export async function probe(profile: Profile): Promise<string> {
  if (!profile.endpoint) throw new Error('Endpoint 是空的');
  if (!profile.key) throw new Error('Key 是空的');
  const res = await request({
    url: profile.endpoint,
    headers: chatHeaders(profile),
    data: JSON.stringify({
      model: profile.model,
      max_tokens: 16,
      reasoning: { effort: 'none' },
      messages: [{ role: 'user', content: 'ping' }],
    }),
  });
  if (res.status < 200 || res.status >= 300) throw parseErr(res);
  const j = JSON.parse(res.responseText);
  const reply = pickReply(j);
  return `HTTP ${res.status}，模型 ${j.model || profile.model} 回了「${reply.slice(0, 30) || '(空)'}」`;
}

export async function gradeAnswer(): Promise<{ result: string; secs: string }> {
  const ta = getTextarea();
  if (!ta) throw new Error('没找到答题框');

  const plain = (ta.value || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim();
  if (!plain) {
    throw new Error('作答区没有文字内容（只有图片），先用「🖊️ 手写转文字」把手写稿转成文字');
  }

  setStatus('正在准备题干与解析…');
  const { text, hasAnalysis } = await buildDoc({ header: false });
  if (!hasAnalysis) {
    throw new Error('没取到解析，无法对照踩分点判分（先点「查看解析」，或在 ⚙️ 里打开自动展开）');
  }

  setStatus(`${providerLabel()} 判分中…`);
  const t0 = Date.now();
  const result = await chat(cfg.gradePrompt, text);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (!result) throw new Error('模型返回了空结果');
  return { result, secs };
}
