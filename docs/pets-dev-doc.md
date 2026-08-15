# Pets 宠物状态气泡 — 开发文档

## 1. 背景与目标

复刻 codex CLI 的 `/pets` 宠物状态角标体验：会话运行期间在聊天区角落显示一只宠物，用动画与气泡文案反映会话状态（运行中/等待输入/已完成/受阻）。复用 OpenChamber 既有斜杠命令系统与设置/i18n 基础设施，不新造轮子；资产运行时按需下载，不膨胀仓库。

## 2. 领域模型与词汇表

| 术语 | 定义 |
|---|---|
| **Pet（宠物）** | 可展示的虚拟形象。拥有 `id`、名称、CDN 资产。共 8 只（数量与文件名需前置验证） |
| **PetState（宠物状态）** | 四态：`running` / `needs-input` / `ready` / `blocked`，语义对齐 codex，文案本地化 |
| **PetBubble（宠物气泡）** | 聊天区左下角浮动 UI 载体（Web/移动运行时）；桌面端由全局悬浮窗（PetOverlay）承载。长按可拖动，不可点击切换 |
| **PetOverlayWindow（宠物悬浮窗）** | 桌面端（Electron）独立 always-on-top 透明窗口，渲染 `pet-overlay.html`；状态由主窗口经 IPC 单向推送，位置持久化到桌面设置 |
| **PetAssetCache（资产缓存）** | CDN 资产按需下载后的本地缓存；Electron 落磁盘、Web/移动落 IndexedDB |
| **showPet（设置）** | 全局布尔设置，走正式设置系统；默认值按运行时平台区分 |
| **PetPreference（宠物偏好）** | 当前选中宠物 id，存 localStorage，不跨端同步 |

## 3. 决策记录（ADR 摘要）

详见 `docs/adr/0003-pets-pet-status-bubble.md`，本文档为实施视角的展开。

| 编号 | 决策 | 依据 |
|---|---|---|
| ADR-001 | 资产运行时从 `https://persistent.oaistatic.com/codex/pets/v1/*.webp` 按需下载 + 本地缓存，**不打包进仓库** | Q7-A；仓库不膨胀，失败可优雅降级 |
| ADR-002 | 气泡文案本地化（运行中/等待输入/已完成/受阻），不逐字复刻英文 | Q8-B；项目 i18n 硬规范（`locale-ui-patterns`） |
| ADR-003 | 桌面/Web 默认显示；Capacitor 与 hosted mobile 默认隐藏、设置可开启 | Q9-B；共享契约覆盖全部 5 运行时 |
| ADR-004 | `/pets` 为 UI 操作型命令（切换开关）：`/pets` 显隐、`/pets <name>` 选宠；不产生消息、不经 LLM；无会话可用 | Q1-A；复用 `builtInCommands` + `handleSubmit` 斜杠分支（同 undo/redo/timeline 模式） |
| ADR-005 | 默认单只宠物，~~点击循环切换~~（已作废，见 ADR-012）；换宠走设置页列表与 `/pets` 命令；偏好持久化到 localStorage | Q2-A、Q4-A；渲染可控，多只/按状态换宠留作增强 |
| ADR-006 | 四态信号全部用真实数据：`busy`→运行中、`retry`→受阻、idle 且有 pending permission/question→等待输入、其余 idle→已完成 | Q5-A；`session.error` 归约 idle 的事实决定"受阻"用 retry 而非 error |
| ADR-007 | 有消息的会话即显示，无会话/无消息隐藏 | Q6-A |
| ADR-008 | 加载中显示静态占位帧；单只失败隐藏 + 一次性提示；全部失败显示离线气泡；下次会话重试；**失败不伪装成成功** | Q7-A；AGENTS.md 不变量 |
| ADR-009 | `showPet` 进正式设置系统（跨端同步）；宠物偏好本地存储 | Q8-A；设置系统 5 处契约 + 服务端白名单 |
| ADR-010 | 气泡挂聊天区左下角（`left-3 bottom-3`），z-index 低于 autocomplete(z-100)/抽屉(z-60)；桌面端由独立置顶悬浮窗承载（ADR-011），Web/移动保持应用内挂载 | Q3-A；实测左下角无既有浮层，与右上角 WorkStatusPanel 对角线不冲突 |

## 4. 状态映射规范

输入信号（事实已核验）：

