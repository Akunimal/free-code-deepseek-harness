'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

// Capture Windows' actual process creation stamp, rather than estimating it
// from spawn time. Exact FILETIME ticks are persisted as a decimal string.
function captureProcessCreation(pid, expectedParentPid) {
  if (!Number.isInteger(pid) || pid < 1) throw new Error('Invalid process identity PID');
  const parentCheck = expectedParentPid
    ? `$c=Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}";if(!$c -or $c.ParentProcessId -ne ${Number(expectedParentPid)}){throw 'Process parent identity changed'};`
    : '';
  const code = `$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';${parentCheck}$p=[Diagnostics.Process]::GetProcessById(${pid});$t=$p.StartTime.ToUniversalTime();@{startedAt=$t.ToString('o');creationTicks=$t.Ticks.ToString()}|ConvertTo-Json -Compress`;
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const args = ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')];
  const options = {
    // A cold PowerShell host can exceed five seconds under Windows load.
    // Root identity gets ten seconds; child captures keep their short bound.
    windowsHide: true, timeout: expectedParentPid ? 5000 : 10000, encoding: 'utf8', maxBuffer: 8192, stdio: ['ignore', 'pipe', 'pipe']
  };
  let output;
  try { output = execFileSync(powershell, args, options); }
  catch (error) {
    if (expectedParentPid || error.code !== 'ETIMEDOUT') throw error;
    // One immediate root-only retry avoids losing another whole scheduler minute.
    output = execFileSync(powershell, args, options);
  }
  const identity = JSON.parse(output);
  if (!/^\d+$/.test(identity.creationTicks) || !Number.isFinite(Date.parse(identity.startedAt))) throw new Error('Invalid Windows creation identity');
  return identity;
}

module.exports = { captureProcessCreation };
