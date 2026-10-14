package protocol

import (
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"strings"
	"testing"
)

type countedRepairReader struct {
	reader io.Reader
	bytes  int
}

func (r *countedRepairReader) Read(p []byte) (int, error) {
	n, err := r.reader.Read(p)
	r.bytes += n
	return n, err
}
func TestPashStreamFrameReadBudget(t *testing.T) {
	source := &countedRepairReader{reader: strings.NewReader(strings.Repeat("a", 32<<20))}
	filtered := NewToolNameRepair(Chat, repairRequest(Chat, "bash")).FilterStream(source, Chat)
	defer filtered.Close()
	_, err := io.ReadAll(filtered)
	if err == nil {
		t.Fatal("oversized frame accepted")
	}
	if source.bytes > (16<<20)+8192 {
		t.Fatalf("read past bounded frame before rejection: %d", source.bytes)
	}
}

func TestPashNativeConsumerStartsWithCompleteIdentity(t *testing.T) {
	input := "data: {\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_keep\",\"type\":\"function\",\"opaque\":9007199254740993,\"function\":{\"name\":\"pash\",\"arguments\":\"\"}}]}}]}\n\ndata: {\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"{}\"}}]}}]}\n\ndata: [DONE]\n\n"
	filtered := NewToolNameRepair(Chat, repairRequest(Chat, "bash")).FilterStream(strings.NewReader(input), Chat)
	defer filtered.Close()
	got, err := io.ReadAll(filtered)
	if err != nil {
		t.Fatal(err)
	}
	seen := false
	for _, line := range strings.Split(string(got), "\n") {
		if !strings.HasPrefix(line, "data: {") {
			continue
		}
		doc, err := repairDocument([]byte(line[6:]))
		if err != nil {
			t.Fatal(err)
		}
		for _, choice := range repairArray(doc["choices"]) {
			for _, callValue := range repairArray(repairObject(repairObject(choice)["delta"])["tool_calls"]) {
				call := repairObject(callValue)
				fn := repairObject(call["function"])
				if !seen {
					// pi-ai emits toolcall_start on the first entry, even with an empty
					// name; DSH immediately requires complete immutable identity.
					if fn["name"] != "bash" || call["id"] != "call_keep" || fn["arguments"] != "{}" {
						t.Fatalf("incomplete toolcall_start: %+v", call)
					}
					if call["opaque"].(json.Number).String() != "9007199254740993" {
						t.Fatal("lost buffered opaque metadata")
					}
					seen = true
				}
			}
		}
	}
	if !seen {
		t.Fatal("no executable tool call")
	}
}

func repairRequest(p Protocol, names ...string) map[string]any {
	tools := []any{}
	for _, name := range names {
		switch p {
		case Chat:
			tools = append(tools, map[string]any{"type": "function", "function": map[string]any{"name": name, "parameters": map[string]any{"type": "object"}}})
		case Anthropic:
			tools = append(tools, map[string]any{"name": name, "input_schema": map[string]any{"type": "object"}})
		case Responses:
			tools = append(tools, map[string]any{"type": "function", "name": name, "parameters": map[string]any{"type": "object"}})
		}
	}
	return map[string]any{"model": "fixture", "tools": tools, "messages": []any{}, "input": []any{}}
}

func TestPashTranscodedAndRotationStream(t *testing.T) {
	input := "data: {\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_keep\",\"function\":{\"name\":\"p\",\"arguments\":\"\"}}]}}]}\n\ndata: {\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"name\":\"ash\",\"arguments\":\"{}\"}}]}}]}\n\ndata: {\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"tool_calls\"}]}\n\ndata: [DONE]\n\n"
	for _, target := range []Protocol{Chat, Anthropic, Responses} {
		for _, rotation := range []bool{false, true} {
			output := httptest.NewRecorder()
			filtered := NewToolNameRepair(Chat, repairRequest(Chat, "bash")).FilterStream(strings.NewReader(input), Chat)
			var err error
			if rotation {
				_, _, committed, failure := RotationStream(context.Background(), output, filtered, Chat, target, "fixture", func() error { return nil })
				err = failure
				if !committed {
					t.Fatal("tool output not committed")
				}
			} else {
				_, _, err = TranscodeStream(context.Background(), output, filtered, Chat, target, "fixture")
			}
			filtered.Close()
			if err != nil {
				t.Fatal(err)
			}
			if strings.Contains(output.Body.String(), "pash") || !strings.Contains(output.Body.String(), "bash") || !strings.Contains(output.Body.String(), "call_keep") {
				t.Fatalf("lost repaired identity for %s: %s", target, output.Body.String())
			}
		}
	}
}