- `useSessionActivity(sessionId)` → `phase: 'idle'|'busy'|'retry'`（`useSessionActivity.ts:30`）
- **注意**：pending permission/question 时该 hook 强制返回 idle（:41），须先查再判
- `useSessionPermissions` / `useSessionQuestions` → 等待输入的判据

| 显示态 | 判定（按序） | 气泡文案 |
|---|---|---|
| 运行中 | `phase === 'busy'` | 运行中 |
| 受阻 | `phase === 'retry'` | 受阻 |
| 等待输入 | `phase === 'idle'` 且 pending permission/question 非空 | 等待输入 |
| 已完成 | 其余 idle | 已完成 |

## 5. 技术设计

### 5.1 命令注册

- `CommandAutocomplete.tsx:141` `builtInCommands` 增加 `{ name: 'pets', source: 'openchamber', isBuiltIn: true, description: t(...) }`；`getCommandIcon`（:337）加 `case 'pets'`
- `ChatInput.tsx` `handleSubmit` 斜杠分支：解析 `pets` 与可选参数 → 切换显隐 / 设置选中宠物；**不进入发送流程**（参照 undo/redo/timeline 一类）
- `slashCommands.ts` 的 `MAGIC_PROMPT_COMMANDS` 不适用（该表为"发送 prompt 对"命令）

### 5.2 资产获取与缓存

- URL 模式：`https://persistent.oaistatic.com/codex/pets/v1/{id}-spritesheet-v4.webp`
- **前置验证已完成（实测）**：8 只内置宠物来自 Codex App 目录——`codex` / `dewey` / `fireball` / `rocky` / `seedy` / `stacky` / `bsod` / `null-signal`。资产是**静态精灵图**（1536×1872，8 列×9 行帧，每帧 192×208），单张 0.49–1.03MB，总计约 6.5MB（修正了早期"8 个独立动画 webp、约 32MB"的估算）。动画由运行时按帧网格裁切播放，轨道与 Codex 目录一致（idle 行 0 / running 行 7 / waiting 行 6 / review 行 8 / failed 行 5）
- 缓存键 = CDN 文件名（版本化，更新即换文件名）；统一 IndexedDB（共享 UI 无磁盘 API，Electron/Web/移动行为一致）；已缓存资产点击切换零网络
- 资产状态机：`idle` / `loading` / `ok` / `failed`，显式区分，绝不把失败渲染成成功；失败后点击或下次会话重试

### 5.3 状态订阅

- 单会话场景：`useSessionActivity` + `useSessionPermissions`/`useSessionQuestions`
- 跨会话聚合（如多会话场景）可仿 `SessionSidebar.tsx:228` 的 `hasBusySession`，但本版先按"当前会话"实现（ADR-007 范围内）

### 5.4 渲染

- Web/移动挂载点：`ChatContainer.tsx` 的 `data-composer-bound` relative 容器（:1244）；桌面端（Electron）不渲染应用内气泡，由独立 always-on-top 透明悬浮窗（`pet-overlay.html`）承载
- 桌面悬浮窗：主进程创建（transparent/frameless/`alwaysOnTop('screen-saver')`/skipTaskbar/focusable:false），与主窗口同 origin 共享 IndexedDB 资产缓存；状态与回复预览由主窗口 `PetOverlayBridge` 经 `pet_overlay_show|hide|update` IPC 单向推送，主进程重放最新载荷；窗口位置存 `settings.json#desktopPetOverlayPosition`
- 交互：**不可点击切换宠物**；长按 400ms（位移 <8px）进入拖动 —— 桌面端经 `pet_overlay_move` 移动窗口并持久化，Web/移动以 transform 偏移并持久化到 localStorage
- 动画：状态触发后持续保持（running/needs-input/blocked 主帧循环，`loopStart: 0`），直至状态变化；`ready` 为呼吸循环；气泡文案同样持续显示
- 性能：仅渲染当前宠物；`document.hidden` 时暂停动画；宠物不拦截输入区事件

### 5.5 设置项（5 处契约 + 服务端）

1. `lib/desktop.ts:47` `DesktopSettings` 加 `showPet?: boolean`
2. `lib/api/types.ts:634` `SettingsPayload` 加 `showPet?: boolean`
3. `stores/useUIStore.ts`：interface + 默认值 + setter + `partialize`（4 处）
4. `lib/persistence.ts`：`materializeAuthoritativeUiSettings` 默认值（桌面 true / 移动 false，仿 `mobileKeyboardMode` 平台分默认先例）、`applyDesktopUiPreferences`、`sanitizeWebSettings`
5. `packages/web/server/lib/opencode/settings-helpers.js:124` `sanitizeSettingsUpdate` 白名单加 `showPet` 校验（不加则设置写不进磁盘）
6. UI：`OpenChamberVisualSettings.tsx`（`VisibleSetting` :281、`shouldShow`、`SettingsCheckboxRow` + `settingsItem`）、`OpenChamberPage.tsx` `visibleSettings`、`lib/settings/search.ts` 条目（id 与 settingsItem 一致）

