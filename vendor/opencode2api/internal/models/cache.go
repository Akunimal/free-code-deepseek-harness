package models

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"opencode2api/internal/config"
	wire "opencode2api/internal/protocol"
)

const modelCatalogCacheSchemaVersion = 3

var modelCatalogCacheWriteMu sync.Mutex

type modelCatalogCache struct {
	SchemaVersion   int                                      `json:"schema_version"`
	UpdatedAt       time.Time                                `json:"updated_at"`
	Zen             []string                                 `json:"zen"`
	Go              []string                                 `json:"go"`
	NativeProtocols map[config.Tier]map[string]wire.Protocol `json:"native_protocols"`
	Unsupported     map[config.Tier]map[string]bool          `json:"unsupported"`
	Metadata        map[config.Tier]map[string]Metadata      `json:"metadata,omitempty"`
}

// LoadCache installs a validated disk snapshot into a catalog. It deliberately
// changes only discovered state; configured protocol overrides and routing
// preferences stay owned by the current Config.
func (c *Catalog) LoadCache(path string) error {
	cache, err := loadModelCatalogCache(path)
	if err != nil {
		return err
	}
	c.mu.Lock()
	c.zen = toSet(cache.Zen)
	c.goModels = toSet(cache.Go)
	c.nativeProtocols = cloneTierProtocols(cache.NativeProtocols)
	c.unsupported = cloneTierBools(cache.Unsupported)
	c.modelMeta = cloneModelMeta(cache.Metadata)
	c.updatedAt = cache.UpdatedAt.UTC()
	c.cacheSource = "disk"
	c.stale = true
	if c.cachePath == "" {
		c.cachePath = path
	}
	c.mu.Unlock()
	return nil
}

// SaveCache snapshots only public model capability data. Credentials and
// proxy configuration are not part of modelCatalog and can never enter this
// file.
func (c *Catalog) SaveCache() error {
	c.mu.RLock()
	path := c.cachePath
	cache := modelCatalogCache{
		SchemaVersion:   modelCatalogCacheSchemaVersion,
		UpdatedAt:       c.updatedAt.UTC(),
		Zen:             sortedSetKeys(c.zen),
		Go:              sortedSetKeys(c.goModels),
		NativeProtocols: cloneTierProtocols(c.nativeProtocols),
		Unsupported:     cloneTierBools(c.unsupported),
		Metadata:        cloneModelMeta(c.modelMeta),
	}
	c.mu.RUnlock()
	if path == "" {
		return nil
	}
	return saveModelCatalogCache(path, cache)
}

func CatalogCachePath(configPath string) string {
	if configPath == "" {
		return ""
	}
	return configPath + ".models.catalog.json"
}

func loadModelCatalogCache(path string) (modelCatalogCache, error) {
	if path == "" {
		return modelCatalogCache{}, os.ErrNotExist
	}
	file, err := os.Open(path)
	if err != nil {
		return modelCatalogCache{}, err
	}
	defer file.Close()
	var cache modelCatalogCache
	decoder := json.NewDecoder(io.LimitReader(file, 32<<20))
	if err := decoder.Decode(&cache); err != nil {
		return modelCatalogCache{}, err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return modelCatalogCache{}, errors.New("model catalog cache contains multiple JSON values")
		}
		return modelCatalogCache{}, err
	}
	if cache.SchemaVersion != modelCatalogCacheSchemaVersion {
		return modelCatalogCache{}, fmt.Errorf("unsupported model catalog cache schema version %d", cache.SchemaVersion)
	}
	if cache.UpdatedAt.IsZero() {
		return modelCatalogCache{}, errors.New("model catalog cache is missing updated_at")
	}
	cache.Zen = normalizeModelIDs(cache.Zen)
	cache.Go = normalizeModelIDs(cache.Go)
	if len(cache.Zen) == 0 && len(cache.Go) == 0 {
		return modelCatalogCache{}, errors.New("model catalog cache is empty")
	}
	if err := validateCatalogCapabilities(cache.NativeProtocols, cache.Unsupported); err != nil {
		return modelCatalogCache{}, err
	}
	cache.NativeProtocols = cloneTierProtocols(cache.NativeProtocols)
	cache.Unsupported = cloneTierBools(cache.Unsupported)
	cache.UpdatedAt = cache.UpdatedAt.UTC()
	return cache, nil
}

func normalizeModelIDs(items []string) []string {
	seen := make(map[string]struct{}, len(items))
	result := make([]string, 0, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		result = append(result, item)
	}
	sort.Strings(result)
	return result
}

func validateCatalogCapabilities(native map[config.Tier]map[string]wire.Protocol, unsupported map[config.Tier]map[string]bool) error {
	for tier, protocols := range native {
		if tier != config.TierZen && tier != config.TierGo {
			return fmt.Errorf("model catalog cache contains unknown tier %q", tier)
		}
		for model, protocol := range protocols {
			if model == "" || !wire.Valid(protocol) {
				return fmt.Errorf("model catalog cache contains invalid protocol for %q", model)
			}
		}
	}
	for tier, models := range unsupported {
		if tier != config.TierZen && tier != config.TierGo {
			return fmt.Errorf("model catalog cache contains unknown tier %q", tier)
		}
		for model := range models {
			if strings.TrimSpace(model) == "" {
				return errors.New("model catalog cache contains an empty unsupported model")
			}
		}
	}
	return nil
}

func saveModelCatalogCache(path string, cache modelCatalogCache) error {
	if path == "" {
		return nil
	}
	modelCatalogCacheWriteMu.Lock()
	defer modelCatalogCacheWriteMu.Unlock()
	data, err := json.MarshalIndent(cache, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	dir := filepath.Dir(path)
	temp, err := os.CreateTemp(dir, ".models-catalog-*.tmp")
	if err != nil {
		return err
	}
	tempPath := temp.Name()
	defer os.Remove(tempPath)
	if err = temp.Chmod(0600); err == nil {
		_, err = temp.Write(data)
	}
	if err == nil {
		err = temp.Sync()
	}
	if closeErr := temp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}

	if runtime.GOOS == "windows" {
		backup := path + ".replace"
		if err := os.Remove(backup); err != nil && !os.IsNotExist(err) {
			return err
		}
		hadOld := false
		if _, statErr := os.Stat(path); statErr == nil {
			if err := os.Rename(path, backup); err != nil {
				return err
			}
			hadOld = true
		} else if !os.IsNotExist(statErr) {
			return statErr
		}
		if err := os.Rename(tempPath, path); err != nil {
			if hadOld {
				_ = os.Rename(backup, path)
			}
			return err
		}
		if hadOld {
			_ = os.Remove(backup)
		}
		return nil
	}
	return os.Rename(tempPath, path)
}
