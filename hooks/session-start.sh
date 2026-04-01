#!/bin/bash
# SessionStart hook: remind Claude to read .verified/state.md

STATE_FILE=".verified/state.md"

if [ -f "$STATE_FILE" ]; then
  FEATURE=$(grep -m1 '^feature:' "$STATE_FILE" | sed 's/feature: *//')
  PHASE=$(grep -m1 '^phase:' "$STATE_FILE" | sed 's/phase: *//')
  STATUS=$(grep -m1 '^status:' "$STATE_FILE" | sed 's/status: *//')
  LAST=$(grep -m1 '^last_activity:' "$STATE_FILE" | sed 's/last_activity: *//')

  if [ -n "$FEATURE" ] && [ "$FEATURE" != "none" ]; then
    echo "{\"additionalContext\": \"STOP. Before responding to the user, you MUST report this status first:\\n\\nVerified Development Status:\\n  Feature: ${FEATURE}\\n  Phase: ${PHASE}\\n  Status: ${STATUS}\\n  Last: ${LAST}\\n\\nRead .verified/state.md and .verified/features/${FEATURE}/plan.md to understand the full context. Tell the user the current state and suggest the next step BEFORE doing anything else. Do NOT skip this.\"}"
  fi
fi
