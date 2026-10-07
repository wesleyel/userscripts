// ==UserScript==
// @name         CodeBrick 手写作答 OCR + AI 判分
// @namespace    https://www.codebrick.tech/
// @version      3.0.3
// @description  CodeBrick 刷题页：iPad 手写作答图 OCR 转文字、智能截图题卡、复制全题（含选择题选项 / 我的选择 / 正确答案）、对照解析踩分点 AI 判分（任意 OpenAI 兼容服务，可配置多个）
// @author       wesley
// @match        https://www.codebrick.tech/practice/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @connect      *
// @downloadURL  https://update.greasyfork.org/scripts/594729/CodeBrick%20%E6%89%8B%E5%86%99%E4%BD%9C%E7%AD%94%20OCR%20%2B%20AI%20%E5%88%A4%E5%88%86.user.js
// @updateURL    https://update.greasyfork.org/scripts/594729/CodeBrick%20%E6%89%8B%E5%86%99%E4%BD%9C%E7%AD%94%20OCR%20%2B%20AI%20%E5%88%A4%E5%88%86.meta.js
// ==/UserScript==

(function () {
'use strict';
"use strict";
(() => {
  // projects/codebrick/src/prompts.ts
  var DEFAULT_PROMPT = `你是一个手写 OCR 转录助手。图片是我在 iPad 上手写的考研 408 / 计算机类主观题作答。

请把手写内容**逐字转录**成 Markdown：
- 只转录，不解答、不补充、不"优化"我的表述，也不要纠正我答案里的知识性错误。
- 保留原有的分条编号，如 (1) (2) ① ②，保留原始换行结构。
- 公式用 LaTeX：行内 $...$，独立成行 $$...$$。二进制/十六进制数、寄存器名按原样写。
- 表格转成 Markdown 表格。
- 框图、连线图、箭头示意等无法用文字转录的部分，用 [图: 一句话描述] 占位。
- 确实辨认不出的字写成 ⟨?⟩。
- 直接输出转录结果本身，不要任何前言、结语，也不要用代码块包裹整体。`;
  var DEFAULT_GRADE_PROMPT = `你是考研 408 / 计算机学科的阅卷老师。下面会给你一道主观题的【题干】、【我的作答】和【完整解析】（解析里含标准答案和踩分点）。

请严格对照解析逐个踩分点判分：

1. 先从题干和解析中拆出全部得分点。题干里通常标了每小问的分值（如「(3) …（4 分）」），小问内部再按解析中的关键结论细分到 1~2 分一个点。拆出的各点分值之和必须等于该题满分。
2. 逐点判定，输出一个 Markdown 表格：

| 小问 | 得分点 | 分值 | 得分 | 判定依据 |

「判定依据」里引用我作答中的原话（没写就写「未作答」），并说明为什么给这个分。

3. 判分从严，按真实阅卷标准：
   - 关键结论/数值/信号取值必须明确写出才给分，写对但理由错的只给结论分；
   - 意思接近但缺关键词的给一半分，并指出缺了什么；
   - 完全没提的给 0 分，**不要替我脑补**，也不要因为"他可能是这个意思"而放宽；
   - 我写错的地方要明确指出错在哪，而不是含糊带过。
4. 表格后另起一行给出：**总分：X / Y 分**
5. 最后写「失分小结」，逐条列出丢分的具体原因和下次的注意点，每条一句话，直指问题，不要写鼓励的话。

直接输出结果，不要前言。`;

  // projects/codebrick/src/config.ts
  var THINKING_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
  var DEFAULT_MAX_TOKENS = 4096;
  var DEFAULT_SHOT_WIDTH = 760;
  var blankProfile = () => ({
    name: "新服务",
    endpoint: "https://api.openai.com/v1/chat/completions",
    key: "",
    model: "gpt-4o",
    thinking: "none",
    maxTokens: DEFAULT_MAX_TOKENS
  });
  var DEFAULTS = {
    profiles: [],
    activeProfile: 0,
    prompt: DEFAULT_PROMPT,
    gradePrompt: DEFAULT_GRADE_PROMPT,
    useStem: true,
    // 把题干作为上下文一起发过去，提升专业术语识别率
    autoPaste: true,
    // 拦截 Cmd+V 里的图片自动识别
    keepImage: true,
    // 同时让站点保存原图
    insertMode: "append",
    maxEdge: 1600,
    // 发送前把长边压到这个像素，省 token
    shotWidth: DEFAULT_SHOT_WIDTH,
    maxTokens: DEFAULT_MAX_TOKENS,
    thinking: "none",
    autoOpenAnalysis: true
    // 复制全题时，主观题解析没展开就自动点「查看解析」
  };
  var cfg = {};
  for (const k of Object.keys(DEFAULTS)) {
    const v = GM_getValue(k);
    cfg[k] = v === void 0 ? DEFAULTS[k] : v;
  }
  function save(k, v) {
    cfg[k] = v;
    GM_setValue(k, v);
  }
  function defaults() {
    return DEFAULTS;
  }
  if (!Array.isArray(cfg.profiles) || !cfg.profiles.length) {
    const legacy = [];
    const push = (name, ep, key, model) => {
      if (key && /\/chat\/completions\s*$/.test(ep || "")) legacy.push({ name, endpoint: ep, key, model });
    };
    push("Grok", GM_getValue("grokEndpoint"), GM_getValue("grokKey"), GM_getValue("grokModel") || "grok-4");
    push("Claude", GM_getValue("claudeEndpoint"), GM_getValue("claudeKey"), GM_getValue("claudeModel") || "");
    if (legacy.length) {
      save("profiles", legacy);
      save("activeProfile", 0);
      console.info("[cbocr] 已从旧版配置迁移 " + legacy.length + " 个服务");
    }
  }
  function activeProfile() {
    const list = cfg.profiles || [];
    if (!list.length) return null;
    return list[Math.min(Math.max(0, cfg.activeProfile | 0), list.length - 1)];
  }
  function profileThinking(profile) {
    const v = profile?.thinking;
    if (v && THINKING_EFFORTS.includes(v)) return v;
    return THINKING_EFFORTS.includes(cfg.thinking) ? cfg.thinking : "none";
  }
  function profileMaxTokens(profile) {
    const n = parseInt(String(profile?.maxTokens), 10);
    if (n >= 256) return n;
    const g = parseInt(String(cfg.maxTokens), 10);
    return g >= 256 ? g : DEFAULT_MAX_TOKENS;
  }
  function providerLabel() {
    const p = activeProfile();
    return p ? `${p.name}（${p.model}）` : "未配置服务";
  }

  // projects/codebrick/src/dom.ts
  var $ = (sel, root = document) => root.querySelector(sel);
  var $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  var getTextarea = () => $("textarea.ca-textarea");
  function setValue(ta, val) {
    ta.value = val;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function getStem() {
    const el = $(".card.stem");
    return el ? el.innerText.trim().slice(0, 3e3) : "";
  }
  function escHtml(s) {
    return String(s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  }
  function waitFor(fn, ms) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        const v = fn();
        if (v) return resolve(v);
        if (Date.now() - t0 > ms) return resolve(null);
        setTimeout(tick, 200);
      };
      tick();
    });
  }
  function findButton(text) {
    return $$("button").find((b) => b.textContent.trim() === text);
  }

  // projects/codebrick/src/markdown.ts
  function texOf(el) {
    return el.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim() || el.textContent.trim();
  }
  function inlineMd(node) {
    let s = "";
    node.childNodes.forEach((c) => {
      if (c.nodeType === 3) {
        s += c.nodeValue.replace(/\s+/g, " ");
        return;
      }
      if (c.nodeType !== 1) return;
      const el = c;
      if (el.classList.contains("katex-display")) {
        s += "\n$$" + texOf(el) + "$$\n";
        return;
      }
      if (el.classList.contains("katex")) {
        s += "$" + texOf(el) + "$";
        return;
      }
      switch (el.tagName) {
        case "BR":
          s += "\n";
          break;
        case "STRONG":
        case "B":
          s += "**" + inlineMd(el).trim() + "**";
          break;
        case "EM":
        case "I":
          s += "*" + inlineMd(el).trim() + "*";
          break;
        case "CODE":
          s += "`" + el.textContent + "`";
          break;
        case "DEL":
        case "S":
          s += "~~" + inlineMd(el).trim() + "~~";
          break;
        case "A": {
          const txt = inlineMd(el).trim();
          const href = el.href || "";
          const bare = href.replace(/^https?:\/\//, "").replace(/\/$/, "");
          s += txt && bare.toLowerCase() === txt.toLowerCase() ? txt : "[" + (txt || href) + "](" + href + ")";
          break;
        }
        case "IMG":
          s += "![" + (el.alt || "") + "](" + el.src + ")";
          break;
        case "SUB":
          s += "_" + el.textContent;
          break;
        case "SUP":
          s += "^" + el.textContent;
          break;
        default:
          s += inlineMd(el);
      }
    });
    return s;
  }
  function listMd(list, indent) {
    const ordered = list.tagName === "OL";
    const lines = [];
    let n = 1;
    const isList = (e) => e.tagName === "UL" || e.tagName === "OL";
    [...list.children].filter((li) => li.tagName === "LI").forEach((li) => {
      const nested = [...li.children].filter(isList);
      const clone = li.cloneNode(true);
      [...clone.children].filter(isList).forEach((e) => e.remove());
      lines.push(" ".repeat(indent) + (ordered ? n++ + ". " : "- ") + inlineMd(clone).trim());
      nested.forEach((sub) => lines.push(listMd(sub, indent + 2)));
    });
    return lines.join("\n");
  }
  function tableMd(table) {
    const rows = [...table.querySelectorAll("tr")];
    if (!rows.length) return "";
    const cells = (r) => [...r.children].map((c) => inlineMd(c).trim().replace(/\|/g, "\\|") || " ");
    const head = cells(rows[0]);
    const lines = [
      "| " + head.join(" | ") + " |",
      "| " + head.map(() => "---").join(" | ") + " |"
    ];
    rows.slice(1).forEach((r) => {
      const cs = cells(r);
      while (cs.length < head.length) cs.push(" ");
      lines.push("| " + cs.join(" | ") + " |");
    });
    return lines.join("\n");
  }
  function domToMd(root) {
    const out = [];
    const walk = (parent) => {
      parent.childNodes.forEach((c) => {
        if (c.nodeType === 3) {
          const t = c.nodeValue.trim();
          if (t) out.push(t);
          return;
        }
        if (c.nodeType !== 1) return;
        const el = c;
        const T = el.tagName;
        if (/^H[1-6]$/.test(T)) {
          out.push("#".repeat(Number(T[1])) + " " + inlineMd(el).trim());
        } else if (T === "P") {
          const s = inlineMd(el).trim();
          if (s) out.push(s);
        } else if (T === "UL" || T === "OL") {
          out.push(listMd(el, 0));
        } else if (T === "TABLE") {
          out.push(tableMd(el));
        } else if (T === "BLOCKQUOTE") {
          out.push(domToMd(el).split("\n").map((l) => l ? "> " + l : ">").join("\n"));
        } else if (T === "PRE") {
          out.push("```\n" + el.textContent.replace(/\n$/, "") + "\n```");
        } else if (T === "HR") {
          out.push("---");
        } else if (T === "IMG") {
          out.push("![" + (el.alt || "") + "](" + el.src + ")");
        } else if (el.classList.contains("katex") || el.classList.contains("katex-display")) {
          const s = inlineMd(wrap(el)).trim();
          if (s) out.push(s);
        } else if (T === "DIV" || T === "SECTION" || T === "ARTICLE") {
          walk(el);
        } else {
          const s = inlineMd(el).trim();
          if (s) out.push(s);
        }
      });
    };
    walk(root);
    return out.filter(Boolean).join("\n\n");
  }
  function wrap(el) {
    const box = document.createElement("div");
    box.appendChild(el.cloneNode(true));
    return box;
  }
  function inlineHtml(s) {
    return escHtml(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>").replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  }
  function mdToHtml(md) {
    const lines = md.split("\n");
    const out = [];
    const isRow = (l) => /^\s*\|/.test(l || "");
    const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (isRow(l) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) {
        const rows = [];
        while (i < lines.length && isRow(lines[i])) rows.push(lines[i++]);
        const head = cells(rows[0]);
        let html = "<table><thead><tr>" + head.map((h2) => "<th>" + inlineHtml(h2) + "</th>").join("") + "</tr></thead><tbody>";
        rows.slice(2).forEach((r) => {
          html += "<tr>" + cells(r).map((c) => "<td>" + inlineHtml(c) + "</td>").join("") + "</tr>";
        });
        out.push(html + "</tbody></table>");
        continue;
      }
      const h = l.match(/^(#{1,6})\s+(.*)/);
      if (h) {
        const lv = Math.min(6, h[1].length + 3);
        out.push(`<h${lv}>${inlineHtml(h[2])}</h${lv}>`);
        i++;
        continue;
      }
      if (/^\s*[-*]\s+/.test(l)) {
        const items = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
        out.push("<ul>" + items.map((t) => "<li>" + inlineHtml(t) + "</li>").join("") + "</ul>");
        continue;
      }
      if (/^\s*\d+\.\s+/.test(l)) {
        const items = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ""));
        out.push("<ol>" + items.map((t) => "<li>" + inlineHtml(t) + "</li>").join("") + "</ol>");
        continue;
      }
      if (!l.trim()) {
        i++;
        continue;
      }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !isRow(lines[i]) && !/^#{1,6}\s/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s/.test(lines[i])) {
        buf.push(lines[i++]);
      }
      out.push("<p>" + inlineHtml(buf.join(" ")) + "</p>");
    }
    return out.join("\n");
  }

  // projects/codebrick/src/ui/status.ts
  var ui = {
    statusEl: null,
    undoBtn: null,
    pasteBtn: null,
    profileSel: null,
    actionBtns: []
  };
  function setStatus(msg, kind) {
    const el = ui.statusEl;
    if (!el) return;
    el.textContent = msg || "";
    el.className = "cbocr-status" + (kind ? " " + kind : "");
  }
  function setBusy(v) {
    ui.actionBtns.forEach((b) => {
      b.disabled = v;
    });
  }
  function mkBtn(label, cls, onClick, title) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cbocr-btn" + (cls ? " " + cls : "");
    b.textContent = label;
    if (title) b.title = title;
    b.addEventListener("click", onClick);
    return b;
  }

  // projects/codebrick/src/question.ts
  var getKind = () => getTextarea() ? "subjective" : $("button.opt") ? "choice" : null;
  var parseKeys = (s) => s?.match(/[A-Z]/g) || [];
  function readChoice() {
    const verdict = $(".card.verdict");
    const verdictText = verdict?.textContent || "";
    const verdictMine = parseKeys(verdictText.match(/你选了\s*([A-Z、,，\s]+)/)?.[1]);
    const verdictCorrect = parseKeys(verdictText.match(/正确答案(?:是|为|：|:)\s*([A-Z、,，\s]+)/)?.[1]);
    const opts = $$("button.opt").map((b) => {
      const key = $(".opt-key", b)?.textContent?.trim() || "";
      const textEl = $(".opt-text", b);
      return {
        key,
        text: textEl ? inlineMd(textEl).trim() : "",
        cls: b.classList
      };
    });
    const classCorrect = opts.filter((o) => o.cls.contains("correct")).map((o) => o.key);
    const classMine = opts.filter((o) => o.cls.contains("selected") || o.cls.contains("wrong")).map((o) => o.key);
    const correct = verdictCorrect.length ? verdictCorrect : classCorrect;
    let mine = verdictMine.length ? verdictMine : classMine;
    if (!mine.length && verdict && !verdict.classList.contains("bad") && correct.length) mine = correct;
    return {
      options: opts.map((o) => ({
        key: o.key,
        text: o.text,
        mine: mine.includes(o.key),
        correct: correct.includes(o.key)
      })),
      mine,
      correct,
      revealed: !!verdict || classCorrect.length > 0
    };
  }
  var optLine = (o) => `- ${o.key}. ${o.text}`;
  var pick = (c, keys) => keys.map((k) => {
    const o = c.options.find((x) => x.key === k);
    return o ? `${k}. ${o.text}` : k;
  }).join("；");
  function choiceAnalysis() {
    const parts = [];
    $$(".card").forEach((card) => {
      if (card.matches(".stem, .verdict, .cause-card") || card.querySelector("button.opt")) return;
      const h = $("h3.sub", card);
      const body = $(".md", card);
      if (!h || !body) return;
      parts.push("### " + h.textContent.trim().replace(/[：:]$/, ""), domToMd(body));
    });
    return parts.join("\n\n");
  }
  function findAnalysisBody() {
    const card = $$(".card").find((c) => {
      const h = $("h3.sub, h2, h1, h4", c);
      return !!h && /完整解析|参考答案|解析/.test(h.textContent);
    });
    if (!card) return null;
    return $(".md", card) || card;
  }
  function questionHeader() {
    const badge = $(".qhead .source-badge")?.textContent?.trim() || $(".qhead .ctx-crumb")?.innerText.replace(/\s+/g, " ").trim();
    const meta = $(".qhead-right")?.innerText.split("\n")[0].trim();
    const parts = ["# " + (badge || document.title)];
    if (meta) parts.push(meta);
    parts.push("来源：" + location.href.split("?")[0]);
    return parts;
  }
  async function buildDoc({ header, reveal = true }) {
    const kind = getKind();
    const parts = header ? questionHeader() : [];
    const stemEl = $(".card.stem .md-seg") || $(".card.stem");
    parts.push("## 题干", stemEl ? domToMd(stemEl) : "_（未找到题干）_");
    if (kind === "choice") {
      const c = readChoice();
      parts.push("## 选项", c.options.map(optLine).join("\n"));
      parts.push("## 我的选择", c.mine.length ? pick(c, c.mine) : "_（未选择）_");
      if (!reveal) return { text: parts.join("\n\n"), hasAnalysis: false, mine: "", kind, choice: c };
      parts.push("## 正确答案", c.correct.length ? pick(c, c.correct) : "_（尚未揭晓：提交或点「看解析」后再复制）_");
      const analysis = c.revealed ? choiceAnalysis() : "";
      if (analysis) parts.push("## 解析", analysis);
      return { text: parts.join("\n\n"), hasAnalysis: !!analysis, mine: "", kind, choice: c };
    }
    const mine = (getTextarea()?.value || "").trim();
    parts.push("## 我的作答", mine || "_（未作答）_");
    let body = findAnalysisBody();
    if (!body && cfg.autoOpenAnalysis) {
      const btn = findButton("查看解析");
      if (btn) {
        setStatus("正在展开解析…");
        btn.click();
        body = await waitFor(findAnalysisBody, 8e3);
      }
    }
    parts.push("## 完整解析", body ? domToMd(body) : "_（解析未展开，先点「查看解析」）_");
    return { text: parts.join("\n\n"), hasAnalysis: !!body, mine, kind };
  }
  function getQuestionMeta() {
    const badgeEl = $(".qhead .source-badge, .source-badge");
    const qmetaEl = $(".qhead .qmeta, .qmeta");
    const diffEl = $(".difficulty, .qhead .difficulty");
    let source = badgeEl?.textContent?.trim() || badgeEl?.getAttribute("title")?.trim() || "";
    if (!source) source = $(".qhead .ctx-crumb")?.innerText.replace(/\s+/g, " ").trim() || "";
    if (!source && qmetaEl) {
      const m = qmetaEl.textContent.match(/(?:真题|统考|模拟|期末|练习)[^·\n]*/);
      if (m) source = m[0].trim();
    }
    if (!source) source = document.title.replace(/ - CodeBrick.*|CodeBrick.*$/i, "").trim() || "题目";
    let score = "";
    if (qmetaEl) {
      const m = qmetaEl.textContent.match(/(?:(?:大题|单选|多选|综合题|简答题|计算题)\s*)?(\d+(?:\.\d+)?)\s*分/);
      if (m) score = m[0].replace(/\s+/g, " ").trim();
    }
    let difficulty = diffEl?.textContent?.trim() || "";
    if (!difficulty && qmetaEl) {
      const m = qmetaEl.textContent.match(/难度\s*([★☆]+|\S+)/);
      if (m) difficulty = m[1].trim();
    }
    const qid = location.pathname.match(/\/q\/([^/?#]+)/)?.[1] || "";
    return { source, score, difficulty, qid };
  }

  // projects/codebrick/src/ai.ts
  async function toBase64(file, maxEdge) {
    let bmp;
    try {
      bmp = await createImageBitmap(file);
    } catch {
      throw new Error(`无法解码这张图（${file.type || "未知格式"}）。HEIC 请先在「照片」里导出成 PNG/JPEG。`);
    }
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    return { mime: "image/jpeg", b64: dataUrl.split(",")[1], dataUrl, w, h };
  }
  function request(opts) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        timeout: 18e4,
        ...opts,
        onload: (r) => resolve(r),
        onerror: (r) => {
          const bits = [r?.error, r?.statusText, r?.status ? "status=" + r.status : ""].filter(Boolean).join(" · ");
          let host = "";
          try {
            host = new URL(opts.url).host;
          } catch {
            host = opts.url;
          }
          reject(new Error(
            `请求 ${host} 失败${bits ? "：" + bits : ""}。依次排查：① Tampermonkey 是否弹过域名授权（脚本设置里把该域名设为「始终允许」）② Endpoint 拼写与协议 ③ 该地址在本机浏览器里是否可达（内网/代理）`
          ));
        },
        ontimeout: () => reject(new Error("请求超时（180s），换更小的图或更快的模型试试"))
      });
    });
  }
  function parseErr(res) {
    let detail = res.responseText || "";
    try {
      const j = JSON.parse(detail);
      detail = j.error?.message || j.message || detail;
    } catch {
    }
    return new Error(`HTTP ${res.status}: ${String(detail).slice(0, 400)}`);
  }
  function chatBody(profile, system, text, images) {
    const content = (images || []).map((im) => ({
      type: "image_url",
      image_url: { url: im.dataUrl, detail: "high" }
    }));
    content.push({ type: "text", text });
    return {
      model: profile.model,
      max_tokens: profileMaxTokens(profile),
      reasoning: { effort: profileThinking(profile) },
      messages: [
        { role: "system", content: system },
        { role: "user", content }
      ]
    };
  }
  var chatHeaders = (profile) => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${profile.key}`
  });
  var pickReply = (json) => (json.choices?.[0]?.message?.content || "").trim();
  async function chat(system, text, images) {
    const p = activeProfile();
    if (!p) throw new Error("还没配置识别服务，点 ⚙️ 添加一个");
    if (!p.key) throw new Error(`服务「${p.name}」还没填 API Key，点 ⚙️ 补上`);
    if (!p.endpoint) throw new Error(`服务「${p.name}」还没填 Endpoint`);
    const res = await request({
      url: p.endpoint,
      headers: chatHeaders(p),
      data: JSON.stringify(chatBody(p, system, text, images))
    });
    if (res.status < 200 || res.status >= 300) throw parseErr(res);
    return pickReply(JSON.parse(res.responseText));
  }
  async function probe(profile) {
    if (!profile.endpoint) throw new Error("Endpoint 是空的");
    if (!profile.key) throw new Error("Key 是空的");
    const res = await request({
      url: profile.endpoint,
      headers: chatHeaders(profile),
      data: JSON.stringify({
        model: profile.model,
        max_tokens: 16,
        reasoning: { effort: "none" },
        messages: [{ role: "user", content: "ping" }]
      })
    });
    if (res.status < 200 || res.status >= 300) throw parseErr(res);
    const j = JSON.parse(res.responseText);
    const reply = pickReply(j);
    return `HTTP ${res.status}，模型 ${j.model || profile.model} 回了「${reply.slice(0, 30) || "(空)"}」`;
  }
  async function gradeAnswer() {
    const ta = getTextarea();
    if (!ta) throw new Error("没找到答题框");
    const plain = (ta.value || "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").trim();
    if (!plain) {
      throw new Error("作答区没有文字内容（只有图片），先用「🖊️ 手写转文字」把手写稿转成文字");
    }
    setStatus("正在准备题干与解析…");
    const { text, hasAnalysis } = await buildDoc({ header: false });
    if (!hasAnalysis) {
      throw new Error("没取到解析，无法对照踩分点判分（先点「查看解析」，或在 ⚙️ 里打开自动展开）");
    }
    setStatus(`${providerLabel()} 判分中…`);
    const t0 = Date.now();
    const result = await chat(cfg.gradePrompt, text);
    const secs = ((Date.now() - t0) / 1e3).toFixed(1);
    if (!result) throw new Error("模型返回了空结果");
    return { result, secs };
  }

  // projects/codebrick/src/state.ts
  var state = {
    busy: false,
    undoSnapshot: null
  };

  // projects/codebrick/src/ocr.ts
  function insertText(ta, text) {
    const cur = ta.value;
    if (cfg.insertMode === "replace") {
      setValue(ta, text);
    } else if (cfg.insertMode === "cursor") {
      const s = ta.selectionStart ?? cur.length;
      const e = ta.selectionEnd ?? cur.length;
      setValue(ta, cur.slice(0, s) + text + cur.slice(e));
      ta.focus();
      ta.setSelectionRange(s + text.length, s + text.length);
    } else {
      const sep = cur.trim() ? cur.endsWith("\n") ? "\n" : "\n\n" : "";
      setValue(ta, cur + sep + text);
      ta.scrollTop = ta.scrollHeight;
    }
  }
  async function runOCR(files) {
    const ta = getTextarea();
    if (!ta) return;
    if (state.busy) {
      setStatus("还在识别上一张，稍等…");
      return;
    }
    const imgs = [...files].filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) {
      setStatus("没找到图片", "err");
      return;
    }
    state.busy = true;
    setBusy(true);
    try {
      setStatus(`压缩 ${imgs.length} 张图…`);
      const payload = [];
      for (const f of imgs) payload.push(await toBase64(f, cfg.maxEdge));
      let contextText = imgs.length > 1 ? `以上 ${imgs.length} 张图按顺序是同一份作答的连续页面，请连贯地转录成一份完整答案。` : "请转录上面这张图里的手写内容。";
      if (cfg.useStem) {
        const stem = getStem();
        if (stem) {
          contextText += `

