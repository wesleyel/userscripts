// ==UserScript==
// @name         CodeBrick 手写作答 OCR + AI 判分
// @namespace    https://www.codebrick.tech/
// @version      2.4.2
// @description  CodeBrick 刷题页：iPad 手写作答图 OCR 转文字、智能截图题卡、复制全题、对照解析踩分点 AI 判分（任意 OpenAI 兼容服务，可配置多个）
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
