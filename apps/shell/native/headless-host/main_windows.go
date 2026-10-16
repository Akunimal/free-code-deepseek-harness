// FreeCode's background-process boundary. This executable is built with the
// Windows GUI subsystem: the boundary itself must never allocate a console.
package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"unsafe"
)

var sourceID = "development"
var user32 = syscall.NewLazyDLL("user32.dll")
var kernel32 = syscall.NewLazyDLL("kernel32.dll")
var advapi32 = syscall.NewLazyDLL("advapi32.dll")

const (
	tokenGroupsClass = 2          // TOKEN_INFORMATION_CLASS TokenGroups.
	seGroupLogonID   = 0xC0000000 // SE_GROUP_LOGON_ID.
	// Desktop rights granted to the restricted child's logon-session SID:
	// DESKTOP_READOBJECTS | CREATEWINDOW | CREATEMENU | ENUMERATE | WRITEOBJECTS.
	// Deliberately excludes SWITCHDESKTOP, HOOKCONTROL, JOURNALRECORD/PLAYBACK,
	// WRITE_DAC, WRITE_OWNER and DELETE.
	privateDesktopLogonRights = 0x000000c7
)

var logonSessionSIDPattern = regexp.MustCompile(`^S-1-5-5-[0-9]+-[0-9]+$`)

type sidAndAttributes struct {
	Sid        *syscall.SID
	Attributes uint32
}

type tokenGroups struct {
	GroupCount uint32
	Groups     [1]sidAndAttributes
}

type hostOptions struct {
	stdin, stdout, stderr syscall.Handle
	desktopName           string // Internal test seam; not exposed as a CLI override.
}

type jobLimits struct {
	ProcessTime, JobTime                                       int64
	Flags                                                      uint32
	MinWorkingSet, MaxWorkingSet                               uintptr
	ActiveProcessLimit                                         uint32
	Affinity                                                   uintptr
	PriorityClass, SchedulingClass                             uint32
	IO                                                         [6]uint64
	ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory uintptr
}

func main() {
	if len(os.Args) == 2 && os.Args[1] == "--build-info" {
		fmt.Println(sourceID)
		return
	}
	if len(os.Args) < 3 || os.Args[1] != "--" {
		fmt.Fprintln(os.Stderr, "headless-host: expected -- executable [arguments]")
		os.Exit(125)
	}
	code, err := runContained(os.Args[2:], hostOptions{
		stdin: syscall.Handle(os.Stdin.Fd()), stdout: syscall.Handle(os.Stdout.Fd()), stderr: syscall.Handle(os.Stderr.Fd()),
	})
	if err != nil {
		// Do not echo argv/env; they can contain credentials.
		fmt.Fprintf(os.Stderr, "headless-host: containment failed: %v\n", err)
		os.Exit(125)
	}
	os.Exit(int(code))
}

func checked(ok uintptr, err error, operation string) error {
	if ok == 0 {
		return fmt.Errorf("%s: %w", operation, err)
	}
	return nil
}

// privateDesktopSDDL returns the private desktop descriptor. SYSTEM keeps full
// control; only the caller's logon session receives the desktop rights above.
// The owner gets no ACE. Never Everyone or Authenticated Users. The Low
// mandatory label (no-write-up) lets Low-integrity WRITE_RESTRICTED children
// initialise USER32 on this desktop; without it the default Medium label fails
// their DLL init. Only this private desktop is labelled; the interactive desktop
// is untouched.
func privateDesktopSDDL(logonSID string) (string, error) {
	if !logonSessionSIDPattern.MatchString(logonSID) {
		return "", fmt.Errorf("logon session SID is malformed")
	}
	return fmt.Sprintf("D:(A;;GA;;;SY)(A;;0x%08x;;;%s)S:(ML;;NW;;;LW)", privateDesktopLogonRights, logonSID), nil
}