以下是这道题的题干，仅供你识别专业术语、符号和小问编号时参考，**不要作答、不要把题干抄进输出**：

<题干>
${stem}
</题干>`;
        }
      }
      setStatus(`${providerLabel()} 识别中…`);
      const t0 = Date.now();
      const text = await chat(cfg.prompt, contextText, payload);
      const secs = ((Date.now() - t0) / 1e3).toFixed(1);
      if (!text) throw new Error("模型返回了空结果，换张更清晰的图或换个模型试试");
      state.undoSnapshot = ta.value;
      insertText(ta, text);
      setStatus(`✓ 已插入 ${text.length} 字（${secs}s）`, "ok");
      if (ui.undoBtn) ui.undoBtn.style.display = "";
    } catch (e) {
      console.error("[cbocr]", e);
      setStatus(e.message, "err");
    } finally {
      state.busy = false;
      setBusy(false);
    }
  }

  // projects/codebrick/src/bind.ts
  function bindTextarea(ta) {
    if (ta.dataset.cbocrBound) return;
    ta.dataset.cbocrBound = "1";
    ta.addEventListener("paste", (e) => {
      if (!cfg.autoPaste) return;
      const files = [...e.clipboardData?.items || []].filter((it) => it.kind === "file" && it.type.startsWith("image/")).map((it) => it.getAsFile()).filter((f) => !!f);
      if (!files.length) return;
      if (!cfg.keepImage) {
        e.preventDefault();
        e.stopPropagation();
      }
      setTimeout(() => runOCR(files), cfg.keepImage ? 800 : 0);
    }, true);
    ta.addEventListener("dragover", (e) => {
      if (![...e.dataTransfer?.types || []].includes("Files")) return;
      e.preventDefault();
      ta.classList.add("cbocr-drop");
    });
    ta.addEventListener("dragleave", () => ta.classList.remove("cbocr-drop"));
    ta.addEventListener("drop", (e) => {
      const files = [...e.dataTransfer?.files || []].filter((f) => f.type.startsWith("image/"));
      ta.classList.remove("cbocr-drop");
      if (!files.length) return;
      e.preventDefault();
      e.stopPropagation();
      runOCR(files);
    }, true);
  }

  // projects/codebrick/src/clipboard.ts
  function writeClipboard(text) {
    if (typeof GM_setClipboard === "function") {
      GM_setClipboard(text, { type: "text", mimetype: "text/plain" });
      return Promise.resolve();
    }
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const tmp = document.createElement("textarea");
    tmp.value = text;
    tmp.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(tmp);
    tmp.select();
    const ok = document.execCommand("copy");
    tmp.remove();
    return ok ? Promise.resolve() : Promise.reject(new Error("浏览器拒绝了写剪贴板"));
  }
  async function writeClipboardImage(blob) {
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return true;
    }
    return false;
  }
  function downloadImage(dataUrl, filename) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // projects/codebrick/src/screenshot.ts
  var loading = null;
  function ensureHtml2Canvas() {
    if (typeof window.html2canvas === "function") return Promise.resolve(window.html2canvas);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
      s.onload = () => {
        if (typeof window.html2canvas === "function") resolve(window.html2canvas);
        else reject(new Error("html2canvas 未能成功初始化"));
      };
      s.onerror = () => reject(new Error("无法从 CDN 加载 html2canvas，请检查网络"));
      document.head.appendChild(s);
    });
    return loading;
  }
  async function captureStemCard() {
    const stem = $(".card.stem");
    if (!stem) throw new Error("未找到题干卡片（.card.stem）");
    const html2canvas = await ensureHtml2Canvas();
    const meta = getQuestionMeta();
    const header = document.createElement("div");
    header.className = "cbocr-shot-header";
    header.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px;">
      <span class="cbocr-shot-badge">🏷️ ${escHtml(meta.source)}</span>
      ${meta.qid ? `<span class="cbocr-shot-qid">${escHtml(meta.qid)}</span>` : ""}
    </div>
    <div class="cbocr-shot-meta-right">
      ${meta.score ? `<span class="cbocr-shot-score"><span style="color:#d97706">💯</span> ${escHtml(meta.score)}</span>` : ""}
      ${meta.difficulty ? `<span class="cbocr-shot-diff"><span>难度</span> <span class="stars">${escHtml(meta.difficulty)}</span></span>` : ""}
    </div>`;
    let target = stem;
    let temp = null;
    if (getKind() === "choice") {
      temp = buildChoiceCard(stem, meta);
      document.body.appendChild(temp);
      target = temp;
    } else {
      stem.prepend(header);
    }
    const targetWidth = Math.max(500, parseInt(String(cfg.shotWidth), 10) || DEFAULT_SHOT_WIDTH);
    const prev = { w: target.style.width, mw: target.style.maxWidth, bs: target.style.boxSizing };
    target.style.width = targetWidth + "px";
    target.style.maxWidth = targetWidth + "px";
    target.style.boxSizing = "border-box";
    const extraStyle = document.createElement("style");
    extraStyle.textContent = `
    .card.stem img, .card.stem svg { max-width: 100% !important; height: auto !important; }
  `;
    document.head.appendChild(extraStyle);
    let canvas;
    try {
      canvas = await html2canvas(target, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        scrollY: -window.scrollY,
        scrollX: 0
      });
    } finally {
      header.remove();
      temp?.remove();
      extraStyle.remove();
      target.style.width = prev.w;
      target.style.maxWidth = prev.mw;
      target.style.boxSizing = prev.bs;
    }
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("生成截图图片失败"));
        resolve({ canvas, blob, dataUrl: canvas.toDataURL("image/png"), meta });
      }, "image/png");
    });
  }
  function buildChoiceCard(stem, meta) {
    const { options } = readChoice();
    const wrap2 = document.createElement("div");
    wrap2.className = "cbocr-cq";
    wrap2.style.cssText = "position:fixed;left:-10000px;top:0;";
    const head = `
    <div class="cbocr-cq-head">
      <span class="cbocr-cq-chip">${escHtml(meta.source)}</span>
      ${meta.qid ? `<span class="cbocr-cq-qid">${escHtml(meta.qid)}</span>` : ""}
      <span class="cbocr-cq-sp"></span>
      ${meta.difficulty ? `<span class="cbocr-cq-diff">${escHtml(meta.difficulty)}</span>` : ""}
    </div>`;
    const rows = options.map((o, i) => {
      const btn = document.querySelectorAll("button.opt")[i];
      const text = btn?.querySelector(".opt-text")?.innerHTML ?? escHtml(o.text);
      const state2 = o.correct ? o.mine ? "ok" : "right" : o.mine ? "bad" : "";
      const tag = o.correct && o.mine ? "我的选择 · 正确" : o.correct ? "正确答案" : o.mine ? "我的选择" : "";
      return `<div class="cbocr-cq-opt ${state2 || (o.mine ? "mine" : "")}">
      <span class="cbocr-cq-key">${escHtml(o.key)}</span>
      <span class="cbocr-cq-text">${text}</span>
      ${tag ? `<span class="cbocr-cq-tag">${tag}</span>` : ""}
    </div>`;
    }).join("");
    const seg = stem.querySelector(".md-seg") || stem;
    wrap2.innerHTML = `${head}<div class="cbocr-cq-stem">${seg.innerHTML}</div><div class="cbocr-cq-opts">${rows}</div>`;
    return wrap2;
  }

  // projects/codebrick/src/ui/modals.ts
  function setTip(tip, msg, kind) {
    tip.textContent = msg;
    tip.className = "cbocr-status " + kind;
  }
  function showScreenshotModal(blob, dataUrl, meta, canvas) {
    const mask = document.createElement("div");
    mask.className = "cbocr-mask";
    const w = Math.round(canvas.width / 2);
    mask.innerHTML = `
    <div class="cbocr-modal wide">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
        <h3 style="margin:0">📸 题干智能截图</h3>
        <div style="display:flex; gap:6px;">
          <button class="cbocr-btn cbocr-mini" data-act="toggle-scale" data-scaled="false" title="切换缩放模式">🔍 适应窗口</button>
        </div>
      </div>
      <p class="cbocr-meta">
        ${escHtml(meta.source)} · ${meta.score ? escHtml(meta.score) + " · " : ""}${meta.difficulty ? "难度 " + escHtml(meta.difficulty) + " · " : ""}2x 高清题卡 (${canvas.width}×${canvas.height}px · 排版宽 ${w}px)
      </p>
      <div class="cbocr-shot-preview">
        <img src="${dataUrl}" alt="题干截图" style="width:${w}px; max-width:none;" />
      </div>
      <div class="cbocr-actions">
        <button class="cbocr-btn" data-act="copy">📋 复制图片</button>
        <button class="cbocr-btn" data-act="download">💾 下载图片</button>
        <button class="cbocr-btn primary" data-act="close">关闭</button>
      </div>
      <div class="cbocr-status ok" data-role="tip" style="margin-top:8px">
        ✓ 已自动写入系统剪贴板，可直接在 iPad/备忘录/GoodNotes 中 Cmd+V 粘贴
      </div>
    </div>`;
    document.body.appendChild(mask);
    const tip = mask.querySelector("[data-role=tip]");
    const img = mask.querySelector(".cbocr-shot-preview img");
    const scaleBtn = mask.querySelector("[data-act=toggle-scale]");
    const close = () => mask.remove();
    mask.addEventListener("click", (e) => {
      if (e.target === mask) close();
    });
    const safeName = [meta.qid, meta.source].filter(Boolean).join("-").replace(/[\s·\/:*?"<>|]+/g, "_") + ".png";
    scaleBtn.addEventListener("click", () => {
      const scaled = scaleBtn.dataset.scaled === "true";
      img.style.maxWidth = scaled ? "none" : "100%";
      img.style.width = scaled ? w + "px" : "auto";
      scaleBtn.textContent = scaled ? "🔍 适应窗口" : "🔍 1:1 原尺寸";
      scaleBtn.dataset.scaled = String(!scaled);
    });
    mask.querySelectorAll(".cbocr-actions button").forEach((b) => {
      b.addEventListener("click", async () => {
        const act = b.dataset.act;
        if (act === "close") return close();
        if (act === "download") {
          downloadImage(dataUrl, safeName);
          return setTip(tip, "✓ 已触发下载：" + safeName, "ok");
        }
        if (act === "copy") {
          try {
            if (!await writeClipboardImage(blob)) throw new Error("浏览器未允许写入图片到剪贴板，建议点击「下载图片」");
            setTip(tip, "✓ 图片已再次复制到剪贴板", "ok");
          } catch (e) {
            setTip(tip, "复制失败：" + e.message, "err");
          }
        }
      });
    });
  }
  function showResult(title, body, meta) {
    const mask = document.createElement("div");
    mask.className = "cbocr-mask";
    mask.innerHTML = `
    <div class="cbocr-modal wide">
      <h3>${title}</h3>
      <p class="cbocr-meta"></p>
      <div class="cbocr-result"></div>
      <div class="cbocr-actions">
        <button class="cbocr-btn" data-act="append">追加到作答</button>
        <button class="cbocr-btn" data-act="copy">复制结果</button>
        <button class="cbocr-btn primary" data-act="close">关闭</button>
      </div>
      <div class="cbocr-status" data-role="tip" style="margin-top:8px"></div>
    </div>`;
    mask.querySelector(".cbocr-meta").textContent = meta || "";
    mask.querySelector(".cbocr-result").innerHTML = mdToHtml(body);
    document.body.appendChild(mask);
    const tip = mask.querySelector("[data-role=tip]");
    const copyResult = async (automatic = false) => {
      try {
        await writeClipboard(body);
        setTip(tip, automatic ? "✓ 判分结果已自动复制到剪贴板，关闭后仍可粘贴" : "✓ 已复制到剪贴板", "ok");
      } catch (e) {
        setTip(tip, (automatic ? "自动复制失败，请点击「复制结果」重试：" : "复制失败：") + e.message, "err");
      }
    };
    void copyResult(true);
    const close = () => mask.remove();
    mask.addEventListener("click", (e) => {
      if (e.target === mask) close();
    });
    mask.querySelectorAll(".cbocr-actions button").forEach((b) => {
      b.addEventListener("click", async () => {
        const act = b.dataset.act;
        if (act === "close") return close();
        if (act === "copy") return void await copyResult();
        if (act === "append") {
          const ta = getTextarea();
          if (!ta) return;
          state.undoSnapshot = ta.value;
          const sep = ta.value.trim() ? "\n\n" : "";
          setValue(ta, ta.value + sep + "---\n\n" + body);
          if (ui.undoBtn) ui.undoBtn.style.display = "";
          setTip(tip, "✓ 已追加到答题框（面板上可撤销）", "ok");
        }
      });
    });
  }

  // projects/codebrick/src/ui/profile-select.ts
  function refreshProfileSel() {
    const sel = ui.profileSel;
    if (!sel) return;
    const list = cfg.profiles || [];
    sel.innerHTML = "";
    if (!list.length) {
      sel.innerHTML = "<option>未配置服务</option>";
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    list.forEach((prof, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = prof.model ? `${prof.name} · ${prof.model}` : prof.name;
      sel.appendChild(o);
    });
    sel.value = String(Math.min(cfg.activeProfile | 0, list.length - 1));
  }

  // projects/codebrick/src/ui/settings.ts
  var PRESETS = [
    ["OpenAI", "https://api.openai.com/v1/chat/completions", "gpt-4o"],
    ["xAI Grok", "https://api.x.ai/v1/chat/completions", "grok-4"],
    ["DeepSeek", "https://api.deepseek.com/v1/chat/completions", "deepseek-chat"],
    ["通义千问", "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", "qwen-vl-max"]
  ];
  function profileCard(prof, isActive) {
    const el = document.createElement("div");
    el.className = "cbocr-prof";
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
    const f = (n) => el.querySelector(`[data-f=${n}]`);
    f("name").value = prof.name || "";
    f("model").value = prof.model || "";
    f("endpoint").value = prof.endpoint || "";
    f("key").value = prof.key || "";
    f("thinking").value = profileThinking(prof);
    f("maxTokens").value = String(profileMaxTokens(prof));
    el.querySelector("input[type=radio]").checked = !!isActive;
    const readSelf = () => {
      const th = f("thinking").value;
      return {
        name: f("name").value.trim() || "未命名",
        model: f("model").value.trim(),
        endpoint: f("endpoint").value.trim(),
        key: f("key").value.trim(),
        thinking: THINKING_EFFORTS.includes(th) ? th : "none",
        maxTokens: Math.max(256, parseInt(f("maxTokens").value, 10) || DEFAULT_MAX_TOKENS)
      };
    };
    const tip = el.querySelector("[data-role=tip]");
    el.querySelector("[data-act=del]").addEventListener("click", () => {
      const wasActive = el.querySelector("input[type=radio]").checked;
      const box = el.parentElement;
      el.remove();
      if (wasActive) box.querySelector(".cbocr-prof input[type=radio]")?.setAttribute("checked", "checked");
      const first = box.querySelector(".cbocr-prof input[type=radio]");
      if (wasActive && first) first.checked = true;
    });
    el.querySelector("[data-act=test]").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      tip.className = "cbocr-status";
      tip.textContent = "正在连接…";
      try {
        tip.textContent = "✓ " + await probe(readSelf());
        tip.className = "cbocr-status ok";
      } catch (err) {
        tip.textContent = "✗ " + err.message;
        tip.className = "cbocr-status err";
      } finally {
        btn.disabled = false;
      }
    });
    el._read = readSelf;
    return el;
  }
  function openSettings() {
    const mask = document.createElement("div");
    mask.className = "cbocr-mask";
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
    const g = (id) => mask.querySelector("#" + id);
    const box = g("o-profiles");
    const list = (cfg.profiles || []).length ? cfg.profiles : [blankProfile()];
    list.forEach((prof, idx) => box.appendChild(profileCard(prof, idx === (cfg.activeProfile | 0))));
    if (!box.querySelector("input[type=radio]:checked")) {
      const first = box.querySelector("input[type=radio]");
      if (first) first.checked = true;
    }
    PRESETS.forEach(([name, ep, model], i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = name;
      g("o-preset").appendChild(o);
    });
    g("o-add").addEventListener("click", () => box.appendChild(profileCard(blankProfile(), false)));
    g("o-preset").addEventListener("change", (e) => {
      const sel = e.target;
      const i = sel.value;
      if (i === "") return;
      const [name, endpoint, model] = PRESETS[Number(i)];
      box.appendChild(profileCard({ ...blankProfile(), name, endpoint, model, key: "" }, false));
      sel.value = "";
    });
    g("o-mode").value = cfg.insertMode;
    g("o-stem").checked = cfg.useStem;
    g("o-keep").checked = cfg.keepImage;
    g("o-autoana").checked = cfg.autoOpenAnalysis;
    g("o-edge").value = String(cfg.maxEdge);
    g("o-shotwidth").value = String(cfg.shotWidth || DEFAULT_SHOT_WIDTH);
    g("o-prompt").value = cfg.prompt;
    g("o-gprompt").value = cfg.gradePrompt;
    const close = () => mask.remove();
    mask.addEventListener("click", (e) => {
      if (e.target === mask) close();
    });
    g("o-cancel").addEventListener("click", close);
    g("o-reset").addEventListener("click", () => {
      g("o-prompt").value = DEFAULT_PROMPT;
      g("o-gprompt").value = DEFAULT_GRADE_PROMPT;
    });
    g("o-save").addEventListener("click", () => {
      const cards = [...box.querySelectorAll(".cbocr-prof")];
      const profiles = cards.map((c) => c._read());
      let active = cards.findIndex((c) => c.querySelector("input[type=radio]").checked);
      if (active < 0) active = 0;
      save("profiles", profiles);
      save("activeProfile", active);
      save("insertMode", g("o-mode").value);
      save("useStem", g("o-stem").checked);
      save("keepImage", g("o-keep").checked);
      save("autoOpenAnalysis", g("o-autoana").checked);
      save("maxEdge", Math.max(400, parseInt(g("o-edge").value, 10) || defaults().maxEdge));
      save("shotWidth", Math.max(500, parseInt(g("o-shotwidth").value, 10) || DEFAULT_SHOT_WIDTH));
      save("prompt", g("o-prompt").value || DEFAULT_PROMPT);
      save("gradePrompt", g("o-gprompt").value || DEFAULT_GRADE_PROMPT);
      refreshProfileSel();
      close();
      setStatus(`设置已保存 · 当前使用 ${providerLabel()}`, "ok");
    });
  }

  // projects/codebrick/src/ui/bar.ts
  async function handleSmartScreenshot() {
    if (state.busy) {
      setStatus("还在处理中，稍等…");
      return;
    }
    state.busy = true;
    setBusy(true);
    setStatus("正在生成题干截图…");
    try {
      const { canvas, blob, dataUrl, meta } = await captureStemCard();
      let copied = false;
      try {
        copied = await writeClipboardImage(blob);
      } catch (err) {
        console.warn("[cbocr] 写入剪贴板异常:", err);
      }
      setStatus(copied ? "✓ 截图已复制到剪贴板" : "✓ 截图已生成", "ok");
      showScreenshotModal(blob, dataUrl, meta, canvas);
    } catch (e) {
      console.error("[cbocr] 智能截图失败:", e);
      setStatus("截图失败：" + e.message, "err");
    } finally {
      state.busy = false;
      setBusy(false);
    }
  }
  function copyButton(label, title, run) {
    const btn = mkBtn(label, "", async () => {
      btn.disabled = true;
      try {
        setStatus(await run(), "ok");
      } catch (e) {
        console.error("[cbocr]", e);
        setStatus("复制失败：" + e.message, "err");
      } finally {
        btn.disabled = false;
      }
    }, title);
    return btn;
  }
  function choiceCopyButtons() {
    const quick = copyButton("📋 复制题目+选项", "复制题干、全部选项和我当前选的答案（不含正确答案，刷题途中可放心用）", async () => {
      const { text, choice } = await buildDoc({ header: true, reveal: false });
      await writeClipboard(text);
      const mine = choice?.mine.join("、") || "未选择";
      return `✓ 已复制题干 + ${choice?.options.length ?? 0} 个选项 · 我的选择：${mine}`;
    });
    const full = copyButton("📄 复制全题", "复制题干、选项、我的选择、正确答案和解析（答案揭晓后可用）", async () => {
      const { text, choice, hasAnalysis } = await buildDoc({ header: true });
      await writeClipboard(text);
      if (!choice?.revealed) return "已复制，但答案还没揭晓：提交或点「看解析」后再复制才带正确答案";
      return `✓ 已复制 · 我的选择：${choice.mine.join("、") || "未选"} · 正确答案：${choice.correct.join("、") || "未知"}${hasAnalysis ? " · 含解析" : ""}`;
    });
    return [quick, full];
  }
  function subjectiveButtons(fileInput) {
    const selBtn = mkBtn(
      "🖊️ 手写转文字",
      "primary",
      () => fileInput.click(),
      "选择 iPad 导出的手写图片（可多选，按顺序拼接）"
    );
    const label = () => cfg.autoPaste ? "📋 自动识别粘贴：开" : "📋 自动识别粘贴：关";
    const pasteBtn = mkBtn(label(), "cbocr-toggle" + (cfg.autoPaste ? " on" : ""), () => {
      save("autoPaste", !cfg.autoPaste);
      pasteBtn.textContent = label();
      pasteBtn.className = "cbocr-btn cbocr-toggle" + (cfg.autoPaste ? " on" : "");
    }, "开启后，在答题框里 Cmd+V 粘贴图片会自动送去识别");
    ui.pasteBtn = pasteBtn;
    const undoBtn = mkBtn("↩︎ 撤销插入", "", () => {
      const ta = getTextarea();
      if (ta && state.undoSnapshot !== null) {
        setValue(ta, state.undoSnapshot);
        state.undoSnapshot = null;
        undoBtn.style.display = "none";
        setStatus("已撤销");
      }
    });
    undoBtn.style.display = "none";
    ui.undoBtn = undoBtn;
    const copyBtn = copyButton("📄 复制全题", "把题干、我的作答、完整解析拼成 Markdown 复制到剪贴板（解析没展开会自动点开）", async () => {
      const { text } = await buildDoc({ header: true });
      await writeClipboard(text);
      return `✓ 已复制 ${text.length} 字（题干 + 我的作答 + 完整解析）`;
    });
    const gradeBtn = mkBtn("🧮 AI 判分", "", async () => {
      if (state.busy) {
        setStatus("还在忙，稍等…");
        return;
      }
      state.busy = true;
      setBusy(true);
      gradeBtn.disabled = true;
      try {
        const { result, secs } = await gradeAnswer();
        const score = result.match(/总分[：:]\s*\*{0,2}\s*([\d.]+)\s*\/\s*([\d.]+)/);
        setStatus(score ? `✓ 判分完成：${score[1]} / ${score[2]} 分（${secs}s）` : `✓ 判分完成（${secs}s）`, "ok");
        showResult("AI 判分结果", result, `${providerLabel()} · 耗时 ${secs}s · 对照站点解析的踩分点，仅供参考`);
      } catch (e) {
        console.error("[cbocr]", e);
        setStatus(e.message, "err");
      } finally {
        state.busy = false;
        setBusy(false);
        gradeBtn.disabled = false;
      }
    }, "把题干 + 我的作答 + 完整解析发给模型，对照踩分点逐点判分（用你自己的 API Key，不消耗站点积分）");
    return [selBtn, ui.pasteBtn, undoBtn, copyBtn, gradeBtn];
  }
  function buildBar(anchor, kind) {
    const bar = document.createElement("div");
    bar.className = "cbocr-bar";
    bar.dataset.cbocr = "1";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.multiple = true;
    fileInput.style.display = "none";
    fileInput.addEventListener("change", () => {
      if (fileInput.files?.length) runOCR(fileInput.files);
      fileInput.value = "";
    });
    const shotBtn = mkBtn(
      "📸 智能截图",
      "",
      handleSmartScreenshot,
      "截取题干高清题卡（顶部条自动标注题源、分值、难度，黄金宽度排版防止图片缩放文字过小）"
    );
    const cfgBtn = mkBtn("⚙️", "", openSettings, "管理识别服务 / 提示词 / 截图排版");
    ui.statusEl = document.createElement("span");
    ui.statusEl.className = "cbocr-status";
    const items = [];
    const actions = [shotBtn];
    if (kind === "choice") {
      const copies = choiceCopyButtons();
      items.push(...copies, shotBtn);
      actions.push(...copies);
    } else {
      const [selBtn, pasteBtn, undoBtn, copyBtn, gradeBtn] = subjectiveButtons(fileInput);
      const sel = document.createElement("select");
      sel.className = "cbocr-select";
      sel.title = "切换识别服务";
      sel.addEventListener("change", () => {
        save("activeProfile", Number(sel.value));
        setStatus("已切换到 " + providerLabel());
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

  // projects/codebrick/src/ui/styles.ts
  var CSS = `
  .cbocr-bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:6px 0 2px; }
  .cbocr-btn {
    font: inherit; font-size:12px; line-height:1; padding:6px 10px; cursor:pointer;
    border:1px solid #d6dae0; border-radius:6px; background:#fff; color:#333;
  }
  .cbocr-btn:hover:not(:disabled) { background:#f3f5f8; border-color:#b9c0c9; }
  .cbocr-btn:disabled { opacity:.5; cursor:not-allowed; }
  .cbocr-btn.primary { background:#2563eb; border-color:#2563eb; color:#fff; }
  .cbocr-btn.primary:hover:not(:disabled) { background:#1d4ed8; }
  .cbocr-toggle.on  { background:#e8f0fe; border-color:#9cb8f0; color:#1d4ed8; }
  .cbocr-status { font-size:12px; color:#666; }
  .cbocr-status.err { color:#c0392b; }
  .cbocr-status.ok  { color:#15803d; }
  .cbocr-drop { outline:2px dashed #2563eb !important; outline-offset:2px; background:#f5f9ff !important; }

  .cbocr-mask {
    position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:99999;
    display:flex; align-items:center; justify-content:center;
  }
  .cbocr-modal {
    background:#fff; border-radius:10px; width:min(560px, 92vw); max-height:86vh; overflow:auto;
    padding:18px 20px; box-shadow:0 12px 40px rgba(0,0,0,.25); font-size:13px; color:#222;
  }
  .cbocr-modal h3 { margin:0 0 14px; font-size:15px; }
  .cbocr-modal label { display:block; margin:10px 0 4px; font-weight:600; font-size:12px; color:#444; }
  .cbocr-modal input[type=text], .cbocr-modal input[type=number], .cbocr-modal input[type=password],
  .cbocr-modal select, .cbocr-modal textarea {
    width:100%; box-sizing:border-box; padding:6px 8px; font:inherit; font-size:12px;
    border:1px solid #d6dae0; border-radius:6px; background:#fff; color:#222;
  }
  .cbocr-modal textarea { min-height:150px; resize:vertical; font-family:ui-monospace,Menlo,monospace; }
  .cbocr-modal .row { display:flex; gap:10px; }
  .cbocr-modal .row > * { flex:1; min-width:0; }
  .cbocr-check { display:flex; align-items:center; gap:6px; margin:8px 0; font-size:12px; }
  .cbocr-check input { margin:0; }
  .cbocr-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:18px; }
  .cbocr-hint { font-size:11px; color:#888; margin-top:4px; line-height:1.5; }

  .cbocr-modal.wide { width:min(880px, 95vw); }
  .cbocr-result {
    font-size:13px; line-height:1.7; color:#222;
    background:#fafbfc; border:1px solid #eceff3; border-radius:6px;
    padding:12px 16px; max-height:62vh; overflow:auto; margin:0;
  }
  .cbocr-result p { margin:8px 0; }
  .cbocr-result h4, .cbocr-result h5, .cbocr-result h6 { margin:14px 0 6px; font-size:13px; }
  .cbocr-result ul, .cbocr-result ol { margin:8px 0; padding-left:22px; }
  .cbocr-result li { margin:3px 0; }
  .cbocr-result code { background:#eef1f4; padding:1px 4px; border-radius:3px; font-size:12px; }
  .cbocr-result table { border-collapse:collapse; width:100%; margin:10px 0; font-size:12.5px; }
  .cbocr-result th, .cbocr-result td {
    border:1px solid #e3e7ec; padding:6px 9px; text-align:left; vertical-align:top;
  }
  .cbocr-result th { background:#f2f5f8; font-weight:600; white-space:nowrap; }
  .cbocr-result tbody tr:nth-child(even) { background:#fff; }
  .cbocr-meta { font-size:11px; color:#888; margin:0 0 10px; }

  .cbocr-select {
    font: inherit; font-size:12px; padding:5px 8px; max-width:200px;
    border:1px solid #d6dae0; border-radius:6px; background:#fff; color:#333; cursor:pointer;
  }
  .cbocr-prof {
    border:1px solid #e3e7ec; border-radius:8px; padding:10px 12px; margin-top:8px; background:#fcfdfe;
  }
  .cbocr-prof-head { display:flex; align-items:center; gap:8px; }
  .cbocr-radio { display:flex !important; align-items:center; gap:5px; margin:0 !important; font-size:12px; font-weight:600; }
  .cbocr-radio input { margin:0; }
  .cbocr-btn.cbocr-mini { padding:4px 8px; font-size:11px; }

  /* 智能截图顶部条与弹窗 */
  .cbocr-shot-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    margin: -2px -2px 16px -2px;
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
    box-sizing: border-box;
  }
  .cbocr-shot-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    background: #eff6ff;
    color: #1d4ed8;
    font-weight: 700;
    font-size: 13px;
    border-radius: 6px;
    border: 1px solid #bfdbfe;
  }
  .cbocr-shot-qid {
    font-size: 12px;
    color: #64748b;
    font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
    font-weight: 500;
    background: #f1f5f9;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid #e2e8f0;
  }
  .cbocr-shot-meta-right {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .cbocr-shot-score {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 600;
    color: #334155;
  }
  .cbocr-shot-diff {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 600;
    color: #475569;
  }
  .cbocr-shot-diff .stars {
    color: #f59e0b;
    letter-spacing: 1px;
    font-size: 14px;
  }
  .cbocr-shot-preview {
    max-height: 62vh;
    overflow: auto;
    text-align: center;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 16px;
    margin: 8px 0;
  }
  .cbocr-shot-preview img {
    display: inline-block;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
    border-radius: 6px;
    transition: max-width .15s ease;
  }

  /* 选择题截图卡片 */
  .cbocr-cq {
    box-sizing: border-box; padding: 20px 24px 22px; background: #fff; color: #1f2937;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Helvetica Neue", sans-serif;
    font-size: 15px; line-height: 1.7;
  }
  .cbocr-cq-head { display: flex; align-items: center; gap: 8px; padding-bottom: 12px; margin-bottom: 14px; border-bottom: 1px solid #eef0f3; font-size: 12px; }
  .cbocr-cq-chip { padding: 2px 9px; border-radius: 999px; background: #eff6ff; color: #1d4ed8; font-weight: 600; }
  .cbocr-cq-qid { color: #9ca3af; font-family: ui-monospace, Menlo, monospace; }
  .cbocr-cq-sp { flex: 1; }
  .cbocr-cq-diff { color: #f59e0b; letter-spacing: 1px; }
  .cbocr-cq-stem p { margin: 6px 0; }
  .cbocr-cq-stem > :first-child { margin-top: 0; }
  .cbocr-cq-opts { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
  .cbocr-cq-opt {
    display: flex; align-items: center; gap: 12px; padding: 9px 14px;
    border: 1px solid #e5e7eb; border-radius: 10px; background: #fff;
  }
  .cbocr-cq-key {
    flex: none; width: 24px; height: 24px; border-radius: 50%; background: #f3f4f6; color: #4b5563;
    font-size: 13px; font-weight: 600; display: flex; align-items: center; justify-content: center;
  }
  .cbocr-cq-text { flex: 1; min-width: 0; }
  .cbocr-cq-tag { flex: none; font-size: 12px; font-weight: 600; }
  .cbocr-cq-opt.mine { border-color: #93c5fd; background: #eff6ff; }
  .cbocr-cq-opt.mine .cbocr-cq-key { background: #2563eb; color: #fff; }
  .cbocr-cq-opt.mine .cbocr-cq-tag { color: #1d4ed8; }
  .cbocr-cq-opt.ok, .cbocr-cq-opt.right { border-color: #86efac; background: #f0fdf4; }
  .cbocr-cq-opt.ok .cbocr-cq-key, .cbocr-cq-opt.right .cbocr-cq-key { background: #16a34a; color: #fff; }
  .cbocr-cq-opt.ok .cbocr-cq-tag, .cbocr-cq-opt.right .cbocr-cq-tag { color: #15803d; }
  .cbocr-cq-opt.bad { border-color: #fca5a5; background: #fef2f2; }
  .cbocr-cq-opt.bad .cbocr-cq-key { background: #dc2626; color: #fff; }
  .cbocr-cq-opt.bad .cbocr-cq-tag { color: #b91c1c; }
`;

  // projects/codebrick/src/main.ts
  GM_addStyle(CSS);
  function anchorFor(kind) {
    if (kind === "subjective") {
      const ta = getTextarea();
      bindTextarea(ta);
      return $(".ca-diagram-tools") || ta.parentElement?.querySelector(".ca-tools") || ta;
    }
    return $("button.opt")?.closest("section.card, .card") || null;
  }
  function mount() {
    const kind = getKind();
    if (!kind) return;
    const anchor = anchorFor(kind);
    if (!anchor) return;
    if (anchor.nextElementSibling?.dataset?.cbocr === "1") return;
    buildBar(anchor, kind);
  }
  mount();
  new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
})();
})();
