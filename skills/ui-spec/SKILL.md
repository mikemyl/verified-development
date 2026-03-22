---
name: ui-spec
description: >-
  Create a UI design contract with brand identity, design system, screen
  specifications, and competitive research. Use when the user invokes /ui-spec
  or asks to design screens, create a design system, define brand colors,
  or specify UI for a feature.
version: 0.1.0
---

Create a UI specification for a feature. This is an optional step between Specify and Plan for features with user-facing interfaces.

## Process

### 1. Determine Feature

- If feature name provided as argument → use it
- If no argument → read `.verified/state.md` for the current feature
- If no argument and no state → ask the user which feature needs a UI spec

### 2. Check Prerequisites

- Read `.verified/features/{feature-name}/spec.md` — the functional spec MUST exist first
- If no spec exists, tell the user to run `/specify` first

### 3. Check for Existing Design System

Look for an existing design system:
- `.verified/design-system.md` — project-wide design tokens
- Previous `ui-spec.md` files in other features
- `tailwind.config.js` or `tailwind.config.ts` for existing theme

If a design system exists, reference it. Don't re-ask brand questions.

### 4. Design System Discovery (first time only)

If no design system exists, guide the user through discovery. Load the `ui-specification` skill for the question framework.

Ask these in conversational order (not as a dump of 13 questions):

**Round 1: Brand feel**
- What 3 adjectives describe your brand?
- Who is your target audience?

**Round 2: Visual direction**
- Show me 2-3 sites you admire visually. What do you like about each?
- Do you have existing brand assets (logos, colors, fonts)?

**Round 3: Competition**
- Who are your 2-3 main competitors? (offer to research their sites)
- What would make your UI stand out?

**Round 4: Technical**
- What component library? (React + shadcn / Go templates + HTMX / other)
- What devices/browsers must be supported?

If the user provides competitor URLs, use WebFetch to analyze their design patterns:
- Color schemes
- Layout patterns
- Component styles
- What works / what doesn't

Save the design system to `.verified/design-system.md` for reuse across features.

### 5. Screen Specification

For each screen in the feature:

1. **Ask the user** to describe what the screen does (or reference the acceptance scenarios)
2. **Propose a layout** — describe the spatial arrangement
3. **List components** — what shadcn/custom components are needed
4. **Define interactions** — what happens on click, hover, submit
5. **Define states** — loading, empty, error, success
6. **Define responsive behavior** — what changes at each breakpoint
7. **Define accessibility** — keyboard flow, screen reader announcements

Present each screen spec to the user for feedback before moving to the next.

### 6. Component Inventory

Compile the full list:
- shadcn components used as-is
- shadcn components needing customization
- Custom components to build

### 7. Write UI Spec

Write `.verified/features/{feature-name}/ui-spec.md` following the template from the ui-specification skill.

### 8. Quality Check

Run through the checklist:
- [ ] Every screen has purpose, entry point, and user state
- [ ] All states defined (loading, empty, error, success)
- [ ] Responsive behavior for mobile/tablet/desktop
- [ ] Keyboard navigation documented
- [ ] Component inventory complete
- [ ] Design tokens defined (or referenced from design-system.md)
- [ ] Accessibility requirements per screen

### 9. Update State

```yaml
---
feature: {feature-name}
phase: ui-spec
status: complete
last_activity: {YYYY-MM-DD} - UI specification complete
---
```

### 10. Suggest Next Step

```
UI specification complete: .verified/features/{feature-name}/ui-spec.md

Next: Run /plan {feature-name} to create the implementation plan.
```

## Competitive Research

When the user provides competitor URLs:

1. Fetch the site with WebFetch
2. Analyze:
   - Color palette (primary, secondary, accent)
   - Typography choices
   - Layout patterns (sidebar, cards, tables)
   - Navigation patterns
   - Call-to-action styling
   - What feels polished vs rough
3. Present findings as "steal this / avoid this" summary
4. Incorporate learnings into the design system

## Important

- UI spec comes AFTER functional spec — don't design screens without knowing what they need to DO
- Design system is project-wide — save it separately from feature specs
- Don't over-specify — define enough for implementation, not pixel-perfect mockups
- Always include accessibility — it's not optional
- If the user already has a design system, respect it — don't redesign from scratch
