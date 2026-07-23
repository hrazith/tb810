# UI Architecture

This document defines the canonical UI architecture for TB810 and the shared
platform surface. It is intentionally small and opinionated so we can keep the
product consistent without creating a large generic design system too early.

The goal is not to abstract everything. The goal is to establish a stable
visual and structural vocabulary that:

- keeps TB810 consistent
- avoids repeated styling decisions
- helps future domains ship faster
- can later be reused across Stellar and Asset Edge
- still allows each client to keep its own brand configuration

## Architecture Layers

```text
UI Architecture
├── Brand
│   ├── Colors
│   ├── Typography
│   ├── Icons
│   ├── Radius
│   ├── Shadows
│   └── Motion
│
├── Layout
│   ├── App shell
│   ├── Header
│   ├── Sidebar
│   ├── Page
│   ├── Page content
│   ├── Section
│   ├── Panel placement
│   └── Grid
│
├── Components
│   ├── Button
│   ├── Panel
│   ├── Badge
│   ├── Field
│   ├── Input
│   ├── Table
│   ├── Empty state
│   └── Dialog
│
└── Domains
    ├── Owners
    ├── Units
    ├── Ownerships
    ├── Billing
    ├── Payments
    └── other business domains
```

## 1. Brand

The Brand layer defines visual identity.

It owns:

- font families
- font weights
- semantic colors
- icon family
- border-radius scale
- shadows
- motion characteristics
- logos and brand assets

Brand must not contain:

- page composition
- business rules
- domain-specific terminology
- data fetching
- workflow logic

Brand values should be exposed through semantic tokens and shared configuration
rather than repeated directly throughout feature code.

Examples of brand tokens:

- primary action color
- foreground color
- muted foreground
- panel border
- default radius
- focus ring
- default typography

## 2. Layout

The Layout layer defines how pages and regions are composed.

It owns:

- application shell
- top header
- side navigation
- content width
- page padding
- vertical rhythm
- page headers
- sections
- grids
- placement of panels
- responsive page structure

Layout should answer questions such as:

- Where does page content begin?
- How wide can content grow?
- How much vertical space separates the header from the main content?
- How do sections align?
- What changes on smaller screens?

Layout must not contain:

- business rules
- owner-specific behavior
- unit-specific behavior
- billing logic
- domain data access

## 3. Components

The Components layer contains reusable UI primitives.

Examples:

- Button
- Panel
- Badge
- Field
- Input
- Table
- EmptyState
- Dialog

Components should:

- be reusable across domains
- consume Brand tokens
- fit within Layout primitives
- expose a small and intentional API
- support accessibility
- avoid knowing which business domain is rendering them

Components must not:

- fetch domain data
- contain owner, unit, payment, or billing business rules
- define page-level composition
- encode one-off feature behavior unless explicitly implemented as a domain
  component

## 4. Domains

The Domains layer solves business problems.

Examples:

- Owners
- Units
- Ownerships
- Billing
- Payments

Domains own:

- business terminology
- domain validation
- workflows
- data access
- domain-specific forms
- domain-specific tables
- route composition
- orchestration of Layout and Components

Domain code may compose:

- Brand through tokens
- Layout through page primitives
- Components through reusable controls

Domain code should not redefine:

- colors
- spacing conventions
- button systems
- panel styles
- global page structure

## Dependency Direction

```text
Brand
  ↓
Layout and Components
  ↓
Domains
```

Domains may consume lower layers, but lower layers must not depend on Domains.

## Canonical Vocabulary

The vocabulary should remain intentionally small. New primitives should only be
added when repeated application needs justify them.

### Brand

- fonts
- semantic colors
- icons
- radius
- shadows
- motion

### Layout

- `AppShell`
- `Header`
- `Sidebar`
- `Page`
- `PageContent`
- `Section`
- `Grid`

### Components

- `Button`
- `Panel`
- `Badge`
- `Field`
- `Input`
- `Table`
- `EmptyState`
- `Dialog`

### Domains

- `Owners`
- `Units`
- `Ownerships`
- `Unit Accounts`
- `Billing`
- `Invoices`
- `Payments`
- `Receipts`
- `Documents`

## Practical Guidance

- Brand should be resolved once per request or tenant, not restated inside each
  component.
- Layout should provide the stable page frame for all client apps.
- Components should be shared wherever they genuinely repeat.
- Domains should own the business vocabulary and orchestration.
- Feature code should use semantic tokens and layout primitives instead of
  hard-coded ad hoc styling.
- The architecture should keep TB810 readable today while leaving room to reuse
  the same conventions in Stellar and Asset Edge later.

