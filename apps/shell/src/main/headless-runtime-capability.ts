import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Refuse old runtimes whose explicit GUI actions would run invisibly. */
export function assertHeadlessDesktopRuntime(dshDir: string, platform: NodeJS.Platform): void {
  if (platform !== 'win32') return;
  for (const [directory, markers] of [
    ['host/open-in-app', ['FREECODE_HEADLESS_DESKTOP', 'FREECODE_GUI_LAUNCH_ENDPOINT']],
    ['util/native-command', ['FREECODE_HEADLESS_DESKTOP', 'FREECODE_GUI_OPEN_PATH_ENDPOINT']],
  ] as const) {
    let source: string;
    try { source = readFileSync(join(dshDir, 'packages', directory, 'lib', 'index.js'), 'utf8'); }
    catch { throw new Error(`private-desktop GUI broker bundle is missing: ${directory}`); }
    if (markers.some(marker => !source.includes(marker))) throw new Error(`private-desktop GUI broker bundle is stale: ${directory}`);
  }
}
