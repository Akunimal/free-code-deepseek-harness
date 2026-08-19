# Agent Note: Unsupported browser locales must not open in Chinese

Status: implemented

English | [中文](2026-08-19-safe-initial-locale.zh.md)

## Problem

The client correctly matched `navigator` language tags for shipped locales, but used the Chinese dictionary fallback as the last-resort initial locale. A browser with no `zh`, `en`, or `es` preference could therefore open the product in Chinese without an explicit user choice.

## Decision

Keep `zh` as the dictionary lookup fallback and as the result of an explicit Chinese selection. Give initial locale resolution its own `DEFAULT_LOCALE` of `en`: browser `zh`, `en`, and `es` preferences still win, while an unsupported or unavailable browser language opens in English. The Host-backed preference continues to override the provisional value after activation.

## Consequences

Users with Spanish or English browser preferences retain automatic localization. Other users no longer receive an unexpected Chinese surface and can choose Spanish, English, or Chinese from Settings. Existing explicit `locale.preference: zh` values remain respected.

## Testing

The locale suite covers Spanish regional matching, unsupported-language fallback, non-browser boot fallback, Host preference adoption, and explicit locale switching. The focused suite passes 35 tests.
