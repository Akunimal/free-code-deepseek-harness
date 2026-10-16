package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"syscall"
	"testing"
	"time"
	"unsafe"
)

func TestPrivateDesktopContainsVisibleRootAndNewConsoleDescendant(t *testing.T) {
	if testing.Short() {
		t.Skip("actual Windows desktop/process integration")
	}
	t.Setenv("FREECODE_HEADLESS_FIXTURE", "root")
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	var output bytes.Buffer
	drained := make(chan struct{})
	go func() { io.Copy(&output, r); close(drained) }()
	code, err := runContained([]string{exe, "-test.run=^TestWindowFixture$"}, hostOptions{
		stdin: syscall.Handle(os.Stdin.Fd()), stdout: syscall.Handle(w.Fd()), stderr: syscall.Handle(w.Fd()),
	})
	w.Close()
	select {
	case <-drained:
	case <-time.After(5 * time.Second):
		t.Fatal("inherited pipes did not close")
	}
	if err != nil {
		t.Fatalf("launch: %v\n%s", err, output.String())
	}
	if code != 37 {
		t.Fatalf("exit status = %d, output: %s", code, output.String())
	}
	var records []map[string]any
	for _, line := range strings.Split(output.String(), "\n") {
		if !strings.HasPrefix(line, "FIXTURE ") {
			continue
		}
		var record map[string]any
		if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "FIXTURE ")), &record); err != nil {
			t.Fatal(err)
		}
		records = append(records, record)
	}
	if len(records) != 2 {
		t.Fatalf("expected root + descendant evidence, got %s", output.String())
	}
	for _, record := range records {
		if !strings.HasPrefix(record["desktop"].(string), "FreeCode-headless-") {
			t.Fatalf("escaped desktop: %v", record)
		}
		if record["desktop"] != records[0]["desktop"] {
			t.Fatalf("descendant did not inherit desktop: %v", records)
		}
		if record["interactive"].(bool) {
			t.Fatalf("window appeared on interactive desktop: %v", record)
		}
		if record["job"].(bool) != true {
			t.Fatalf("process ran before Job attachment: %v", record)
		}
	}
	if !strings.Contains(output.String(), "[headless-window]") {
		t.Fatalf("no native watchdog evidence: %s", output.String())
	}
}

func TestHelperJobClosesOnlyItsOwnedTree(t *testing.T) {
	if testing.Short() {
		t.Skip("actual helper build and Job lifetime integration")
	}
	helper := filepath.Join(t.TempDir(), "headless-host.exe")
	build := exec.Command("go", "build", "-trimpath", "-ldflags=-H=windowsgui", "-o", helper, ".")
	build.Env = append(os.Environ(), "GOTOOLCHAIN=local", "GOPROXY=off", "GOSUMDB=off", "CGO_ENABLED=0")
	build.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build: %v %s", err, output)
	}
	t.Setenv("FREECODE_HEADLESS_FIXTURE", "hold")
	exe, _ := os.Executable()
	command := exec.Command(helper, "--", exe, "-test.run=^TestWindowFixture$")
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	output, err := command.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	defer command.Process.Kill() // Only this test's helper, never a process-name lookup.
	var handles []syscall.Handle
	scanner := bufio.NewScanner(output)
	for len(handles) < 2 && scanner.Scan() {
		if !strings.HasPrefix(scanner.Text(), "FIXTURE ") {
			continue
		}
		var record map[string]any
		if err := json.Unmarshal([]byte(strings.TrimPrefix(scanner.Text(), "FIXTURE ")), &record); err != nil {
			t.Fatal(err)
		}
		handle, err := syscall.OpenProcess(0x100000, false, uint32(record["pid"].(float64)))
		if err != nil {
			t.Fatal(err)
		}
		defer syscall.CloseHandle(handle)
		handles = append(handles, handle)
	}
	if len(handles) != 2 {
		t.Fatal("did not receive owned root + descendant PIDs")
	}
	if err := command.Process.Kill(); err != nil {
		t.Fatal(err)
	}
	command.Wait()
	for _, handle := range handles {
		result, err := syscall.WaitForSingleObject(handle, 5000)
		if err != nil || result != 0 {
			t.Fatalf("owned child outlived helper: result=%d err=%v", result, err)
		}
	}
}

func TestContainmentFailsClosed(t *testing.T) {
	exe, _ := os.Executable()
	_, err := runContained([]string{exe}, hostOptions{desktopName: "invalid\\desktop"})
	if err == nil {
		t.Fatal("invalid desktop must fail, never spawn directly")
	}
}

func TestStandardInputArgumentsEnvironmentAndDirectory(t *testing.T) {
	t.Setenv("FREECODE_HEADLESS_FIXTURE", "io")
	t.Setenv("FREECODE_IO_SENTINEL", "test-owned-value")
	exe, _ := os.Executable()
	input, writer, _ := os.Pipe()
	defer input.Close()
	writer.WriteString("unicode ñ input\n")
	writer.Close()
	output, target, _ := os.Pipe()
	defer output.Close()
	args := []string{"", "two words", "a\"b", "trailing\\", "ñ雪"}
	code, err := runContained(append([]string{exe, "-test.run=^TestWindowFixture$", "--"}, args...), hostOptions{
		stdin: syscall.Handle(input.Fd()), stdout: syscall.Handle(target.Fd()), stderr: syscall.Handle(target.Fd()),
	})
	target.Close()
	data, _ := io.ReadAll(output)
	if err != nil || code != 23 {
		t.Fatalf("code=%d err=%v output=%s", code, err, data)
	}
	var record struct {
		Args            []string
		Input, Env, Cwd string
	}
	if err := json.Unmarshal(bytes.TrimSpace(data), &record); err != nil {
		t.Fatal(err)
	}
	cwd, _ := os.Getwd()
	if !reflect.DeepEqual(record.Args, args) || record.Input != "unicode ñ input\n" || record.Env != "test-owned-value" || record.Cwd != cwd {
		t.Fatalf("I/O/env/cwd changed: %+v", record)
	}
}

