// Package httpx provides shared HTTP response and transport helpers.
package httpx

import (
	"encoding/json"
	"fmt"
	"net/http"
)

func WriteJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	WriteJSONStatus(w, status, value)
}

func WriteJSONStatus(w http.ResponseWriter, status int, value any) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func WriteSSE(w http.ResponseWriter, event string, id uint64, value any) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	if id > 0 {
		_, _ = fmt.Fprintf(w, "id: %d\n", id)
	}
	if event != "" {
		_, _ = fmt.Fprintf(w, "event: %s\n", event)
	}
	_, err = fmt.Fprintf(w, "data: %s\n\n", data)
	return err
}
