package httpx

import (
	"fmt"
	"runtime"
)

func UserAgent() string {
	return fmt.Sprintf("opencode/1.18.31 (%s %s; %s)", runtime.GOOS, runtime.GOARCH, runtime.Version())
}
