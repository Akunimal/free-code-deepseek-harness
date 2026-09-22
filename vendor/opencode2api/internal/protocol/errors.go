package protocol

import (
	"net/http"

	"opencode2api/internal/httpx"
)

func WriteError(w http.ResponseWriter, protocol Protocol, status int, message, kind, requestID string) {
	w.Header().Set("Content-Type", "application/json")
	if requestID != "" {
		w.Header().Set("x-request-id", requestID)
	}
	if protocol == Anthropic {
		httpx.WriteJSONStatus(w, status, map[string]any{"type": "error", "error": map[string]any{"type": kind, "message": message}})
		return
	}
	httpx.WriteJSONStatus(w, status, map[string]any{"error": map[string]any{"message": message, "type": kind, "param": nil, "code": nil}})
}