// logonSessionSID returns this helper token's logon-session SID (S-1-5-5-x-y).
// The windows-acl sandbox's WRITE_RESTRICTED children keep that SID as a
// restricting SID, so a desktop ACE for it admits them without widening access.
func logonSessionSID() (string, error) {
	token, err := syscall.OpenCurrentProcessToken()
	if err != nil {
		return "", fmt.Errorf("OpenCurrentProcessToken: %w", err)
	}
	defer token.Close()
	var needed uint32
	advapi32.NewProc("GetTokenInformation").Call(uintptr(token), tokenGroupsClass, 0, 0, uintptr(unsafe.Pointer(&needed)))
	if needed == 0 {
		return "", fmt.Errorf("GetTokenInformation(TokenGroups): size query failed")
	}
	buffer := make([]uint64, (needed+7)/8) // uint64 backing keeps the header and SIDs aligned.
	ok, _, nativeErr := advapi32.NewProc("GetTokenInformation").Call(uintptr(token), tokenGroupsClass, uintptr(unsafe.Pointer(&buffer[0])), uintptr(needed), uintptr(unsafe.Pointer(&needed)))
	if err := checked(ok, nativeErr, "GetTokenInformation(TokenGroups)"); err != nil {
		return "", err
	}
	header := (*tokenGroups)(unsafe.Pointer(&buffer[0]))
	groups := unsafe.Slice(&header.Groups[0], header.GroupCount)
	for _, group := range groups {
		if group.Attributes&seGroupLogonID != seGroupLogonID {
			continue
		}
		var text *uint16
		if err := syscall.ConvertSidToStringSid(group.Sid, &text); err != nil {
			return "", fmt.Errorf("ConvertSidToStringSid: %w", err)
		}
		length := 0
		for *(*uint16)(unsafe.Add(unsafe.Pointer(text), length*2)) != 0 {
			length++
		}
		sid := syscall.UTF16ToString(unsafe.Slice(text, length))
		syscall.LocalFree(syscall.Handle(uintptr(unsafe.Pointer(text))))
		return sid, nil
	}
	return "", fmt.Errorf("logon session SID not found in helper token")
}

