package protocol

import (
	"strings"

	"opencode2api/internal/jsonutil"
)

const (
	toolReasoningPlaceholder             = "tool call"
	anthropicRedactedThinkingPlaceholder = "[redacted thinking]"
)

var reasoningVendorHints = [...]string{"moonshot", "kimi", "deepseek", "mimo", "xiaomimimo"}

type bridgeBlock struct {
	Kind          string
	Text          string
	Signature     string
	Encrypted     string
	URL           string
	MediaType     string
	Data          string
	FileID        string
	Filename      string
	ID            string
	Name          string
	Arguments     any
	ArgumentsJSON string
	CallID        string
	Result        any
	IsError       bool
}

type bridgeMessage struct {
	Role   string
	Blocks []bridgeBlock
}

type bridgeTool struct {
	Name        string
	Description string
	Schema      any
	Strict      bool
}

type bridgeToolChoice struct {
	Mode string
	Name string
}

type bridgeRequest struct {
	Model       string
	System      []bridgeBlock
	Developer   []bridgeBlock
	Messages    []bridgeMessage
	Tools       []bridgeTool
	ToolChoice  bridgeToolChoice
	Stream      bool
	Temperature any
	TopP        any
	MaxTokens   any
	Stop        any
	Reasoning   any
	Metadata    any
	// Sampling and response-shape knobs are carried across the bridge as
	// opaque values. Each protocol accepts a different shape, so a value that
	// cannot be expressed natively is omitted rather than rejected: dropping a
	// knob silently was the old behavior and it made clients believe (for
	// example) that JSON mode had been honored.
	ResponseFormat    any
	ParallelToolCalls any
	FrequencyPenalty  any
	PresencePenalty   any
	Seed              any
	// Native-fidelity knobs decoded from the client body and re-emitted
	// upstream. prompt_cache_key is the big one: native opencode sends the
	// session-sliced ID here and rides prompt-cache affinity; without it
	// every proxied turn pays full attention over the whole history.
	PromptCacheKey   any
	SafetyIdentifier any
	ServiceTier      any
	Store            any
}

type Usage struct {
	// Input is the total prompt input, including cache reads and writes. This
	// matches OpenAI's prompt_tokens semantics and lets each output encoder
	// split the provider-specific cache fields exactly once.
	Input         int
	Output        int
	Total         int
	Cached        int
	CacheCreation int
	Reasoning     int
}

type bridgeResponse struct {
	ID        string
	Model     string
	Text      string
	Reasoning []bridgeBlock
	Tools     []bridgeBlock
	Stop      string
	Error     string
	Usage     Usage
	Created   int64
}

func ConvertRequest(from, to Protocol, input map[string]any) (map[string]any, error) {
	if from == to {
		return jsonutil.CloneMap(input), nil
	}
	request, err := decodeBridgeRequest(from, input)
	if err != nil {
		return nil, err
	}
	return encodeBridgeRequest(to, request)
}

func normalizeResponsesRole(role string) string {
	if role == "assistant" {
		return "assistant"
	}
	return "user"
}

func schemaOrDefault(value any) any {
	if value == nil {
		return map[string]any{"type": "object", "properties": map[string]any{}}
	}
	return value
}

// chatResponseFormat converts a bridge-level response format into the OpenAI
// Chat Completions shape. Chat and Responses agree on the format type names but
// not on the json_schema nesting: Responses carries name/schema/strict inline,
// while Chat nests them under "json_schema". A value that has no Chat
// equivalent (the "text" type) is omitted instead of failing the request.
func chatResponseFormat(format any) any {
	object, ok := format.(map[string]any)
	if !ok {
		return nil
	}
	switch jsonutil.StringAt(object, "type") {
	case "json_object":
		return map[string]any{"type": "json_object"}
	case "json_schema":
		if nested, ok := object["json_schema"].(map[string]any); ok {
			return map[string]any{"type": "json_schema", "json_schema": nested}
		}
		nested := make(map[string]any, 4)
		for _, key := range []string{"name", "description", "schema", "strict"} {
			if value, exists := object[key]; exists {
				nested[key] = value
			}
		}
		if len(nested) == 0 {
			return nil
		}
		return map[string]any{"type": "json_schema", "json_schema": nested}
	default:
		return nil
	}
}

// responsesTextFormat converts a bridge-level response format into the object
// accepted by the Responses "text.format" field. A Chat-style nested
// json_schema is flattened into the inline shape Responses expects.
func responsesTextFormat(format any) any {
	object, ok := format.(map[string]any)
	if !ok {
		return nil
	}
	switch jsonutil.StringAt(object, "type") {
	case "text", "json_object":
		return object
	case "json_schema":
		if nested, ok := object["json_schema"].(map[string]any); ok {
			flattened := make(map[string]any, len(nested)+1)
			for key, value := range nested {
				flattened[key] = value
			}
			flattened["type"] = "json_schema"
			return flattened
		}
		return object
	default:
		return nil
	}
}

