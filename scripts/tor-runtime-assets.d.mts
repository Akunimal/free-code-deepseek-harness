export interface TorRuntimeAssets {
  executable: string
  geoipFiles: [string, string]
  sha256: string
}

export function verifyTorRuntimeAssets(
  resourcesRoot: string,
  expectedTorSha256: string,
): TorRuntimeAssets
