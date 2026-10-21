import { session } from 'electron';

export interface CookieLogger {
  warn(meta: Record<string, unknown>, msg: string): void;
}

/** Remove stale loopback auth cookies left by previous ephemeral-token runs.
 *  Prevents the cookie header on 127.0.0.1 from exceeding Node's maxHeaderSize (431 error). */
export async function cleanupStaleLoopbackCookies(logger?: CookieLogger): Promise<number> {
  let removedCount = 0;
  try {
    for (const domain of ['127.0.0.1', 'localhost']) {
      const cookies = await session.defaultSession.cookies.get({ domain });
      for (const c of cookies) {
        if (c.name.startsWith('dsh-auth-')) {
          const scheme = 'http://' + domain + (c.path || '/');
          await session.defaultSession.cookies.remove(scheme, c.name);
          removedCount++;
        }
      }
    }
  } catch (err) {
    logger?.warn({ err }, 'failed to cleanup stale loopback cookies');
  }
  return removedCount;
}
