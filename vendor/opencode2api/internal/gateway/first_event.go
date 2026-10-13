package gateway

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

var errFirstEventTimeout = fmt.Errorf("upstream first SSE event timed out: %w", context.DeadlineExceeded)

type attemptBody struct {
	io.Reader
	body   io.ReadCloser
	cancel context.CancelCauseFunc
}

func (b *attemptBody) Close() error {
	b.cancel(nil)
	return b.body.Close()
}

// Wait before returning a successful SSE response to the retry loop, while
// nothing has been committed downstream. Keep every byte for native forwarding.
// Comments and incomplete frames do not count as the first event.
func doInferenceAttempt(client *http.Client, req *http.Request, timeout time.Duration) (*http.Response, error) {
	if timeout <= 0 || strings.HasSuffix(req.URL.Path, "/systemone") {
		return client.Do(req)
	}
	ctx, cancel := context.WithCancelCause(req.Context())
	resp, err := client.Do(req.Clone(ctx))
	if err != nil {
		cancel(nil)
		return resp, err
	}
	if resp.StatusCode/100 != 2 || !strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/event-stream") {
		resp.Body = &attemptBody{Reader: resp.Body, body: resp.Body, cancel: cancel}
		return resp, nil
	}
	timer := time.AfterFunc(timeout, func() { cancel(errFirstEventTimeout) })
	reader := bufio.NewReader(resp.Body)
	prefix, err := readFirstEvent(reader)
	stopped := timer.Stop()
	if !stopped && ctx.Err() == nil {
		// Stop(false) means the callback may still be about to run.
		cancel(errFirstEventTimeout)
	}
	if cause := context.Cause(ctx); cause != nil {
		err = cause
	}
	if err != nil {
		cancel(nil)
		resp.Body.Close()
		return nil, err
	}
	resp.Body = &attemptBody{Reader: io.MultiReader(bytes.NewReader(prefix), reader), body: resp.Body, cancel: cancel}
	return resp, nil
}

func readFirstEvent(reader *bufio.Reader) ([]byte, error) {
	const maxPrelude = 1 << 20
	var prefix, line []byte
	hasData := false
	for {
		part, err := reader.ReadSlice('\n')
		if len(prefix)+len(part) > maxPrelude {
			return nil, errors.New("upstream SSE prelude exceeds 1 MiB")
		}
		prefix = append(prefix, part...)
		line = append(line, part...)
		if errors.Is(err, bufio.ErrBufferFull) {
			continue
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				err = io.ErrUnexpectedEOF
			}
			return nil, err
		}
		text := strings.TrimSuffix(strings.TrimSuffix(string(line), "\n"), "\r")
		line = line[:0]
		if text == "" && hasData {
			return prefix, nil
		}
		if strings.HasPrefix(text, "data:") || text == "data" {
			hasData = true
		}
	}
}
