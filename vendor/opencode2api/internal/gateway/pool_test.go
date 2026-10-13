package gateway

import "testing"

func TestAnonymousPoolStartsDirectThenFallsThroughToTor(t *testing.T) {
	direct := &proxyTransport{name: "direct"}
	tor := &proxyTransport{name: "socks5://127.0.0.1:9050"}
	direct.healthy.Store(true)
	tor.healthy.Store(true)
	pool := &anonymousPool{nodes: []*anonymousNode{{proxy: direct}, {proxy: tor}}}

	for _, affinity := range []string{"", "a", "b", "session-0", "session-1", "session-2", "session-3", "session-4", "session-5"} {
		firstRequest := pool.CursorFor(affinity)
		if got := firstRequest.Next(); got == nil || got.proxy != direct {
			t.Fatalf("first anonymous route for affinity %q = %v, want direct", affinity, got)
		}
		if got := firstRequest.Next(); got == nil || got.proxy != tor {
			t.Fatalf("fallback anonymous route for affinity %q = %v, want Tor", affinity, got)
		}
		if got := firstRequest.Next(); got != nil {
			t.Fatalf("cursor for affinity %q visited more than its configured routes: %+v", affinity, got)
		}
	}
}
