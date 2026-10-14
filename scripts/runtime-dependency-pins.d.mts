export interface RuntimeDependencyPin {
  id: string
  path: string
  required?: boolean
  version?: string
  sha256?: string
  [key: string]: unknown
}

export interface RuntimeDependencyManifest {
  dependencies: RuntimeDependencyPin[]
  [key: string]: unknown
}

export function refreshRuntimeDependencyPins(
  manifest: RuntimeDependencyManifest,
  payloadRoot: string,
): RuntimeDependencyManifest
