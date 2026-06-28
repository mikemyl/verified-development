# Process Retro: enforced-test-taxonomy

## What worked
- Deterministic wave engine drove clean fan-out — 9 waves, zero collisions, prompt-anchor-first TDD kept the doc/skill edits honest (every skill change was RED-locked before editing).
- Plan critics earned their keep: two critics independently caught the missing `/map`→parser dependency, and the design critic caught the sign-off persistence hole — both fixed before implementation, not after.
- Passing a fixed substring contract from each anchor-writing executor to the later editing executor kept the RED→GREEN handoff across waves coherent.

## What didn't
- The over-broad default scenario regex (`AS|S|SC|EC|FR`) passed every unit test yet produced 44 false `UNSERVED_SCENARIO` on a real spec. Unit fixtures used `AS-`-only ids, so the over-match was invisible until the review smoke test ran the gate against this feature's own spec. A deterministic gate was systematically wrong on real input while green on its tests.
- `handoff.js update` expects a JSON patch on **stdin**; my per-wave checkpoint calls passed `--complete` flags (no such interface) and silently no-op'd or hung. The per-wave checkpoints were ineffective for the whole run — only discovered when the final call hit the 2-minute timeout.

## Workflow tuning signals
- Gate/validator features should include an **end-to-end dogfood against a real spec+plan** as an explicit acceptance step, not only unit fixtures. The unit tests were thorough but shared the blind spot of the implementation (narrow id fixtures).
- `hooks/lib/handoff.js` `update`/`write` ergonomics: a TTY fast-fail guard was added this feature, but the deeper issue is the flag-vs-stdin mismatch. Consider making `update` accept `--set k=v` flags, or at least documenting the piped-JSON contract at call sites in the phase skills.

## Top process learning
A deterministic gate validated only by unit tests with narrow fixtures can still be systematically wrong on real input — dogfood it end-to-end before shipping.
