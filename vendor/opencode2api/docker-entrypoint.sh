#!/bin/sh
set -eu

state_dir=${STATE_DIR:-/var/lib/opencode2api}
config_path=${CONFIG_PATH:-$state_dir/config.json}
config_seed_path=${CONFIG_SEED_PATH:-}
# Empty means "defer to config.json". Only an explicitly provided value becomes
# a command-line override, so the file stays authoritative as documented.
listen_address=${LISTEN_ADDRESS:-}
webui_listen_address=${WEBUI_LISTEN_ADDRESS:-}

if [ "$(id -u)" = "0" ]; then
    mkdir -p "$state_dir"
    chown opencode2api:opencode2api "$state_dir"
    exec su-exec opencode2api:opencode2api "$0" "$@"
fi

if [ "$#" -gt 0 ]; then
    exec "$@"
fi

# The example config binds the API to loopback, which is unreachable from
# outside a container through published ports. Rewrite only that exact default
# while seeding; any other address is left exactly as the operator wrote it.
seed_container_listen() {
    if grep -q '"listen"[[:space:]]*:[[:space:]]*"127.0.0.1:8080"' "$1"; then
        sed -i 's|"listen"[[:space:]]*:[[:space:]]*"127.0.0.1:8080"|"listen": "0.0.0.0:8080"|' "$1"
        printf '%s\n' "Seeded $1 with listen 0.0.0.0:8080 so it is reachable through published ports."
    fi
}

if [ ! -f "$config_path" ]; then
    mkdir -p "$(dirname "$config_path")"
    if [ -n "$config_seed_path" ] && [ -f "$config_seed_path" ]; then
        cp "$config_seed_path" "$config_path"
        seed_container_listen "$config_path"
        printf '%s\n' "Initialized $config_path from $config_seed_path."
    else
        cp /app/config.example.json "$config_path"
        seed_container_listen "$config_path"
        printf '%s\n' \
            "config.json not found; created $config_path. Set API keys or enable anonymous mode, and change the WebUI password before use."
    fi
fi

set -- /usr/local/bin/opencode2api -config "$config_path"
if [ -n "$listen_address" ]; then
    set -- "$@" -listen "$listen_address"
fi
if [ -n "$webui_listen_address" ]; then
    set -- "$@" -web-listen "$webui_listen_address"
fi
exec "$@"
