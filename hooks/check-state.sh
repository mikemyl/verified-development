#!/bin/bash
# UserPromptSubmit hook: inject verified-development state into context
# Fires on every user message, but only outputs if .verified/state.md exists
# and has an active feature

STATE_FILE=".verified/state.md"

if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

FEATURE=$(grep -m1 '^feature:' "$STATE_FILE" | sed 's/feature: *//')
PHASE=$(grep -m1 '^phase:' "$STATE_FILE" | sed 's/phase: *//')
STATUS=$(grep -m1 '^status:' "$STATE_FILE" | sed 's/status: *//')
LAST=$(grep -m1 '^last_activity:' "$STATE_FILE" | sed 's/last_activity: *//')

if [ -z "$FEATURE" ] || [ "$FEATURE" = "none" ]; then
  exit 0
fi

cat << EOJSON
{"additionalContext": "[verified-development] Active feature: ${FEATURE} | Phase: ${PHASE} | Status: ${STATUS} | Last: ${LAST} — Read .verified/state.md and the feature's plan.md before starting work. Report current state to the user first."}
EOJSON
