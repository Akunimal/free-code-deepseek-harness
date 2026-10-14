export interface RuntimeDependencyRequirement {
  id: string
  required: boolean
}

export function missingRuntimeDependencyIsFailure(
  dependency: RuntimeDependencyRequirement,
): boolean
