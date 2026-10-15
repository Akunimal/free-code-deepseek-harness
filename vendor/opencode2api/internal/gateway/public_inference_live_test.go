package gateway

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"opencode2api/internal/identity"
	wire "opencode2api/internal/protocol"
)

// Explicit opt-in only: two public, free requests maximum; no retries, proxies,
// ambient credentials or redirects. Ordinary unit/release suites never send these.
func TestPublicInferenceLive(t *testing.T) {
	if os.Getenv("FREECODE_LIVE_OPENCODE_TEST") != "1" {
		t.Skip("requires explicit authorization for two public inference requests")
	}
	client := &http.Client{Timeout: 120 * time.Second, Transport: &http.Transport{}, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	defer client.CloseIdleConnections()
	successful := false
	for _, base := range []string{"https://opencode.ai/inference", "https://opencode.ai/inference/openai"} {
		body := []byte(`{"model":"step-5-preview-free","messages":[{"role":"user","content":"Reply only OK"}],"max_tokens":16}`)
		ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
		req, err := newUpstreamRequest(ctx, base, wire.Chat, prepareAnonymousBody(body, wire.Chat), identity.RequestIDs{Session: identity.CanonicalSessionID("freecode-public-compatibility-check"), Project: "freecode-public-compatibility-check"}, "public")
		if err != nil {
			cancel()
			t.Fatal(err)
		}
		start := time.Now()
		resp, err := client.Do(req)
		if err != nil {
			cancel()
			t.Logf("path=%s transport=%v elapsed=%s", req.URL.Path, err, time.Since(start))
			continue
		}
		data, readErr := io.ReadAll(io.LimitReader(resp.Body, 1024*1024+1))
		resp.Body.Close()
		cancel()
		if readErr != nil || len(data) > 1024*1024 {
			t.Logf("path=%s HTTP=%d incomplete body", req.URL.Path, resp.StatusCode)
			continue
		}
		if resp.StatusCode != 200 {
			message := strings.TrimSpace(string(data))
			if len(message) > 240 {
				message = message[:240]
			}
			t.Logf("path=%s HTTP=%d elapsed=%s response=%q", req.URL.Path, resp.StatusCode, time.Since(start), message)
			continue
		}
		if strings.Contains(resp.Header.Get("Content-Type"), "text/event-stream") {
			data, err = wire.CollapseStream(strings.NewReader(string(data)), wire.Chat, "step-5-preview-free")
		}
		var result struct {
			Choices []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			} `json:"choices"`
		}
		decodeErr := json.Unmarshal(data, &result)
		nonempty := err == nil && decodeErr == nil && len(result.Choices) > 0 && strings.TrimSpace(result.Choices[0].Message.Content) != ""
		t.Logf("path=%s HTTP=200 nonempty_completion=%t elapsed=%s", req.URL.Path, nonempty, time.Since(start))
		successful = successful || nonempty
	}
	if !successful {
		t.Fatal("live completion was not verified; see transport/HTTP evidence above")
	}
}
