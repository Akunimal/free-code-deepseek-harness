package admin

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"opencode2api/internal/config"
	"opencode2api/internal/httpx"
)

const adminCookieName = "opencode2api_session"

type adminSession struct {
	Username    string
	AuthVersion string
	CSRF        string
	Expires     time.Time
}

type loginWindow struct {
	Started time.Time
	Count   int
}

func (a *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	client := clientIP(r)
	if !a.allowLogin(client) {
		writeAdminError(w, http.StatusTooManyRequests, "rate_limited", "too many login attempts; try again later")
		return
	}
	var input struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := decodeAdminJSON(w, r, &input); err != nil {
		writeAdminError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	cfg := a.manager.Config()
	usernameMatch := len(input.Username) == len(cfg.WebUI.Username) && subtle.ConstantTimeCompare([]byte(input.Username), []byte(cfg.WebUI.Username)) == 1
	passwordMatch := config.VerifyPassword(cfg.WebUI.PasswordHash, input.Password)
	if !usernameMatch || !passwordMatch {
		a.recordLoginFailure(client)
		a.logger.Warn("admin login failed", "component", "auth", "event", "login_failed", "client_ip", client)
		writeAdminError(w, http.StatusUnauthorized, "invalid_credentials", "invalid username or password")
		return
	}
	token, err := randomToken(32)
	if err != nil {
		writeAdminError(w, http.StatusInternalServerError, "internal_error", "could not create session")
		return
	}
	csrf, err := randomToken(24)
	if err != nil {
		writeAdminError(w, http.StatusInternalServerError, "internal_error", "could not create session")
		return
	}
	expires := time.Now().Add(time.Duration(cfg.WebUI.SessionTTLMinutes) * time.Minute)
	a.mu.Lock()
	delete(a.attempts, client)
	a.cleanupSessionsLocked(time.Now())
	if len(a.sessions) >= 2048 {
		a.removeEarliestSessionLocked()
	}
	a.sessions[tokenDigest(token)] = adminSession{Username: cfg.WebUI.Username, AuthVersion: config.Fingerprint(cfg.WebUI.PasswordHash), CSRF: csrf, Expires: expires}
	a.mu.Unlock()
	http.SetCookie(w, &http.Cookie{Name: adminCookieName, Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode, Expires: expires, MaxAge: int(time.Until(expires).Seconds()), Secure: requestIsSecure(r)})
	w.Header().Set("Cache-Control", "no-store")
	a.logger.Info("admin login succeeded", "component", "auth", "event", "login_succeeded", "client_ip", client)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"username": cfg.WebUI.Username, "csrf_token": csrf, "expires_at": expires.UTC()})
}

func (a *Server) handleSession(w http.ResponseWriter, r *http.Request) {
	session, _ := sessionFromContext(r)
	w.Header().Set("Cache-Control", "no-store")
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"authenticated": true, "username": session.Username, "csrf_token": session.CSRF, "expires_at": session.Expires.UTC()})
}

func (a *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	cookie, _ := r.Cookie(adminCookieName)
	if cookie != nil {
		a.mu.Lock()
		delete(a.sessions, tokenDigest(cookie.Value))
		a.mu.Unlock()
	}
	http.SetCookie(w, &http.Cookie{Name: adminCookieName, Value: "", Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: -1, Secure: requestIsSecure(r)})
	w.WriteHeader(http.StatusNoContent)
}

type sessionContextKey struct{}

func (a *Server) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(adminCookieName)
		if err != nil || cookie.Value == "" {
			writeAdminError(w, http.StatusUnauthorized, "authentication_required", "login required")
			return
		}
		now := time.Now()
		a.mu.Lock()
		session, ok := a.sessions[tokenDigest(cookie.Value)]
		if ok && now.After(session.Expires) {
			delete(a.sessions, tokenDigest(cookie.Value))
			ok = false
		}
		a.mu.Unlock()
		if !ok {
			writeAdminError(w, http.StatusUnauthorized, "authentication_required", "session expired or invalid")
			return
		}
		cfg := a.manager.Config()
		if session.Username != cfg.WebUI.Username || session.AuthVersion != config.Fingerprint(cfg.WebUI.PasswordHash) {
			writeAdminError(w, http.StatusUnauthorized, "authentication_required", "session is no longer valid")
			return
		}
		r = r.WithContext(context.WithValue(r.Context(), sessionContextKey{}, session))
		next.ServeHTTP(w, r)
	})
}

