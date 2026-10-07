export function writeClipboard(text: string): Promise<void> {
  if (typeof GM_setClipboard === 'function') {
    GM_setClipboard(text, { type: 'text', mimetype: 'text/plain' });
    return Promise.resolve();
  }
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const tmp = document.createElement('textarea');
  tmp.value = text;
  tmp.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(tmp);
  tmp.select();
  const ok = document.execCommand('copy');
  tmp.remove();
  return ok ? Promise.resolve() : Promise.reject(new Error('浏览器拒绝了写剪贴板'));
}

export async function writeClipboardImage(blob: Blob): Promise<boolean> {
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  }
  return false;
}

export function downloadImage(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
