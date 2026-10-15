package identity

import (
	"net/http/httptest"
	"regexp"
	"testing"
)

var canonicalSessionIDPattern = regexp.MustCompile(`^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$`)

func TestDeriveRequestIDsUsesStableCanonicalSessionForForeignIdentity(t *testing.T) {
	body := map[string]any{"conversation_id": "session-bb247373-2f7c-4f2f-b0ec-f3b17897c7d0"}
	request := httptest.NewRequest("POST", "/v1/responses", nil)
	first := DeriveRequestIDs(request, body)
	second := DeriveRequestIDs(request, body)

	if !canonicalSessionIDPattern.MatchString(first.Session) {
		t.Fatalf("session ID is not OpenCode canonical: %q", first.Session)
	}
	if first.Session != second.Session {
		t.Fatalf("same conversation produced unstable sessions: %q and %q", first.Session, second.Session)
	}
	if first.Request == second.Request {
		t.Fatalf("independent requests reused request ID %q", first.Request)
	}
}

func TestDeriveRequestIDsPreservesCanonicalOpenCodeSession(t *testing.T) {
	want := "ses_012345678ffeabcdefghijklmn"
	request := httptest.NewRequest("POST", "/v1/responses", nil)
	request.Header.Set("x-opencode-session", want)

	got := DeriveRequestIDs(request, map[string]any{}).Session
	if got != want {
		t.Fatalf("canonical OpenCode session changed: got %q, want %q", got, want)
	}
}
