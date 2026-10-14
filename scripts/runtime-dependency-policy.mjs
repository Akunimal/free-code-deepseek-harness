/** Optional runtime dependencies may be supplied by PATH when not bundled. */
export function missingRuntimeDependencyIsFailure(dependency) {
  return dependency.required === true;
}