func runContained(argv []string, options hostOptions) (uint32, error) {
	if len(argv) == 0 {
		return 0, fmt.Errorf("executable is required")
	}
	executable, err := exec.LookPath(argv[0])
	if err != nil {
		return 0, fmt.Errorf("resolve executable: not found")
	}
	executable, err = filepath.Abs(executable)
	if err != nil {
		return 0, fmt.Errorf("resolve absolute executable: %w", err)
	}
	name := options.desktopName
	if name == "" {
		nonce := make([]byte, 16)
		if _, err := rand.Read(nonce); err != nil {
			return 0, err
		}
		name = "FreeCode-headless-" + hex.EncodeToString(nonce)
	}
	namePtr, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return 0, err
	}
	// Fail closed: without the logon-session ACE the restricted child cannot
	// initialise USER32 (STATUS_DLL_INIT_FAILED), so no desktop is created.
	logon, err := logonSessionSID()
	if err != nil {
		return 0, err
	}
	sddl, err := privateDesktopSDDL(logon)
	if err != nil {
		return 0, err
	}
	sddlPtr, err := syscall.UTF16PtrFromString(sddl)
	if err != nil {
		return 0, err
	}
	var descriptor uintptr
	converted, _, convertErr := advapi32.NewProc("ConvertStringSecurityDescriptorToSecurityDescriptorW").Call(uintptr(unsafe.Pointer(sddlPtr)), 1, uintptr(unsafe.Pointer(&descriptor)), 0)
	if err := checked(converted, convertErr, "ConvertStringSecurityDescriptorToSecurityDescriptorW"); err != nil {
		return 0, err
	}
	defer syscall.LocalFree(syscall.Handle(descriptor))
	security := syscall.SecurityAttributes{Length: uint32(unsafe.Sizeof(syscall.SecurityAttributes{})), SecurityDescriptor: descriptor, InheritHandle: 1}
	desktop, _, nativeErr := user32.NewProc("CreateDesktopW").Call(uintptr(unsafe.Pointer(namePtr)), 0, 0, 0, 0xff, uintptr(unsafe.Pointer(&security)))
	if err := checked(desktop, nativeErr, "CreateDesktopW"); err != nil {
		return 0, err
	}
	defer user32.NewProc("CloseDesktop").Call(desktop)

	job, _, nativeErr := kernel32.NewProc("CreateJobObjectW").Call(0, 0)
	if err := checked(job, nativeErr, "CreateJobObjectW"); err != nil {
		return 0, err
	}
	defer syscall.CloseHandle(syscall.Handle(job))
	limits := jobLimits{Flags: 0x2000} // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE; no breakaway.
	ok, _, nativeErr := kernel32.NewProc("SetInformationJobObject").Call(job, 9, uintptr(unsafe.Pointer(&limits)), unsafe.Sizeof(limits))
	if err := checked(ok, nativeErr, "SetInformationJobObject"); err != nil {
		return 0, err
	}

	var diagnostics atomic.Uint32
	var diagnosticLock sync.Mutex
	stopInteractive, err := watchDesktop(0, job, false, options.stderr, &diagnostics, &diagnosticLock)
	if err != nil {
		return 0, err
	}
	defer stopInteractive()
	stopPrivate, err := watchDesktop(desktop, job, true, options.stderr, &diagnostics, &diagnosticLock)
	if err != nil {
		return 0, err
	}
	defer stopPrivate()

	for _, h := range []syscall.Handle{options.stdin, options.stdout, options.stderr} {
		if err := syscall.SetHandleInformation(h, 1, 1); err != nil {
			return 0, fmt.Errorf("inheritable stdio: %w", err)
		}
	}
	command := []string{syscall.EscapeArg(executable)}
	for _, arg := range argv[1:] {
		command = append(command, syscall.EscapeArg(arg))
	}
	commandPtr, err := syscall.UTF16PtrFromString(strings.Join(command, " "))
	if err != nil {
		return 0, err
	}
	executablePtr, _ := syscall.UTF16PtrFromString(executable)
	startup := syscall.StartupInfo{
		Cb: uint32(unsafe.Sizeof(syscall.StartupInfo{})), Desktop: namePtr,
		Flags:      0x101 | 0x80, // USESHOWWINDOW | USESTDHANDLES | FORCEOFFFEEDBACK.
		ShowWindow: 0, StdInput: options.stdin, StdOutput: options.stdout, StdErr: options.stderr,
	}
	var process syscall.ProcessInformation
	err = syscall.CreateProcess(executablePtr, commandPtr, nil, nil, true, 0x08000004, nil, nil, &startup, &process)
	if err != nil {
		return 0, fmt.Errorf("CreateProcessW: %w", err)
	}
	defer syscall.CloseHandle(process.Process)
	defer syscall.CloseHandle(process.Thread)
	ok, _, nativeErr = kernel32.NewProc("AssignProcessToJobObject").Call(job, uintptr(process.Process))
	if err := checked(ok, nativeErr, "AssignProcessToJobObject"); err != nil {
		syscall.TerminateProcess(process.Process, 125) // Only our still-suspended target.
		return 0, err
	}
	resumed, _, nativeErr := kernel32.NewProc("ResumeThread").Call(uintptr(process.Thread))
	if resumed == 0xffffffff {
		return 0, fmt.Errorf("ResumeThread: %w", nativeErr)
	}
	if _, err := syscall.WaitForSingleObject(process.Process, syscall.INFINITE); err != nil {
		return 0, err
	}
	var code uint32
	err = syscall.GetExitCodeProcess(process.Process, &code)
	return code, err
}

func shouldHide(owned, visible bool, object, child int32) bool {
	return owned && visible && object == 0 && child == 0
}

