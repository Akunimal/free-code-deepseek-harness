# Agent Note: 零信任桌面发布 gate 负责已发布路径验证

Status: implemented

[English](2026-08-25-zero-trust-desktop-release-gates.md) | 中文

## 问题

桌面发布路径横跨源代码 bundle、NSIS hook、已安装 runtime 文件、子进程可见性和升级行为。源代码测试通过时，打包安装仍可能丢失 runtime 目录或快捷方式。

## 决策

仓库拥有 Windows `release:gate`，负责运行空白检查、完整 FreeCode workspace 测试、契约测试、类型检查、Windows ACL 回归测试、桌面打包、动态 vendored bundle 新鲜度检查，以及隔离的全新安装和 0.2.4 升级 smoke。已安装 runtime smoke 只使用临时安装目录和用户数据目录，验证 CLI 和 preflight，并检查后代窗口。NSIS 提取后的 hook 可以重新创建缺失的开始菜单和桌面快捷方式，但不得删除或修改已提取的 payload。

快捷方式契约同时明确写入 electron-builder 配置，并由 NSIS hook gate 和 release 契约测试机械检查。发布说明保持英文和西班牙文部分、artifact 列表及验证结果一致。

## 考虑过的替代方案

- **依赖 installer 默认行为并手动启动一次**——拒绝，因为 electron-builder 即使链接不存在也会保留 `KeepShortcuts` 注册状态，而成功启动不能证明升级或快捷方式行为。
- **针对用户正在使用的安装运行安装测试**——拒绝，因为验证不得关闭或修改正在运行的 FreeCode 会话。
- **把跳过或无关的上游测试当作 release 结果**——拒绝，因为只有产品范围内的 gate 及其明确的平台限制才能作为该桌面 artifact 的证据。

## 后果

- Windows 发布耗时更长，因为打包和隔离的 installer smoke 都是强制项。
- 已安装路径 smoke 被跳过或中断时，release 不能标记为绿色。
- 完整上游 suite 可能暴露独立的平台、凭据或环境失败；这些失败与产品 release gate 分开，不能被静默改称为产品覆盖。
