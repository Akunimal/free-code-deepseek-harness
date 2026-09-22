package protocol

import (
	"encoding/json"
	"fmt"
	"io"
	"time"
)

// CollapseStream consumes one complete upstream SSE stream and synthesizes
// the equivalent single (non-streaming) response document in the same
// protocol.
//
// It exists for upstream lanes that only serve streaming responses: the
// gateway forces stream:true on the wire and collapses the events back so
// downstream clients that asked for a plain JSON reply keep working.
func CollapseStream(reader io.Reader, protocol Protocol, model string) ([]byte, error) {
	parser := &bridgeStreamParser{
		protocol:          protocol,
		tools:             map[string]bool{},
		toolIDs:           map[string]string{},
		toolNames:         map[string]string{},
		responseArgs:      map[string]bool{},
		responseReasoning: map[string]bool{},
	}
	acc := &collapseAccumulator{tools: map[string]int{}}
	acc.response.Created = time.Now().Unix()
	acc.response.Model = model
	terminated := false
	streamErr := error(nil)
	readErr := readSSE(reader, func(eventName, data string) error {
		events, err := parser.Parse(eventName, data)
		if err != nil {
			streamErr = err
			return errStreamUpstreamFailure
		}
		for _, event := range events {
			switch event.Kind {
			case "done":
				terminated = true
				return errStreamNormalTermination
			case "error":
				streamErr = fmt.Errorf("%s", firstNonEmpty(event.Error, "upstream stream failed"))
				return errStreamUpstreamFailure
			default:
				acc.apply(event)
			}
		}
		return nil
	})
	if readErr != nil && readErr != errStreamNormalTermination {
		if streamErr != nil {
			return nil, streamErr
		}
		return nil, readErr
	}
	if !terminated {
		if streamErr != nil {
			return nil, streamErr
		}
		return nil, errSSEUnexpectedEOF
	}
	return json.Marshal(encodeBridgeResponse(protocol, acc.response))
}

type collapseAccumulator struct {
	response bridgeResponse
	tools    map[string]int
	reason   *bridgeBlock
}

func (acc *collapseAccumulator) apply(event bridgeStreamEvent) {
	switch event.Kind {
	case "start":
		if event.ResponseID != "" {
			acc.response.ID = event.ResponseID
		}
		if event.Model != "" {
			acc.response.Model = event.Model
		}
	case "text":
		acc.response.Text += event.Text
	case "reasoning":
		if event.Text == "" && event.Encrypted == "" && event.Signature == "" {
			break
		}
		acc.reasoningBlock().Text += event.Text
		if event.Encrypted != "" {
			acc.splitReasoning()
			acc.reasoningBlock().Encrypted += event.Encrypted
			acc.reason = nil
		}
	case "reasoning_signature":
		acc.reasoningBlock().Signature += event.Signature
	case "tool_start":
		acc.toolBlock(event.ToolKey, event.ToolID, event.ToolName)
	case "tool_delta":
		block := acc.toolBlock(event.ToolKey, event.ToolID, event.ToolName)
		block.ArgumentsJSON += event.Text
	case "usage":
		if event.Usage != nil {
			mergeBridgeUsage(&acc.response.Usage, *event.Usage)
		}
	case "finish":
		acc.response.Stop = event.Stop
	}
}

// reasoningBlock returns the reasoning block deltas accumulate into,
// starting a fresh one when the previous block already carries encrypted
// content (a different item on the wire).
func (acc *collapseAccumulator) reasoningBlock() *bridgeBlock {
	if acc.reason == nil {
		acc.response.Reasoning = append(acc.response.Reasoning, bridgeBlock{Kind: "reasoning"})
		acc.reason = &acc.response.Reasoning[len(acc.response.Reasoning)-1]
	}
	return acc.reason
}

func (acc *collapseAccumulator) splitReasoning() {
	acc.reason = nil
}

func (acc *collapseAccumulator) toolBlock(key, id, name string) *bridgeBlock {
	if index, ok := acc.tools[key]; ok {
		block := &acc.response.Tools[index]
		if block.ID == "" {
			block.ID = id
		}
		if block.Name == "" {
			block.Name = name
		}
		return block
	}
	acc.response.Tools = append(acc.response.Tools, bridgeBlock{Kind: "tool_call", ID: id, Name: name})
	acc.tools[key] = len(acc.response.Tools) - 1
	return &acc.response.Tools[len(acc.response.Tools)-1]
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
