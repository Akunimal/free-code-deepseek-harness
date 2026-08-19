# Agent Note: Normalize developer messages for DeepSeek chat completions

Status: implemented

English | [中文](2026-08-19-developer-role-compatibility.zh.md)

## Problem

OpenAI-compatible callers can send `role: developer` in `/v1/chat/completions`. The local `opencode2api` proxy forwarded that role unchanged, but the DeepSeek chat endpoint accepts only `system`, `user`, `assistant`, and `tool`, so a normal prompt could fail with `invalid_request_error`.

## Decision

Normalize only the `developer` role to `system` in `convertMessagesForUpstream`, the single wire conversion used before the upstream request. Keep all supported roles unchanged. The change is carried as a build patch because the vendored `opencode2api` source is restored after resource builds.

## Consequences

Developer instructions retain their system-instruction semantics and no longer reach DeepSeek as an unsupported role. Responses input already performs the same normalization; this closes the equivalent gap for direct Chat Completions input.

## Testing

The focused Go app suite passes with both build patches applied. The new regression test verifies `developer` becomes `system` while `user`, `assistant`, and `tool` remain unchanged. The build script applies and restores the patched vendor source.
