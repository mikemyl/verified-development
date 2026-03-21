---
name: install-hooks
description: >-
  Install project-specific enforcement hooks for verified development.
  Creates PostToolUse lint hook and PreToolUse commit gate in the project's
  .claude/settings.local.json. Use when the user invokes /install-hooks or
  asks to set up enforcement, install quality gates, or automate linting.
version: 0.1.0
---

Install mechanical enforcement hooks for the current project. These are real command-based hooks executed by the runtime — not suggestions the LLM can ignore.

## What Gets Installed

### 1. Post-write lint check (advisory)
After every file write/edit, runs the project's linter on changed code. Results are shown to the LLM, which must address any issues. Advisory (doesn't block the write).

### 2. Pre-commit verification gate (blocking)
Before any `git commit`, runs the project's verify command. If verification fails, the commit is **blocked**. The LLM cannot commit unverified code.

## Process

### 1. Detect or Ask for Commands

Check if `.verified/config.json` exists with hook commands. If not, ask the user:

**Question 1: Lint command**
"What command runs your linter on changed code? This will run after every file write."

Examples by language:
- Go: `golangci-lint run --new-from-rev=HEAD`
- TypeScript: `npx eslint --no-error-on-unmatched-pattern $(git diff --name-only HEAD -- '*.ts' '*.tsx')`
- Java: `mvn checkstyle:check -q`
- General: `just lint`

**Question 2: Verify command**
"What command runs your full verification pipeline? This will gate commits."

Examples:
- `just verify`
- `make verify`
- `npm run verify`
- `mvn verify`

**Question 3: Timeout**
"How long should the lint check be allowed to run (seconds)? Default: 30"
"How long should the verify command be allowed to run (seconds)? Default: 300"

### 2. Store in Config

Save the commands to `.verified/config.json` under the `hooks` key:

```json
{
  "hooks": {
    "post_write_lint": "golangci-lint run --new-from-rev=HEAD",
    "post_write_timeout": 30,
    "pre_commit_verify": "just verify",
    "pre_commit_timeout": 300
  }
}
```

### 3. Create Hook Scripts

Create `.verified/hooks/post-write-lint.sh`:

```bash
#!/bin/bash
# Post-write lint check — runs after every file write
# Advisory only (exit 0) — results shown to LLM for fixing

LINT_CMD="{{post_write_lint}}"

# Only run on source files (skip markdown, json, etc.)
# The file path comes from the hook input
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE" ]; then
  exit 0
fi

# Skip non-source files
case "$FILE" in
  *.md|*.json|*.yml|*.yaml|*.toml|*.txt|*.csv)
    exit 0
    ;;
esac

# Run linter
eval "$LINT_CMD" 2>&1
exit 0  # Always advisory — never block writes
```

Create `.verified/hooks/pre-commit-gate.sh`:

```bash
#!/bin/bash
# Pre-commit verification gate — blocks commits if verify fails

VERIFY_CMD="{{pre_commit_verify}}"

# Check if the bash command is a git commit
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if ! echo "$COMMAND" | grep -qE '^\s*git\s+commit'; then
  exit 0  # Not a commit — allow
fi

# Run verification
echo "Running verification before commit..."
if eval "$VERIFY_CMD" 2>&1; then
  echo "Verification passed. Commit allowed."
  exit 0
else
  echo "BLOCKED: Verification failed. Fix issues before committing."
  exit 2  # Block the commit
fi
```

Make both executable:
```bash
chmod +x .verified/hooks/post-write-lint.sh
chmod +x .verified/hooks/pre-commit-gate.sh
```

### 4. Write Project Hooks

Read the existing `.claude/settings.local.json` (if it exists) and merge the new hooks. Write to `.claude/settings.local.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "bash .verified/hooks/post-write-lint.sh",
            "timeout": 30
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash .verified/hooks/pre-commit-gate.sh",
            "timeout": 300
          }
        ]
      }
    ]
  }
}
```

**Important:** If `.claude/settings.local.json` already has hooks, MERGE — don't overwrite. Read existing hooks, append ours, write back.

### 5. Verify Installation

Test that hooks work:

```bash
# Test lint hook (should produce output or pass silently)
echo '{"tool_input":{"file_path":"test.go"}}' | bash .verified/hooks/post-write-lint.sh

# Test commit gate (should run verify)
echo '{"tool_input":{"command":"git commit -m test"}}' | bash .verified/hooks/pre-commit-gate.sh
```

### 6. Summary

```
Hooks installed for verified development.

  Post-write lint:     {lint command}
                       Runs after every file write (advisory)
                       Timeout: {N}s

  Pre-commit verify:   {verify command}
                       Blocks commits if verification fails
                       Timeout: {N}s

  Hook scripts:        .verified/hooks/
  Settings:            .claude/settings.local.json

To remove hooks: delete the entries from .claude/settings.local.json
To update commands: edit .verified/config.json and re-run /install-hooks
```

## Important

- Always MERGE with existing `.claude/settings.local.json` — never overwrite
- Hook scripts live in `.verified/hooks/` — commit them to git
- Post-write hook is advisory (exit 0) — it shows lint errors but doesn't block writes
- Pre-commit hook is blocking (exit 2) — it prevents committing unverified code
- If the user wants to bypass the commit gate temporarily, they need to edit settings.local.json
- Re-running `/install-hooks` updates the scripts with new commands from config
