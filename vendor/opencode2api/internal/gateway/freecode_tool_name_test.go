package gateway

import (
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
	"opencode2api/internal/models"
	wire "opencode2api/internal/protocol"
)

func TestPashGatewayOriginalToolBoundary(t *testing.T) {
	for _, rotation := range []bool{false, true} {
		for _, stream := range []bool{false, true} {
			for _, declared := range []string{"bash", "read", "pash"} {
				t.Run(strings.Join([]string{map[bool]string{true: "rotation", false: "regular"}[rotation], map[bool]string{true: "stream", false: "document"}[stream], declared}, "/"), func(t *testing.T) {
					calls := 0
					upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
						calls++
						var input map[string]any
						if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
							t.Error(err)
						}
						if input["stream"] == true {
							w.Header().Set("Content-Type", "text/event-stream")
							io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_keep\",\"type\":\"function\",\"function\":{\"name\":\"pash\",\"arguments\":\"{}\"}}]}}]}\n\ndata: {\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"tool_calls\"}]}\n\ndata: [DONE]\n\n")
						} else {
							io.WriteString(w, `{"choices":[{"message":{"tool_calls":[{"id":"call_keep","type":"function","function":{"name":"pash","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}`)
						}
					}))
					defer upstream.Close()
					path := filepath.Join(t.TempDir(), "config.json")
					data, _ := json.Marshal(map[string]any{"server_keys": []string{"fixture"}, "zen_keys": []string{"fixture"}, "go_keys": []string{"fixture"}, "upstream": map[string]any{"zen": upstream.URL, "go": upstream.URL}, "prefer": "zen", "proxies": []string{"direct"}})
					if err := os.WriteFile(path, data, 0600); err != nil {
						t.Fatal(err)
					}
					cfg, err := config.Load(path)
					if err != nil {
						t.Fatal(err)
					}
					g, err := New(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)), nil)
					if err != nil {
						t.Fatal(err)
					}
					g.catalog.ReplaceWithCapabilities([]string{"fixture"}, []string{"fixture"}, map[config.Tier]map[string]wire.Protocol{config.TierZen: {"fixture": wire.Chat}, config.TierGo: {"fixture": wire.Chat}}, nil, nil)
					payload := map[string]any{"model": "fixture", "stream": stream, "messages": []any{map[string]any{"role": "user", "content": "test"}}, "tools": []any{map[string]any{"type": "function", "function": map[string]any{"name": declared, "parameters": map[string]any{"type": "object"}}}}}
					body, _ := json.Marshal(payload)
					request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(string(body)))
					output := httptest.NewRecorder()
					if rotation {
						result := g.rotationAttempt(context.Background(), output, request, wire.Chat, payload, "alias", models.Route{ID: "fixture", Tier: config.TierGo, Protocol: wire.Chat}, identity.RequestIDs{Request: "test", Session: "test"}, 1)
						if result.err != nil || !result.committed {
							t.Fatalf("rotation: %+v", result)
						}
					} else {
						g.handleInference(wire.Chat)(output, request)
					}
					if output.Code != 200 {
						t.Fatalf("HTTP %d: %s", output.Code, output.Body.String())
					}
					want := "pash"
					if declared == "bash" {
						want = "bash"
					}
					if !strings.Contains(output.Body.String(), `"name":"`+want+`"`) {
						t.Fatalf("wanted %s: %s", want, output.Body.String())
					}
					if !strings.Contains(output.Body.String(), "call_keep") {
						t.Fatal("tool identity lost")
					}
					if calls != 1 {
						t.Fatalf("unexpected inference replay: %d", calls)
					}
				})
			}
		}
	}
}