func TestPashRepairRefusesRestrictedChoiceAndTornFrame(t *testing.T) {
	req := repairRequest(Responses, "bash")
	req["tool_choice"] = map[string]any{"type": "allowed_tools", "mode": "auto", "tools": []any{map[string]any{"type": "function", "name": "read"}}}
	body := []byte(`{"output":[{"type":"function_call","name":"pash","call_id":"keep","arguments":"{}"}]}`)
	got, err := NewToolNameRepair(Responses, req).RepairResponse(body, Responses)
	if err != nil || string(got) != string(body) {
		t.Fatal("restricted tool choice gained bash")
	}
	input := "data: {\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"name\":\"pash\",\"arguments\":\"{}\"}}]}}]}"
	filtered := NewToolNameRepair(Chat, repairRequest(Chat, "bash")).FilterStream(strings.NewReader(input), Chat)
	got, err = io.ReadAll(filtered)
	filtered.Close()
	if err == nil || len(got) != 0 {
		t.Fatal("torn frame leaked an executable name")
	}
}

func TestDeclaredPashResponseRepair(t *testing.T) {
	documents := map[Protocol]string{
		Chat:      `{"id":"r","vendor":9007199254740993,"choices":[{"message":{"tool_calls":[{"id":"call_keep","type":"function","function":{"name":"pash","arguments":"{\"command\":\"echo safe\"}"}}]},"finish_reason":"tool_calls"}]}`,
		Anthropic: `{"id":"r","vendor":9007199254740993,"content":[{"type":"thinking","thinking":"reason","signature":"keep-signature"},{"type":"tool_use","id":"call_keep","name":"pash","input":{"command":"echo safe"}}],"stop_reason":"tool_use"}`,
		Responses: `{"id":"r","vendor":9007199254740993,"output":[{"type":"function_call","id":"item_keep","call_id":"call_keep","name":"pash","arguments":"{\"command\":\"echo safe\"}"}]}`,
	}
	for p, doc := range documents {
		t.Run(string(p), func(t *testing.T) {
			for _, names := range [][]string{{"bash"}, {"pash", "bash"}, {"read"}, {}, {"bash", "pa"}} {
				repair := NewToolNameRepair(p, repairRequest(p, names...))
				got, err := repair.RepairResponse([]byte(doc), p)
				if err != nil {
					t.Fatal(err)
				}
				wantRepair := len(names) == 1 && names[0] == "bash"
				if wantRepair {
					if strings.Contains(string(got), `"name":"pash"`) || !strings.Contains(string(got), `"name":"bash"`) {
						t.Fatalf("wrong name: %s", got)
					}
					for _, keep := range []string{"call_keep", "echo safe", "9007199254740993"} {
						if !strings.Contains(string(got), keep) {
							t.Fatalf("lost %s", keep)
						}
					}
				} else if string(got) != doc {
					t.Fatal("changed a request without unambiguous declared bash")
				}
			}
		})
	}
}

func TestPashRepairRespectsToolChoiceAndUnknownNames(t *testing.T) {
	doc := []byte(`{"choices":[{"message":{"tool_calls":[{"function":{"name":"pash","arguments":"{}"}}]}}]}`)
	for _, choice := range []any{"none", map[string]any{"type": "function", "function": map[string]any{"name": "read"}}} {
		req := repairRequest(Chat, "bash", "read")
		req["tool_choice"] = choice
		got, err := NewToolNameRepair(Chat, req).RepairResponse(doc, Chat)
		if err != nil || string(got) != string(doc) {
			t.Fatal("tool choice boundary changed")
		}
	}
	other := strings.ReplaceAll(string(doc), "pash", "pash_extra")
	got, err := NewToolNameRepair(Chat, repairRequest(Chat, "bash")).RepairResponse([]byte(other), Chat)
	if err != nil || string(got) != other {
		t.Fatal("fuzzy repair is forbidden")
	}
}

