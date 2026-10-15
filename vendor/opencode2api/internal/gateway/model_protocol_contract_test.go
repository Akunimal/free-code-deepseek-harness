package gateway

import (
	"bytes"
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
	"opencode2api/internal/models"
	wire "opencode2api/internal/protocol"
	"opencode2api/internal/rotation"
)

const unsupportedProtocolMessage = "the model uses an upstream protocol that opencode2api does not expose"

// The public catalog and inference endpoint must share one protocol-capability
// decision. Otherwise a model can appear selectable in /v1/models while every
// chat request deterministically fails before reaching an upstream.
func TestModelsDoNotAdvertiseChatModelsRejectedByProtocolDispatch(t *testing.T) {
	rotationManager, err := rotation.New("", config.RotationConfig{})
	if err != nil {
		t.Fatal(err)
	}
	const localKey = "test-local-gateway-key"
	const supportedModel = "deepseek-chat-v3-valid"
	const unsupportedModel = "deepseek-legacy-unexposed"
	g := &Gateway{
		cfg:      config.Config{ServerKeys: []string{localKey}, ZenKeys: []string{"unused-test-key"}},
		logger:   slog.Default(),
		rotation: rotationManager,
		zenNodes: &nodePool{nodes: []*upstreamNode{{key: "unused-test-key"}}},
		goNodes:  &nodePool{},
		catalog:  models.NewCatalog(config.TierZen, nil),
	}
	g.catalog.ReplaceWithCapabilities(
		[]string{supportedModel, unsupportedModel},
		nil,
		map[config.Tier]map[string]wire.Protocol{
			config.TierZen: {supportedModel: wire.Chat},
		},
		map[config.Tier]map[string]bool{
			config.TierZen: {unsupportedModel: true},
		},
		nil,
	)
	handler := g.Handler()

	modelsResponse := httptest.NewRecorder()
	modelsRequest := httptest.NewRequest(http.MethodGet, "/v1/models", nil)
	modelsRequest.Header.Set("Authorization", "Bearer "+localKey)
	handler.ServeHTTP(modelsResponse, modelsRequest)
	if modelsResponse.Code != http.StatusOK {
		t.Fatalf("GET /v1/models status = %d, want %d: %s", modelsResponse.Code, http.StatusOK, modelsResponse.Body.String())
	}
	var listing struct {
		Data []struct {
			ID        string   `json:"id"`
			Protocol  string   `json:"native_protocol"`
			Endpoints []string `json:"supported_endpoints"`
		} `json:"data"`
	}
	if err := json.Unmarshal(modelsResponse.Body.Bytes(), &listing); err != nil {
		t.Fatalf("decode GET /v1/models: %v", err)
	}
	if len(listing.Data) != 1 || listing.Data[0].ID != supportedModel {
		t.Fatalf("GET /v1/models exposed %#v, want only %q", listing.Data, supportedModel)
	}
	if listing.Data[0].Protocol == "" || len(listing.Data[0].Endpoints) == 0 {
		t.Fatalf("listed chat route lacks protocol/endpoints metadata: %#v", listing.Data[0])
	}

	requestBody, err := json.Marshal(map[string]any{
		"model":    unsupportedModel,
		"messages": []map[string]string{{"role": "user", "content": "test"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	inferenceResponse := httptest.NewRecorder()
	inferenceRequest := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", bytes.NewReader(requestBody))
	inferenceRequest.Header.Set("Authorization", "Bearer "+localKey)
	handler.ServeHTTP(inferenceResponse, inferenceRequest)
	if inferenceResponse.Code != http.StatusBadRequest {
		t.Fatalf("unsupported model status = %d, want %d: %s", inferenceResponse.Code, http.StatusBadRequest, inferenceResponse.Body.String())
	}
	var apiError struct {
		Error struct {
			Message string  `json:"message"`
			Type    string  `json:"type"`
			Param   *string `json:"param"`
			Code    *string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(inferenceResponse.Body.Bytes(), &apiError); err != nil {
		t.Fatalf("decode unsupported-protocol response: %v", err)
	}
	if apiError.Error.Message != unsupportedProtocolMessage || apiError.Error.Type != "invalid_request_error" || apiError.Error.Param != nil || apiError.Error.Code != nil {
		t.Fatalf("unsupported-protocol response = %#v, want exact OpenAI error envelope", apiError.Error)
	}
}

func TestListedChatModelCompletesInferenceAgainstLocalUpstream(t *testing.T) {
	const localKey = "test-local-gateway-key"
	const upstreamKey = "fixture-upstream-key"
	const model = "deepseek-chat-v3-fixture"
	upstreamCalls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		if r.URL.Path != "/v1/chat/completions" {
			t.Errorf("upstream path = %q, want /v1/chat/completions", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer "+upstreamKey {
			t.Errorf("upstream authorization = %q, want fixture key", got)
		}
		var request struct {
			Model  string `json:"model"`
			Stream bool   `json:"stream"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Errorf("decode upstream request: %v", err)
		}
		if request.Model != model {
			t.Errorf("upstream model = %q, want %q", request.Model, model)
		}
		if request.Stream {
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = io.WriteString(w, "data: {\"id\":\"cmpl-fixture\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"deepseek-chat-v3-fixture\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"stream fixture\"},\"finish_reason\":null}]}\n\ndata: {\"id\":\"cmpl-fixture\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"deepseek-chat-v3-fixture\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"id":"cmpl-fixture","object":"chat.completion","created":1,"model":"deepseek-chat-v3-fixture","choices":[{"index":0,"message":{"role":"assistant","content":"fixture response"},"finish_reason":"stop"}]}`)
	}))
	defer upstream.Close()

	configPath := filepath.Join(t.TempDir(), "config.json")
	configJSON, err := json.Marshal(map[string]any{
		"server_keys": []string{localKey},
		"zen_keys":    []string{upstreamKey},
		"upstream":    map[string]string{"zen": upstream.URL},
		"prefer":      "zen",
		"proxies":     []string{"direct"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(configPath, configJSON, 0o600); err != nil {
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
	g.catalog.ReplaceWithCapabilities(
		[]string{model}, nil,
		map[config.Tier]map[string]wire.Protocol{config.TierZen: {model: wire.Chat}},
		nil, nil,
	)
	handler := g.Handler()

	modelsResponse := httptest.NewRecorder()
	modelsRequest := httptest.NewRequest(http.MethodGet, "/v1/models", nil)
	modelsRequest.Header.Set("Authorization", "Bearer "+localKey)
	handler.ServeHTTP(modelsResponse, modelsRequest)
	if modelsResponse.Code != http.StatusOK {
		t.Fatalf("GET /v1/models status = %d: %s", modelsResponse.Code, modelsResponse.Body.String())
	}
	var listing struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(modelsResponse.Body.Bytes(), &listing); err != nil {
		t.Fatalf("decode GET /v1/models: %v", err)
	}
	if len(listing.Data) != 1 || listing.Data[0].ID != model {
		t.Fatalf("GET /v1/models returned %#v, want listed model %q", listing.Data, model)
	}

	requestBody := []byte(`{"model":"deepseek-chat-v3-fixture","messages":[{"role":"user","content":"hello"}],"stream":false}`)
	inferenceResponse := httptest.NewRecorder()
	inferenceRequest := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", bytes.NewReader(requestBody))
	inferenceRequest.Header.Set("Authorization", "Bearer "+localKey)
	handler.ServeHTTP(inferenceResponse, inferenceRequest)
	if inferenceResponse.Code != http.StatusOK {
		t.Fatalf("POST /v1/chat/completions status = %d: %s", inferenceResponse.Code, inferenceResponse.Body.String())
	}
	var completion struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(inferenceResponse.Body.Bytes(), &completion); err != nil {
		t.Fatalf("decode chat completion: %v", err)
	}
	if len(completion.Choices) != 1 || completion.Choices[0].Message.Content != "fixture response" {
		t.Fatalf("chat completion = %#v, want fixture response", completion)
	}
	streamResponse := httptest.NewRecorder()
	streamRequest := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", bytes.NewReader(
		[]byte(`{"model":"deepseek-chat-v3-fixture","messages":[{"role":"user","content":"hello"}],"stream":true}`),
	))
	streamRequest.Header.Set("Authorization", "Bearer "+localKey)
	handler.ServeHTTP(streamResponse, streamRequest)
	if streamResponse.Code != http.StatusOK {
		t.Fatalf("streaming POST /v1/chat/completions status = %d: %s", streamResponse.Code, streamResponse.Body.String())
	}
	if !strings.Contains(streamResponse.Header().Get("Content-Type"), "text/event-stream") ||
		!strings.Contains(streamResponse.Body.String(), "stream fixture") ||
		!strings.Contains(streamResponse.Body.String(), "[DONE]") {
		t.Fatalf("streaming chat response missing SSE content: headers=%v body=%q", streamResponse.Header(), streamResponse.Body.String())
	}
	if upstreamCalls != 2 {
		t.Fatalf("local upstream calls = %d, want 2 (one document response and one stream)", upstreamCalls)
	}
}
