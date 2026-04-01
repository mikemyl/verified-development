#!/bin/bash
# SessionStart hook: remind Claude to read .verified/state.md

STATE_FILE=".verified/state.md"

if [ -f "$STATE_FILE" ]; then
  FEATURE=$(grep -m1 '^feature:' "$STATE_FILE" | sed 's/feature: *//')
  PHASE=$(grep -m1 '^phase:' "$STATE_FILE" | sed 's/phase: *//')
  STATUS=$(grep -m1 '^status:' "$STATE_FILE" | sed 's/status: *//')
  LAST=$(grep -m1 '^last_activity:' "$STATE_FILE" | sed 's/last_activity: *//')

  if [ -n "$FEATURE" ] && [ "$FEATURE" != "none" ]; then
    echo "{\"additionalContext\": \"VERIFIED DEVELOPMENT: Read .verified/state.md before doing anything. Current state: feature=${FEATURE}, phase=${PHASE}, status=${STATUS}. Last activity: ${LAST}. Tell the user where things stand and what the next step is.\"}"
  fi
fi
