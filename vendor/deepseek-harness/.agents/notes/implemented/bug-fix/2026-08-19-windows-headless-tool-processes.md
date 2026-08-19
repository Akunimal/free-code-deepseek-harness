# Agent Note: Keep Windows tool subprocesses headless

Status: implemented

English | [中文](2026-08-19-windows-headless-tool-processes.zh.md)

## Problem

The Electron shell hid its own long-lived child processes, but the upstream local subprocess provider called Node's `child_process.spawn` without `windowsHide`. PowerShell and sandbox runners created for tool calls could therefore flash visible console windows on Windows. The tree-termination `taskkill` helper used the same omission for synchronous spawns.

## Decision

Apply `windowsHide: platform === 'win32'` at the shared subprocess spawn boundary and `windowsHide: true` to the Windows `taskkill` helper. Keep stdio collection and process-tree semantics unchanged. Add a Windows-compatible regression test that inspects the actual spawn options through the existing test seam.

## Consequences

Foreground and background tool commands, sandbox runners, and their termination helper remain invisible while their output continues through the existing captured streams. Interactive PTY sessions keep their own terminal provider and are not converted into ordinary hidden pipes.

## Testing

The focused `windows-headless.spec.ts` passes. It verifies that a Windows tool subprocess receives `windowsHide: true` and `detached: false`; the release workflow must repeat this on the Windows matrix together with the full upstream tests.
