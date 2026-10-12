export type ProcessLaunchApi = 'exec' | 'execFile' | 'execFileSync' | 'execSync' | 'fork' | 'spawn' | 'spawnSync'
export type ProcessLaunchPolicy = 'hidden' | 'missing' | 'dynamic' | 'unknown' | 'visible-ui-exception'

export interface ProcessLaunchSite {
  readonly file: string
  readonly line: number
  readonly api: ProcessLaunchApi
  readonly policy: ProcessLaunchPolicy
}

export interface ProcessLaunchInventory {
  readonly files: number
  readonly launches: number
  readonly visibleUiExceptions: number
  readonly failures: readonly string[]
  readonly sites: readonly ProcessLaunchSite[]
}

export function inspectProcessLaunchSource(source: string, file?: string): ProcessLaunchSite[]
export function verifyProcessLaunchInventory(root?: string): ProcessLaunchInventory
