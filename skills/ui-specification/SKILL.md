---
name: ui-specification
description: >-
  How to create UI design contracts for verified development. Use when specifying
  features with user interfaces, creating design systems, defining brand identity,
  or researching competitor designs. Triggers on: "UI spec", "design system",
  "brand colors", "screen design", "component inventory", "ui-spec", or when
  creating files in .verified/features/*/ui-spec.md.
version: 0.1.0
---

# UI Specification

A UI specification defines the visual and interaction design BEFORE implementation. It bridges the gap between functional requirements (spec.md) and code — ensuring the UI is intentional, consistent, and accessible.

## When to Create a UI Spec

Create a UI spec when the feature has user-facing screens. Skip it for pure API/backend work.

The UI spec is created AFTER the functional spec (spec.md) and BEFORE the implementation plan (plan.md).

## UI Spec Format

Output: `.verified/features/{feature-name}/ui-spec.md`

### Template

```markdown
# UI Specification: {Feature Name}

## Design Context

### Brand Identity
- **Personality:** {e.g., professional but warm, minimal, playful}
- **Primary colors:** {hex values}
- **Secondary colors:** {hex values}
- **Typography:** {font families, sizes, weights}
- **Spacing system:** {base unit, scale}
- **Border radius:** {values}
- **Shadow system:** {elevation levels}

### Design References
- {URL or description of similar site/screen and what to take from it}
- {URL or description and what to take from it}
- {What specifically to NOT copy and why}

### Component Library
- Framework: {React + shadcn / Go templates + HTMX / plain HTML}
- Base components: {shadcn components to use}
- Custom components needed: {list}

## Screens

### Screen: {Screen Name}

**Purpose:** {What the user accomplishes on this screen}
**Entry point:** {How the user gets here}
**User state:** {Authenticated? Role? What data do they have?}

#### Layout
{Describe the layout structure — header, sidebar, main content, footer}
{ASCII wireframe or description of spatial arrangement}

#### Components
| Component | Type | Behavior | Data |
|-----------|------|----------|------|
| {name} | {shadcn/custom} | {interaction} | {what it shows} |

#### Interactions
- {Click X → Y happens}
- {Hover X → tooltip shows Z}
- {Submit form → loading state → success/error}

#### States
- **Loading:** {skeleton, spinner, or progressive}
- **Empty:** {empty state message and illustration}
- **Error:** {error display, retry mechanism}
- **Success:** {confirmation, redirect, toast}

#### Responsive Behavior
- **Desktop (>=1024px):** {layout description}
- **Tablet (768-1023px):** {what changes}
- **Mobile (<768px):** {what changes}

#### Accessibility
- {Keyboard flow through the screen}
- {Screen reader announcements for dynamic content}
- {Focus management for modals/overlays}
```

## Design System Discovery

When the project doesn't have an established design system, guide the user through these questions:

### Brand Identity Questions
1. **What 3 adjectives describe your brand?** (e.g., trustworthy, modern, approachable)
2. **Who is your target audience?** (demographics, expectations, tech savviness)
3. **What emotions should the UI evoke?** (confidence, excitement, calm, urgency)

### Visual Direction
4. **Show me 2-3 sites you admire visually.** What specifically do you like about each?
5. **Show me 1-2 sites you dislike.** What specifically feels wrong?
6. **Do you have existing brand assets?** (logos, colors, fonts, style guides)

### Competitive Research
7. **Who are your direct competitors?** (2-3 names or URLs)
8. **What do competitors do well?** (specific UI patterns to learn from)
9. **What do competitors do poorly?** (gaps to exploit)
10. **What would make your UI stand out?** (differentiator)

### Technical Constraints
11. **What devices/browsers must be supported?**
12. **Performance constraints?** (target load time, bundle size)
13. **Accessibility requirements?** (WCAG level, specific needs)

## Component Inventory

For projects using shadcn/Tailwind, create a component inventory:

```markdown
## Component Inventory

### Using from shadcn (no customization)
- Button, Input, Select, Dialog, Toast, Table, Tabs

### Using from shadcn (customized)
- Card — custom padding, shadow
- DataTable — custom column definitions, filters

### Custom components needed
- PropertyCard — property image, name, rating, price
- BookingTimeline — horizontal timeline with status markers
- RevenueChart — recharts line chart with custom tooltip
```

## Design Tokens

When establishing a design system, define tokens:

```markdown
## Design Tokens

### Colors
- --primary: #2563EB (trust, action)
- --primary-foreground: #FFFFFF
- --secondary: #F59E0B (warmth, highlights)
- --destructive: #EF4444 (errors, deletions)
- --muted: #6B7280 (secondary text)
- --background: #FFFFFF
- --card: #F9FAFB

### Typography
- --font-sans: 'Inter', system-ui, sans-serif
- --font-mono: 'JetBrains Mono', monospace
- Headings: 600 weight, tracking -0.02em
- Body: 400 weight, leading 1.6

### Spacing (4px base)
- --space-1: 4px
- --space-2: 8px
- --space-3: 12px
- --space-4: 16px
- --space-6: 24px
- --space-8: 32px

### Breakpoints
- sm: 640px
- md: 768px
- lg: 1024px
- xl: 1280px
```

## Quality Checklist

Before moving to Plan phase:

- [ ] Every screen has a clear purpose and entry point
- [ ] Loading, empty, error, and success states defined for each screen
- [ ] Responsive behavior specified for mobile, tablet, desktop
- [ ] Keyboard navigation flow documented
- [ ] Component inventory complete (shadcn vs custom)
- [ ] Design tokens defined (colors, typography, spacing)
- [ ] Competitive research documented (what to learn, what to avoid)
- [ ] Accessibility requirements specified per screen

## Relationship to Other Phases

```
SPECIFY        UI-SPEC           PLAN              IMPLEMENT
spec.md   ->   ui-spec.md   ->   plan.md     ->    code
scenarios      screens           tasks             components
requirements   interactions      file paths        styles
edge cases     responsive        test order        tests
               accessibility
```

The UI spec answers: "What does the user SEE and DO?"
The functional spec answers: "What does the system DO?"
Together they fully specify the feature.
