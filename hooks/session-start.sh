#!/bin/bash
# SessionStart hook: read .verified/state.md and any in-flight handoff,
# emit a resume banner the agent must report before responding.
#
# Output uses the hookSpecificOutput envelope — bare additionalContext
# is silently dropped by Claude Code.
# https://code.claude.com/docs/en/hooks.md

set -eu

STATE_FILE=".verified/state.md"

if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

# Tolerant frontmatter scrape — values may be quoted, plain, or absent.
unquote() { sed -E 's/^[[:space:]]*//; s/^"//; s/"$//; s/^'\''//; s/'\''$//'; }
field() {
  grep -m1 "^$1:" "$STATE_FILE" 2>/dev/null | sed -E "s/^$1:[[:space:]]*//" | unquote
}

FEATURE=$(field feature)
PHASE=$(field phase)
STATUS=$(field status)
LAST=$(field last_activity)
NEXT_ACTION=$(field next_action)

if [ -z "$FEATURE" ] || [ "$FEATURE" = "none" ]; then
  exit 0
fi

HANDOFF_PATH=".verified/features/${FEATURE}/handoff.json"
RESUME_BANNER=""

if [ -f "$HANDOFF_PATH" ]; then
  # Report N/M task progress and timestamp without parsing JSON in pure bash —
  # use node if available, otherwise grep.
  if command -v node >/dev/null 2>&1; then
    SUMMARY=$(node -e '
      try {
        const h = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
        const done = (h.completed_tasks || []).length;
        const left = (h.remaining_tasks || []).length;
        const blockers = (h.blockers || []).filter(b => b.severity === "blocking").length;
        const ts = h.timestamp || "?";
        const note = blockers > 0 ? ` [${blockers} BLOCKING]` : "";
        process.stdout.write(`${done}/${done + left} tasks done${note}, paused ${ts}`);
      } catch (e) { process.stdout.write("present (could not parse)"); }
    ' "$HANDOFF_PATH" 2>/dev/null || echo "present")
  else
    SUMMARY="present"
  fi
  RESUME_BANNER="HANDOFF DETECTED for ${FEATURE} (${PHASE}): ${SUMMARY}. Run /continue for the brief.\\n\\n"
fi

NEXT_LINE=""
if [ -n "$NEXT_ACTION" ]; then
  NEXT_LINE="\\n  Next:   ${NEXT_ACTION}"
fi

CONTEXT="${RESUME_BANNER}STOP. Before responding to the user, you MUST report this status first:\\n\\nVerified Development Status:\\n  Feature: ${FEATURE}\\n  Phase:   ${PHASE}\\n  Status:  ${STATUS}\\n  Last:    ${LAST}${NEXT_LINE}\\n\\nRead .verified/state.md and the feature artifacts under .verified/features/${FEATURE}/. Tell the user the current state and suggest the next step BEFORE doing anything else. Do NOT skip this."

# Emit proper envelope — bare additionalContext is dropped.
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$CONTEXT"
