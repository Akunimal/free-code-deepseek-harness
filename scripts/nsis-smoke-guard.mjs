export function interactiveNsisSmokeOptedIn(environment = process.env) {
  return environment.FREECODE_ALLOW_INTERACTIVE_NSIS_SMOKE === '1'
    && environment.FREECODE_NSIS_SMOKE_ENV === 'disposable-vm';
}
