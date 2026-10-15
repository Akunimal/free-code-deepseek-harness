package gateway

import (
	"context"
	"io"
	"net"
	"net/http"
	"testing"
	"time"
)

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

func TestAnonymousPoolDoesNotCoolRoutesForUpstreamAccessRejections(t *testing.T) {
	for _, status := range []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden} {
		status := status
		t.Run(http.StatusText(status), func(t *testing.T) {
			direct := &proxyTransport{name: "direct"}
			tor := &proxyTransport{name: "socks5://127.0.0.1:9050"}
			direct.healthy.Store(true)
			tor.healthy.Store(true)
			directNode := &anonymousNode{proxy: direct}
			torNode := &anonymousNode{proxy: tor}
			pool := &anonymousPool{
				nodes:    []*anonymousNode{directNode, torNode},
				cooldown: time.Minute,
			}

			for attempt := 0; attempt < 5; attempt++ {
				for _, node := range pool.nodes {
					pool.MarkFailure(node, &http.Response{StatusCode: status}, nil)
				}
			}

			for _, node := range pool.nodes {
				if got := node.failures.Load(); got != 0 {
					t.Errorf("HTTP %d counted as proxy failure %d times; want 0", status, got)
				}
				if got := node.cooldownUntil.Load(); got != 0 {
					t.Errorf("HTTP %d set proxy cooldown to %d; want none", status, got)
				}
			}

			cursor := pool.CursorFor("session")
			if got := cursor.Next(); got != directNode {
				t.Fatalf("first route after repeated upstream HTTP %d = %v, want direct", status, got)
			}
			if got := cursor.Next(); got != torNode {
				t.Fatalf("fallback after repeated upstream HTTP %d = %v, want Tor", status, got)
			}
		})
	}
}

func TestAnonymousPoolStillCoolsRateLimitedAndUnavailableRoutes(t *testing.T) {
	for _, status := range []int{http.StatusTooManyRequests, http.StatusBadGateway} {
		proxy := &proxyTransport{name: "direct"}
		proxy.healthy.Store(true)
		node := &anonymousNode{proxy: proxy}
		pool := &anonymousPool{
			nodes:    []*anonymousNode{node},
			cooldown: time.Minute,
		}

		pool.MarkFailure(node, &http.Response{StatusCode: status, Header: make(http.Header)}, nil)

		if got := node.failures.Load(); got != 1 {
			t.Errorf("HTTP %d failure count = %d, want 1", status, got)
		}
		cursor := pool.CursorFor("")
		if got := cursor.Next(); got != nil {
			t.Errorf("HTTP %d route remained selectable during cooldown: %+v", status, got)
		}
	}
}

func TestFailedLoopbackTorProxyRetriesSoonAfterManualRecovery(t *testing.T) {
	if localSocksHealthInterval > 15*time.Second {
		t.Fatalf("unhealthy loopback Tor proxy is retried every %s; want <= 15s for manual Tor recovery", localSocksHealthInterval)
	}
}

func TestLocalSocksHealthProbeUsesOnlyTheSOCKS5Greeting(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	serverResult := make(chan error, 1)
	go func() {
		conn, acceptErr := listener.Accept()
		if acceptErr != nil {
			serverResult <- acceptErr
			return
		}
		defer conn.Close()
		greeting := make([]byte, 3)
		if _, readErr := io.ReadFull(conn, greeting); readErr != nil {
			serverResult <- readErr
			return
		}
		if string(greeting) != string([]byte{0x05, 0x01, 0x00}) {
			serverResult <- &unexpectedGreeting{got: greeting}
			return
		}
		_, writeErr := conn.Write([]byte{0x05, 0x00})
		serverResult <- writeErr
	}()

	proxy := &proxyTransport{name: "socks5://" + listener.Addr().String(), localSocks: true}
	results := (&transportPool{items: []*proxyTransport{proxy}}).CheckLocalSocksHealth(context.Background(), time.Second)
	if len(results) != 1 || results[0].err != nil {
		t.Fatalf("local SOCKS probe failed: %+v", results)
	}
	if err := <-serverResult; err != nil {
		t.Fatal(err)
	}
}

type unexpectedGreeting struct{ got []byte }

func (e *unexpectedGreeting) Error() string { return "unexpected SOCKS5 greeting" }

func TestLoopbackTorRouteRecoversAfterHealthCheck(t *testing.T) {
	direct := &proxyTransport{name: "direct"}
	tor := &proxyTransport{name: "socks5://127.0.0.1:9050", localSocks: true}
	direct.healthy.Store(true)
	tor.healthy.Store(false)
	pool := &anonymousPool{nodes: []*anonymousNode{{proxy: direct}, {proxy: tor}}}

	firstRequest := pool.CursorFor("")
	if got := firstRequest.Next(); got == nil || got.proxy != direct {
		t.Fatalf("first route before Tor recovers = %v, want direct", got)
	}
	if got := firstRequest.Next(); got != nil {
		t.Fatalf("unhealthy Tor should be skipped until its local probe recovers: %+v", got)
	}
	tor.healthy.Store(true) // equivalent to a successful periodic SOCKS5 greeting

	secondRequest := pool.CursorFor("")
	if got := secondRequest.Next(); got == nil || got.proxy != direct {
		t.Fatalf("first route after Tor recovers = %v, want direct", got)
	}
	if got := secondRequest.Next(); got == nil || got.proxy != tor {
		t.Fatalf("fallback after Tor recovers = %v, want Tor", got)
	}
}

func TestOnlyLoopbackSOCKSURLsUseFastLocalHealthChecks(t *testing.T) {
	if !isLocalSocksProxy("socks5://127.0.0.1:9050") {
		t.Fatal("loopback SOCKS proxy should use fast local health checks")
	}
	if !isLocalSocksProxy("socks5h://[::1]:9050") {
		t.Fatal("IPv6 loopback SOCKS proxy should use fast local health checks")
	}
	if isLocalSocksProxy("socks5://proxy.example:9050") {
		t.Fatal("remote proxy must keep the normal remote health-check cadence")
	}
}
