// Package protocol translates Chat, Responses, and Anthropic payloads and
// streams, and carries the opaque System One decision payloads.
package protocol

type Protocol string

const (
	Chat      Protocol = "chat"
	Responses Protocol = "responses"
	Anthropic Protocol = "anthropic"
	// SystemOne is OpenCode Zen's structured decision endpoint. A request pairs
	// a free-form state with typed questions and the reply carries typed
	// answers, so the payload shares no shape with the chat/responses bridge and
	// is forwarded as-is.
	SystemOne Protocol = "systemone"
)

func Valid(p Protocol) bool {
	return p == Chat || p == Responses || p == Anthropic || p == SystemOne
}

func Path(protocol Protocol) string {
	switch protocol {
	case Responses:
		return "/v1/responses"
	case Anthropic:
		return "/v1/messages"
	case SystemOne:
		return "/v1/systemone"
	default:
		return "/v1/chat/completions"
	}
}
