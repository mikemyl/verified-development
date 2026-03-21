# codecov.yml Configuration

Use when scaffolding a new Go project that uses Codecov for CI coverage enforcement.

```yaml
codecov:
  require_ci_to_pass: true

coverage:
  precision: 2
  round: down
  range: "60...100"

  status:
    project:
      default:
        target: 80%
        threshold: 2%
    patch:
      default:
        target: 80%
        threshold: 5%

  # require_changes prevents noise on docs-only PRs
  require_changes: true

ignore:
  - "cmd/"
  - "**/*_test.go"
  - "mock_*.go"
  - "mocks/**"
```

## Configuration Rationale

- **Project target 80%, threshold 2%**: Repository total stays at or above 80%. Threshold allows minor fluctuations (e.g., removing heavily-tested code) without blocking PRs.
- **Patch target 80%, threshold 5%**: Only lines changed in the PR must be 80% covered. More generous threshold (5%) accounts for small unavoidable untestable lines (error branches in generated code, etc.).
- **Ignored paths**: `cmd/` (main packages with minimal logic), test files, mock files.
- **require_changes**: Skips coverage check on documentation-only PRs.
