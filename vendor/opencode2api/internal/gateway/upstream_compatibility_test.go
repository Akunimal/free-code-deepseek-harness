package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"opencode2api/internal/config"
	"opencode2api/internal/identity"
	wire "opencode2api/internal/protocol"
)

func TestAnonymousCatalogCompletesViaCurrentInferenceOrigin(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/inference/openai/v1/chat/completions" || r.Header.Get("x-opencode-session-id") == "" || r.Header.Get("x-opencode-request") != "" {
			t.Errorf("obsolete inference request: path=%s session-id-present=%t legacy-header-present=%t", r.URL.Path, r.Header.Get("x-opencode-session-id") != "", r.Header.Get("x-opencode-request") != "")
			http.Error(w, "fixture rejects obsolete contract", http.StatusForbidden)
			return
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if body["stream"] != true {
			t.Error("anonymous inference must use the stable streaming contract")
		}
		w.Header().Set("Content-Type", "text/event-stream")
		io.WriteString(w, "data: {\"id\":\"fixture\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"verified completion\"}}]}\n\ndata: {\"id\":\"fixture\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n")
	}))
	defer upstream.Close()
	configPath := filepath.Join(t.TempDir(), "config.json")
	configBytes, _ := json.Marshal(map[string]any{
		"server_keys": []string{"fixture"}, "anonymous": true, "proxies": []string{"direct"}, "prefer": "zen",
		"upstream": map[string]string{"zen": upstream.URL + "/legacy", "anonymous": upstream.URL + "/inference"},
	})
	if err := os.WriteFile(configPath, configBytes, 0600); err != nil {
		t.Fatal(err)
	}
	cfg, err := config.Load(configPath)
	if err != nil {
		t.Fatal(err)
	}
	g, err := New(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)), nil)
	if err != nil {
		t.Fatal(err)
	}
	ids := []string{"step-5-preview-free", "cat-jam-free"}
	g.catalog.ReplaceWithCapabilities(ids, nil, map[config.Tier]map[string]wire.Protocol{config.TierZen: {ids[0]: wire.Chat, ids[1]: wire.Chat}}, nil, nil)
	for _, model := range ids {
		body, _ := json.Marshal(map[string]any{"model": model, "messages": []map[string]string{{"role": "user", "content": "fixture only"}}})
		r := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", bytes.NewReader(body))
		r.Header.Set("Authorization", "Bearer fixture")
		w := httptest.NewRecorder()
		g.Handler().ServeHTTP(w, r)
		if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "verified completion") {
			t.Fatalf("listed model %s failed current-origin inference: HTTP %d %s", model, w.Code, w.Body.String())
		}
	}
}

// Lock the stable v1.4 upstream boundary separately from our downstream API.
func TestCurrentAnonymousUpstreamContract(t *testing.T) {
	ids := identity.RequestIDs{Session: "ses_012345678ffeabcdefghijklmn", Request: "req_local_only", Project: "prj_local_only"}
	req, err := newUpstreamRequest(context.Background(), "https://opencode.ai/inference", wire.Chat, []byte(`{}`), ids, "public")
	if err != nil {
		t.Fatal(err)
	}
	if got := req.Header.Get("x-opencode-session-id"); got != ids.Session {
		t.Errorf("current upstream session header = %q", got)
	}
	if got := req.Header.Get("x-opencode-request"); got != "" {
		t.Errorf("obsolete tracing header leaked upstream: %q", got)
	}
	if got := req.Header.Get("x-opencode-project"); strings.HasPrefix(got, "prj_") {
		t.Errorf("local project identifier leaked upstream: %q", got)
	}
	if got := req.Header.Get("User-Agent"); !strings.HasPrefix(got, "opencode/latest/") {
		t.Errorf("obsolete upstream client contract: %q", got)
	}
	if req.Header.Get("Authorization") != "Bearer public" {
		t.Error("public upstream credential is not preserved")
	}
	if req.Method != http.MethodPost {
		t.Error("inference must remain POST")
	}
}

func TestCurrentAnonymousEndpointIsSeparateFromCatalogOrigin(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(path, []byte(`{"anonymous":true,"server_keys":["fixture"],"upstream":{"zen":"http://127.0.0.1:43210/catalog","anonymous":"http://127.0.0.1:43210/inference"}}`), 0600); err != nil {
		t.Fatal(err)
	}
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatalf("current stable upstream endpoint config rejected: %v", err)
	}
	_ = cfg
}

func TestInferenceProtocolNamespaces(t *testing.T) {
	for _, c := range []struct {
		base     string
		protocol wire.Protocol
		key      string
		path     string
	}{
		{"https://opencode.ai/inference", wire.Chat, "public", "/inference/openai/v1/chat/completions"},
		{"https://opencode.ai/inference/", wire.Responses, "public", "/inference/openai/v1/responses"},
		{"https://opencode.ai/inference", wire.Anthropic, "public", "/inference/anthropic/v1/messages"},
		{"https://opencode.ai/zen", wire.Chat, "paid-fixture", "/zen/v1/chat/completions"},
		{"http://127.0.0.1:1234/custom", wire.Chat, "public", "/custom/v1/chat/completions"},
		{"https://opencode.ai/inference/openai", wire.Chat, "public", "/inference/openai/v1/chat/completions"},
	} {
		req, err := newUpstreamRequest(context.Background(), c.base, c.protocol, []byte("{}"), identity.RequestIDs{}, c.key)
		if err != nil {
			t.Fatal(err)
		}
		if req.URL.Path != c.path {
			t.Errorf("%s %s: path=%s want=%s", c.base, c.protocol, req.URL.Path, c.path)
		}
	}
}
