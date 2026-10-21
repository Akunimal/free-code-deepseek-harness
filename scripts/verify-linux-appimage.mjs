#!/usr/bin/env node
// This fork ships a Windows x64-only Phoenix sidecar. Do not bless an AppImage
// until a separately pinned, supported Linux sidecar exists.
console.error('verify-linux-appimage: unsupported; Phoenix FreeLLMpool and this release are currently packaged for Windows x64 only.');
process.exit(2);
