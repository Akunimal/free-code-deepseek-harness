import { DetectedRoute } from '@freecode/shared-types';

/**
 * OmniRoute detector — on-demand localhost scan for OpenAI-compatible
 * proxy endpoints (OmniRoute or any other local proxy). NEVER auto-scanned
 * at boot (privacy + noise); only when the user clicks "Scan localhost"
 * in the Settings → Add proxy provider wizard.
 */

const SCAN_PORTS = [8080, 8000, 3000, 11434, 4000, 5000, 7000, 1234, 5001];
const SCAN_TIMEOUT_MS = 800;
const PARALLEL = 4;

export interface DetectorConfig {
  ports?: number[];
  timeoutMs?: number;
}

async function scanPort(port: number, timeoutMs: number): Promise<DetectedRoute | null> {
  const baseURL = `http://127.0.0.1:${port}`;
  const started = Date.now();
  try {
    const res = await fetch(`${baseURL}/v1/models`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { id?: string }[] };
    const models = (body.data ?? [])
      .map((m) => m.id)
      .filter((x): x is string => typeof x === 'string' && x.length > 0);
    if (models.length === 0) return null;
    return { port, baseURL, models, latencyMs: Date.now() - started };
  } catch {
    return null;
  }
}

export async function detectLocalRoutes(cfg: DetectorConfig = {}): Promise<DetectedRoute[]> {
  const ports = cfg.ports ?? SCAN_PORTS;
  const timeoutMs = cfg.timeoutMs ?? SCAN_TIMEOUT_MS;
  const results: (DetectedRoute | null)[] = new Array(ports.length).fill(null);

  // Worker-pool style: limited concurrency so 800ms timeouts don't stack.
  let next = 0;
  const workers = Array.from({ length: Math.min(PARALLEL, ports.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= ports.length) return;
      results[i] = await scanPort(ports[i]!, timeoutMs);
    }
  });
  await Promise.all(workers);

  return results
    .filter((r): r is DetectedRoute => r !== null)
    .sort((a, b) => a.latencyMs - b.latencyMs);
}