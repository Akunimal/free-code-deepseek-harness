package config

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
)

// SaveAtomic writes normalized JSON and keeps the preceding file as
// config.json.bak. The temporary file is created beside the target so the
// final rename stays on the same filesystem.
func SaveAtomic(path string, cfg Config) error {
	cfg.PasswordForSave()
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("encode config: %w", err)
	}
	data = append(data, '\n')
	dir := filepath.Dir(path)
	temp, err := os.CreateTemp(dir, ".config-*.tmp")
	if err != nil {
		return fmt.Errorf("create temporary config: %w", err)
	}
	tempPath := temp.Name()
	defer os.Remove(tempPath)
	if _, err = temp.Write(data); err == nil {
		err = temp.Sync()
	}
	closeErr := temp.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return fmt.Errorf("write temporary config: %w", err)
	}
	if info, statErr := os.Stat(path); statErr == nil {
		_ = os.Chmod(tempPath, info.Mode().Perm())
	}

	backup := path + ".bak"
	if runtime.GOOS == "windows" {
		_ = os.Remove(backup)
		if _, statErr := os.Stat(path); statErr == nil {
			if err := os.Rename(path, backup); err != nil {
				return fmt.Errorf("backup config: %w", err)
			}
		}
		if err := os.Rename(tempPath, path); err != nil {
			_ = os.Rename(backup, path)
			return fmt.Errorf("replace config: %w", err)
		}
		return nil
	}
	if _, statErr := os.Stat(path); statErr == nil {
		if err := copyFile(path, backup); err != nil {
			return fmt.Errorf("backup config: %w", err)
		}
	}
	if err := os.Rename(tempPath, path); err != nil {
		return fmt.Errorf("replace config: %w", err)
	}
	return nil
}

func copyFile(source, target string) error {
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()
	mode := os.FileMode(0600)
	if info, statErr := in.Stat(); statErr == nil {
		mode = info.Mode().Perm()
	}
	out, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, mode)
	if err != nil {
		return err
	}
	_ = out.Chmod(mode)
	_, copyErr := io.Copy(out, in)
	syncErr := out.Sync()
	closeErr := out.Close()
	if copyErr != nil {
		return copyErr
	}
	if syncErr != nil {
		return syncErr
	}
	return closeErr
}
