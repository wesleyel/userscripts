import { escHtml } from './dom';

// ─────────────── DOM → Markdown（站点解析/题干是渲染好的 Markdown，这里还原） ───────────────

/** KaTeX 渲染节点里藏着原始 LaTeX（annotation），直接取它，避免 mathml + html 双份文本 */
function texOf(el: Element): string {
  return el.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim() || el.textContent!.trim();
}

/** 行内元素：加粗 / 斜体 / 代码 / 链接 / 图片 / 上下标 / 公式 */
export function inlineMd(node: Node): string {
  let s = '';
  node.childNodes.forEach((c) => {
    if (c.nodeType === 3) { s += c.nodeValue!.replace(/\s+/g, ' '); return; }
    if (c.nodeType !== 1) return;
    const el = c as HTMLElement;
    if (el.classList.contains('katex-display')) { s += '\n$$' + texOf(el) + '$$\n'; return; }
    if (el.classList.contains('katex')) { s += '$' + texOf(el) + '$'; return; }
    switch (el.tagName) {
      case 'BR': s += '\n'; break;
      case 'STRONG': case 'B': s += '**' + inlineMd(el).trim() + '**'; break;
      case 'EM': case 'I': s += '*' + inlineMd(el).trim() + '*'; break;
      case 'CODE': s += '`' + el.textContent + '`'; break;
      case 'DEL': case 'S': s += '~~' + inlineMd(el).trim() + '~~'; break;
      case 'A': {
        const txt = inlineMd(el).trim();
        const href = (el as HTMLAnchorElement).href || '';
        const bare = href.replace(/^https?:\/\//, '').replace(/\/$/, '');
        s += (txt && bare.toLowerCase() === txt.toLowerCase())
          ? txt
          : '[' + (txt || href) + '](' + href + ')';
        break;
      }
      case 'IMG': s += '![' + ((el as HTMLImageElement).alt || '') + '](' + (el as HTMLImageElement).src + ')'; break;
      case 'SUB': s += '_' + el.textContent; break;
      case 'SUP': s += '^' + el.textContent; break;
      default: s += inlineMd(el);
    }
  });
  return s;
}

function listMd(list: Element, indent: number): string {
  const ordered = list.tagName === 'OL';
  const lines: string[] = [];
  let n = 1;
  const isList = (e: Element) => e.tagName === 'UL' || e.tagName === 'OL';
  [...list.children].filter((li) => li.tagName === 'LI').forEach((li) => {
    const nested = [...li.children].filter(isList);
    const clone = li.cloneNode(true) as Element;
    [...clone.children].filter(isList).forEach((e) => e.remove());
    lines.push(' '.repeat(indent) + (ordered ? n++ + '. ' : '- ') + inlineMd(clone).trim());
    nested.forEach((sub) => lines.push(listMd(sub, indent + 2)));
  });
  return lines.join('\n');
}

function tableMd(table: Element): string {
  const rows = [...table.querySelectorAll('tr')];
  if (!rows.length) return '';
  const cells = (r: Element) => [...r.children].map((c) => inlineMd(c).trim().replace(/\|/g, '\\|') || ' ');
  const head = cells(rows[0]);
  const lines = [
    '| ' + head.join(' | ') + ' |',
    '| ' + head.map(() => '---').join(' | ') + ' |',
  ];
  rows.slice(1).forEach((r) => {
    const cs = cells(r);
    while (cs.length < head.length) cs.push(' ');
    lines.push('| ' + cs.join(' | ') + ' |');
  });
  return lines.join('\n');
}

export function domToMd(root: Element): string {
  const out: string[] = [];
  const walk = (parent: Element) => {
    parent.childNodes.forEach((c) => {
      if (c.nodeType === 3) { const t = c.nodeValue!.trim(); if (t) out.push(t); return; }
      if (c.nodeType !== 1) return;
      const el = c as HTMLElement;
      const T = el.tagName;
      if (/^H[1-6]$/.test(T)) {
        out.push('#'.repeat(Number(T[1])) + ' ' + inlineMd(el).trim());
      } else if (T === 'P') {
        const s = inlineMd(el).trim(); if (s) out.push(s);
      } else if (T === 'UL' || T === 'OL') {
        out.push(listMd(el, 0));
      } else if (T === 'TABLE') {
        out.push(tableMd(el));
      } else if (T === 'BLOCKQUOTE') {
        out.push(domToMd(el).split('\n').map((l) => (l ? '> ' + l : '>')).join('\n'));
      } else if (T === 'PRE') {
        out.push('```\n' + el.textContent!.replace(/\n$/, '') + '\n```');
      } else if (T === 'HR') {
        out.push('---');
      } else if (T === 'IMG') {
        out.push('![' + ((el as HTMLImageElement).alt || '') + '](' + (el as HTMLImageElement).src + ')');
      } else if (el.classList.contains('katex') || el.classList.contains('katex-display')) {
        const s = inlineMd(wrap(el)).trim(); if (s) out.push(s);
      } else if (T === 'DIV' || T === 'SECTION' || T === 'ARTICLE') {
        walk(el);
      } else {
        const s = inlineMd(el).trim(); if (s) out.push(s);
      }
    });
  };
  walk(root);
  return out.filter(Boolean).join('\n\n');
}

/** 把单个节点包进临时容器，复用 inlineMd 的遍历逻辑 */
function wrap(el: Element): Element {
  const box = document.createElement('div');
  box.appendChild(el.cloneNode(true));
  return box;
}

// ─────────────── Markdown → HTML（AI 判分结果展示用） ───────────────

function inlineHtml(s: string): string {
  return escHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
}

export function mdToHtml(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  const isRow = (l?: string) => /^\s*\|/.test(l || '');
  const cells = (r: string) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  let i = 0;

  while (i < lines.length) {
    const l = lines[i];

    if (isRow(l) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const rows: string[] = [];
      while (i < lines.length && isRow(lines[i])) rows.push(lines[i++]);
      const head = cells(rows[0]);
      let html = '<table><thead><tr>'
        + head.map((h) => '<th>' + inlineHtml(h) + '</th>').join('')
        + '</tr></thead><tbody>';
      rows.slice(2).forEach((r) => {
        html += '<tr>' + cells(r).map((c) => '<td>' + inlineHtml(c) + '</td>').join('') + '</tr>';
      });
      out.push(html + '</tbody></table>');
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
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ''));
      out.push('<ul>' + items.map((t) => '<li>' + inlineHtml(t) + '</li>').join('') + '</ul>');
      continue;
    }

    if (/^\s*\d+\.\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ''));
      out.push('<ol>' + items.map((t) => '<li>' + inlineHtml(t) + '</li>').join('') + '</ol>');
      continue;
    }

    if (!l.trim()) { i++; continue; }

    const buf: string[] = [];
    while (i < lines.length && lines[i].trim()
      && !isRow(lines[i]) && !/^#{1,6}\s/.test(lines[i])
      && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s/.test(lines[i])) {
      buf.push(lines[i++]);
    }
    out.push('<p>' + inlineHtml(buf.join(' ')) + '</p>');
  }
  return out.join('\n');
}
