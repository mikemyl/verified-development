# Planning & the Wave Engine

`/plan` turns a spec into an ordered, test-first task list. Two things make it more than a checklist: a deterministic parallelization engine, and an adversarial critic pass (the latter is documented in [adversarial-critique.md](adversarial-critique.md)).

## Task grammar

Every plan task declares a machine-readable surface so the scheduler doesn't have to guess:

```
T003 [P] Add the Booking value object (files: domain/booking.go, domain/booking_test.go) (depends on T001)
```

- `(files: a, b)` — the files the task creates or modifies. This is the authoritative signal for collision detection.
- `(depends on T001)` / `(depends on T001-T003)` — explicit ordering. Ranges expand.
- `[P]` — a **human hint only**. The engine, not the marker, decides what actually runs in parallel.

## The deterministic wave engine

`hooks/lib/waves.js` (Node, no dependencies; library + CLI) parses the plan and does all the graph math, emitting a versioned `plan-waves/v1` JSON contract. The LLM authors task metadata; a script computes the schedule. This moves the parallelization decision out of the model and makes it testable.

Algorithm: **Kahn level-layering** groups tasks into waves (each wave's tasks all have their dependencies satisfied by earlier waves), then **pairwise file-set intersection** detects collisions (two same-wave tasks touching the same file).

The contract reports:

| Field | Meaning |
|-------|---------|
| `waves` | Arrays of task IDs; each inner array runs concurrently |
| `depends_on` / `files` / `wave` / `status` | Per-task resolved metadata |
| `collisions` | Same-wave tasks declaring the same file — a scheduling error |
| `undeclared` | Parallel-wave tasks with no declared file surface — treated conservatively |
| `parallel` | Whether any wave has ≥2 tasks |

Exit codes: `0` ok, `1` usage error, `2` malformed plan (dependency cycle, unknown dependency, or duplicate task id — the offender is named).

### How the phases use it

- **`/plan` (step 8a)** computes the waves, renders a `## Waves` table, and **refuses to present a plan** that exits 2 or reports any collision.
- **`/implement`** re-runs the same engine and gates each wave on `collisions` / `undeclared` before fanning out executor agents.

Run it yourself:

```bash
node hooks/lib/waves.js compute path/to/plan.md
# or pipe a plan on stdin:
cat plan.md | node hooks/lib/waves.js compute -
```

The engine is fully unit-tested model-free (`tests/waves.test.cjs`) — that is the entire point of moving the schedule out of the LLM.

## Backward compatibility

Plans without `(files:)` trailers don't crash — those tasks surface in `undeclared` and are treated conservatively (never assumed parallel-safe). The `[P]` marker still renders for human readers but no longer drives scheduling.