// reasoningEffort projects a bridge-level reasoning value onto the OpenAI Chat
// "reasoning_effort" field.
//
// Precedence matters: a level the client stated explicitly (the "effort" field,
// whether or not it arrived next to a thinking block) wins over anything
// inferred from a thinking budget. Before this, an Anthropic request carrying
// both thinking.budget_tokens and output_config.effort threw the explicit
// effort away and reported the budget bucket instead, so a client asking for
// "max" was served as "high".
func reasoningEffort(value any) any {
	if object, ok := value.(map[string]any); ok {
		if effort, ok := explicitEffort(object); ok {
			return effort
		}
		switch jsonutil.StringAt(object, "type") {
		case "disabled":
			return nil
		case "enabled", "adaptive":
			return effortForThinkingBudget(jsonutil.IntAt(object, "budget_tokens"))
		default:
			return object["type"]
		}
	}
	if effort, ok := normalizeEffortValue(value); ok {
		return effort
	}
	return value
}

// explicitEffort reports the effort a client stated verbatim in a reasoning
// object and whether the object carried one at all. A stated effort outranks a
// budget, including inside a thinking block that also has budget_tokens:
// budget 2048 plus effort "max" is a request for "max", not for "low".
//
// The second return is ok, not "effort != nil": the stated value nil means the
// client named "none"/"disabled" explicitly, which must clear an inferred level
// rather than fall through to it.
func explicitEffort(object map[string]any) (any, bool) {
	for _, key := range []string{"effort", "reasoning_effort"} {
		if value, exists := object[key]; exists {
			if effort, ok := normalizeEffortValue(value); ok {
				return effort, true
			}
		}
	}
	return nil, false
}

// normalizeEffortValue validates an effort a client stated explicitly. A
// non-empty string is passed through verbatim (case preserved) so unsupported
// levels are not silently rewritten or dropped; only "none"/"disabled" mean
// "no reasoning" and clear the value. Everything else, nil included, reports
// ok=false so the caller can fall back to a budget-derived level.
func normalizeEffortValue(value any) (any, bool) {
	text, ok := value.(string)
	if !ok {
		return nil, false
	}
	switch strings.ToLower(strings.TrimSpace(text)) {
	case "none", "disabled":
		// Explicitly no reasoning: clear any inferred level instead of
		// resurrecting one from a budget.
		return nil, true
	case "":
		return nil, false
	}
	return value, true
}

// anthropicThinking maps a bridge-level reasoning value back onto the Anthropic
// "thinking" block plus the "output_config" that carries the effort natively.
//
// The budget reproduced here keeps the Anthropic payload self-consistent and
// mirrors what the inverse direction (effortForThinkingBudget) reads back, so
// the two are inverse on every rung. A budget the client originally named is
// restored verbatim rather than re-derived from the level, so an Anthropic ->
// Chat -> Anthropic round trip does not rewrite 32000 into an 8192 rung.
//
// The emitted number is a float64 because that is the shape a decoded JSON
// number has, which keeps converted payloads indistinguishable from the ones
// that came in through a same-protocol passthrough.
func anthropicThinking(value any) (any, map[string]any) {
	if value == nil {
		return nil, nil
	}
	budget := 0
	if object, ok := value.(map[string]any); ok {
		kind := jsonutil.StringAt(object, "type")
		// A budget is what makes the round trip lossless, so it is read before
		// the effort: a value that reached the bridge as a thinking block still
		// names the budget the client sent, and re-deriving one from the level
		// would fold 32000 back down to the 16384 rung.
		budget = jsonutil.IntAt(object, "budget_tokens")
		if effort, stated := explicitEffort(object); stated {
			// "none"/"disabled" clears the reasoning configuration entirely.
			if effort == nil {
				return nil, nil
			}
			return thinkingFor(effort, budget), map[string]any{"effort": effort}
		}
		if kind == "disabled" {
			return nil, nil
		}
		// A level carried in "type" (Chat's {"reasoning":{"type":"high"}}), or a
		// one-sided {"type":"enabled"} whose only control is its budget.
		if effort, stated := normalizeEffortValue(object["type"]); stated {
			if effort == nil {
				return nil, nil
			}
			return thinkingFor(effort, budget), map[string]any{"effort": effort}
		}
		if budget > 0 {
			return thinkingFor(effortForThinkingBudget(budget), budget),
				map[string]any{"effort": effortForThinkingBudget(budget)}
		}
		value = object["type"]
	}
	effort, ok := normalizeEffortValue(value)
	if !ok {
		if number, isNumber := numericValue(value); isNumber {
			// A reasoning value that only carries a budget: keep the budget and
			// publish the level it maps to, so no rung is invented.
			if number <= 0 {
				return nil, nil
			}
			return thinkingFor(effortForThinkingBudget(number), number),
				map[string]any{"effort": effortForThinkingBudget(number)}
		}
		// Not an effort string (for example a bool): nothing to say about
		// reasoning, so stay silent rather than inventing a level.
		return nil, nil
	}
	if effort == nil {
		// "none"/"disabled".
		return nil, nil
	}
	return thinkingFor(effort, budget), map[string]any{"effort": effort}
}