func sessionFromContext(r *http.Request) (adminSession, bool) {
	session, ok := r.Context().Value(sessionContextKey{}).(adminSession)
	return session, ok
}

func (a *Server) csrf(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		session, ok := sessionFromContext(r)
		if !ok || subtle.ConstantTimeCompare([]byte(r.Header.Get("X-CSRF-Token")), []byte(session.CSRF)) != 1 {
			writeAdminError(w, http.StatusForbidden, "csrf_failed", "invalid CSRF token")
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" {
			parsed, err := url.Parse(origin)
			expectedScheme := "http"
			if requestIsSecure(r) {
				expectedScheme = "https"
			}
			if err != nil || !strings.EqualFold(parsed.Host, r.Host) || !strings.EqualFold(parsed.Scheme, expectedScheme) {
				writeAdminError(w, http.StatusForbidden, "origin_failed", "request origin does not match this server")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (a *Server) handleAccount(w http.ResponseWriter, r *http.Request) {
	var input struct {
		CurrentPassword string `json:"current_password"`
		Username        string `json:"username"`
		NewPassword     string `json:"new_password"`
	}
	if err := decodeAdminJSON(w, r, &input); err != nil {
		writeAdminError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	cfg := a.manager.Config()
	if !config.VerifyPassword(cfg.WebUI.PasswordHash, input.CurrentPassword) {
		writeAdminError(w, http.StatusForbidden, "verification_failed", "current password is incorrect")
		return
	}
	if username := strings.TrimSpace(input.Username); username != "" {
		cfg.WebUI.Username = username
	}
	if input.NewPassword != "" {
		cfg.WebUI.Password = input.NewPassword
	}
	if _, err := a.manager.Apply(cfg, true); err != nil {
		writeAdminError(w, http.StatusBadRequest, "account_update_failed", err.Error())
		return
	}
	a.mu.Lock()
	a.sessions = make(map[string]adminSession)
	a.mu.Unlock()
	http.SetCookie(w, &http.Cookie{Name: adminCookieName, Value: "", Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: -1, Secure: requestIsSecure(r)})
	a.logger.Info("admin account updated", "component", "auth", "event", "account_updated", "client_ip", clientIP(r))
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"updated": true, "reauthenticate": true})
}

func (a *Server) allowLogin(client string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	now := time.Now()
	if len(a.attempts) > 1024 {
		for address, candidate := range a.attempts {
			if now.Sub(candidate.Started) > 5*time.Minute {
				delete(a.attempts, address)
			}
		}
	}
	if _, exists := a.attempts[client]; !exists && len(a.attempts) >= 4096 {
		return false
	}
	window := a.attempts[client]
	if window.Started.IsZero() || now.Sub(window.Started) > 5*time.Minute {
		return true
	}
	return window.Count < 5
}

func (a *Server) recordLoginFailure(client string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	now := time.Now()
	window := a.attempts[client]
	if window.Started.IsZero() || now.Sub(window.Started) > 5*time.Minute {
		window = loginWindow{Started: now}
	}
	window.Count++
	a.attempts[client] = window
}

func (a *Server) cleanupSessionsLocked(now time.Time) {
	for token, session := range a.sessions {
		if now.After(session.Expires) {
			delete(a.sessions, token)
		}
	}
}

func (a *Server) removeEarliestSessionLocked() {
	var earliestToken string
	var earliest time.Time
	for token, session := range a.sessions {
		if earliestToken == "" || session.Expires.Before(earliest) {
			earliestToken, earliest = token, session.Expires
		}
	}
	if earliestToken != "" {
		delete(a.sessions, earliestToken)
	}
}

func randomToken(length int) (string, error) {
	data := make([]byte, length)
	if _, err := rand.Read(data); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(data), nil
}

func tokenDigest(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

func requestIsSecure(r *http.Request) bool {
	if r == nil {
		return false
	}
	return r.TLS != nil || strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")), "https")
}
