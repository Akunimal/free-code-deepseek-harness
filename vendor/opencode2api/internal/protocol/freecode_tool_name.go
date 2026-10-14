package protocol

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
)

// ToolNameRepair fixes one observed invalid name, never an undeclared tool.
// The original downstream request is authoritative, before anonymous shaping
// adds its synthetic core tools. IDs, arguments, approvals and tool schemas
// remain the caller's; this layer does not execute or retry anything.
type ToolNameRepair struct {
	enabled   bool
	names     map[string]*repairToolName
	heldBytes int
}
type repairToolName struct {
	raw         string
	sent        bool
	header      map[string]any
	headerBytes int
}

func NewToolNameRepair(p Protocol, payload map[string]any) *ToolNameRepair {
	repair := &ToolNameRepair{names: map[string]*repairToolName{}}
	request, err := decodeBridgeRequest(p, payload)
	if err != nil {
		return repair
	}
	declared := map[string]bool{}
	for _, tool := range request.Tools {
		declared[tool.Name] = true
	}
	repair.enabled = declared["bash"] && !declared["pash"] && !declared["p"] && !declared["pa"] && !declared["pas"]
	if request.ToolChoice.Mode == "none" || (request.ToolChoice.Mode == "named" && request.ToolChoice.Name != "bash") {
		repair.enabled = false
	}
	// Unknown/restricted choice schemas must not gain a capability through
	// the older bridge decoder's empty/default representation.
	if choice, ok := payload["tool_choice"].(map[string]any); ok {
		kind, _ := choice["type"].(string)
		if (p == Anthropic && kind != "auto" && kind != "any" && kind != "tool") ||
			(p != Anthropic && kind != "function") {
			repair.enabled = false
		}
	}
	if choice, ok := payload["tool_choice"].(string); ok && choice != "auto" && choice != "required" && choice != "any" {
		repair.enabled = false
	}
	return repair
}

func (repair *ToolNameRepair) RepairResponse(body []byte, p Protocol) ([]byte, error) {
	if !repair.enabled {
		return body, nil
	}
	document, err := repairDocument(body)
	if err != nil {
		return body, err
	}
	changed, err := repair.rewrite(document, p, false)
	if err != nil {
		return nil, err
	}
	if !changed {
		return body, nil
	}
	return json.Marshal(document)
}

// Native SSE framing/opaque metadata are preserved. Only tool-name fields in
// modified records are serialized; unrelated records remain byte-for-byte.
func (repair *ToolNameRepair) FilterStream(input io.Reader, p Protocol) io.ReadCloser {
	if !repair.enabled {
		return io.NopCloser(input)
	}
	return &repairStreamReader{input: bufio.NewReader(input), source: input, repair: repair, protocol: p}
}

type repairStreamReader struct {
	input    *bufio.Reader
	source   io.Reader
	repair   *ToolNameRepair
	protocol Protocol
	out      []byte
	end      error
}

