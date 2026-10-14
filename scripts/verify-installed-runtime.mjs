#!/usr/bin/env node
/**
 * Exercise the runtime from an installed Windows package. Filesystem layout
 * checks cannot catch a broken preflight, a dead Electron bootstrap, or a
 * visible console created by a descendant process.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInstalledSmokeEnvironment } from './installed-runtime-environment.mjs';

const APP_EXE_NAME = 'FreeCode DeepSeek Harness.exe';
// First run downloads the runtime after the small desktop setup is installed.
// Allow a slow connection and extraction, while still honoring an explicit
// tighter/longer timeout for release validation.
const DEFAULT_TIMEOUT_MS = Number(process.env.FREECODE_FIRST_RUN_TIMEOUT_MS ?? 1_800_000);
if (!Number.isFinite(DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS <= 0) {
  throw new Error('installed-runtime: FREECODE_FIRST_RUN_TIMEOUT_MS must be a positive number');
}

function cliEntry(harnessRuntimeDir) {
  return join(harnessRuntimeDir, 'dsh', 'apps', 'cli', 'lib', 'bin.js');
}

function appExecutable(installDir) {
  const expected = join(installDir, APP_EXE_NAME);
  if (existsSync(expected)) return expected;
  const fallback = readdirSync(installDir)
    .filter((name) => name.endsWith('.exe') && !/^Uninstall/i.test(name))
    .map((name) => join(installDir, name));
  if (fallback.length === 1) return fallback[0];
  throw new Error(`installed-runtime: application executable not found under ${installDir}`);
}

function readLog(userDataDir) {
  const logPath = join(userDataDir, 'logs', 'app.log');
  try { return readFileSync(logPath, 'utf8'); } catch { return ''; }
}

function powershell(command, timeout = 5_000) {
  const result = spawnSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command,
  ], { encoding: 'utf8', windowsHide: true, timeout });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`PowerShell probe exited ${String(result.status)}: ${result.stderr ?? ''}`);
  return result.stdout ?? '';
}

function stopProcessesUnder(installDir) {
  const prefix = installDir.endsWith('\\') ? installDir : `${installDir}\\`;
  const escaped = prefix.replaceAll("'", "''");
  const command = `$prefix='${escaped}'; Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($prefix,[System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  powershell(command, 15_000);
}

function stopProcessesReferencing(installDir) {
  const prefix = installDir.endsWith('\\') ? installDir : `${installDir}\\`;
  const escaped = prefix.replaceAll("'", "''");
  const command = `$needle='${escaped}'.ToLowerInvariant(); $self=$PID; Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $self -and $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($needle) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  powershell(command, 15_000);
}

function visibleDescendantProbe(rootPid, durationMs = 12_000) {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FreeCodeWindowProbe {
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
}
'@
$root = ${rootPid}
$deadline = [DateTime]::UtcNow.AddMilliseconds(${durationMs})
while ([DateTime]::UtcNow -lt $deadline) {
  $all = @(Get-CimInstance Win32_Process)
  $ids = [System.Collections.Generic.HashSet[int]]::new()
  [void]$ids.Add($root)
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($item in $all) {
      if ($ids.Contains([int]$item.ParentProcessId) -and $ids.Add([int]$item.ProcessId)) { $changed = $true }
    }
  }
  foreach ($id in $ids) {
    if ($id -eq $root) { continue }
    $process = Get-Process -Id $id -ErrorAction SilentlyContinue
    # Electron child processes often expose a null MainWindowHandle while
    # booting. Do not let PowerShell coerce null into IntPtr and fail the
    # release smoke; only probe a concrete handle.
    if ($null -eq $process -or $null -eq $process.MainWindowHandle -or [IntPtr]::Zero.Equals($process.MainWindowHandle)) { continue }
    if ([FreeCodeWindowProbe]::IsWindowVisible($process.MainWindowHandle)) {
      Write-Output ("VISIBLE|{0}|{1}|{2}" -f $process.Id,$process.ProcessName,$process.MainWindowTitle)
      exit 42
    }
  }
  Start-Sleep -Milliseconds 75
}
`;
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script,
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else if (code === 42) reject(new Error(`installed-runtime: visible descendant window detected: ${stdout.trim()}`));
      else reject(new Error(`installed-runtime: window probe exited ${String(code)}: ${stderr.trim()}`));
    });
  });
}

async function launchAndProbe(installDir, label) {
  const executable = appExecutable(installDir);
  const environment = createInstalledSmokeEnvironment(installDir, process.env);
  for (const key of ['APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOME', 'TEMP', 'TMP']) {
    mkdirSync(environment.env[key], { recursive: true });
  }
  const child = spawn(executable, [`--user-data-dir=${environment.userDataDir}`], {
    env: environment.env,
    windowsHide: true,
    stdio: 'ignore',
  });
  try {
    const deadline = Date.now() + DEFAULT_TIMEOUT_MS;
    let started = false;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`installed-runtime: ${label} exited ${String(child.exitCode)} during startup`);
      const log = readLog(environment.userDataDir);
      if (log.includes('harness runtime preflight failed')) {
        throw new Error(`installed-runtime: ${label} preflight failed:\n${log.slice(-4_000)}`);
      }
      if (log.includes('first-run DSH runtime setup failed')) {
        throw new Error(`installed-runtime: ${label} first-run runtime setup failed:\n${log.slice(-6_000)}`);
      }
      if (log.includes('harness supervisor gave up') || log.includes('dsh readiness timeout')) {
        throw new Error(`installed-runtime: ${label} supervisor failed before readiness:\n${log.slice(-6_000)}`);
      }
      if (log.includes('shell starting')) {
        // shell starting only proves that Electron opened. Require the
        // actual dsh readiness callback as well; otherwise a native-addon
        // ABI crash can pass the install smoke while the UI is unusable.
        if (log.includes('harness ready')) {
          started = true;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!started) throw new Error(`installed-runtime: ${label} did not reach shell startup within ${DEFAULT_TIMEOUT_MS}ms`);
    await visibleDescendantProbe(child.pid);
    return environment;
  } finally {
    if (child.pid) {
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    }
    try { stopProcessesUnder(installDir); } catch { /* cleanup is retried by the caller */ }
  }
}

