# Pets 宠物状态气泡：运行时资产下载、文案本地化与平台显隐策略

OpenChamber 将复刻 codex CLI 的 `/pets` 宠物状态角标：会话运行期间在聊天区角落显示宠物，以动画与文案反映会话状态（运行中/等待输入/已完成/受阻）。围绕三个方向性问题做出以下决策。

## 资产：运行时按需下载 + 本地缓存，不打包进仓库

- 资产来自 `https://persistent.oaistatic.com/codex/pets/v1/*.webp`（8 只 × 约 1-4MB，需实施前置实测确认清单）。
- 选择运行时下载：仓库不膨胀（约 32MB），资产更新无需发版，与 codex 行为一致。
- 缓存：Electron 落磁盘（userData），Web 与移动端落 IndexedDB；缓存键含版本戳。
- 失败语义（AGENTS.md 不变量："fetch 失败不得伪装成权威成功"）：加载中显示静态占位帧；单只失败隐藏并一次性提示；全部失败显示离线气泡；下次会话重试。绝不把失败渲染成成功状态。
- 不选打包进仓库：体积大、更新要发版、增加第三方资产的分发面。

## 文案：本地化而非逐字复刻英文

- codex 显示 `Running / Needs input / Ready / Blocked`；OpenChamber 用户可见文案必须走项目 i18n（`locale-ui-patterns` 硬规范）。
- 四态语义对齐：运行中 / 等待输入 / 已完成 / 受阻。key 全量补齐 11 种语言，缺 key 由 `Record<I18nKey, string>` 类型强制 + `messages.test.ts` key parity 拦截。

## 平台显隐：桌面/Web 默认显示，移动端默认隐藏可配置

- `showPet` 布尔设置走正式设置系统（跨端同步，服务端白名单持久化）。
- 默认值按平台区分（仿 `mobileKeyboardMode` 先例）：桌面（含 VS Code webview）为 true，Capacitor 与 hosted mobile web（`isMobileSurfaceRuntime()`）为 false，设置页可开启。
- 选哪只宠物属本地偏好（localStorage），不跨端同步——显隐是全局契约，审美偏好是本地事实。

**Consequences**: 资产依赖第三方 CDN 可用性，离线时降级为离线气泡（功能可用性不依赖资产成功加载）；移动端用户默认不可见，需主动开启；设置项增加服务端白名单维护面（`sanitizeSettingsUpdate` 未加条目则保存被静默丢弃，以单测兜底）。
