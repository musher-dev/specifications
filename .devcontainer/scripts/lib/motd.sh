#!/usr/bin/env bash
# motd.sh — Renders a startup MOTD summarizing the dev container state.
#
# This is a library file meant to be sourced, not executed directly.
# Requires common.sh (has_cmd, log) to be sourced first.
#
# Usage: source "path/to/motd.sh"; show_motd "/path/to/.devcontainer"

if [[ -z "${_MOTD_SH_LOADED:-}" ]]; then
readonly _MOTD_SH_LOADED=1

# --- Color setup ---

_motd_setup_colors() {
  if [[ -t 1 ]] && has_cmd tput; then
    _BOLD="$(tput bold)"
    _DIM="$(tput dim)"
    _YELLOW="$(tput setaf 3)"
    _CYAN="$(tput setaf 6)"
    _RESET="$(tput sgr0)"
  else
    _BOLD="" _DIM="" _YELLOW="" _CYAN="" _RESET=""
  fi
}

# --- Sub-functions ---

_motd_header() {
  local line
  line="$(printf '═%.0s' {1..58})"
  echo "${_BOLD}${line}${_RESET}"
  echo "${_BOLD}  Musher Dev Container${_RESET}"
  echo "${_BOLD}${line}${_RESET}"
}

# Prints a detected runtime version, or skips if not found.
#
# Arguments:
#   $1 — command name
#   $2 — display label
#   $3 — version extraction command (eval'd)
_motd_runtime_entry() {
  local cmd="$1" label="$2" version_cmd="$3"
  if has_cmd "$cmd"; then
    local ver
    ver="$(eval "$version_cmd" 2>/dev/null || echo "?")"
    printf "  ${_CYAN}%-9s${_RESET} %-14s" "$label" "$ver"
  else
    printf "  %-9s %-14s" "" ""
  fi
}

# The two runtimes this container provides: node from its Feature, for the npm
# CLIs tools/ installs, and bun from mise, which runs tools/.
_motd_runtimes() {
  local sep
  sep="$(printf '─%.0s' {1..54})"
  echo ""
  echo "  ${_BOLD}Runtimes${_RESET}"
  echo "  ${_DIM}${sep}${_RESET}"
  _motd_runtime_entry node "node" "node -v"
  _motd_runtime_entry bun "bun" "bun -v"
  echo ""
}

_motd_quickref() {
  local sep
  sep="$(printf '─%.0s' {1..54})"
  echo ""
  echo "  ${_BOLD}Quick Reference${_RESET}"
  echo "  ${_DIM}${sep}${_RESET}"
  echo "  git status / log / diff"
  echo "  task                             Task runner"
  echo "  claude                           Claude Code AI"
}

# Warns when .env is missing keys from .env.example, or has empty
# required values. Silent when env is healthy.
#
# Globals:
#   _BOLD, _DIM, _YELLOW, _RESET — color codes set by _motd_setup_colors
# Arguments:
#   $1 — .devcontainer directory (where .env / .env.example live)
_motd_env_warnings() {
  local devcontainer_dir="${1:-}"
  [[ -d "${devcontainer_dir}" ]] || return 0

  local env_file="${devcontainer_dir}/.env"
  local example_file="${devcontainer_dir}/.env.example"
  local lib_file="${devcontainer_dir}/scripts/lib/env-check.sh"
  [[ -f "${lib_file}" ]] || return 0

  # shellcheck source=./env-check.sh
  source "${lib_file}"

  local missing="" required=""
  if [[ -f "${example_file}" ]]; then
    missing="$(env_check_drift "${env_file}" "${example_file}" 2>&1 || true)"
  fi
  required="$(env_check_required "${env_file}" 2>/dev/null || true)"

  if [[ -z "${missing}" && -z "${required}" ]]; then
    return 0
  fi

  local sep
  sep="$(printf '─%.0s' {1..54})"
  echo ""
  echo "  ${_BOLD}${_YELLOW}Environment${_RESET}"
  echo "  ${_DIM}${sep}${_RESET}"
  if [[ -n "${missing}" ]]; then
    echo "  ${_YELLOW}Missing keys in .env (copy them from .env.example; 'task env:check' lists them):${_RESET}"
    awk '{print "    - " $0}' <<< "${missing}"
  fi
  if [[ -n "${required}" ]]; then
    echo "  ${_YELLOW}Required keys with empty values:${_RESET}"
    awk '{print "    - " $0}' <<< "${required}"
  fi
}

_motd_tips() {
  local sep
  sep="$(printf '─%.0s' {1..54})"
  echo ""
  echo "  ${_BOLD}Tips${_RESET}"
  echo "  ${_DIM}${sep}${_RESET}"
  echo "  * Tool versions:           .config/mise/config.toml"
  echo "  * Local overrides:         .devcontainer/.env"
}

# Renders the full MOTD to stdout.
#
# Arguments:
#   $1 — path to .devcontainer/ directory (may be empty to skip env warnings)
# Outputs:
#   MOTD text to stdout
show_motd() {
  local devcontainer_dir="${1:-}"
  _motd_setup_colors

  local border
  border="$(printf '═%.0s' {1..58})"

  echo ""
  _motd_header
  _motd_runtimes
  _motd_env_warnings "$devcontainer_dir"
  _motd_quickref
  _motd_tips
  echo "${_BOLD}${border}${_RESET}"
  echo ""
}

fi
