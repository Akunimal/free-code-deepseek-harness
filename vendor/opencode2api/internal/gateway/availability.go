package gateway

import (
	"context"

	"errors"

	"time"

	"opencode2api/internal/models"
)

func (m *RuntimeManager) AvailabilitySnapshot() []models.Availability {
	items := []models.Availability{}
	r := m.current.Load()
	if r == nil {
		return items
	}
	for _, model := range r.gateway.catalog.List() {
		if r.gateway.catalog.IsFreeModel(model) {
			items = append(items, r.availability.Get(model))
		}
	}
	return items
}

func (m *RuntimeManager) RestoreModel(model string) error {
	m.updateMu.Lock()
	defer m.updateMu.Unlock()
	r := m.current.Load()
	if r == nil {
		return errors.New("gateway runtime is unavailable")
	}
	for _, item := range m.AvailabilitySnapshot() {
		if item.Model == model {
			return r.availability.Restore(model, time.Now().UTC())
		}
	}
	return errors.New("unknown free model")
}

// SetManualModel switches a free model between manual and automatic control.
// Manual models stay enabled and are excluded from automatic probing.
func (m *RuntimeManager) SetManualModel(model string, manual bool) error {
	m.updateMu.Lock()
	defer m.updateMu.Unlock()
	r := m.current.Load()
	if r == nil {
		return errors.New("gateway runtime is unavailable")
	}
	for _, item := range m.AvailabilitySnapshot() {
		if item.Model == model {
			return r.availability.SetManual(model, manual, time.Now().UTC())
		}
	}
	return errors.New("unknown free model")
}

func (m *RuntimeManager) startAvailabilityChecks() {
	ctx, cancel := context.WithCancel(m.root)
	m.availabilityCancel = cancel
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			m.checkFreeModels(ctx)
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}

func (m *RuntimeManager) checkFreeModels(ctx context.Context) {
	for _, item := range m.AvailabilitySnapshot() {
		if ctx.Err() != nil {
			return
		}
		r := m.current.Load()
		if r == nil {
			return
		}
		item = r.availability.Get(item.Model)
		if item.Manual {
			continue
		}
		if time.Now().Before(item.NextCheck) {
			continue
		}
		result := r.gateway.probeFreeModel(ctx, item.Model)
		if !result.attempted || ctx.Err() != nil {
			continue
		}
		// Config changes may replace credentials or endpoints during a probe.
		m.updateMu.Lock()
		if m.current.Load() == r {
			if err := r.availability.Record(item.Model, item.Generation, result.success, result.reason, result.channel, time.Now().UTC(), result.effort); err != nil {
				m.logger.Warn("model availability state save failed", "error", err)
			}
			m.logger.Info("free model availability checked", "component", "models", "event", "availability_checked", "model", item.Model, "available", result.success, "reason", result.reason, "channel", result.channel)
		}
		m.updateMu.Unlock()
	}
}
