#!/usr/bin/env bash

# Resolve a key path written in a production env file before passing it to
# OpenSSH. Windows users may keep a native C:/... path while the deployment
# script is executed by WSL, where the same file is exposed as /mnt/c/....
resolve_deploy_ssh_key() {
  local configured="${1:-}"
  if [[ -z "$configured" ]]; then
    printf '\n'
    return 0
  fi

  if [[ -f "$configured" ]]; then
    printf '%s\n' "$configured"
    return 0
  fi

  if command -v wslpath >/dev/null 2>&1; then
    local converted
    converted="$(wslpath -u "$configured" 2>/dev/null || true)"
    if [[ -f "$converted" ]]; then
      printf '%s\n' "$converted"
      return 0
    fi
  fi

  printf '%s\n' "$configured"
}

resolve_deploy_ssh_known_hosts() {
  local configured="${1:-}"
  if [[ -z "$configured" ]]; then
    printf '\n'
    return 0
  fi

  local converted candidate
  if [[ -f "$configured" ]]; then
    candidate="$(dirname "$configured")/known_hosts"
    if [[ -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  fi

  if ! command -v wslpath >/dev/null 2>&1; then
    printf '\n'
    return 0
  fi

  converted="$(wslpath -u "$configured" 2>/dev/null || true)"
  if [[ -z "$converted" ]]; then
    printf '\n'
    return 0
  fi

  candidate="$(dirname "$converted")/known_hosts"
  if [[ -f "$candidate" ]]; then
    printf '%s\n' "$candidate"
  else
    printf '\n'
  fi
}

deploy_ssh() {
  local key="${1:-}"
  local known_hosts="${2:-}"
  local host="${3:-}"
  local command="${4:-}"
  local ssh_binary=ssh
  local key_argument="$key"
  local known_hosts_argument="$known_hosts"

  # WSL sees Windows-mounted private keys as mode 0777, which native Linux
  # OpenSSH rejects. Use the Windows OpenSSH client in that case and convert
  # the mounted paths back to native Windows paths.
  if command -v ssh.exe >/dev/null 2>&1 && [[ "$key" == /mnt/* || "$known_hosts" == /mnt/* ]]; then
    ssh_binary=ssh.exe
    if [[ "$key" == /mnt/* ]]; then key_argument="$(wslpath -w "$key")"; fi
    if [[ "$known_hosts" == /mnt/* ]]; then known_hosts_argument="$(wslpath -w "$known_hosts")"; fi
  fi

  if [[ -n "$key_argument" && -n "$known_hosts_argument" ]]; then
    "$ssh_binary" -o BatchMode=yes -o "UserKnownHostsFile=$known_hosts_argument" -i "$key_argument" "$host" "$command"
  elif [[ -n "$key_argument" ]]; then
    "$ssh_binary" -o BatchMode=yes -i "$key_argument" "$host" "$command"
  elif [[ -n "$known_hosts_argument" ]]; then
    "$ssh_binary" -o BatchMode=yes -o "UserKnownHostsFile=$known_hosts_argument" "$host" "$command"
  else
    "$ssh_binary" -o BatchMode=yes "$host" "$command"
  fi
}

deploy_rsync() {
  local key="${1:-}"
  local known_hosts="${2:-}"
  shift 2

  local ssh_binary=ssh
  local key_argument="$key"
  local known_hosts_argument="$known_hosts"
  if command -v ssh.exe >/dev/null 2>&1 && [[ "$key" == /mnt/* || "$known_hosts" == /mnt/* ]]; then
    ssh_binary=ssh.exe
    if [[ "$key" == /mnt/* ]]; then key_argument="$(wslpath -w "$key")"; fi
    if [[ "$known_hosts" == /mnt/* ]]; then known_hosts_argument="$(wslpath -w "$known_hosts")"; fi
  fi

  local ssh_transport="$ssh_binary -o BatchMode=yes"
  if [[ -n "$key_argument" ]]; then
    ssh_transport="$ssh_transport -i \"$key_argument\""
  fi
  if [[ -n "$known_hosts_argument" ]]; then
    ssh_transport="$ssh_transport -o \"UserKnownHostsFile=$known_hosts_argument\""
  fi

  rsync -az -e "$ssh_transport" "$@"
}
