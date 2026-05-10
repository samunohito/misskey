#!/bin/bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 Affaan Mustafa and everything-claude-code contributors
#
# Strategic Compact Suggester
# Runs on PreToolUse or periodically to suggest manual compaction at logical intervals
#
# Upstream:        https://github.com/affaan-m/everything-claude-code (v2.0.0-rc.1)
# Upstream path:   skills/strategic-compact/suggest-compact.sh
# Upstream license: MIT — https://github.com/affaan-m/everything-claude-code/blob/main/LICENSE
# Project-level notice: see .claude/THIRD_PARTY_LICENSES.md (Misskey 内サードパーティ一覧 + MIT 全文)
#
# Imported into Misskey .claude/ on 2026-05-10 as a verbatim copy
# (no dependency on the ECC plugin runtime).
#
# Why manual over auto-compact:
# - Auto-compact happens at arbitrary points, often mid-task
# - Strategic compacting preserves context through logical phases
# - Compact after exploration, before execution
# - Compact after completing a milestone, before starting next
#
# Hook config (in ~/.claude/settings.json):
# {
#   "hooks": {
#     "PreToolUse": [{
#       "matcher": "Edit|Write",
#       "hooks": [{
#         "type": "command",
#         "command": "<repo-root>/.claude/skills/strategic-compact/suggest-compact.sh"
#       }]
#     }]
#   }
# }
#
# Criteria for suggesting compact:
# - Session has been running for extended period
# - Large number of tool calls made
# - Transitioning from research/exploration to implementation
# - Plan has been finalized

# Track tool call count (increment in a temp file)
# Use CLAUDE_SESSION_ID for session-specific counter (not $$ which changes per invocation)
SESSION_ID="${CLAUDE_SESSION_ID:-${PPID:-default}}"
# Use XDG_RUNTIME_DIR (user-private, mode 0700) when available.
# When falling back to /tmp, create a per-user subdirectory with 0700 to avoid
# symlink/race-condition attacks from other users on shared machines.
if [ -n "${XDG_RUNTIME_DIR:-}" ] && [ -d "$XDG_RUNTIME_DIR" ]; then
  COUNTER_DIR="$XDG_RUNTIME_DIR"
else
  COUNTER_DIR="/tmp/claude-compact-${UID:-$(id -u)}"
  ( umask 077 && mkdir -p "$COUNTER_DIR" ) 2>/dev/null
fi
COUNTER_FILE="$COUNTER_DIR/claude-tool-count-${SESSION_ID}"
THRESHOLD=${COMPACT_THRESHOLD:-50}

# Initialize or increment counter
if [ -f "$COUNTER_FILE" ]; then
  count=$(cat "$COUNTER_FILE")
  count=$((count + 1))
  echo "$count" > "$COUNTER_FILE"
else
  echo "1" > "$COUNTER_FILE"
  count=1
fi

# Suggest compact after threshold tool calls
if [ "$count" -eq "$THRESHOLD" ]; then
  echo "[StrategicCompact] $THRESHOLD tool calls reached - consider /compact if transitioning phases" >&2
fi

# Suggest at regular intervals after threshold
if [ "$count" -gt "$THRESHOLD" ] && [ $((count % 25)) -eq 0 ]; then
  echo "[StrategicCompact] $count tool calls - good checkpoint for /compact if context is stale" >&2
fi
