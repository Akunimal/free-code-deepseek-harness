// Package protocol translates Chat, Responses, and Anthropic payloads and streams.
package protocol

type Protocol string

const (
	Chat      Protocol = "chat"
	Responses Protocol = "responses"
	Anthropic Protocol = "anthropic"
)

func Valid(p Protocol) bool {
	return p == Chat || p == Responses || p == Anthropic
}

func Path(protocol Protocol) string {
	switch protocol {
	case Responses:
		return "/v1/responses"
	case Anthropic:
		return "/v1/messages"
	default:
		return "/v1/chat/completions"
	}
}
