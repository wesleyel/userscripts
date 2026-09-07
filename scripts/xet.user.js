// ==UserScript==
// @name         小鹅通 · 看课助手
// @namespace    local.xiaoe.study
// @version      1.4.0
// @description  默认剧院、侧栏标记、全部课程标记汇总(折叠/跳转/导出全部)、油猴内置存储、倍速、A–B 循环与笔记导出
// @match        https://*.h5.xet.pomoho.com/v4/course/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addValueChangeListener
// @run-at       document-idle
// @noframes
// @license MIT
// @downloadURL https://update.greasyfork.org/scripts/594407/%E5%B0%8F%E9%B9%85%E9%80%9A%20%C2%B7%20%E7%9C%8B%E8%AF%BE%E5%8A%A9%E6%89%8B.user.js
// @updateURL https://update.greasyfork.org/scripts/594407/%E5%B0%8F%E9%B9%85%E9%80%9A%20%C2%B7%20%E7%9C%8B%E8%AF%BE%E5%8A%A9%E6%89%8B.meta.js
// ==/UserScript==

(() => {
  'use strict';
  const HOST_ID = 'xe-study-assistant';
  if (document.getElementById(HOST_ID)) return;
  const PREFIX = 'xe-study:v1:';
  const contexts = new Map();
  const imageMemory = new Map(), imageURLs = new Map(), imagePending = new Map();
  let imageDBPromise = null, exporting = false;
  let ctx = null, video = null, videoAbort = null, theater = false;
  let desiredRate = null, loopA = null, loopB = null, looping = false;
  let reconcileQueued = false, seenURL = '', pendingLink = null;
  let boundCourse = '', lastSource = '', storageFault = false;
  let awaitingMedia = null;
  let lastDeleted = null;
  let activePanel = 'study', collapsed = false, wantTheater = true;
  const nativePlayers = new Map(), nativeComponents = new Map();
  let frameCallbackVideo=null, frameCallbackId=null, frameSample=null, frameIntervals=[];
  let frameRateMode='auto';
  const abort = new AbortController();
  const signal = abort.signal;
  const host = document.createElement('div');
  host.id = HOST_ID;
  const ui = host.attachShadow({ mode: 'open' });
  const css = document.createElement('style');
  css.textContent = `
    html[data-xe-study] { --xe-study-side-width:min(360px, 44vw); --xe-study-side-space:var(--xe-study-side-width); }
    html[data-xe-study-collapsed] { --xe-study-side-space:0px; }
    @media(max-width:600px) { html[data-xe-study] { --xe-study-side-width:min(340px, 85vw); } }
    html[data-xe-study-theater] { overflow: hidden !important; }
    html[data-xe-study-theater] #live-room-landscape,
    html[data-xe-study-theater] #base-business-layer,
    html[data-xe-study-theater] #base-business-container {
      width:100vw!important; max-width:none!important; height:100dvh!important; margin:0!important;
    }
    html[data-xe-study-theater] #base-business-container > header,
    html[data-xe-study-theater] #base-business-container > section { display:none!important; }
    html[data-xe-study-theater] #base-business-container > main {
      position:fixed!important; inset:0 var(--xe-study-side-space) 0 0!important;
      width:calc(100vw - var(--xe-study-side-space))!important; height:100dvh!important;
      margin:0!important; padding:0!important; background:#000!important; z-index:900!important;
    }
    html[data-xe-study-theater] #base-business-container > main :is(
      .videoAreaWrapper,.videoAreaView,#live-landscape-video,#basic-video-layer,#video-container,
      .live-player-component,.player-area,.playerModule,#videoWrapper) {
      width:100%!important; height:100%!important; max-width:none!important; max-height:none!important;
      margin:0!important; padding:0!important;
    }
    html[data-xe-study-theater] #videoWrapper video { width:100%!important; height:100%!important; object-fit:contain!important; }
    /* 移除随控制条显示的全画面渐变遮罩，避免遮暗课件。 */
    html[data-xe-study] .xgplayer .gradient {
      background-image: none !important;
    }
    /* 修复 xgplayer 在 PC 端因 not-allow-autoplay 或 inactive 导致控制条与进度条隐形 */
    .xgplayer.not-allow-autoplay .basic-xgplayer-controls,
    .xgplayer.xgplayer-nostart .basic-xgplayer-controls {
      pointer-events: auto !important;
      visibility: visible !important;
      opacity: 1 !important;
    }
    .xgplayer .basic-xgplayer-controls {
      z-index: 25 !important;
      opacity: 1 !important;
      visibility: visible !important;
      transform: translateY(0) !important;
      pointer-events: auto !important;
      transition: opacity 0.3s ease, transform 0.3s ease !important;
    }
    .xgplayer.xgplayer-inactive:not(:hover) .basic-xgplayer-controls {
      opacity: 0 !important;
      transform: translateY(100%) !important;
      pointer-events: none !important;
    }
    .xgplayer .xgplayer-progress,
    .xgplayer .xg-inner-controls,
    .xgplayer .xg-center-grid {
      visibility: visible !important;
      opacity: 1 !important;
    }
    html[data-xe-study-theater] .playerModule,
    html[data-xe-study-theater] .xgplayer {
      position: relative !important;
      overflow: hidden !important;
    }
    html[data-xe-study-theater] .basic-xgplayer-controls {
      position: absolute !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
    }
    /* 只改变原互动/介绍区域的布局，保留 Vue 节点、输入框及事件。 */
    html[data-xe-study] #base-business-container > footer {
      position:fixed!important; inset:80px 0 0 auto!important; width:var(--xe-study-side-width)!important;
      height:calc(100dvh - 80px)!important; max-height:none!important; margin:0!important;
      padding:0!important; display:flex!important; flex-direction:column!important;
      background:#fff!important; border-left:1px solid #334054; box-sizing:border-box!important;
      overflow:hidden!important; z-index:2147483644!important;
    }
    html[data-xe-study-panel="study"] #base-business-container > footer,
    html[data-xe-study-panel="all"] #base-business-container > footer,
    html[data-xe-study-collapsed] #base-business-container > footer { display:none!important; }
    html[data-xe-study] #base-business-container > footer > .tab-zone-container { display:none!important; }
    html[data-xe-study] #tab-swiper { flex:1!important; min-height:0!important; width:100%!important; height:100%!important; }
    html[data-xe-study] #tab-swiper > .van-swipe__track {
      display:block!important; width:100%!important; height:100%!important; transform:none!important;
    }
    html[data-xe-study] #tab-swiper > .van-swipe__track > .van-swipe-item {
      display:none!important; position:relative!important; float:none!important;
      width:100%!important; height:100%!important; transform:none!important;
    }
    html[data-xe-study-panel="interaction"] #tab-swiper > .van-swipe__track > [data-xe-study-pane="interaction"],
    html[data-xe-study-panel="intro"] #tab-swiper > .van-swipe__track > [data-xe-study-pane="intro"] { display:block!important; }
    html[data-xe-study] #tab-swiper :is(.interactionView,.detailView) { width:100%!important; height:100%!important; }
  `;
  ui.innerHTML = `
    <style>
      :host{all:initial;position:fixed;right:0;top:0;width:var(--xe-study-side-width,360px);height:100dvh;z-index:2147483646;pointer-events:none;color-scheme:dark;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#ebf0f9}
      *{box-sizing:border-box}button,select,textarea{font:inherit;color:inherit}button,select{border:1px solid #354253;border-radius:8px;background:#253143;cursor:pointer;padding:7px 10px}button:hover{background:#35445a}button:disabled,select:disabled{opacity:.4;cursor:not-allowed}button:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #83c8ff;outline-offset:2px}
      #shell,.box{width:100%;height:100%}.box{border-left:1px solid #334054;background:#131d2c;overflow:hidden;display:flex;flex-direction:column}.box.native{background:transparent}header{height:52px;flex-shrink:0;padding:10px 14px;display:flex;align-items:center;gap:8px;background:#1c293b;pointer-events:auto}.brand{font-weight:700;letter-spacing:.5px;flex:1}.small{font-size:12px;color:#b2c1d6}header button{padding:3px 8px}nav{height:48px;flex-shrink:0;display:flex;align-items:stretch;padding:0 8px;background:#1c293b;border-bottom:1px solid #334054;pointer-events:auto}nav button{border:0;border-radius:0;background:transparent;flex:1;padding:8px 4px;color:#a8b7cc;font-size:13px;white-space:nowrap}nav button[aria-selected="true"]{color:#a9dbff;border-bottom:3px solid #65b9ea;background:#203348}main{padding:16px 14px;min-height:0;flex:1;overflow:auto;pointer-events:auto}h2{font-size:13px;margin:0 0 14px;font-weight:500;word-break:break-word;color:#b2c1d6}.row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:9px}.row>*{flex:1}#clock{font-variant-numeric:tabular-nums;color:#a9dbff;white-space:nowrap}.primary{background:#245e84;border-color:#3c91ba}.primary:hover{background:#2c749c}.divider{border-top:1px solid #334054;margin:16px 0}#marks{display:grid;gap:9px}.mark{padding:9px;border:1px solid #354253;border-radius:10px;background:#1b2839}.mark-head{display:flex;align-items:center;gap:8px;margin-bottom:6px}.stamp{color:#a9dbff;font-variant-numeric:tabular-nums;font-weight:600}.spacer{flex:1}.delete{font-size:12px;padding:3px 8px;background:transparent;color:#b3c1d3}textarea{display:block;resize:vertical;width:100%;min-height:56px;border:1px solid #445267;border-radius:7px;background:#111b29;padding:7px}#status{font-size:12px;color:#b4c9dd;margin:8px 0 0;overflow-wrap:anywhere}.empty{color:#9fb1c8;text-align:center;padding:16px 0}.help{font-size:11px;color:#95a8c0;margin-top:10px}.hidden,[hidden]{display:none!important}select{width:100%}.count{font-size:12px;color:#a9bcd3}
      :host([data-collapsed]){width:44px;height:auto;top:50%;transform:translateY(-50%)}.compact .box{height:auto;border:1px solid #45516a;border-radius:10px 0 0 10px;background:#1c293b}.compact main,.compact nav,.compact .brand{display:none}.compact header{padding:8px 3px;height:auto}.compact #fold{padding:8px 3px;border:0;width:100%}#native-note{flex:1;padding:20px;background:#fff;color:#526177;font-size:13px;pointer-events:none}
      header{height:40px;padding:6px 12px}.brand{font-size:13px}nav{height:40px}nav button{padding:6px 3px}
      #study-pane{display:flex;flex-direction:column;padding:0;overflow:hidden;font-size:12px}
      .compact #study-pane{display:none}
      .controls{flex:none;padding:10px 10px 8px;border-bottom:1px solid #2a384b}.course-line{display:flex;align-items:center;gap:8px;margin-bottom:7px}#course{min-width:0;flex:1;font-size:12px;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#clock{font-size:11px;flex:none;color:#a6c4df}
      .tools{display:flex;align-items:center;gap:5px;margin-top:5px}.tools button,.tools select{padding:4px 6px;min-height:27px;font-size:12px;border-radius:6px;white-space:nowrap}.tools button{flex:1}.tools select{width:74px;flex:none}.tools .loop-clear{flex:0;padding:4px 8px}#a,#b{font-variant-numeric:tabular-nums}
      .records{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}.records-head{display:flex;align-items:center;gap:6px;flex:none;padding:8px 10px 4px}.records-head .count{flex:1}.text-button{padding:3px 5px!important;font-size:11px!important;border:0;background:transparent;color:#a9bdd4}.text-button:hover{color:#def2ff;background:#253143}
      #marks{display:flex;flex-direction:column;gap:8px;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#435269 transparent;min-height:0;flex:1;padding:6px 10px 12px;overflow-anchor:none}.mark{flex:none;border-radius:8px;padding:8px}.mark.editing{border-color:#65b9ea}.mark-head{gap:4px;margin:0}.stamp{padding:2px 5px;font-size:11px;border:0;background:#253b50}.note-content{margin:7px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;color:#dce6f3}.note-content.muted{color:#8294ac;font-size:11px}.shot{display:block;width:100%;border:0;border-radius:5px;overflow:hidden;background:#080e17;padding:0;margin-top:7px;cursor:zoom-in}.shot:hover{background:#080e17}.shot img{display:block;width:100%;max-height:165px;object-fit:contain}.shot-state{margin:6px 0 0;color:#9badc4;font-size:10px}.empty{font-size:12px;margin:auto 0;line-height:1.9}
      #composer{position:sticky;bottom:0;z-index:2;flex:none;padding:9px 10px calc(9px + env(safe-area-inset-bottom,0px));background:#192637;border-top:1px solid #354458;box-shadow:0 -5px 18px #07101a33}.composer-label{display:flex;align-items:center;gap:6px;margin-bottom:5px;color:#a8bdd4;font-size:11px}.composer-label span{flex:1}#note-input{min-height:64px;height:64px;max-height:150px;resize:vertical;padding:7px 8px;font-size:12px;line-height:1.5;border-color:#40516a}.composer-actions{display:flex;align-items:center;gap:6px;margin-top:7px}.composer-actions .hint{font-size:10px;color:#8c9fb8;flex:1}#add{font-size:12px;padding:5px 10px;border-radius:6px}#status{font-size:10px;line-height:1.35;margin:6px 0 0;max-height:42px;overflow:auto;color:#a4b8cf}
      dialog{width:min(92vw,1400px);max-width:92vw;max-height:92dvh;padding:10px;border:1px solid #4a5b70;border-radius:10px;background:#111c2a;color:#ebf0f9;pointer-events:auto}dialog::backdrop{background:#000c}dialog .preview-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}dialog img{display:block;max-width:100%;max-height:calc(92dvh - 70px);margin:auto;object-fit:contain}dialog button{padding:4px 9px;font-size:12px}
      #keys-help{padding:2px 5px;min-height:21px;flex:none;border:0;font-size:12px;background:transparent;color:#a9bdd4}#keys-dialog{width:min(420px,92vw);font-size:12px;padding:14px}#keys-dialog table{width:100%;border-collapse:collapse;margin:8px 0 12px}#keys-dialog td{padding:5px 3px;border-bottom:1px solid #2b394a}#keys-dialog td:first-child{color:#acd9fc;white-space:nowrap}#keys-dialog p{color:#a9bcd3;font-size:11px;line-height:1.6}#frame-rate{padding:5px;font-size:12px;margin-top:5px}
      @media(max-height:600px){.controls{padding:6px 8px}.course-line{margin-bottom:4px}#note-input{height:45px;min-height:45px}#composer{padding:6px 8px}#status{max-height:28px}.shot img{max-height:115px}}
      #all-pane{display:flex;flex-direction:column;padding:0;overflow:hidden;font-size:12px;min-height:0;min-width:0;flex:1 1 0;pointer-events:auto}
      .compact #all-pane{display:none}
      .all-header{flex:none;padding:10px 12px;background:#192637;border-bottom:1px solid #2a384b;display:flex;align-items:center;gap:8px}
      .all-header .all-stats{flex:1;font-size:12px;color:#a8bdd4}
      .all-header .all-stats strong{color:#ebf0f9;font-weight:600}
      .all-actions{display:flex;gap:6px}
      .all-actions button{padding:3px 8px;font-size:11px}
      #all-courses-list{flex:1 1 0;min-height:0;min-width:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#435269 transparent;padding:10px 10px 24px;display:flex;flex-direction:column;gap:10px;-webkit-overflow-scrolling:touch}
      .all-course-card{flex:none;min-width:0;border:1px solid #354253;border-radius:9px;background:#172231;overflow:hidden;transition:border-color .15s ease}
      .all-course-card[open]{border-color:#486384;background:#182536}
      .all-course-summary{display:flex;align-items:center;gap:8px;padding:9px 10px;cursor:pointer;list-style:none;user-select:none;background:#1c293b}
      .all-course-summary::-webkit-details-marker{display:none}
      .all-course-toggle{font-size:11px;color:#859bb7;transition:transform .2s ease;flex:none;width:12px;text-align:center}
      .all-course-card[open] .all-course-toggle{transform:rotate(90deg)}
      .all-course-info{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}
      .all-course-title{font-size:12px;font-weight:600;color:#dce6f3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .all-course-meta{font-size:11px;color:#8ba2bc;display:flex;align-items:center;gap:6px}
      .all-course-badge{font-size:10px;padding:1px 5px;border-radius:4px;background:#243950;color:#9cd2f6}
      .all-course-badge.current{background:#1e4c34;color:#7ee787}
      .all-course-buttons{display:flex;align-items:center;gap:5px;flex:none}
      .all-course-buttons button{padding:3px 7px!important;font-size:11px!important}
      .all-marks-list{min-height:0;max-height:min(55dvh,480px);overflow-x:hidden;overflow-y:auto;overscroll-behavior-y:auto;scrollbar-width:thin;scrollbar-color:#435269 transparent;padding:10px;border-top:1px solid #28374a;display:flex;flex-direction:column;gap:8px;background:#131d2c}
      .all-marks-list .mark{background:#1a2739;border-color:#2f3f54}
      .all-empty{color:#90a6c0;text-align:center;padding:24px 12px;font-size:12px;line-height:1.8}
    </style>
    <div id="shell"><div class="box">
      <header><span class="brand">课程面板 <span class="small">· 学习空间</span></span><button id="fold" aria-label="折叠右侧面板" aria-expanded="true" title="折叠右侧面板">折叠 ›</button></header>
      <nav role="tablist" aria-label="课程侧栏">
        <button id="tab-study" role="tab" aria-selected="true" aria-controls="study-pane" tabindex="0">看课助手</button>
        <button id="tab-all" role="tab" aria-selected="false" aria-controls="all-pane" tabindex="-1">全部标记</button>
        <button id="tab-interaction" role="tab" aria-selected="false" tabindex="-1">互动</button>
        <button id="tab-intro" role="tab" aria-selected="false" tabindex="-1">介绍</button>
      </nav>
      <main id="study-pane" role="tabpanel" aria-labelledby="tab-study">
        <div class="controls">
          <div class="course-line"><h2 id="course">正在识别课程…</h2><span id="clock">--:-- / --:--</span><button id="keys-help" title="快捷键与逐帧设置" aria-label="快捷键与逐帧设置">⌨</button></div>
          <div class="tools"><button id="back" title="后退 10 秒">−10s</button><button id="forward" title="前进 10 秒">+10s</button><select id="rate" aria-label="播放倍速"><option value="">原速</option>${[0.5,0.75,1,1.25,1.5,1.75,2,2.5,3,4].map(r=>`<option value="${r}">${r}×</option>`).join('')}</select><button id="theater" aria-pressed="false" title="Alt+T 切换剧院模式">剧院</button></div>
          <div class="tools"><button id="a" title="设置循环起点">A 点</button><button id="b" title="设置循环终点">B 点</button><button id="loop" aria-pressed="false">循环</button><button id="clear-loop" class="loop-clear" title="清除循环区间" aria-label="清除循环区间">×</button></div>
        </div>
        <section class="records" aria-label="标记记录">
          <div class="records-head"><span class="count" id="count">0 个标记</span><button id="undo" class="text-button" hidden>撤销删除</button><button id="export" class="text-button" title="导出 Markdown；有截图时打包为 ZIP">导出 ↗</button></div>
          <div id="marks" role="list" aria-label="标记列表" tabindex="0"></div>
        </section>
        <div id="composer">
          <div class="composer-label"><span id="composer-label">备注 · 可留空</span><button id="cancel-edit" class="text-button" hidden>取消编辑</button></div>
          <textarea id="note-input" aria-labelledby="composer-label" placeholder="记下思路、疑问或需要重看的地方…"></textarea>
          <div class="composer-actions"><span class="hint" id="composer-hint">自动截图 · ⌘/Ctrl+Enter 提交</span><button id="add" class="primary">＋ 标记此刻</button></div>
          <p id="status" role="status" aria-live="polite">笔记和截图保存在本机。</p>
        </div>
      </main>
      <main id="all-pane" role="tabpanel" aria-labelledby="tab-all" hidden>
        <div class="all-header">
          <div class="all-stats" id="all-stats">正在加载…</div>
          <div class="all-actions">
            <button id="all-refresh" class="text-button" title="重新从本地存储加载标记">刷新</button>
            <button id="all-export" class="primary" title="导出所有课程的 Markdown 笔记及截图">导出全部 ↗</button>
          </div>
        </div>
        <div id="all-courses-list" role="feed" aria-label="所有课程标记列表"></div>
      </main>
      <div id="native-note" hidden>正在加载课程内容…</div>
    </div></div>
    <dialog id="preview"><div class="preview-bar"><span id="preview-title">标记截图</span><button id="preview-close">关闭</button></div><img id="preview-image" alt="标记时的视频画面"></dialog>
    <dialog id="keys-dialog" aria-label="助手快捷键">
      <div class="preview-bar"><strong>助手快捷键</strong><button id="keys-close">关闭</button></div>
      <table><tbody>
        <tr><td>空格</td><td>播放 / 暂停</td></tr><tr><td>← / →</td><td>后退 / 前进 5 秒</td></tr>
        <tr><td>Ctrl + ← / →</td><td>后退 / 前进 15 秒</td></tr>
        <tr><td>X / C / Z</td><td>减速 / 加速 0.1× / 恢复 1×</td></tr>
        <tr><td>D / F</td><td>上一帧 / 下一帧，并暂停</td></tr>
        <tr><td>↑ / ↓ · M</td><td>音量 ±5% · 静音</td></tr><tr><td>Enter</td><td>切换全屏</td></tr>
        <tr><td>Alt + T / Alt + M</td><td>剧院 / 标记</td></tr><tr><td>Esc</td><td>关闭预览 / 退出全屏、剧院</td></tr>
      </tbody></table>
      <label for="frame-rate">逐帧帧率</label><select id="frame-rate"><option value="auto">自动估算，未识别时按 25 fps</option>${[23.976,24,25,29.97,30,50,59.94,60].map(fps=>`<option value="${fps}">${fps} fps</option>`).join('')}</select>
      <p>输入框、输入法组字和选项控件内不执行播放快捷键。备注框仍支持 ⌘/Ctrl+Enter。逐帧使用时间跳转，精度受视频帧率和浏览器解码影响，可手动指定帧率。</p>
    </dialog>`;
  document.head.append(css);
  document.body.append(host);
  document.documentElement.setAttribute('data-xe-study','');
  document.documentElement.setAttribute('data-xe-study-panel',activePanel);
  const $ = id => ui.getElementById(id);
  const status = text => { $('status').textContent = text; };
  const stamp = seconds => {
    if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
    const s = Math.floor(seconds), h = Math.floor(s / 3600);
    return (h ? `${h}:` : '') + `${Math.floor(s / 60) % 60}`.padStart(h ? 2 : 1, '0') + ':' + `${s % 60}`.padStart(2, '0');
  };
  function identify() {
    const url = new URL(location.href);
    const match = url.pathname.match(/^\/v4\/course\/([^/]+)\/([^/]+)/);
    if (!match) return null;
    // 课时路径优先于合集 product_id/pro_id；不以标题或临时 query 分课。
    const id = `${url.origin}${match[0]}`;
    const clean = new URL(url.origin + match[0]);
    for (const name of ['app_id','alive_mode','pro_id','type','conduit_type','conduit_id','product_id','sub_course_id']) {
      if (url.searchParams.has(name)) clean.searchParams.set(name, url.searchParams.get(name));
    }
    return { id, url:clean.href, title:document.title.trim() || match[2], prefix:PREFIX + encodeURIComponent(id) + ':' };
  }
  const COURSE_INDEX_KEY = 'xe-study:courses:v1';
  const gm = {
    hasGM: typeof GM_getValue === 'function' && typeof GM_setValue === 'function',
    get(key, def) {
      if (this.hasGM) {
        try { return GM_getValue(key, def); } catch { /* degrade */ }
      }
      try {
        const v = localStorage.getItem(key);
        return v !== null ? JSON.parse(v) : def;
      } catch { return def; }
    },
    set(key, val) {
      if (this.hasGM) {
        try { GM_setValue(key, val); return true; } catch { /* degrade */ }
      }
      try {
        localStorage.setItem(key, JSON.stringify(val));
        return true;
      } catch { return false; }
    },
    remove(key) {
      if (this.hasGM && typeof GM_deleteValue === 'function') {
        try { GM_deleteValue(key); } catch { /* degrade */ }
      }
      try { localStorage.removeItem(key); } catch { /* degrade */ }
    },
    listKeys() {
      const keys = new Set();
      if (this.hasGM && typeof GM_listValues === 'function') {
        try {
          const list = GM_listValues();
          if (Array.isArray(list)) list.forEach(k => keys.add(k));
        } catch { /* degrade */ }
      }
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k) keys.add(k);
        }
      } catch { /* degrade */ }
      return [...keys];
    }
  };

  // 一次性自动迁移 localStorage 历史记录到油猴存储
  let migratedFromLocal = false;
  function migrateLocalStorageToGM() {
    if (migratedFromLocal) return;
    migratedFromLocal = true;
    try {
      const catalog = getCoursesCatalog();
      let changed = false;
      // 1. 扫描 localStorage 中的所有历史标记并同步到 GM
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(PREFIX) && key !== COURSE_INDEX_KEY) {
          try {
            const raw = localStorage.getItem(key);
            const val = JSON.parse(raw);
            if (validRecord(val)) {
              if (gm.hasGM && GM_getValue(key, null) === null) {
                GM_setValue(key, val);
                changed = true;
              }
              // 补充课程索引
              const rest = key.slice(PREFIX.length);
              const colonIdx = rest.lastIndexOf(':');
              if (colonIdx > 0) {
                const encId = rest.slice(0, colonIdx);
                const id = decodeURIComponent(encId);
                if (!catalog[id]) {
                  catalog[id] = {
                    id,
                    url: id,
                    title: id.split('/').pop() || '历史课程',
                    prefix: PREFIX + encId + ':',
                    updatedAt: Date.now()
                  };
                  changed = true;
                }
              }
            }
          } catch {}
        }
      }
      if (changed) {
        gm.set(COURSE_INDEX_KEY, catalog);
        updateCoursesCatalog();
      }
    } catch {}
  }

  function getCoursesCatalog() {
    return gm.get(COURSE_INDEX_KEY, {}) || {};
  }

  function updateCoursesCatalog(courseInfo = null, touch = false) {
    try {
      const catalog = getCoursesCatalog();
      if (courseInfo && courseInfo.id) {
        const previous = catalog[courseInfo.id];
        const candidate = (courseInfo.title || '').trim();
        const placeholder = !candidate || candidate === courseInfo.id.split('/').pop() || /^(未知课程|历史课程|小鹅通)$/.test(candidate);
        const title = placeholder && previous?.title ? previous.title : candidate;
        if (!touch && previous && previous.title === title && previous.url === courseInfo.url && previous.prefix === courseInfo.prefix) return;
        catalog[courseInfo.id] = {
          id: courseInfo.id,
          url: courseInfo.url,
          title,
          prefix: courseInfo.prefix,
          updatedAt: Date.now()
        };
        gm.set(COURSE_INDEX_KEY, catalog);
      } else {
        // 从现有全部 keys 反推缺失的课程元数据
        const keys = gm.listKeys();
        let updated = false;
        for (const key of keys) {
          if (key.startsWith(PREFIX) && key !== COURSE_INDEX_KEY) {
            // key format: PREFIX + encodeURIComponent(id) + ':' + recordId
            const rest = key.slice(PREFIX.length);
            const colonIdx = rest.lastIndexOf(':');
            if (colonIdx > 0) {
              const encId = rest.slice(0, colonIdx);
              try {
                const id = decodeURIComponent(encId);
                if (!catalog[id]) {
                  catalog[id] = {
                    id,
                    url: id,
                    title: id.split('/').pop() || '未知课程',
                    prefix: PREFIX + encId + ':',
                    updatedAt: Date.now()
                  };
                  updated = true;
                }
              } catch {}
            }
          }
        }
        if (updated) gm.set(COURSE_INDEX_KEY, catalog);
      }
    } catch {}
  }

  function readContext(info) {
    migrateLocalStorageToGM();
    if (contexts.has(info.id)) return contexts.get(info.id);
    const c = { ...info, records:new Map(), dirty:new Set(), remote:new Map(), corrupt:false, draft:'', editing:null, editText:'' };
    contexts.set(c.id,c);
    updateCoursesCatalog(info);
    try {
      const allKeys = gm.listKeys();
      for (const key of allKeys) {
        if (key && key.startsWith(c.prefix)) {
          try {
            const record = gm.get(key, null);
            if (validRecord(record) && key === c.prefix + record.id) c.records.set(record.id, record);
            else if (record !== null) c.corrupt = true;
          } catch { c.corrupt = true; }
        }
      }
    } catch { storageFault = true; }
    return c;
  }
  function validRecord(r) { return r && r.v===1 && typeof r.id==='string' && /^[a-z0-9-]+$/i.test(r.id) && Number.isFinite(r.time) && r.time>=0 && typeof r.note==='string' && typeof r.deleted==='boolean'; }
  function save(c,r) {
    c.remote.delete(r.id);
    c.records.set(r.id,r);
    c.dirty.add(r.id);
    const ok = gm.set(c.prefix+r.id, r);
    if (ok) {
      c.dirty.delete(r.id);
      updateCoursesCatalog(c, true);
    } else {
      storageFault = true;
    }
    if (c===ctx && !signal.aborted) status(c.dirty.size ? '笔记尚未存入油猴存储，请先导出再关闭页面。' : records(c).some(item=>item.imageUnsaved) ? '有截图仅保留在当前页，请先导出再关闭。' : '已保存到油猴存储。');
    if (activePanel === 'all') renderAllPane();
  }
  function flush() {
    for (const c of contexts.values()) for (const id of [...c.dirty]) save(c,c.records.get(id));
  }
  function records(c=ctx) { return c ? [...c.records.values()].filter(r=>!r.deleted).sort((a,b)=>a.time-b.time || a.id.localeCompare(b.id)) : []; }
  function renderMarks(scrollToId=null) {
    const c=ctx, items=records(c);
    const scrollTop=$('marks').scrollTop;
    $('marks').replaceChildren();
    $('count').textContent=`${items.length} 个标记`;
    $('undo').hidden=!lastDeleted || lastDeleted.course!==c?.id;
    if (!items.length) {
      const empty=document.createElement('div'); empty.className='empty'; empty.textContent='在下方写下备注，标记此刻。\n时间和当前画面会一起保存。';empty.style.whiteSpace='pre-line';$('marks').append(empty);
    }
    for (const r of items) {
      const row=document.createElement('article'); row.className='mark'; row.dataset.markId=r.id;row.setAttribute('role','listitem');row.classList.toggle('editing',c.editing===r.id);
      const head=document.createElement('div'); head.className='mark-head';
      const jump=document.createElement('button'); jump.className='stamp'; jump.textContent=stamp(r.time); jump.title='跳转到此标记';
      jump.addEventListener('click',()=>{reconcile();if(ctx===c) seek(r.time);});
      const spacer=document.createElement('span');spacer.className='spacer';
      const edit=document.createElement('button');edit.className='text-button';edit.textContent='编辑';edit.setAttribute('aria-label',`编辑 ${stamp(r.time)} 的备注`);
      edit.addEventListener('click',()=>{reconcile();if(ctx!==c)return;startEdit(r.id);});
      const del=document.createElement('button');del.className='text-button';del.textContent='删除';del.setAttribute('aria-label',`删除 ${stamp(r.time)} 的标记`);
      del.addEventListener('click',()=>{
        save(c,{...c.records.get(r.id),deleted:true});lastDeleted={course:c.id,id:r.id};
        if(c.editing===r.id){c.editing=null;c.editText='';if(ctx===c)syncComposer();}
        if(ctx===c)renderMarks();
      });
      const note=document.createElement('p');note.className='note-content';note.textContent=r.note||'未填写备注';note.classList.toggle('muted',!r.note);
      head.append(jump,spacer,edit,del);row.append(head,note);$('marks').append(row);
      renderScreenshot(c,r,row);
    }
    $('marks').scrollTop=scrollTop;
    if(scrollToId)requestAnimationFrame(()=>{
      const row=ui.querySelector(`[data-mark-id="${scrollToId}"]`);
      if(row && ctx===c)row.scrollIntoView({block:'nearest'});
    });
  }
  function syncComposer() {
    const editing=ctx?.editing,record=editing?ctx.records.get(editing):null;
    $('note-input').value=record?ctx.editText:(ctx?.draft||'');
    $('note-input').disabled=!ctx;
    $('composer-label').textContent=record?`编辑 ${stamp(record.time)} · 原截图保留`:'备注 · 可留空';
    $('cancel-edit').hidden=!record;
    $('add').textContent=record?'保存备注':'＋ 标记此刻';
    $('composer-hint').textContent=record?'⌘/Ctrl+Enter 保存':'自动截图 · ⌘/Ctrl+Enter 提交';
    update();
  }
  function startEdit(id) {
    if(ctx.editing && ctx.editing!==id)commitEdit();
    const r=ctx.records.get(id);if(!r || r.deleted)return;
    ctx.editing=id;ctx.editText=r.note;syncComposer();renderMarks(id);setPanel('study');$('note-input').focus();
  }
  function commitEdit() {
    const c=ctx,r=c?.records.get(c.editing);if(!r)return;
    save(c,{...r,note:c.editText,deleted:false});c.editing=null;c.editText='';syncComposer();renderMarks(r.id);
  }
  function cancelEdit() {
    if(!ctx)return;
    if(ctx.remote.has(ctx.editing)){ctx.records.set(ctx.editing,ctx.remote.get(ctx.editing));ctx.remote.delete(ctx.editing);}
    ctx.editing=null;ctx.editText='';syncComposer();renderMarks();
  }
  function imageDB() {
    if(!imageDBPromise)imageDBPromise=new Promise((resolve,reject)=>{
      const request=indexedDB.open('xe-study-images-v1',1);let failed=false;
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('frames'))request.result.createObjectStore('frames');};
      const fail=()=>{failed=true;reject(request.error||new Error('截图存储暂不可用'));};
      request.onerror=fail;request.onblocked=fail;
      request.onsuccess=()=>{
        const db=request.result;if(failed){db.close();return;}
        db.onversionchange=()=>{db.close();imageDBPromise=null;};resolve(db);
      };
    }).catch(error=>{imageDBPromise=null;throw error;});
    return imageDBPromise;
  }
  async function storeFrame(key,blob) {
    const db=await imageDB();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('frames','readwrite');tx.objectStore('frames').put(blob,key);
      tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||new Error('截图保存失败'));
    });
  }
  async function loadFrame(key) {
    if(imageMemory.has(key))return imageMemory.get(key);
    const db=await imageDB();
    const blob=await new Promise((resolve,reject)=>{
      const request=db.transaction('frames','readonly').objectStore('frames').get(key);
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    if(blob instanceof Blob){imageMemory.set(key,blob);return blob;}return null;
  }
  async function captureFrame(v) {
    if(v.readyState<2 || !v.videoWidth || !v.videoHeight || v.seeking)throw new Error('当前画面未就绪，已保存时间和备注。');
    // 同一点击事件内先冻结当前帧，再异步编码；不改变视频源或播放状态。
    const scale=Math.min(1,1600/v.videoWidth,1200/v.videoHeight),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(v.videoWidth*scale));canvas.height=Math.max(1,Math.round(v.videoHeight*scale));
    try {
      const drawing=canvas.getContext('2d');if(!drawing)throw new Error('无法创建截图画布');
      drawing.drawImage(v,0,0,canvas.width,canvas.height);
      return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('截图编码失败')),'image/jpeg',0.88));
    } catch(error) {
      throw new Error(error.name==='SecurityError'?'浏览器限制此视频截图，时间和备注已保留。':'未能截取当前画面，时间和备注已保留。');
    }
  }
  async function renderScreenshot(c,r,row) {
    const state=document.createElement('p');state.className='shot-state';
    if(r.captureError){state.textContent=r.captureError;row.append(state);return;}
    if(r.captureState==='pending'){state.textContent='正在保存截图…';row.append(state);return;}
    if(!r.hasImage)return;
    try {
      const key=c.prefix+r.id,blob=await loadFrame(key);if(!row.isConnected || signal.aborted)return;
      if(!blob)throw new Error('missing');
      let url=imageURLs.get(key);if(!url){url=URL.createObjectURL(blob);imageURLs.set(key,url);}
      const button=document.createElement('button');button.className='shot';button.title='查看完整截图';button.setAttribute('aria-label',`查看 ${stamp(r.time)} 的截图`);
      const img=document.createElement('img');img.src=url;img.alt=`${stamp(r.time)} 视频截图`;img.loading='lazy';
      button.append(img);button.addEventListener('click',()=>{$('preview-image').src=url;$('preview-title').textContent=`${c.title} · ${stamp(r.time)}`;$('preview').showModal();});row.append(button);
      if(r.imageUnsaved){state.textContent='截图仅在当前页，请导出备份。';row.append(state);}
    } catch {if(row.isConnected){state.textContent='本机未找到截图；时间和备注仍可使用。';row.append(state);}}
  }
  function currentVideo() {
    const list=[...document.querySelectorAll('#videoWrapper video, #video-container video')];
    return list.filter(v=>v.isConnected && v.getBoundingClientRect().width>0 && v.getBoundingClientRect().height>0)
      .sort((a,b)=>b.getBoundingClientRect().width*b.getBoundingClientRect().height-a.getBoundingClientRect().width*a.getBoundingClientRect().height)[0] || null;
  }
  function releaseNativeComponent(state,restore) {
    const {vm,element,original,replacement}=state;
    document.removeEventListener('keyup',original);
    document.removeEventListener('keyup',replacement);
    if(vm.spaceKeyUpEvent===replacement) {
      vm.spaceKeyUpEvent=original;
      if(restore && element.isConnected && !vm._isDestroyed && !vm._isBeingDestroyed && typeof vm.handleEvent==='function')vm.handleEvent();
    }
  }
  function releaseNativePlayer(state) {
    const {player,config,keyShortcut,hadKeyShortcut,plugins}=state;
    const alive=player.root?.isConnected;
    if(config.keyShortcut===false) {
      if(hadKeyShortcut)config.keyShortcut=keyShortcut;else delete config.keyShortcut;
    }
    for(const saved of plugins.values()) {
      const {plugin,disabled,hadDisable}=saved;
      if(!alive || !plugin.config || plugin.config.disable!==true)continue;
      try {
        if(!disabled && typeof plugin.enable==='function')plugin.enable();
        if(hadDisable)plugin.config.disable=disabled;else delete plugin.config.disable;
      } catch { /* 已销毁的插件无需恢复事件。 */ }
    }
  }
  function suppressNativeShortcuts() {
    for(const [vm,state] of nativeComponents)if(!state.element.isConnected || vm._isDestroyed) {
      releaseNativeComponent(state,false);nativeComponents.delete(vm);
    }
    for(const [player,state] of nativePlayers)if(!player.root?.isConnected) {
      releaseNativePlayer(state);nativePlayers.delete(player);
    }
    const element=document.querySelector('.playerModule'),vm=element?.__vue__;
    if(!vm || vm._isDestroyed)return;
    // 这个站点另有 document.keyup；Shadow DOM retarget 使其 INPUT/TEXTAREA 判断失效。
    // 移除确切的 bound 引用，并防止 handleEvent() 在切换状态时重新挂回。
    const current=vm.spaceKeyUpEvent,existing=nativeComponents.get(vm);
    if(typeof current==='function' && current!==existing?.replacement) {
      if(existing)releaseNativeComponent(existing,false);
      const original=vm.spaceKeyUpEvent,replacement=function xeStudyNativeKeyDisabled(){};
      document.removeEventListener('keyup',original);
      vm.spaceKeyUpEvent=replacement;
      nativeComponents.set(vm,{vm,element,original,replacement});
    }
    const players=new Set([vm.basicPlayerIns,vm.xePlayer,vm.player]);
    for(const player of players) {
      if(!player?.config || !player.root?.contains(video))continue;
      let state=nativePlayers.get(player);
      if(!state) {
        state={player,config:player.config,keyShortcut:player.config.keyShortcut,hadKeyShortcut:Object.hasOwn(player.config,'keyShortcut'),plugins:new Map()};
        nativePlayers.set(player,state);
      }
      // 初始化配置负责以后创建的 Keyboard；已有插件通过官方运行时 API 停用。
      player.config.keyShortcut=false;
      const plugin=typeof player.getPlugin==='function'?player.getPlugin('keyboard'):player.plugins?.keyboard;
      if(plugin && !state.plugins.has(plugin) && typeof plugin.disable==='function') {
        state.plugins.set(plugin,{plugin,disabled:plugin.config?.disable,hadDisable:Object.hasOwn(plugin.config||{},'disable')});
        if(plugin._keyState && typeof plugin.handleKeyUp==='function') {
          try {plugin.handleKeyUp();}catch{ /* 某些封装版不公开按键复位入口。 */ }
        }
        plugin.disable();
      }
    }
  }
  function stopFrameTracking() {
    if(frameCallbackId!==null && typeof frameCallbackVideo?.cancelVideoFrameCallback==='function')frameCallbackVideo.cancelVideoFrameCallback(frameCallbackId);
    frameCallbackVideo=null;frameCallbackId=null;frameSample=null;frameIntervals=[];
  }
  function startFrameTracking(v) {
    stopFrameTracking();if(typeof v?.requestVideoFrameCallback!=='function')return;
    frameCallbackVideo=v;
    const track=(now,meta)=>{
      if(signal.aborted || video!==v || frameCallbackVideo!==v)return;
      if(!v.paused && !v.seeking && !awaitingMedia && Math.abs(v.playbackRate-1)<0.001) {
        if(frameSample) {
          const delta=meta.mediaTime-frameSample.mediaTime,count=meta.presentedFrames-frameSample.presentedFrames;
          if(delta>0 && delta<0.5 && count>0) {
            const duration=delta/count;
            if(duration>=1/120 && duration<=1/10){frameIntervals.push(duration);if(frameIntervals.length>40)frameIntervals.shift();}
          }
        }
        frameSample=meta;
      }else frameSample=null;
      frameCallbackId=v.requestVideoFrameCallback(track);
    };
    frameCallbackId=v.requestVideoFrameCallback(track);
  }
  function frameDuration() {
    if(frameRateMode!=='auto')return 1/Number(frameRateMode);
    if(frameIntervals.length<8)return 1/25;
    const ordered=[...frameIntervals].sort((a,b)=>a-b);return ordered[Math.floor(ordered.length/2)];
  }
  function stepFrame(direction) {
    reconcile();if(!finiteVideo())return;
    video.pause();looping=false;
    const step=frameDuration();
    if(seek(video.currentTime+direction*step))status(`${direction<0?'上一帧':'下一帧'} · ${(1/step).toFixed(2).replace(/\.00$/,'')} fps${frameRateMode==='auto'?'（估算）':''}`);
  }
  function setRate(rate) {
    reconcile();if(!video || awaitingMedia)return;
    desiredRate=Math.round(Math.min(4,Math.max(0.5,rate))*100)/100;applyRate();update();status(`播放速度 ${video.playbackRate}×`);
  }
  function togglePlay() {
    reconcile();if(!video || awaitingMedia)return;
    if(video.paused)video.play().catch(()=>status('请先使用原播放器的播放按钮完成加载。'));else video.pause();
  }
  function changeVolume(delta) {
    reconcile();if(!video)return;
    video.volume=Math.max(0,Math.min(1,video.volume+delta));if(delta>0)video.muted=false;
    status(`音量 ${Math.round(video.volume*100)}%`);
  }
  async function toggleFullscreen() {
    try {
      if(document.fullscreenElement)await document.exitFullscreen();
      else await document.querySelector('#videoWrapper')?.requestFullscreen();
    }catch{status('浏览器暂时无法进入全屏，请使用原播放器全屏按钮。');}
  }
  function finiteVideo() { return !awaitingMedia && video && video.isConnected && video.readyState>=1 && Number.isFinite(video.duration) && video.duration>0; }
  function clearLoop() { loopA=null;loopB=null;looping=false;update(); }
  function applyRate() {
    if (video && !awaitingMedia && desiredRate!==null) {
      try { video.playbackRate=desiredRate; } catch { status('当前播放器不支持这个倍速。'); }
    }
  }
  function bind(next) {
    videoAbort?.abort();stopFrameTracking();video=next;boundCourse=ctx?.id || '';lastSource=video?.currentSrc || '';
    if (!video) {update();return;}
    startFrameTracking(video);
    videoAbort=new AbortController(); const opt={signal:videoAbort.signal};
    video.addEventListener('loadedmetadata',()=>{
      if(identify()?.id!==ctx?.id){queueReconcile();return;}
      awaitingMedia=null;applyRate();tryLink();update();
    },opt);
    video.addEventListener('ended',()=>{
      if(identify()?.id===ctx?.id && looping && finiteVideo() && loopA!==null && loopB!==null && loopB<=video.duration) {
        if(seek(loopA,true))video.play().catch(()=>{looping=false;update();status('循环已暂停，请用原播放器继续播放。');});
      }
    },opt);
    video.addEventListener('emptied',()=>{looping=false;frameSample=null;frameIntervals=[];update();},opt);
    video.addEventListener('seeking',()=>{frameSample=null;},opt);
    for (const event of ['timeupdate','durationchange','ratechange','play','pause','seeked']) video.addEventListener(event,onMedia,opt);
    applyRate();tryLink();update();
  }
  function onMedia() {
    const info=identify();
    if (!ctx || info?.id!==ctx.id || boundCourse!==ctx.id) {queueReconcile();return;}
    if (looping && finiteVideo()) {
      if (loopB>video.duration || loopA>=loopB) {clearLoop();status('视频时长变化，已清除循环。');}
      else if (!video.paused && !video.seeking && (video.currentTime>=loopB || video.currentTime<loopA-0.25)) seek(loopA,true);
    }
    tryLink();update();
  }
  function seek(seconds,fromLoop=false) {
    if (!finiteVideo()) {if(!fromLoop)status('等待视频加载，暂时无法跳转。');return false;}
    const t=Math.max(0,Math.min(seconds,Math.max(0,video.duration-0.0001)));
    if (video.seekable.length && ![...Array(video.seekable.length).keys()].some(i=>t>=video.seekable.start(i) && t<=video.seekable.end(i))) {
      if(!fromLoop)status('此时间暂不在可跳转范围内，请稍后重试。');return false;
    }
    if (!fromLoop && looping && (t<loopA || t>loopB)) {looping=false;status('已跳出循环区间，循环暂停。');}
    try {video.currentTime=t;update();return true;} catch {if(!fromLoop)status('播放器尚未允许跳转，请先使用原来的播放按钮。');return false;}
  }
  function tryLink() {
    if (pendingLink!==null && finiteVideo() && seek(pendingLink)) pendingLink=null;
  }
  function update() {
    const ready=!!finiteVideo();
    $('clock').textContent=awaitingMedia?'等待新课程视频…':video ? `${stamp(video.currentTime)} / ${stamp(video.duration)}` : '等待视频…';
    for(const id of ['back','forward','a','b']) $(id).disabled=!ready || !ctx;
    $('add').disabled=!ctx || (!ctx.editing && !ready);
    $('rate').disabled=!video || !!awaitingMedia;
    $('export').disabled=!ctx || exporting;
    $('a').textContent=loopA===null ? 'A 点' : `A ${stamp(loopA)}`;
    $('b').textContent=loopB===null ? 'B 点' : `B ${stamp(loopB)}`;
    $('loop').disabled=!ready || loopA===null || loopB===null;
    $('loop').textContent=looping?'停止':'循环';$('loop').setAttribute('aria-pressed',String(looping));
    if(video) {
      const value=String(video.playbackRate);
      const selected=[...$('rate').options].find(o=>o.value===value);
      $('rate').value=selected ? value : '';
      $('rate').options[0].textContent=selected ? '原速' : `${value}×（当前）`;
    }
  }
  function setTheater(enabled,automatic=false) {
    if(!automatic)wantTheater=enabled;
    if(enabled && (!document.querySelector('#base-business-container > main') || !video)) {status('当前页面还未加载适配的视频容器。');return;}
    if(theater===enabled)return;
    theater=enabled;document.documentElement.toggleAttribute('data-xe-study-theater',enabled);
    $('theater').textContent=enabled?'退出剧院':'剧院';$('theater').setAttribute('aria-pressed',String(enabled));
    window.dispatchEvent(new Event('resize'));
  }
  function reconcile() {
    if(!host.isConnected)document.body?.append(host);
    const info=identify();
    if(info?.id!==ctx?.id) {
      // URL 常先于播放器换课，等待新节点、换源或新 metadata 再开放操作。
      awaitingMedia=ctx && video?{element:video,source:video.currentSrc}:null;
      flush();clearLoop();pendingLink=null;ctx=info?readContext(info):null;
      if(!ctx && theater)setTheater(false,true);
      syncComposer();
      renderMarks();
      status(ctx?.dirty.size?'本课有未保存笔记，请导出。':ctx?.corrupt?'部分旧记录无法读取，原数据已保留。':storageFault?'本机存储不可用，请及时导出。':'笔记和截图保存在本机。');
    }
    if(ctx && info) {
      const changed = ctx.title !== info.title || ctx.url !== info.url;
      ctx.title=info.title;ctx.url=info.url;
      updateCoursesCatalog(ctx);
      $('course').textContent=ctx.title;$('course').title=ctx.title;
      if(changed && activePanel==='all')renderAllPane();
    }
    else $('course').textContent='等待课程页面…';
    if(location.href!==seenURL) {
      seenURL=location.href;const raw=new URL(location.href).searchParams.get('xestudy_t');
      pendingLink=raw!==null && raw.trim()!=='' && Number.isFinite(Number(raw)) && Number(raw)>=0?Number(raw):null;
    }
    const next=currentVideo();
    if(awaitingMedia && next && (next!==awaitingMedia.element || (next.currentSrc && next.currentSrc!==awaitingMedia.source)))awaitingMedia=null;
    if(next!==video || boundCourse!==(ctx?.id || '')) bind(next);
    else if(video && video.currentSrc!==lastSource) {lastSource=video.currentSrc;looping=false;startFrameTracking(video);applyRate();}
    if(theater && (!video || !document.querySelector('#base-business-container > main')))setTheater(false,true);
    if(wantTheater && ctx && video && !theater)setTheater(true,true);
    suppressNativeShortcuts();
    syncNativePanel();
    tryLink();update();
  }
  function queueReconcile() {
    if(reconcileQueued)return;reconcileQueued=true;
    setTimeout(()=>{reconcileQueued=false;if(!signal.aborted)reconcile();},100);
  }
  function addMark() {
    reconcile();if(ctx?.editing){commitEdit();return;}if(!ctx || !finiteVideo())return;
    const c=ctx;
    const id=crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const r={v:1,id,time:Math.round(video.currentTime*1000)/1000,note:c.draft,deleted:false,captureState:'pending'};
    const frame=captureFrame(video),key=c.prefix+id;
    save(c,r);c.draft='';syncComposer();renderMarks(id);setPanel('study');$('note-input').focus();
    const task=(async()=>{
      try {
        const blob=await frame;imageMemory.set(key,blob);let imageUnsaved=false;
        try {await storeFrame(key,blob);}catch{imageUnsaved=true;}
        save(c,{...c.records.get(id),captureState:'ready',hasImage:true,imageUnsaved});
      } catch(error) {
        save(c,{...c.records.get(id),captureState:'failed',captureError:error.message});
        if(ctx===c && !signal.aborted)status(error.message);
      } finally {
        imagePending.delete(key);
        if(ctx===c && !signal.aborted)renderMarks();
      }
    })();
    imagePending.set(key,task);
  }
  function escapeMd(s) {return String(s).replace(/[\\`*_{}\[\]<>#!|~+\-]/g,'\\$&');}
  function markdown(c,items=records(c),imagePaths=new Map()) {
    const lines=[`# ${escapeMd(c.title).replace(/\r?\n/g,' ')} — 课程标记`,'',`[打开课程](<${c.url}>)`,'','时间链接需要安装此脚本，并能正常访问课程。',''];
    for(const r of items) {
      const link=new URL(c.url);link.searchParams.set('xestudy_t',String(r.time));
      lines.push(`- [${stamp(r.time)}](<${link.href}>)`);
      if(r.note)lines.push(...r.note.replace(/\r\n?/g,'\n').split('\n').map(line=>'  '+escapeMd(line)+'  '));
      if(imagePaths.has(r.id))lines.push('',`  ![${stamp(r.time)} 截图](${imagePaths.get(r.id)})`);
      else if(r.hasImage)lines.push('  截图未能读取，未包含在此次导出中。');
      else if(r.captureError)lines.push('  '+escapeMd(r.captureError));
      lines.push('');
    }
    return lines.join('\n')+'\n';
  }
  async function exportNotes() {
    reconcile();if(!ctx || exporting)return;flush();
    const c=ctx;exporting=true;update();status('正在整理笔记和截图…');
    try {
      await Promise.allSettled([...imagePending.entries()].filter(([key])=>key.startsWith(c.prefix)).map(([,task])=>task));
      const items=records(c).map(r=>({...r})),paths=new Map(),files=[];let missing=0;
      for(const r of items)if(r.hasImage) {
        try {
          const blob=await loadFrame(c.prefix+r.id);if(!blob)throw new Error('missing');
          const name=`images/${r.id}.jpg`;paths.set(r.id,name);files.push({name,data:blob});
        }catch{missing++;}
      }
      const md=markdown(c,items,paths),hasImages=files.length>0;
      const blob=hasImages?await makeZip([{name:'notes.md',data:md},...files]):new Blob([md],{type:'text/markdown;charset=utf-8'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;
      a.download=(c.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,100)||'课程')+'-标记'+(hasImages?'.zip':'.md');
      ui.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      if(ctx===c)status(missing?`已导出；${missing} 张截图未能读取，文字已保留。`:hasImages?'已导出 Markdown 和截图压缩包。':'已导出 Markdown。');
    } catch(error) {if(ctx===c)status('导出未完成：'+error.message);}
    finally {exporting=false;update();}
  }

  function getAllCoursesWithMarks() {
    migrateLocalStorageToGM();
    updateCoursesCatalog();
    if (ctx) updateCoursesCatalog(ctx);
    const catalog = getCoursesCatalog();
    const allKeys = gm.listKeys();
    const result = new Map();

    for (const [id, info] of Object.entries(catalog)) {
      result.set(id, {
        id: info.id,
        title: info.title || '未知课程',
        url: info.url || info.id,
        prefix: info.prefix || (PREFIX + encodeURIComponent(info.id) + ':'),
        updatedAt: info.updatedAt || 0,
        records: []
      });
    }

    for (const key of allKeys) {
      if (key.startsWith(PREFIX) && key !== COURSE_INDEX_KEY) {
        try {
          const r = gm.get(key, null);
          if (validRecord(r) && !r.deleted) {
            let found = false;
            for (const [id, course] of result) {
              if (key.startsWith(course.prefix)) {
                course.records.push(r);
                found = true;
                break;
              }
            }
            if (!found) {
              const rest = key.slice(PREFIX.length);
              const colonIdx = rest.lastIndexOf(':');
              if (colonIdx > 0) {
                const encId = rest.slice(0, colonIdx);
                try {
                  const id = decodeURIComponent(encId);
                  const newCourse = {
                    id,
                    title: id.split('/').pop() || '未知课程',
                    url: id,
                    prefix: PREFIX + encId + ':',
                    updatedAt: 0,
                    records: [r]
                  };
                  result.set(id, newCourse);
                } catch {}
              }
            }
          }
        } catch {}
      }
    }

    for (const course of result.values()) {
      course.records.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
    }

    return [...result.values()]
      .filter(c => c.records.length > 0 || (ctx && c.id === ctx.id))
      .sort((a, b) => {
        if (ctx && a.id === ctx.id) return -1;
        if (ctx && b.id === ctx.id) return 1;
        return (b.updatedAt || 0) - (a.updatedAt || 0) || b.records.length - a.records.length;
      });
  }

  async function exportAllNotes() {
    reconcile(); if (exporting) return; flush();
    exporting = true; update();
    const statsEl = $('all-stats');
    if (statsEl) statsEl.textContent = '正在打包所有课程笔记…';
    status('正在打包所有课程标记…');

    try {
      const courses = getAllCoursesWithMarks().filter(c => c.records.length > 0);
      if (!courses.length) {
        status('暂无任何标记可供导出。');
        return;
      }

      await Promise.allSettled([...imagePending.entries()].map(([, task]) => task));
      const zipFiles = [];
      const overviewLines = ['# 全部课程学习标记总览', '', `生成时间：${new Date().toLocaleString()}`, '', `共收录 ${courses.length} 门课程的标记：`, ''];

      for (let i = 0; i < courses.length; i++) {
        const c = courses[i];
        const safeTitle = (c.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 50) || `course_${i+1}`);
        const folderName = `${String(i + 1).padStart(2, '0')}_${safeTitle}`;
        overviewLines.push(`- [${c.title}](./${folderName}/notes.md)（${c.records.length} 个标记）`);

        const paths = new Map();
        for (const r of c.records) {
          if (r.hasImage) {
            try {
              const blob = await loadFrame(c.prefix + r.id);
              if (blob) {
                const imgName = `${folderName}/images/${r.id}.jpg`;
                paths.set(r.id, `images/${r.id}.jpg`);
                zipFiles.push({ name: imgName, data: blob });
              }
            } catch {}
          }
        }
        const courseMd = markdown(c, c.records, paths);
        zipFiles.push({ name: `${folderName}/notes.md`, data: courseMd });
      }

      zipFiles.push({ name: 'README.md', data: overviewLines.join('\n') + '\n' });

      const zipBlob = await makeZip(zipFiles);
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `全部课程标记_${new Date().toISOString().slice(0, 10)}.zip`;
      ui.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      status(`已成功导出全部 ${courses.length} 门课程的标记压缩包！`);
    } catch (error) {
      status('导出全部失败：' + error.message);
    } finally {
      exporting = false;
      update();
      if (activePanel === 'all') renderAllPane();
    }
  }

  async function exportCourseNotesById(courseId) {
    reconcile(); if (exporting) return; flush();
    const courses = getAllCoursesWithMarks();
    const c = courses.find(item => item.id === courseId);
    if (!c || !c.records.length) { status('该课程暂无标记可导出。'); return; }

    exporting = true; update(); status(`正在导出《${c.title}》…`);
    try {
      const items = [...c.records];
      const paths = new Map(), files = [];
      for (const r of items) {
        if (r.hasImage) {
          try {
            const blob = await loadFrame(c.prefix + r.id);
            if (blob) {
              const name = `images/${r.id}.jpg`;
              paths.set(r.id, name);
              files.push({ name, data: blob });
            }
          } catch {}
        }
      }
      const md = markdown(c, items, paths);
      const hasImages = files.length > 0;
      const blob = hasImages ? await makeZip([{ name: 'notes.md', data: md }, ...files]) : new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (c.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 100) || '课程') + '-标记' + (hasImages ? '.zip' : '.md');
      ui.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      status(`《${c.title}》导出完成。`);
    } catch (error) {
      status('导出失败：' + error.message);
    } finally {
      exporting = false; update();
    }
  }

  function renderAllPane() {
    const listEl = $('all-courses-list');
    const statsEl = $('all-stats');
    if (!listEl) return;

    const courses = getAllCoursesWithMarks();
    const totalMarks = courses.reduce((sum, c) => sum + c.records.length, 0);
    if (statsEl) {
      statsEl.innerHTML = `共 <strong>${courses.length}</strong> 门课 · <strong>${totalMarks}</strong> 个标记`;
    }

    const scrollTop = listEl.scrollTop;
    const cardStates = new Map([...listEl.querySelectorAll('.all-course-card')].map(card => [
      card.dataset.courseId, { open: card.open, scrollTop: card.querySelector('.all-marks-list')?.scrollTop || 0 }
    ]));
    listEl.replaceChildren();

    if (!courses.length || totalMarks === 0) {
      const empty = document.createElement('div');
      empty.className = 'all-empty';
      empty.textContent = '暂无课程标记记录。\n在课程播放时点击“＋ 标记此刻”，所有课程的标记都将汇总在此处。';
      listEl.append(empty);
      return;
    }

    for (const c of courses) {
      const isCurrent = ctx && c.id === ctx.id;
      const details = document.createElement('details');
      details.className = 'all-course-card';
      details.dataset.courseId = c.id;
      details.open = cardStates.get(c.id)?.open ?? !!isCurrent;

      const summary = document.createElement('summary');
      summary.className = 'all-course-summary';

      const toggleIcon = document.createElement('span');
      toggleIcon.className = 'all-course-toggle';
      toggleIcon.textContent = '▶';

      const infoBox = document.createElement('div');
      infoBox.className = 'all-course-info';

      const titleEl = document.createElement('div');
      titleEl.className = 'all-course-title';
      titleEl.textContent = c.title || '未知课程';
      titleEl.title = c.title || '';

      const metaEl = document.createElement('div');
      metaEl.className = 'all-course-meta';

      const badge = document.createElement('span');
      badge.className = 'all-course-badge' + (isCurrent ? ' current' : '');
      badge.textContent = isCurrent ? '当前正在看' : `${c.records.length} 个标记`;
      metaEl.append(badge);

      if (isCurrent && c.records.length > 0) {
        const countSpan = document.createElement('span');
        countSpan.textContent = `${c.records.length} 个标记`;
        metaEl.append(countSpan);
      }

      infoBox.append(titleEl, metaEl);

      const btnGroup = document.createElement('div');
      btnGroup.className = 'all-course-buttons';
      btnGroup.addEventListener('click', e => e.stopPropagation());

      const jumpBtn = document.createElement('button');
      jumpBtn.className = 'text-button';
      jumpBtn.textContent = isCurrent ? '跳至' : '打开课';
      jumpBtn.title = isCurrent ? '定位到当前课程面板' : '在新标签页打开本课程';
      jumpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isCurrent) {
          setPanel('study');
        } else {
          window.open(c.url, '_blank');
        }
      });

      const expBtn = document.createElement('button');
      expBtn.className = 'text-button';
      expBtn.textContent = '导出';
      expBtn.title = '单独导出这门课程的标记';
      expBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        exportCourseNotesById(c.id);
      });

      btnGroup.append(jumpBtn, expBtn);
      summary.append(toggleIcon, infoBox, btnGroup);
      details.append(summary);

      const marksList = document.createElement('div');
      marksList.className = 'all-marks-list';

      if (!c.records.length) {
        const emptyMark = document.createElement('div');
        emptyMark.className = 'all-empty';
        emptyMark.style.padding = '10px 0';
        emptyMark.textContent = '当前课程暂无标记';
        marksList.append(emptyMark);
      } else {
        for (const r of c.records) {
          // 完全复用「看课助手」的 mark 卡片结构和样式
          const row = document.createElement('article');
          row.className = 'mark';
          row.dataset.markId = r.id;
          row.setAttribute('role', 'listitem');

          const head = document.createElement('div');
          head.className = 'mark-head';

          const jump = document.createElement('button');
          jump.className = 'stamp';
          jump.textContent = stamp(r.time);
          jump.title = isCurrent ? '跳转到此标记' : '在新标签页打开并跳转此时间';
          jump.addEventListener('click', () => {
            if (isCurrent) {
              reconcile();
              seek(r.time);
              setPanel('study');
            } else {
              const targetUrl = new URL(c.url);
              targetUrl.searchParams.set('xestudy_t', String(r.time));
              window.open(targetUrl.href, '_blank');
            }
          });

          const spacer = document.createElement('span');
          spacer.className = 'spacer';

          const edit = document.createElement('button');
          edit.className = 'text-button';
          edit.textContent = '编辑';
          edit.setAttribute('aria-label', `编辑 ${stamp(r.time)} 的备注`);
          edit.addEventListener('click', () => {
            if (isCurrent) {
              reconcile();
              startEdit(r.id);
            } else {
              const targetUrl = new URL(c.url);
              targetUrl.searchParams.set('xestudy_t', String(r.time));
              window.open(targetUrl.href, '_blank');
            }
          });

          const del = document.createElement('button');
          del.className = 'text-button';
          del.textContent = '删除';
          del.setAttribute('aria-label', `删除 ${stamp(r.time)} 的标记`);
          del.addEventListener('click', () => {
            save(c, { ...r, deleted: true });
            lastDeleted = { course: c.id, id: r.id };
            renderAllPane();
            if (ctx === c) renderMarks();
          });

          const note = document.createElement('p');
          note.className = 'note-content';
          note.textContent = r.note || '未填写备注';
          note.classList.toggle('muted', !r.note);

          head.append(jump, spacer, edit, del);
          row.append(head, note);

          // 复用看课助手的截图渲染逻辑，展示画面缩略图与弹窗预览
          renderScreenshot(c, r, row);

          marksList.append(row);
        }
      }

      details.append(marksList);
      listEl.append(details);
      marksList.scrollTop = cardStates.get(c.id)?.scrollTop || 0;
    }
    listEl.scrollTop = scrollTop;
  }
  /**
   * Build an uncompressed ZIP without dependencies.
   * Embed this function inside the userscript's IIFE.
   * @param {{name: string, data: string | Blob | Uint8Array}[]} files
   * @returns {Promise<Blob>}
   */
  async function makeZip(files) {
    const MAX16 = 0xffff;
    const MAX32 = 0xffffffff;
    const UTF8_FLAG = 0x0800;
    const encoder = new TextEncoder();

    if (!Array.isArray(files)) throw new TypeError('ZIP 文件列表必须是数组。');
    if (files.length > MAX16) throw new RangeError('文件数量超过普通 ZIP 上限，需要 ZIP64。');

    // Snapshot names and mutable input bytes before any asynchronous work.
    const names = new Set();
    let localSize = 0;
    let centralSize = 0;
    const entries = Array.from(files, file => {
      if (!file || typeof file.name !== 'string') throw new TypeError('ZIP 文件名必须是字符串。');
      const name = file.name.replace(/\\/g, '/');
      if (!name || name.includes('\0') || /^[A-Za-z]:/.test(name) ||
          name.split('/').some(part => !part || part === '.' || part === '..')) {
        throw new TypeError('ZIP 文件名必须是安全的相对路径：' + name);
      }
      if (names.has(name)) throw new TypeError('ZIP 文件名重复：' + name);
      names.add(name);
      const nameBytes = encoder.encode(name);
      if (nameBytes.length > MAX16) throw new RangeError('ZIP 文件名的 UTF-8 编码过长。');

      const data = file.data;
      if (typeof data !== 'string' && !(data instanceof Blob) && !(data instanceof Uint8Array)) {
        throw new TypeError('ZIP 内容必须是字符串、Blob 或 Uint8Array。');
      }
      const blob = data instanceof Blob ? data : new Blob([data]);
      // 0xffffffff is reserved as the ZIP64 size/offset sentinel.
      if (blob.size >= MAX32) throw new RangeError('单个文件过大，需要 ZIP64。');
      const offset = localSize;
      localSize += 30 + nameBytes.length + blob.size;
      centralSize += 46 + nameBytes.length;
      if (localSize + centralSize + 22 > MAX32) {
        throw new RangeError('压缩包超过普通 ZIP 的 32 位容量限制，需要 ZIP64。');
      }
      return { nameBytes, blob, offset };
    });

    const crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let crc = n;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      crcTable[n] = crc >>> 0;
    }
    async function crc32(blob) {
      let crc = MAX32;
      const consume = chunk => {
        for (let i = 0; i < chunk.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ chunk[i]) & 0xff];
      };
      if (typeof blob.stream === 'function') {
        const reader = blob.stream().getReader();
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            consume(value);
          }
        } finally {
          reader.releaseLock();
        }
      } else {
        consume(new Uint8Array(await blob.arrayBuffer()));
      }
      return (crc ^ MAX32) >>> 0;
    }

    const now = new Date();
    const year = Math.max(1980, Math.min(2107, now.getFullYear()));
    const dosDate = ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >>> 1);
    const parts = [];
    const directory = [];

    for (const { nameBytes, blob, offset } of entries) {
      const crc = await crc32(blob);
      const local = new Uint8Array(30);
      const lh = new DataView(local.buffer);
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true); // Version needed: 2.0.
      lh.setUint16(6, UTF8_FLAG, true);
      lh.setUint16(8, 0, true); // STORE; sizes are known, no data descriptor.
      lh.setUint16(10, dosTime, true);
      lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, blob.size, true);
      lh.setUint32(22, blob.size, true);
      lh.setUint16(26, nameBytes.length, true);
      // Extra-field length at 28 remains zero.
      parts.push(local, nameBytes, blob);

      const central = new Uint8Array(46);
      const ch = new DataView(central.buffer);
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true); // Created by version 2.0, DOS-compatible attributes.
      ch.setUint16(6, 20, true);
      ch.setUint16(8, UTF8_FLAG, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, blob.size, true);
      ch.setUint32(24, blob.size, true);
      ch.setUint16(28, nameBytes.length, true);
      // Extra/comment lengths, disk number and attributes remain zero.
      ch.setUint32(42, offset, true);
      directory.push(central, nameBytes);
    }

    const end = new Uint8Array(22);
    const eh = new DataView(end.buffer);
    eh.setUint32(0, 0x06054b50, true);
    // Disk numbers and archive comment length remain zero.
    eh.setUint16(8, entries.length, true);
    eh.setUint16(10, entries.length, true);
    eh.setUint32(12, centralSize, true);
    eh.setUint32(16, localSize, true);
    return new Blob([...parts, ...directory, end], { type: 'application/zip' });
  }
  function syncNativePanel() {
    // 不移动或克隆站点节点，避免破坏框架状态、登录及互动输入。
    for(const item of document.querySelectorAll('#tab-swiper > .van-swipe__track > .van-swipe-item')) {
      if(item.querySelector('.interactionView'))item.dataset.xeStudyPane='interaction';
      else if(item.querySelector('.detailView'))item.dataset.xeStudyPane='intro';
    }
    if(activePanel==='study' || activePanel==='all' || collapsed){$('native-note').hidden=true;return;}
    const label=activePanel==='interaction'?'互动':'介绍';
    const tab=[...document.querySelectorAll('#base-business-container > footer .tab-zone-container [role="tab"]')]
      .find(el=>el.textContent.trim()===label);
    $('native-note').hidden=!!tab;
    if(tab && tab.getAttribute('aria-selected')!=='true')tab.click();
  }
  function syncFold() {
    $('shell').classList.toggle('compact',collapsed);
    host.toggleAttribute('data-collapsed',collapsed);
    document.documentElement.toggleAttribute('data-xe-study-collapsed',collapsed);
    $('fold').textContent=collapsed?'展开':'折叠 ›';
    $('fold').title=collapsed?'展开右侧面板':'折叠右侧面板';
    $('fold').setAttribute('aria-label',$('fold').title);
    $('fold').setAttribute('aria-expanded',String(!collapsed));
    syncNativePanel();window.dispatchEvent(new Event('resize'));
  }
  function setPanel(panel) {
    activePanel=panel;collapsed=false;
    document.documentElement.setAttribute('data-xe-study-panel',panel);
    const isCustom = panel==='study' || panel==='all';
    ui.querySelector('.box').classList.toggle('native',!isCustom);
    $('study-pane').hidden=panel!=='study';
    if ($('all-pane')) $('all-pane').hidden=panel!=='all';
    for(const name of ['study','all','interaction','intro']) {
      const tab=$('tab-'+name);
      if(!tab)continue;
      const selected=name===panel;
      tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
    }
    if (panel==='all') renderAllPane();
    syncFold();
  }
  const panels=['study','all','interaction','intro'];
  panels.forEach((panel,index)=>{
    $('tab-'+panel).addEventListener('click',()=>setPanel(panel));
    $('tab-'+panel).addEventListener('keydown',event=>{
      let next;
      if(event.key==='ArrowRight')next=(index+1)%panels.length;
      else if(event.key==='ArrowLeft')next=(index+panels.length-1)%panels.length;
      else if(event.key==='Home')next=0;
      else if(event.key==='End')next=panels.length-1;
      else return;
      event.preventDefault();event.stopPropagation();setPanel(panels[next]);$('tab-'+panels[next]).focus();
    });
  });
  $('fold').addEventListener('click',()=>{collapsed=!collapsed;syncFold();});
  $('theater').addEventListener('click',()=>{reconcile();setTheater(!theater);});
  $('back').addEventListener('click',()=>{reconcile();if(video)seek(video.currentTime-10);});
  $('forward').addEventListener('click',()=>{reconcile();if(video)seek(video.currentTime+10);});
  $('rate').addEventListener('change',()=>setRate(Number($('rate').value)||1));
  $('keys-help').addEventListener('click',()=>$('keys-dialog').showModal());
  $('keys-close').addEventListener('click',()=>$('keys-dialog').close());
  $('keys-dialog').addEventListener('click',event=>{if(event.target===$('keys-dialog'))$('keys-dialog').close();});
  $('frame-rate').addEventListener('change',()=>{frameRateMode=$('frame-rate').value;});
  $('a').addEventListener('click',()=>{reconcile();if(!finiteVideo())return;loopA=video.currentTime;if(loopB!==null && loopB<=loopA)loopB=null;looping=false;update();});
  $('b').addEventListener('click',()=>{reconcile();if(!finiteVideo())return;if(loopA===null || video.currentTime<=loopA+0.25){status('请先设 A 点，再在至少 0.25 秒之后设 B 点。');return;}loopB=video.currentTime;looping=false;update();});
  $('loop').addEventListener('click',()=>{reconcile();if(!finiteVideo() || loopA===null || loopB===null)return;looping=!looping;if(looping)seek(loopA,true);update();});
  $('clear-loop').addEventListener('click',clearLoop);
  $('note-input').addEventListener('input',()=>{
    if(!ctx)return;
    if(ctx.editing)ctx.editText=$('note-input').value;else ctx.draft=$('note-input').value;
  });
  $('note-input').addEventListener('keydown',event=>{
    if(event.key==='Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing){event.preventDefault();event.stopPropagation();addMark();}
  });
  $('cancel-edit').addEventListener('click',cancelEdit);
  $('preview-close').addEventListener('click',()=>$('preview').close());
  $('preview').addEventListener('click',event=>{if(event.target===$('preview'))$('preview').close();});
  $('add').addEventListener('click',addMark);
  $('export').addEventListener('click',exportNotes);
  $('all-export').addEventListener('click',exportAllNotes);
  $('all-refresh').addEventListener('click',()=>renderAllPane());
  $('undo').addEventListener('click',()=>{if(!ctx || lastDeleted?.course!==ctx.id)return;const r=ctx.records.get(lastDeleted.id);if(r)save(ctx,{...r,deleted:false});lastDeleted=null;renderMarks();});
  function isEditablePath(path) {
    return path.some(el=>el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || ['textbox','combobox'].includes(el.getAttribute('role'))));
  }
  // 输入事件在 ShadowRoot 内完成，不让 retarget 后的按键继续冒泡至站点。
  // 不 preventDefault：空格、光标、选择、复制粘贴和 IME 仍由浏览器处理。
  for(const type of ['keydown','keyup','keypress'])ui.addEventListener(type,event=>{
    if(isEditablePath(event.composedPath()))event.stopPropagation();
  },{signal});
  window.addEventListener('keydown',event=>{
    const path=event.composedPath();
    if(!ctx || event.isComposing || event.keyCode===229 || isEditablePath(path) || $('preview').open || $('keys-dialog').open)return;
    if(path.some(el=>el instanceof HTMLElement && el.getAttribute('role')==='tab'))return;
    if(event.metaKey || event.shiftKey)return;
    let action=null,repeatable=false;
    if(event.altKey) {
      if(event.ctrlKey)return;
      if(event.code==='KeyT')action=()=>{reconcile();setTheater(!theater);};
      if(event.code==='KeyM')action=addMark;
    } else if(event.ctrlKey) {
      if(event.code==='ArrowLeft' || event.code==='ArrowRight') {
        repeatable=true;action=()=>{reconcile();if(video)seek(video.currentTime+(event.code==='ArrowLeft'?-15:15));};
      }
    } else {
      // 聚焦按钮或链接时，Enter/Space 仍激活该控件。
      if(['Space','Enter'].includes(event.code) && path.some(el=>el instanceof HTMLElement && (el.matches('button,a[href],summary') || el.getAttribute('role')==='button')))return;
      switch(event.code) {
        case 'Space':action=togglePlay;break;
        case 'ArrowLeft':case 'ArrowRight':repeatable=true;action=()=>{reconcile();if(video)seek(video.currentTime+(event.code==='ArrowLeft'?-5:5));};break;
        case 'KeyX':repeatable=true;action=()=>setRate((video?.playbackRate||1)-0.1);break;
        case 'KeyC':repeatable=true;action=()=>setRate((video?.playbackRate||1)+0.1);break;
        case 'KeyZ':action=()=>setRate(1);break;
        case 'KeyD':case 'KeyF':repeatable=true;action=()=>stepFrame(event.code==='KeyD'?-1:1);break;
        case 'ArrowUp':case 'ArrowDown':repeatable=true;action=()=>changeVolume(event.code==='ArrowUp'?0.05:-0.05);break;
        case 'KeyM':action=()=>{reconcile();if(video){video.muted=!video.muted;status(video.muted?'已静音':'已取消静音');}};break;
        case 'Enter':action=toggleFullscreen;break;
        case 'Escape':if(document.fullscreenElement)action=toggleFullscreen;else if(theater)action=()=>setTheater(false);break;
      }
    }
    if(!action)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(!event.repeat || repeatable)action();
  },{capture:true,signal});
  if (typeof GM_addValueChangeListener === 'function') {
    try {
      GM_addValueChangeListener(COURSE_INDEX_KEY, () => {
        if (activePanel === 'all') renderAllPane();
      });
    } catch {}
  }
  window.addEventListener('storage',event=>{
    for(const c of contexts.values()) {
      if(event.key===null) {status('浏览器存储已从另一页面清除；当前笔记仍可导出。');continue;}
      if(!event.key.startsWith(c.prefix))continue;
      const id=event.key.slice(c.prefix.length);
      if(c.dirty.has(id))continue;
      try {
        const r=JSON.parse(event.newValue);
        if(validRecord(r) && event.key===c.prefix+r.id) {
          const editing=ctx===c?c.editing:null;
          if(editing===id){c.remote.set(id,r);status('此标记已在另一标签修改；保存将使用当前备注，取消会载入远端内容。');continue;}
          c.records.set(id,r);
          if(ctx===c)renderMarks();
        }
      } catch { /* 保留可导出的内存记录，不覆盖损坏的存储。 */ }
    }
  },{signal});
  window.addEventListener('pagehide',flush,{signal});
  window.addEventListener('popstate',queueReconcile,{signal});
  window.addEventListener('hashchange',queueReconcile,{signal});
  const observer=new MutationObserver(queueReconcile);
  observer.observe(document.body,{childList:true,subtree:true});
  // pushState 不一定产生 DOM 变动；只轮询 URL / video，不改站点的 history 方法。
  const timer=setInterval(reconcile,750);
  // 页面内更新助手时恢复可见草稿、当前标签和滚动位置，不操作视频进度。
  host.addEventListener('xe-study-restore',event=>{
    const state=event.detail;if(!ctx || !state || state.course!==ctx.id)return;
    if(state.editing && ctx.records.has(state.editing)) {
      ctx.editing=state.editing;ctx.editText=typeof state.note==='string'?state.note:ctx.records.get(state.editing).note;
    }else ctx.draft=typeof state.note==='string'?state.note:'';
    syncComposer();renderMarks();
    setPanel(panels.includes(state.panel)?state.panel:'study');
    collapsed=!!state.collapsed;syncFold();
    if(typeof state.theater==='boolean')setTheater(state.theater);
    $('marks').scrollTop=Number(state.scrollTop)||0;
  },{signal});
  // 替换脚本时清理自有布局，不影响站点播放器生命周期。
  host.addEventListener('xe-study-destroy',()=>{
    flush();abort.abort();videoAbort?.abort();stopFrameTracking();observer.disconnect();clearInterval(timer);setTheater(false);
    for(const state of nativeComponents.values())releaseNativeComponent(state,true);
    for(const state of nativePlayers.values())releaseNativePlayer(state);
    if($('preview').open)$('preview').close();
    if($('keys-dialog').open)$('keys-dialog').close();
    for(const url of imageURLs.values())URL.revokeObjectURL(url);
    if(imageDBPromise)imageDBPromise.then(db=>db.close()).catch(()=>{});
    for(const name of ['data-xe-study','data-xe-study-panel','data-xe-study-collapsed'])document.documentElement.removeAttribute(name);
    for(const item of document.querySelectorAll('[data-xe-study-pane]'))item.removeAttribute('data-xe-study-pane');
    css.remove();host.remove();window.dispatchEvent(new Event('resize'));
  },{once:true});
  reconcile();
})();