// Hooks run on two dedicated message-loop threads, not timers: one on the
// interactive desktop for accidental escapes, one on the private desktop for
// metadata evidence. Kernel Job membership, not a name/PID ancestry heuristic,
// scopes every action. This never inspects window titles or captures contents.
func watchDesktop(desktop, job uintptr, private bool, stderr syscall.Handle, count *atomic.Uint32, lock *sync.Mutex) (func(), error) {
	type readyResult struct {
		thread uintptr
		err    error
	}
	ready := make(chan readyResult)
	finished := make(chan struct{})
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		defer close(finished)
		thread, _, _ := kernel32.NewProc("GetCurrentThreadId").Call()
		previous, _, _ := user32.NewProc("GetThreadDesktop").Call(thread)
		if desktop != 0 {
			ok, _, err := user32.NewProc("SetThreadDesktop").Call(desktop)
			if failure := checked(ok, err, "SetThreadDesktop"); failure != nil {
				ready <- readyResult{err: failure}
				return
			}
			defer user32.NewProc("SetThreadDesktop").Call(previous)
		}
		callback := syscall.NewCallback(func(_hook, _event, hwnd, object, child, _thread, _time uintptr) uintptr {
			if int32(object) != 0 || int32(child) != 0 {
				return 0
			}
			var pid uint32
			user32.NewProc("GetWindowThreadProcessId").Call(hwnd, uintptr(unsafe.Pointer(&pid)))
			process, err := syscall.OpenProcess(0x1000, false, pid)
			if err != nil {
				return 0
			}
			defer syscall.CloseHandle(process)
			var owned int32
			kernel32.NewProc("IsProcessInJob").Call(uintptr(process), job, uintptr(unsafe.Pointer(&owned)))
			visible, _, _ := user32.NewProc("IsWindowVisible").Call(hwnd)
			if !shouldHide(owned != 0, visible != 0, int32(object), int32(child)) {
				return 0
			}
			user32.NewProc("ShowWindowAsync").Call(hwnd, 0)
			if count.Add(1) > 32 {
				return 0
			} // Bound diagnostics, not enforcement.
			class := make([]uint16, 128)
			user32.NewProc("GetClassNameW").Call(hwnd, uintptr(unsafe.Pointer(&class[0])), uintptr(len(class)))
			image := make([]uint16, 32768)
			size := uint32(len(image))
			kernel32.NewProc("QueryFullProcessImageNameW").Call(uintptr(process), 0, uintptr(unsafe.Pointer(&image[0])), uintptr(unsafe.Pointer(&size)))
			evidence, _ := json.Marshal(map[string]any{"event": "headless-window", "pid": pid, "class": syscall.UTF16ToString(class), "executable": filepath.Base(syscall.UTF16ToString(image)), "privateDesktop": private})
			lock.Lock()
			var written uint32
			syscall.WriteFile(stderr, append(append([]byte("[headless-window] "), evidence...), '\n'), &written, nil)
			lock.Unlock()
			return 0
		})
		hook, _, err := user32.NewProc("SetWinEventHook").Call(0x8000, 0x8002, 0, callback, 0, 0, 0)
		if hook == 0 {
			ready <- readyResult{err: fmt.Errorf("SetWinEventHook: %w", err)}
			return
		}
		defer user32.NewProc("UnhookWinEvent").Call(hook)
		var message struct {
			window         uintptr
			kind           uint32
			wParam, lParam uintptr
			time           uint32
			x, y           int32
			private        uint32
		}
		user32.NewProc("PeekMessageW").Call(uintptr(unsafe.Pointer(&message)), 0, 0, 0, 0)
		ready <- readyResult{thread: thread}
		for {
			result, _, _ := user32.NewProc("GetMessageW").Call(uintptr(unsafe.Pointer(&message)), 0, 0, 0)
			if result == 0 || int32(result) == -1 {
				return
			}
			user32.NewProc("TranslateMessage").Call(uintptr(unsafe.Pointer(&message)))
			user32.NewProc("DispatchMessageW").Call(uintptr(unsafe.Pointer(&message)))
		}
	}()
	result := <-ready
	if result.err != nil {
		<-finished
		return nil, result.err
	}
	return func() { user32.NewProc("PostThreadMessageW").Call(result.thread, 0x12, 0, 0); <-finished }, nil
}
