# 发布指南

## 当前准备状态

- 两份源码已合并到本地 Git 仓库；未创建 GitHub 远程仓库，未推送或发布。
- CodeBrick 2.4.1 已包含判分自动复制。
- 小鹅通 1.4.0 保留 Greasy Fork 脚本 ID `594407` 及原更新地址。
- 发布前需核对小鹅通线上版本；若相同版本号下代码已有变化，先递增本地版本号。

## 1. 创建 GitHub 仓库并推送

在 GitHub 创建空的公开仓库 `userscripts`，不要额外生成 README。把下面的 `OWNER` 替换为实际账户名：

```sh
git remote add origin https://github.com/OWNER/userscripts.git
git push -u origin main
```

也可在本目录使用已登录的 GitHub CLI 创建并推送：

```sh
gh repo create userscripts --public --source=. --remote=origin --push
```

公开前只提交源码和文档，不提交 API Key 或油猴存储导出。

## 2. 在 Greasy Fork 配置两个独立脚本

### CodeBrick

首次发布脚本，使用 `scripts/codebrick-ocr-ai.user.js`，介绍可复制自 `docs/greasyfork/codebrick.md`。选定许可后可补充 `@license`；当前源文件未声明开源许可证。

将代码同步来源设置为以下 Raw 地址（替换 `OWNER`）：

```text
https://raw.githubusercontent.com/OWNER/userscripts/main/scripts/codebrick-ocr-ai.user.js
```

### 小鹅通

管理现有脚本 https://greasyfork.org/zh-CN/scripts/594407 ，将同步源设为：

```text
https://raw.githubusercontent.com/OWNER/userscripts/main/scripts/xet.user.js
```

保留现有脚本条目，不重新创建同名条目。发布前核对线上代码与版本号。

## 3. 配置 Webhook

登录后打开 https://greasyfork.org/en/users/webhook-info ，按账户专属说明获取配置。

在 GitHub 仓库 Settings → Webhooks → Add webhook 中按该说明填写，启用 push 事件。两个脚本都要关联各自的 Raw 同步源。

第一次推送后检查 GitHub webhook 投递结果与 Greasy Fork 两个脚本的同步状态。Webhook 通知 Greasy Fork 检查源码，油猴另按自己的更新检查周期获取新版。

无需 GitHub Actions 代为发布。仓库内的 Actions 只检查源码，不配置发布密钥。Webhook 与 CI 独立运行，因此推送前必须先在本地检查通过。

## 4. 安装和验证更新

从 Greasy Fork 安装脚本，确认油猴识别为原脚本的更新并开启自动检查。不要随意改变 `@name`、`@namespace` 或存储键。

CodeBrick 首次发布后，把安装链接补进 README；如需本地文件安装也从 Greasy Fork 更新，可将该站生成的真实 `@updateURL` / `@downloadURL` 写回源码，不使用占位地址。

Greasy Fork 会处理更新 URL，使通过该站安装的脚本从该站更新。小鹅通已有的更新 URL 保持原样。

## 每次发布

1. 修改对应脚本，递增其 `@version`，更新 CHANGELOG 和 README 版本。
2. 执行 `node tools/check.mjs`。
3. 在目标网站验证受影响功能。CodeBrick 检查判分完成后剪贴板内容、关闭弹窗后粘贴及手动复制；小鹅通检查播放控制、标记保存与导出。
4. 提交并推送，确认 Greasy Fork 显示新版本。
5. 在油猴中手动检查一次更新，确认能获取新版。

## 官方参考

- https://greasyfork.org/en/help/api
- https://greasyfork.org/en/help/meta-keys
- https://www.tampermonkey.net/documentation.php?q=version