func TestWatchdogScope(t *testing.T) {
	for _, tc := range []struct {
		name           string
		owned, visible bool
		object, child  int32
		want           bool
	}{
		{"owned top-level window", true, true, 0, 0, true},
		{"unrelated process", false, true, 0, 0, false},
		{"already hidden", true, false, 0, 0, false},
		{"non-window accessibility object", true, true, -4, 0, false},
		{"child accessibility object", true, true, 0, 1, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := shouldHide(tc.owned, tc.visible, tc.object, tc.child); got != tc.want {
				t.Fatalf("got %t", got)
			}
		})
	}
}

// This fixture deliberately ignores hidden flags, shows a GUI window twice,
// requests focus, and creates a grandchild with CREATE_NEW_CONSOLE. It may only
// run under the private desktop created by runContained, never directly.
func TestWindowFixture(t *testing.T) {
	mode := os.Getenv("FREECODE_HEADLESS_FIXTURE")
	if mode == "" {
		t.Skip("subprocess fixture only")
	}
	user := syscall.NewLazyDLL("user32.dll")
	thread, _, _ := syscall.NewLazyDLL("kernel32.dll").NewProc("GetCurrentThreadId").Call()
	desktop, _, _ := user.NewProc("GetThreadDesktop").Call(thread)
	name := make([]uint16, 256)
	var needed uint32
	user.NewProc("GetUserObjectInformationW").Call(desktop, 2, uintptr(unsafe.Pointer(&name[0])), uintptr(len(name)*2), uintptr(unsafe.Pointer(&needed)))
	desktopName := syscall.UTF16ToString(name)
	if !strings.HasPrefix(desktopName, "FreeCode-headless-") {
		os.Exit(98)
	}
	if mode == "io" {
		data, _ := io.ReadAll(os.Stdin)
		cwd, _ := os.Getwd()
		json.NewEncoder(os.Stdout).Encode(map[string]any{"Args": os.Args[3:], "Input": string(data), "Env": os.Getenv("FREECODE_IO_SENTINEL"), "Cwd": cwd})
		os.Exit(23)
	}
	class, _ := syscall.UTF16PtrFromString("STATIC")
	title, _ := syscall.UTF16PtrFromString("test-owned headless fixture")
	hwnd, _, _ := user.NewProc("CreateWindowExW").Call(0, uintptr(unsafe.Pointer(class)), uintptr(unsafe.Pointer(title)), 0x10cf0000, 50, 50, 100, 100, 0, 0, 0, 0)
	if hwnd == 0 {
		os.Exit(97)
	}
	user.NewProc("ShowWindow").Call(hwnd, 5)
	user.NewProc("ShowWindow").Call(hwnd, 5)
	user.NewProc("SetForegroundWindow").Call(hwnd)
	var interactive bool
	// Compare the actual input desktop name without inspecting user's windows.
	input, _, _ := user.NewProc("OpenInputDesktop").Call(0, 0, 1)
	if input != 0 {
		inputName := make([]uint16, 256)
		user.NewProc("GetUserObjectInformationW").Call(input, 2, uintptr(unsafe.Pointer(&inputName[0])), uintptr(len(inputName)*2), uintptr(unsafe.Pointer(&needed)))
		interactive = syscall.UTF16ToString(inputName) == desktopName
		user.NewProc("CloseDesktop").Call(input)
	} else {
		os.Exit(95)
	}
	var inJob int32
	process, _ := syscall.GetCurrentProcess()
	syscall.NewLazyDLL("kernel32.dll").NewProc("IsProcessInJob").Call(uintptr(process), 0, uintptr(unsafe.Pointer(&inJob)))
	record, _ := json.Marshal(map[string]any{"desktop": desktopName, "interactive": interactive, "job": inJob != 0, "mode": mode, "pid": os.Getpid()})
	fmt.Printf("FIXTURE %s\n", record)
	if mode == "root" || mode == "hold" {
		exe, _ := os.Executable()
		child := exec.Command(exe, "-test.run=^TestWindowFixture$")
		leaf := "leaf"
		if mode == "hold" {
			leaf = "hold-leaf"
		}
		child.Env = append(os.Environ(), "FREECODE_HEADLESS_FIXTURE="+leaf)
		child.Stdout, child.Stderr = os.Stdout, os.Stderr
		child.SysProcAttr = &syscall.SysProcAttr{CreationFlags: 0x10}
		if mode == "hold" {
			if err := child.Start(); err != nil {
				os.Exit(96)
			}
		} else if err := child.Run(); err == nil || child.ProcessState.ExitCode() != 37 {
			os.Exit(96)
		}
	}
	if strings.HasPrefix(mode, "hold") {
		time.Sleep(30 * time.Second)
	}
	time.Sleep(100 * time.Millisecond)
	user.NewProc("DestroyWindow").Call(hwnd)
	os.Exit(37)
}
