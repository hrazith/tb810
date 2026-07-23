# Torre Balta 810 Shell Project

Torre Balta 810 is being introduced as a separate client shell, not as a
strict one-to-one clone of the current database-backed client model.

## Goal

Create a branded launch surface for `torrebalta810.org.pe` that preserves the
shared host-platform architecture while leaving room for a custom client data
model later.

## Current Shell Shape

- Brand key: `tb810`
- Public name: `Torre Balta 810`
- Shortname: `TB810`
- App domain: `app.torrebalta810.org.pe`
- Root domain: `torrebalta810.org.pe`
- Login/auth should inherit the TB810 brand pack
- Data model should stay flexible until the client workflow is finalized

## What This Does Not Mean

- Do not assume the Highline data model maps directly to TB810
- TB810 should use the shared host-platform pattern with its own domain mapping
- Do not reuse TB810 as a fake UI-only row in the client switcher unless the
  deployment is actually attached

## Immediate Next Steps

1. Use the `tb810` brand pack for logo, copy, and theme color
2. Decide the initial route contract for the shell
3. Define the first TB810 data source or placeholder data strategy
4. Keep `app.torrebalta810.org.pe` as the app host and `torrebalta810.org.pe`
   as the root domain

