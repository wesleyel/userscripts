export const CSS = `
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

  /* 左侧 Material 悬浮按钮 */
  .cbocr-fabs {
    position: fixed; left: 16px; top: 50%; transform: translateY(-50%); z-index: 9990;
    display: flex; flex-direction: column; gap: 14px;
  }
  .cbocr-fab {
    position: relative; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; cursor: pointer;
    background: #fff; color: #374151; font: inherit; font-size: 19px; line-height: 1;
    box-shadow: 0 1px 3px rgba(0,0,0,.22), 0 3px 8px rgba(0,0,0,.14);
    transition: box-shadow .2s, transform .2s, background .2s;
  }
  .cbocr-fab:hover:not(:disabled) { box-shadow: 0 3px 6px rgba(0,0,0,.24), 0 8px 18px rgba(0,0,0,.18); transform: translateY(-1px); background: #f8fafc; }
  .cbocr-fab:active:not(:disabled) { transform: scale(.94); }
  .cbocr-fab:disabled { opacity: .45; cursor: not-allowed; }
  .cbocr-fab.primary { background: #2563eb; color: #fff; }
  .cbocr-fab.primary:hover:not(:disabled) { background: #1d4ed8; }
  .cbocr-fab.toggle:not(.on) { opacity: .6; }
  .cbocr-fab.on::after {
    content: ''; position: absolute; top: 3px; right: 3px; width: 9px; height: 9px;
    border-radius: 50%; background: #22c55e; border: 2px solid #fff; box-sizing: content-box;
  }
  .cbocr-fab-label {
    position: absolute; left: calc(100% + 12px); top: 50%; transform: translate(-4px, -50%);
    padding: 6px 12px; border-radius: 6px; background: rgba(33,33,33,.94); color: #fff;
    font-size: 12px; font-weight: 500; white-space: nowrap; pointer-events: none;
    opacity: 0; transition: opacity .15s, transform .15s;
  }
  .cbocr-fab:hover .cbocr-fab-label { opacity: 1; transform: translate(0, -50%); }

  /* Snackbar */
  .cbocr-toast {
    position: fixed; left: 76px; bottom: 28px; z-index: 99998; max-width: min(420px, 70vw);
    padding: 11px 18px; border-radius: 8px; background: #323232; color: #fff;
    font-size: 13px; line-height: 1.5; box-shadow: 0 3px 10px rgba(0,0,0,.3);
    opacity: 0; transform: translateY(8px); pointer-events: none; transition: opacity .2s, transform .2s;
  }
  .cbocr-toast.show { opacity: 1; transform: none; }
  .cbocr-toast.ok { background: #1b5e20; }
  .cbocr-toast.err { background: #b3261b; }
`;
