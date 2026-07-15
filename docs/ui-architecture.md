# UI Architecture

This document defines the permanent UI vocabulary for TB810 and future AssetEdge-family products.

## Purpose

The UI layer exists to provide reusable interface primitives that keep feature code consistent, readable, and easy to evolve.

It should help a new engineer understand the app without needing to know a design framework or memorize repeated Tailwind class strings.

## Layer Responsibilities

### `brand/`

`brand/` owns the visual identity of a product.

It may define:

- typography
- colors
- radius
- shadows
- visual tokens
- product names
- brand assets

`brand/` does not own routes, business logic, or data access.

### `components/ui/`

`components/ui/` owns reusable UI primitives.

These primitives are shared building blocks such as panels, buttons, badges, headers, and states.

`components/ui/` should express the application’s interface vocabulary, not business rules.

### Feature Components

Feature components live with the domain or route they support.

They solve business problems and compose UI primitives into working screens.

Feature code should never hardcode repeated TB810 visual styles when a shared primitive exists.

## Canonical Vocabulary

These are the initial canonical TB810 UI primitives:

- `Panel`
- `Button`
- `PageHeader`
- `Badge`
- `EmptyState`
- `Dialog`
- `Field`

`Panel` and `Button` are implemented at this stage.

The remaining primitives are documented as future vocabulary and should be introduced only when needed.

## Button

`Button` is the canonical action primitive for TB810.

It is used for user actions, including primary call-to-action links when rendered through `asChild`.

Canonical variants:

- `primary`
- `secondary`
- `destructive`
- `ghost`
- `link`
- `icon`

Canonical sizes:

- `sm`
- `md`
- `lg`

The default size is `md`.

The primary button treatment should remain brand-driven and visually restrained:

- `px-12 py-3 text-base font-medium shadow-sm`
- smooth, subtle hover and focus states
- standard rounded radius
- no gradients or heavy animation

Feature pages should not recreate button chrome inline when a shared primitive exists.

## Panel

`Panel` is the major grouped content container for TB810.

It owns:

- border
- radius
- background
- shadow
- padding variants

Feature pages should not repeat the canonical panel styling inline.

Preferred usage:

```tsx
<Panel>
  ...
</Panel>

<Panel padding="compact">
  ...
</Panel>

<Panel padding="spacious">
  ...
</Panel>
```

`Panel` should remain usable from server components and support semantic HTML through an `as` prop where practical.

## Brand vs UI vs Feature Code

### Brand

Defines the product’s visual identity.

### UI

Defines reusable interface primitives.

### Feature slices

Solve business problems and should consume the shared primitives instead of recreating them.

## Cross-Product Direction

This UI layer is intended to become shared across future AssetEdge products.

TB810 is the first implementation.

Future products such as Highline, Stellar, and the AssetEdge Platform should implement the same UI contract while supplying their own branding.

The contract should remain stable even when the brand layer changes.

## Guidance

- Prefer business-readable names over design-framework terminology
- Keep primitives small and composable
- Avoid feature-level reimplementation of panel chrome
- Keep styling decisions centralized so future products can swap branding without rewriting feature pages
