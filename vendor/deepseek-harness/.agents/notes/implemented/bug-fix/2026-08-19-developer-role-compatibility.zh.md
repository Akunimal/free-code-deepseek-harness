# Agent Note: 为 DeepSeek Chat Completions 规范化 developer 消息

Status: implemented

[English](2026-08-19-developer-role-compatibility.md) | 中文

## Problem

OpenAI 兼容调用方可以在 `/v1/chat/completions` 中发送 `role: developer`。本地 `opencode2api` 代理原样转发了该角色，但 DeepSeek Chat 接口只接受 `system`、`user`、`assistant` 和 `tool`，因此普通提示可能以 `invalid_request_error` 失败。

## Decision

在上游请求前唯一的 wire 转换 `convertMessagesForUpstream` 中，仅将 `developer` 角色规范化为 `system`。其他受支持的角色保持不变。由于 vendored `opencode2api` 源码会在资源构建后恢复，此修改通过构建补丁携带。

## Consequences

Developer 指令保留 system 指令语义，不再以不受支持的角色抵达 DeepSeek。Responses 输入已经执行相同的规范化；此修改补上了直接 Chat Completions 输入的对应缺口。

## Testing

应用两个构建补丁后，聚焦 Go app 测试套件通过。新增回归测试验证 `developer` 变为 `system`，而 `user`、`assistant` 和 `tool` 保持不变。构建脚本能够应用并恢复被补丁修改的 vendor 源码。
