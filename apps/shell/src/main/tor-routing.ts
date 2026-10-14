/**
 * Keep the direct-first Tor candidate in the gateway configuration after the
 * manager has allocated stable ports, even if the first Tor bootstrap fails.
 * This lets an explicit retry recover the same route without restarting DSH.
 */
export function resolveTorProxyCandidates(proxyUrl: string | null | undefined): string[] {
  return proxyUrl ? ['direct', proxyUrl] : ['direct'];
}
