# Justfile Template for Go Verified Development

Use this template when scaffolding a new Go project with `/init`.

```just
# Verified Development — Go Verification Pipeline
# All targets must pass. No warnings tolerated.

set shell := ["bash", "-euo", "pipefail", "-c"]

# Default: run full verification
default: verify

# Extract module path from go.mod
mod := `head -1 go.mod | awk '{print $2}'`

# --- Thresholds ---
coverage_threshold := "80"
mutation_threshold := "60"

# --- Meta targets ---

# Run full verification pipeline
verify: lint test coverage mutation security deadcode build-check
    @echo "All checks passed."

# --- Individual targets ---

# Run linters (revive + golangci-lint + go vet)
lint:
    revive -config revive.toml -formatter friendly ./...
    golangci-lint run ./...
    go vet ./...

# Run tests with race detection and shuffle
test:
    go test -race -shuffle=on -count=1 -timeout 300s ./...

# Check project-wide test coverage
coverage:
    go test -covermode=atomic -coverprofile=coverage.out ./...
    @total=$(go tool cover -func=coverage.out | grep total | awk '{print $3}' | sed 's/%//'); \
    echo "Coverage: $total%"; \
    if [ "$(echo "$total < {{coverage_threshold}}" | bc -l)" -eq 1 ]; then \
        echo "FAIL: Coverage $total% < {{coverage_threshold}}% threshold"; \
        exit 1; \
    fi

# Check coverage on changed lines only (vs main branch)
patch-coverage:
    #!/usr/bin/env bash
    set -euo pipefail
    go test -covermode=atomic -coverprofile=coverage.out ./...
    CHANGED_FILES=$(git diff --name-only main -- '*.go' | grep -v '_test.go' || true)
    if [ -z "$CHANGED_FILES" ]; then
        echo "No changed Go files — patch coverage check skipped."
        exit 0
    fi
    # Extract coverage for changed files only
    TOTAL_LINES=0
    COVERED_LINES=0
    for file in $CHANGED_FILES; do
        pkg_path=$(dirname "$file")
        file_coverage=$(go tool cover -func=coverage.out | grep "$pkg_path" || true)
        if [ -n "$file_coverage" ]; then
            lines=$(echo "$file_coverage" | wc -l)
            covered=$(echo "$file_coverage" | awk '{sum += $3} END {print sum}' | sed 's/%//')
            TOTAL_LINES=$((TOTAL_LINES + lines))
            COVERED_LINES=$(echo "$COVERED_LINES + $covered" | bc)
        fi
    done
    if [ "$TOTAL_LINES" -gt 0 ]; then
        PCT=$(echo "scale=1; $COVERED_LINES / $TOTAL_LINES" | bc)
        echo "Patch coverage: $PCT%"
        if [ "$(echo "$PCT < {{coverage_threshold}}" | bc -l)" -eq 1 ]; then
            echo "FAIL: Patch coverage $PCT% < {{coverage_threshold}}% threshold"
            exit 1
        fi
    fi

# Run mutation testing
mutation:
    gremlins unleash --threshold-efficacy {{mutation_threshold}} --workers 1 --timeout-coefficient 3

# Run security scanners
security:
    gosec -quiet ./...
    govulncheck ./...

# Detect unreachable code and unused assignments
deadcode:
    deadcode ./...
    go vet -vettool=$(which ineffassign) ./... 2>&1 || true

# Verify compilation and dependency integrity
build-check:
    go build ./...
    go mod verify
    go mod tidy -diff

# --- Optional targets (not part of verify) ---

# Run benchmarks
bench:
    go test -bench=. -benchmem ./...

# Run CPU profiling
profile:
    go test -cpuprofile=cpu.prof -bench=. ./...
    go tool pprof -http=:8080 cpu.prof

# Clean generated files
clean:
    rm -f coverage.out cpu.prof
```

## Notes

- `set shell` ensures consistent behavior across platforms
- `-count=1` disables test caching — every run is fresh
- `-shuffle=on` randomizes test order to catch dependencies
- `-race` enables the race detector for all tests
- `gremlins --workers 1` ensures deterministic mutation runs
- `coverage_threshold` and `mutation_threshold` are configurable at the top
- `patch-coverage` compares against `main` branch — adjust if your default branch differs
- `build-check` includes `go mod tidy -diff` to catch uncommitted dependency changes
