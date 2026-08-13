# OpenChamber

OpenChamber 为 OpenCode 提供共享的 web、桌面、VS Code、托管移动端和原生移动端 UI 表面。本上下文定义了用户在运行 AI agent 工作并接收其结果反馈时所使用的领域语言，重点是与通知和声音反馈相关的术语。

## Language

### 通知 (Notifications)

**系统通知 (System Notification)**:
操作系统或浏览器级别的通知，由 `Notification` API、Electron 原生通知或移动端推送通道投递。
_Avoid_: native toast, OS alert

**通知事件 (Notification Event)**:
OpenCode SDK 发出的、可能触发通知的事件（`session.idle`、`session.error`、`permission.asked`、`question.asked`）。
_Avoid_: event type, SDK event

**通知模板 (Notification Template)**:
用户可自定义的通知标题和消息文本，支持变量（如 `{agent_name}`、`{last_message}`）。
_Avoid_: message format

**通知通道 (Notification Channel)**:
投递系统通知的方式（桌面原生、Web 浏览器、Service Worker 推送、iOS APNs、UI SSE 流）。
_Avoid_: delivery method, transport

### 音效 (Sounds)

**音效 (Sound Effect)**:
一个可分配给音效通道的音频资产（.aac 文件）。系统提供 45 个预置音效，按主题分组（alert-01..10, bip-bop-01..10, staplebops-01..07, nope-01..12, yup-01..06）。
_Avoid_: audio file, sound file, chime

**音效通道 (Sound Channel)**:
一个可独立配置的事件类别（agent / permissions / errors），每个通道有独立的启用开关和音效选择。启用时，对应事件发生会播放所选音效。
_Avoid_: sound category, sound kind, event channel

**音效预览 (Sound Preview)**:
在音效选择器中悬停选项时触发的临时播放，用于在不提交选择的情况下试听音效。受防抖和组件生命周期控制。
_Avoid_: preview playback, sound test

**音效选择器 (Sound Selector)**:
允许用户为每个音效通道浏览、预览和选择音效的 UI 控件。第一个选项为 "None"（关闭该通道的音效）。
_Avoid_: sound picker, dropdown

### 行为

**可见性门控 (Visibility Gate)**:
`document.visibilityState === 'visible'` 的前端检查，当应用窗口不可见时抑制音效播放。仅抑制音效，不影响系统通知。
_Avoid_: autoplay guard, focus check, background suppression

**音效播放点 (Sound Playback Point)**:
前端事件处理代码中调用 `playSoundById()` 的位置。每个音效通道恰好对应一个播放点：agent 通道在 `session.idle` 时播放、errors 通道在 `session.error` 时播放、permissions 通道在 `permission.asked` 时播放。`question.asked` 事件不属于任何音效通道。
_Avoid_: sound hook, trigger point