// thinkingFor builds the Anthropic "thinking" block for an effort, reusing the
// budget the client named when there is one and synthesizing the rung's
// lower bound otherwise.
func thinkingFor(effort any, budget int) map[string]any {
	if budget <= 0 {
		budget = budgetForEffort(effort)
	}
	return map[string]any{"type": "enabled", "budget_tokens": float64(budget)}
}

// reasoningBudget reports the thinking budget a bridge-level reasoning value
// names, or 0 when the value carries none.
func reasoningBudget(value any) int {
	object, ok := value.(map[string]any)
	if !ok {
		return 0
	}
	if budget := jsonutil.IntAt(object, "budget_tokens"); budget > 0 {
		return budget
	}
	if _, ok := explicitEffort(object); !ok {
		return 0
	}
	// An effort states a level, not a budget. A Chat client that sends only
	// {"reasoning_effort":"high"} has no budget to carry.
	return numericValueOrZero(object["reasoning_budget_tokens"])
}

// withReasoningBudget attaches a budget to a bridge-level reasoning value,
// keeping any effort already present alongside it.
func withReasoningBudget(value any, budget int) any {
	if budget <= 0 {
		return value
	}
	switch typed := value.(type) {
	case map[string]any:
		merged := make(map[string]any, len(typed)+1)
		for key, existing := range typed {
			merged[key] = existing
		}
		merged["budget_tokens"] = budget
		return merged
	default:
		return map[string]any{"budget_tokens": budget, "effort": value}
	}
}

// numericValue reads a JSON number out of a decoded body, which reports every
// number as float64.
func numericValue(value any) (int, bool) {
	switch number := value.(type) {
	case float64:
		return int(number), true
	case int:
		return number, true
	case int64:
		return int(number), true
	default:
		return 0, false
	}
}

func numericValueOrZero(value any) int {
	number, _ := numericValue(value)
	return number
}

// budgetForEffort is the inverse of effortForThinkingBudget: the smallest
// lower-bound budget that maps back to the same rung. Only "high" and above
// need a real number, since Anthropic requires budget_tokens to be at least
// 1024 and a top-of-range budget already means "max".
func budgetForEffort(value any) int {
	text, _ := value.(string)
	switch strings.ToLower(strings.TrimSpace(text)) {
	case "minimal", "low":
		return 1024
	case "medium":
		return 4096
	case "high":
		return 8192
	case "xhigh":
		return 16384
	case "max":
		return 32768
	default:
		return 4096
	}
}

// effortForThinkingBudget buckets an Anthropic thinking budget onto an OpenAI
// reasoning level. The rungs are ordered and pairwise distinct so that a
// budget a client chose deliberately stays distinguishable: before this,
// everything at or above 8192 collapsed to "high" and the ladder had no rung
// above it, so 32000 and 8192 were indistinguishable and an Anthropic -> Chat
// -> Anthropic round trip rewrote 32000 into 8192.
//
// A missing budget keeps the historical "high": thinking:{type:"adaptive"}
// with no budget_tokens is the common shape, and it must not silently change
// level. An explicit "max"/"xhigh" effort is how a client asks for a rung
// above "high", and that path does not consult the budget.
func effortForThinkingBudget(budget int) string {
	switch {
	case budget <= 0:
		return "high"
	case budget >= 32768:
		return "max"
	case budget >= 16384:
		return "xhigh"
	case budget > 8192:
		// 8193..16383 sits above the old "high" boundary; folding it into
		// "high" would report a larger budget as the same level.
		return "high"
	case budget >= 8192:
		// The threshold itself keeps its historical bucket.
		return "high"
	case budget > 2048:
		return "medium"
	default:
		return "low"
	}
}

func bridgeBlocksText(blocks []bridgeBlock) string {
	var text strings.Builder
	for _, block := range blocks {
		if block.Kind == "text" {
			text.WriteString(block.Text)
		}
	}
	return text.String()
}

func asPrefix(id, prefix string) string {
	if strings.HasPrefix(id, prefix+"_") {
		return id
	}
	for _, current := range []string{"chatcmpl_", "resp_", "msg_"} {
		id = strings.TrimPrefix(id, current)
	}
	return prefix + "_" + id
}
