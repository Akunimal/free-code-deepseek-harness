package app

import "testing"

func TestConvertRequestMapsDeveloperRoleToSystem(t *testing.T) {
	body := convertRequest(&OpenAIRequest{
		Model: "m",
		Messages: []Message{
			{Role: "developer", Content: "instructions"},
			{Role: "user", Content: "question"},
			{Role: "assistant", Content: "answer"},
			{Role: "tool", ToolCallID: "call-1", Content: "result"},
		},
	})

	messages, ok := body["messages"].([]map[string]any)
	if !ok {
		t.Fatalf("messages = %T, want []map[string]any", body["messages"])
	}
	wantRoles := []string{"system", "user", "assistant", "tool"}
	if len(messages) != len(wantRoles) {
		t.Fatalf("message count = %d, want %d: %#v", len(messages), len(wantRoles), messages)
	}
	for i, want := range wantRoles {
		if got := messages[i]["role"]; got != want {
			t.Fatalf("messages[%d].role = %#v, want %q", i, got, want)
		}
	}
}