func TestPashNativeStreamRepair(t *testing.T) {
	streams := map[Protocol]string{
		Chat:      "id: preserve\nretry: 123\n: keep-comment\ndata: {\"vendor\":9007199254740993,\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_keep\",\"function\":{\"name\":\"p\",\"arguments\":\"\"}}]}}]}\n\ndata: {\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"name\":\"ash\",\"arguments\":\"\"}}]}}]}\n\ndata: {\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"{}\"}}]}}]}\n\ndata: {\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"tool_calls\"}]}\n\ndata: [DONE]\n\n",
		Anthropic: "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":1,\"vendor\":9007199254740993,\"content_block\":{\"type\":\"tool_use\",\"id\":\"call_keep\",\"name\":\"pash\",\"input\":{}}}\n\nevent: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
		Responses: "event: response.output_item.added\ndata: {\"type\":\"response.output_item.added\",\"vendor\":9007199254740993,\"item\":{\"type\":\"function_call\",\"id\":\"call_keep\",\"name\":\"pash\",\"arguments\":\"{}\"}}\n\nevent: response.completed\ndata: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\",\"output\":[]}}\n\n",
	}
	for p, input := range streams {
		t.Run(string(p), func(t *testing.T) {
			filtered := NewToolNameRepair(p, repairRequest(p, "bash")).FilterStream(strings.NewReader(input), p)
			defer filtered.Close()
			got, err := io.ReadAll(filtered)
			if err != nil {
				t.Fatal(err)
			}
			if strings.Contains(string(got), `"name":"pash"`) || !strings.Contains(string(got), `"name":"bash"`) {
				t.Fatalf("incorrect stream: %s", got)
			}
			for _, keep := range []string{"call_keep", "9007199254740993"} {
				if !strings.Contains(string(got), keep) {
					t.Fatalf("lost %s", keep)
				}
			}
			if p == Chat {
				for _, keep := range []string{"id: preserve", "retry: 123", ": keep-comment", "[DONE]"} {
					if !strings.Contains(string(got), keep) {
						t.Fatal("lost SSE envelope")
					}
				}
			}
			plain := NewToolNameRepair(p, repairRequest(p, "read")).FilterStream(strings.NewReader(input), p)
			defer plain.Close()
			raw, _ := io.ReadAll(plain)
			if string(raw) != input {
				t.Fatal("undeclared bash stream mutated")
			}
		})
	}
}

func TestPashStreamDoesNotRepairAnExtendedNameOrAcceptLateNameChanges(t *testing.T) {
	frame := func(name, args string) string {
		b, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"index": 0, "delta": map[string]any{"tool_calls": []any{map[string]any{"index": 0, "function": map[string]any{"name": name, "arguments": args}}}}}}})
		return "data: " + string(b) + "\n\n"
	}
	input := frame("pash", "") + frame("_extra", "") + frame("", "{}") + "data: [DONE]\n\n"
	f := NewToolNameRepair(Chat, repairRequest(Chat, "bash")).FilterStream(strings.NewReader(input), Chat)
	got, err := io.ReadAll(f)
	f.Close()
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(got), `"name":"bash"`) || !strings.Contains(string(got), "pash_extra") {
		t.Fatal("extended name gained a declared capability")
	}
	f = NewToolNameRepair(Chat, repairRequest(Chat, "bash")).FilterStream(strings.NewReader(frame("pash", "{}")+frame("_extra", "")), Chat)
	_, err = io.ReadAll(f)
	f.Close()
	if err == nil {
		t.Fatal("accepted tool-name mutation after arguments")
	}
	f = NewToolNameRepair(Chat, repairRequest(Chat, "bash")).FilterStream(strings.NewReader(frame("p", "")+"data: [DONE]\n\n"), Chat)
	_, err = io.ReadAll(f)
	f.Close()
	if err == nil {
		t.Fatal("incomplete prefix silently completed")
	}
}
