package models

import (
	"testing"
	"time"
)

func TestManualRestoreIsNotOverwrittenByAutomaticProbe(t *testing.T) {
	store, err := NewAvailabilityStore("")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 13, 12, 0, 0, 0, time.UTC)
	if err := store.Restore("opencode/gpt-free", now); err != nil {
		t.Fatal(err)
	}
	manual := store.Get("opencode/gpt-free")
	if !manual.Manual || manual.Disabled {
		t.Fatalf("manual restore should keep the model enabled: %+v", manual)
	}
	if err := store.Record(manual.Model, manual.Generation, false, "model_unavailable", "probe", now.Add(time.Minute), EffortProbe{}); err != nil {
		t.Fatal(err)
	}
	afterProbe := store.Get(manual.Model)
	if !afterProbe.Manual || afterProbe.Disabled || afterProbe.Reason != "manually_enabled" {
		t.Fatalf("automatic probe overwrote operator's manual choice: %+v", afterProbe)
	}
}

func TestTransientProbeFailureDoesNotDisableModel(t *testing.T) {
	store, err := NewAvailabilityStore("")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 13, 12, 0, 0, 0, time.UTC)
	if err := store.Record("opencode/gpt-free", 0, false, "timeout", "probe", now, EffortProbe{}); err != nil {
		t.Fatal(err)
	}
	state := store.Get("opencode/gpt-free")
	if state.Disabled {
		t.Fatalf("a transient probe failure disabled the model: %+v", state)
	}
	if want := now.Add(FreeModelCheckInterval); !state.NextCheck.Equal(want) {
		t.Fatalf("transient failure next probe = %s, want %s", state.NextCheck, want)
	}
}
