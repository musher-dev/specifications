#!/usr/bin/env bash
# startup.sh — Shows the startup MOTD each time the container starts.
#
# This repository runs no supporting services (devcontainer.json says why), so
# there is nothing to start: the MOTD reports the container's state, and warns
# when .devcontainer/.env has drifted from its template.
#
# Usage: Called automatically by devcontainer.json postStartCommand.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
DEVCONTAINER_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly DEVCONTAINER_DIR

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/motd.sh
source "${SCRIPT_DIR}/lib/motd.sh"

# Logs the failing command and line number on ERR.
#
# Arguments:
#   $1 — line number
#   $2 — failed command string
# Outputs:
#   Writes error details to stderr via log()
on_error() {
  local line="${1}"
  local cmd="${2}"
  log "ERROR: command '${cmd}' failed at line ${line}"
}
trap 'on_error ${LINENO} "${BASH_COMMAND}"' ERR

# Entry point: renders the MOTD.
#
# Outputs:
#   MOTD text to stdout
main() {
  show_motd "${DEVCONTAINER_DIR}"
}

main "$@"
