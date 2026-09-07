# 学习辅助油猴脚本

集中维护 CodeBrick 作答助手和小鹅通看课助手。两份脚本独立安装、独立升级，源码文件名固定，版本记录在 `@version` 中。

| 脚本 | 当前版本 | 源码 | 安装 |
| --- | --- | --- | --- |
| CodeBrick 手写作答 OCR + AI 判分 | 2.4.1 | [codebrick-ocr-ai.user.js](scripts/codebrick-ocr-ai.user.js) | 待首次发布至 Greasy Fork |
| 小鹅通 · 看课助手 | 1.4.0 | [xet.user.js](scripts/xet.user.js) | [Greasy Fork](https://greasyfork.org/zh-CN/scripts/594407) |

## 使用

先安装 Tampermonkey，再从对应的 Greasy Fork 页面安装脚本。

- **CodeBrick**：在 CodeBrick 刷题页截图题卡、识别手写作答、复制全题，并对照解析进行 AI 判分。首次使用点击设置，填写自己的 OpenAI 兼容服务地址、API Key 和模型。判分完成自动复制原始 Markdown 到剪贴板。
- **小鹅通**：适用于 `https://*.h5.xet.pomoho.com/v4/course/*`，提供剧院模式、课程标记、标记汇总、倍速、A–B 循环和笔记导出。

CodeBrick 的作答图片与判分文本会发送至使用者配置的模型服务；配置保存在油猴存储中。小鹅通的笔记与标记使用浏览器端存储。

## 开发和发布

直接修改 `scripts/` 中的文件，每次发布递增对应脚本的 `@version`，保持 `@name` 与 `@namespace` 稳定。

```sh
node tools/check.mjs
```

GitHub Actions 在推送和 Pull Request 时执行同一检查。检查范围是 JavaScript 语法与发布元数据，不替代目标网站上的功能验证。

发布流程和 GitHub → Greasy Fork 同步配置见 [发布指南](docs/PUBLISHING.md)。可直接用于发布页的介绍见 [CodeBrick](docs/greasyfork/codebrick.md) 和 [小鹅通](docs/greasyfork/xet.md)。

## 来源与许可

本仓库从原工作目录复制当前文件，保留原目录。小鹅通包含迁移时尚未提交的修改。

各脚本按各自许可发布，详见 [许可说明](LICENSES.md)。
