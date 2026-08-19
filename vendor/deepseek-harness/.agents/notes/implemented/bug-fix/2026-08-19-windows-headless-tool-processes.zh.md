# Agent Note: 保持 Windows 工具子进程无窗口运行

Status: implemented

[English](2026-08-19-windows-headless-tool-processes.md) | 中文

## Problem

Electron shell 自己的长期子进程已经隐藏，但上游本地 subprocess provider 调用 Node 的 `child_process.spawn` 时没有设置 `windowsHide`。因此 Windows 上为工具调用创建的 PowerShell 和沙箱 runner 可能闪出可见的控制台窗口。树终止用的 `taskkill` helper 在同步 spawn 时也有同样遗漏。

## Decision

在共享 subprocess spawn 边界应用 `windowsHide: platform === 'win32'`，并为 Windows 的 `taskkill` helper 添加 `windowsHide: true`。保持 stdio 收集和进程树语义不变。新增一个兼容 Windows 的回归测试，通过现有测试 seam 检查实际 spawn 选项。

## Consequences

前台和后台工具命令、沙箱 runner 及其终止 helper 都会保持不可见，同时输出继续通过现有捕获流传递。交互式 PTY 会话继续使用自己的 terminal provider，不会被转换成普通隐藏管道。

## Testing

聚焦测试 `windows-headless.spec.ts` 已通过。它验证 Windows 工具子进程收到 `windowsHide: true` 和 `detached: false`；release workflow 还会在 Windows 矩阵中重复该测试以及完整上游测试。