function runHeadlessCli(installDir, harnessRuntimeDir, label, environment) {
  const entry = cliEntry(harnessRuntimeDir);
  if (!existsSync(entry)) throw new Error(`installed-runtime: ${label} first-run DSH runtime is missing ${entry}`);
  const result = spawnSync(appExecutable(installDir), [entry, 'web', '--help'], {
    cwd: join(harnessRuntimeDir, 'dsh'),
    encoding: 'utf8',
    windowsHide: true,
    env: { ...environment.env, ELECTRON_RUN_AS_NODE: '1' },
    // A cold installed runtime may resolve the complete workspace closure
    // from a busy temp volume. Keep the check bounded, but do not classify
    // healthy cold starts as failures after the payload has already passed
    // the layout gate.
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`installed-runtime: ${label} dsh web --help exited ${String(result.status)}:\n${result.stderr ?? ''}`);
  }
}

export async function verifyInstalledRuntime({ installDir, label }) {
  if (process.platform !== 'win32') throw new Error('installed-runtime: this gate requires Windows');
  const absoluteInstallDir = resolve(installDir);
  const environment = await launchAndProbe(absoluteInstallDir, label);
  runHeadlessCli(absoluteInstallDir, join(environment.userDataDir, 'harness-runtime'), label, environment);
}

export function stopInstalledProcesses(installDir) {
  stopProcessesUnder(resolve(installDir));
}

export function stopInstalledProcessesReferencing(installDir) {
  stopProcessesReferencing(resolve(installDir));
}
