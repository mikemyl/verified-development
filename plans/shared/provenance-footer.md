# Provenance footer (shared)

Single source for the provenance footer + empty-section rule that report-writing skills append to
their outputs (`review.md`, `retro.md`, `audits/*.md`, and any other `.verified/` report). Quote it;
don't restate it per skill.

## Footer

Append this block, verbatim shape, to the end of every generated report — it makes a report
auditable long after the run (which commit, which plugin version, what was scanned):

```
---
_Provenance: repo `<repo>` · branch `<branch>` · commit `<short-sha>` · plugin v`<version>` · generated `<YYYY-MM-DD>` by `/<skill>`._
```

Fill each field from the run: `<short-sha>` = `git rev-parse --short HEAD`, `<version>` = the
plugin's `.claude-plugin/plugin.json` version, `<skill>` = the command that wrote the report.

## Empty-section rule

A report section that has no content is written as `_Not applicable — <reason>._`, never silently
omitted. Silent omission reads as "this was covered" when it wasn't; an explicit _Not applicable_
line proves the section was considered. (Same discipline the process retro already uses for its
`_(none)_` sections.)
