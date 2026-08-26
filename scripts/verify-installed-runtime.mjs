#!/usr/bin/env node
/**
 * Exercise the runtime from an installed Windows package. Filesystem layout
 * checks cannot catch a broken preflight, a dead Electron bootstrap, or a
 * visible console created by a descendant process.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const APP_EXE_NAME = 'FreeCode DeepSeek Harness.exe';
const DEFAULT_TIMEOUT_MS = 60_000;

function nodeExecutable() {
  const candidates = [
    process.env.DSH_TEST_NODE,
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files (x86)\\nodejs\\node.exe',
  ].filter((candidate) => candidate && existsSync(candidate));
  if (candidates.length > 0) return candidates[0];
  const result = spawnSync('where.exe', ['node.exe'], { encoding: 'utf8', windowsHide: true });
  const first = typeof result.stdout === 'string'
    ? result.stdout.split(/\r?\n/u).map((line) => line.trim()).find(Boolean)
    : undefined;
  if (!first) throw new Error('installed-runtime: node.exe not found');
  return first;
}

function cliEntry(installDir) {
  return join(installDir, 'resources', 'freecode', 'dsh', 'apps', 'cli', 'lib', 'bin.js');
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
  const userDataDir = join(installDir, '.release-smoke-user-data');
  const child = spawn(executable, [`--user-data-dir=${userDataDir}`], {
    windowsHide: true,
    stdio: 'ignore',
  });
  try {
    const deadline = Date.now() + DEFAULT_TIMEOUT_MS;
    let started = false;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`installed-runtime: ${label} exited ${String(child.exitCode)} during startup`);
      const log = readLog(userDataDir);
      if (log.includes('harness runtime preflight failed')) {
        throw new Error(`installed-runtime: ${label} preflight failed:\n${log.slice(-4_000)}`);
      }
      if (log.includes('shell starting')) {
        started = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!started) throw new Error(`installed-runtime: ${label} did not reach shell startup within ${DEFAULT_TIMEOUT_MS}ms`);
    await visibleDescendantProbe(child.pid);
  } finally {
    if (child.pid) {
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    }
    try { stopProcessesUnder(installDir); } catch { /* cleanup is retried by the caller */ }
  }
}

function runHeadlessCli(installDir, label) {
  const result = spawnSync(nodeExecutable(), [cliEntry(installDir), 'web', '--help'], {
    cwd: installDir,
    encoding: 'utf8',
    windowsHide: true,
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
  runHeadlessCli(installDir, label);
  await launchAndProbe(installDir, label);
}

export function stopInstalledProcesses(installDir) {
  stopProcessesUnder(installDir);
}
