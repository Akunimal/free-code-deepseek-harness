export interface NativeAddonTargetOptions {
  platform?: string;
  arch?: string;
  linuxLibc?: 'gnu' | 'musl';
}

export type NativeAddonTargetClassification =
  | { kind: 'host'; target?: string }
  | { kind: 'foreign'; target: string; reason: string };

/** Classify an optional platform/architecture-tagged native prebuild. */
export function classifyNativeAddon(
  filePath: string,
  options?: NativeAddonTargetOptions,
): NativeAddonTargetClassification;