### 5.6 i18n（11 语言 × 2 文件，缺 key 编译失败）

- 命令描述：`chat.commandAutocomplete.command.petsDescription`
- 气泡文案：`chat.pets.state.{running,needsInput,ready,blocked}`
- 设置项：`settings.openchamber.visual.field.showPet` + `...Aria`
- 所有 11 种 locale 全量补齐（`Record<I18nKey, string>` 类型强制 + `messages.test.ts` key parity）

## 6. 文件改动清单

| 文件 | 改动 |
|---|---|
| `packages/ui/src/lib/desktop.ts:47` | `DesktopSettings` 加 `showPet?: boolean` |
| `packages/ui/src/lib/api/types.ts:634` | `SettingsPayload` 加 `showPet?: boolean` |
| `packages/ui/src/stores/useUIStore.ts` | interface / 默认值 / setter / `partialize` 4 处 |
| `packages/ui/src/lib/persistence.ts` | `materializeAuthoritativeUiSettings` 平台默认（桌面 true/移动 false）、`applyDesktopUiPreferences`、`sanitizeWebSettings` |
| `packages/web/server/lib/opencode/settings-helpers.js:124` | 白名单加 `showPet` 校验 |
| `packages/web/server/lib/opencode/settings-helpers.test.js` | sanitize 用例 |
| `packages/ui/src/components/chat/CommandAutocomplete.tsx:141,337` | `builtInCommands` 加 `pets` + 图标 case |
| `packages/ui/src/components/chat/ChatInput.tsx` | `handleSubmit` 斜杠分支：`pets`/`pets <name>` 显隐与选宠，不产生消息 |
| `packages/ui/src/components/sections/openchamber/OpenChamberVisualSettings.tsx:281` + `OpenChamberPage.tsx` + `lib/settings/search.ts` | 设置 UI 与搜索索引 |
| 新增 `packages/ui/src/components/chat/pets/` | `catalog.ts`（宠物目录）、`animations.ts`（帧网格与动画轨道）、`petAssetStore.ts`（下载/IndexedDB 缓存/状态机）、`usePetState.ts`（四态映射）、`petPreference.ts`（本地偏好）、`PetBubble.tsx`（应用内 canvas 动画气泡）、`PetStatusBubble.tsx`（状态气泡，双端共享）、`usePetDrag.ts`（长按拖拽）、`usePetAssistantPreview.ts`（回复预览）、`PetOverlay.tsx`（悬浮窗渲染）、`PetOverlayBridge.tsx`（桌面状态桥接） |
| 新增 `packages/web/pet-overlay.html` + `src/pet-overlay-main.tsx` | 悬浮窗页面与入口（vite 多入口 `petOverlay`） |
| `packages/electron/main.mjs` | 悬浮窗窗口生命周期、`pet_overlay_show/hide/update/move` IPC、位置持久化与恢复、退出清理 |
| `packages/ui/src/lib/i18n/messages/*`（11 语言） | `chat.pets.state.*`、`chat.commandAutocomplete.command.petsDescription`、`settings.openchamber.visual.field.showPet`(+Aria) |

## 7. 验证计划

| 检查 | 命令 |
|---|---|
| 类型/i18n key | `bun run --cwd packages/ui type-check` |
| 服务端白名单 | `bun run --cwd packages/web test`（settings-helpers 用例） |
| 死代码/导出形状 | `bun run dead-code` |
| 手动 | 桌面/Web 默认显示、移动默认隐藏；断网降级；点击切换 |

## 8. 失败与回滚考量

- CDN 不可用：全部 `failed` → 离线气泡 + 一次性提示；`/pets` 命令仍可显隐切换
- 设置保存失败：白名单缺失时静默丢弃——以 `settings-helpers.test.js` 用例兜底防回归
- 回滚：`showPet` 默认值改 false 即全局隐藏；命令与气泡共用同一开关
- 键盘/遮挡回归：移动端键盘开合动画不影响气泡挂载层（挂 app shell 而非 composer）