func (r *repairStreamReader) Close() error {
	if c, ok := r.source.(io.Closer); ok {
		return c.Close()
	}
	return nil
}
func (r *repairStreamReader) Read(p []byte) (int, error) {
	if len(p) == 0 {
		return 0, nil
	}
	if len(r.out) == 0 && r.end == nil {
		var frame bytes.Buffer
		atLineStart := true
		for {
			chunk, err := r.input.ReadSlice('\n')
			frame.Write(chunk)
			if frame.Len() > 16<<20 {
				r.end = errors.New("upstream SSE frame exceeds repair limit")
				break
			}
			if err == bufio.ErrBufferFull {
				atLineStart = false
				continue
			}
			if err != nil {
				r.end = err
				if frame.Len() != 0 {
					r.end = io.ErrUnexpectedEOF
				}
				break
			}
			if atLineStart && (bytes.Equal(chunk, []byte("\n")) || bytes.Equal(chunk, []byte("\r\n"))) {
				r.out, r.end = r.repair.frame(frame.Bytes(), r.protocol)
				break
			}
			atLineStart = true
		}
		if r.end == io.EOF && len(r.out) == 0 && r.repair.pending() {
			r.end = errors.New("incomplete upstream tool name")
		}
	}
	if len(r.out) > 0 {
		n := copy(p, r.out)
		r.out = r.out[n:]
		return n, nil
	}
	return 0, r.end
}
func (repair *ToolNameRepair) frame(frame []byte, p Protocol) ([]byte, error) {
	lines := strings.Split(string(frame), "\n")
	data := []string{}
	for _, line := range lines {
		if strings.HasPrefix(line, "data:") {
			data = append(data, strings.TrimPrefix(strings.TrimSuffix(line[5:], "\r"), " "))
		}
	}
	if len(data) == 0 {
		return frame, nil
	}
	payload := strings.Join(data, "\n")
	if payload == "[DONE]" {
		if repair.pending() {
			return nil, errors.New("incomplete upstream tool name")
		}
		return frame, nil
	}
	document, err := repairDocument([]byte(payload))
	if err != nil {
		return frame, nil
	}
	changed, err := repair.rewrite(document, p, true)
	if err != nil {
		return nil, err
	}
	if !changed {
		return frame, nil
	}
	encoded, err := json.Marshal(document)
	if err != nil {
		return nil, err
	}
	out := []string{}
	written := false
	for _, line := range lines {
		if !strings.HasPrefix(line, "data:") {
			out = append(out, line)
			continue
		}
		if !written {
			suffix := ""
			if strings.HasSuffix(line, "\r") {
				suffix = "\r"
			}
			out = append(out, "data: "+string(encoded)+suffix)
			written = true
		}
	}
	return []byte(strings.Join(out, "\n")), nil
}
func repairDocument(body []byte) (map[string]any, error) {
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	var document map[string]any
	if err := decoder.Decode(&document); err != nil {
		return nil, err
	}
	var tail any
	if err := decoder.Decode(&tail); err != io.EOF {
		return nil, errors.New("invalid trailing response data")
	}
	return document, nil
}
func repairObject(value any) map[string]any { m, _ := value.(map[string]any); return m }
func repairArray(value any) []any           { a, _ := value.([]any); return a }
func repairNamed(block map[string]any, kind string) bool {
	if block["type"] == kind && block["name"] == "pash" {
		block["name"] = "bash"
		return true
	}
	return false
}
func (repair *ToolNameRepair) pending() bool {
	for _, name := range repair.names {
		if !name.sent {
			return true
		}
	}
	return false
}
func (repair *ToolNameRepair) rewrite(doc map[string]any, p Protocol, stream bool) (bool, error) {
	changed := false
	switch p {
	case Chat:
		for _, value := range repairArray(doc["choices"]) {
			choice := repairObject(value)
			message := repairObject(choice["message"])
			if stream {
				message = repairObject(choice["delta"])
			}
			calls := repairArray(message["tool_calls"])
			held := map[int]bool{}
			for callIndex, value := range calls {
				call := repairObject(value)
				function := repairObject(call["function"])
				if !stream {
					if function["name"] == "pash" {
						function["name"] = "bash"
						changed = true
					}
					continue
				}
				key := fmt.Sprint(choice["index"], ":", call["index"])
				fragment, _ := function["name"].(string)
				arguments, _ := function["arguments"].(string)
				state := repair.names[key]
				if state == nil {
					if fragment == "" || !strings.HasPrefix("pash", fragment) {
						continue
					}
					if len(repair.names) >= 1024 {
						return false, errors.New("too many upstream tool names")
					}
					state = &repairToolName{}
					repair.names[key] = state
				}
				if state.sent {
					if fragment != "" {
						if fragment != state.raw {
							return false, errors.New("upstream tool name changed after arguments")
						}
						delete(function, "name")
						changed = true
					}
					continue
				}
				if fragment != "" {
					state.raw = mergeToolName(state.raw, fragment)
					if len(state.raw) > 1024 {
						return false, errors.New("upstream tool name exceeds repair limit")
					}
				}
				// Hold the whole pending entry: native pi-ai starts a tool on the
				// first entry and DSH freezes its identity at that moment.
				if state.header == nil {
					state.header = map[string]any{}
				}
				if id, ok := call["id"].(string); ok && id != "" {
					if previous, ok := state.header["id"].(string); ok && previous != "" && previous != id {
						return false, errors.New("upstream tool identity changed")
					}
				}
				for k, v := range call {
					if k == "function" {
						previous := repairObject(state.header[k])
						if previous == nil {
							previous = map[string]any{}
							state.header[k] = previous
						}
						for field, value := range function {
							previous[field] = value
						}
					} else {
						state.header[k] = v
					}
				}
				encoded, _ := json.Marshal(state.header)
				repair.heldBytes += len(encoded) - state.headerBytes
				state.headerBytes = len(encoded)
				if repair.heldBytes > 16<<20 {
					return false, errors.New("pending upstream tool metadata exceeds repair limit")
				}
				if arguments == "" && strings.HasPrefix("pash", state.raw) {
					held[callIndex] = true
					changed = true
					continue
				}
				for k, v := range state.header {
					if k == "function" {
						for field, value := range repairObject(v) {
							if _, present := function[field]; !present {
								function[field] = value
							}
						}
					} else if _, present := call[k]; !present {
						call[k] = v
					}
				}
				name := state.raw
				if name == "pash" {
					name = "bash"
				}
				function["name"] = name
				state.sent = true
				repair.heldBytes -= state.headerBytes
				state.header = nil
				state.headerBytes = 0
				changed = true
			}
			if len(held) > 0 {
				kept := make([]any, 0, len(calls)-len(held))
				for index, call := range calls {
					if !held[index] {
						kept = append(kept, call)
					}
				}
				message["tool_calls"] = kept
			}
			if stream && choice["finish_reason"] != nil && choice["finish_reason"] != "" && repair.pending() {
				return false, errors.New("incomplete upstream tool name")
			}
		}
	case Anthropic:
		if stream {
			changed = repairNamed(repairObject(doc["content_block"]), "tool_use")
		}
		for _, value := range repairArray(doc["content"]) {
			if repairNamed(repairObject(value), "tool_use") {
				changed = true
			}
		}
	case Responses:
		if repairNamed(repairObject(doc["item"]), "function_call") {
			changed = true
		}
		for _, container := range []map[string]any{doc, repairObject(doc["response"])} {
			for _, value := range repairArray(container["output"]) {
				if repairNamed(repairObject(value), "function_call") {
					changed = true
				}
			}
		}
	}
	return changed, nil
}
