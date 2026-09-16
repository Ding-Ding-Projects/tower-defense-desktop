# Accessibility

Accessibility is tracked separately for two different surfaces that are easy to
conflate: this documentation and landing site, which is real and shipped today, and
the desktop game itself, which is still almost entirely unbuilt. Neither is allowed
to borrow credit from the other.

## Behaviour

### This documentation site (shipped)

- **Keyboard reachability.** Every interactive control — tabs, the search and regex
  builder on every panel, every settings control, the notification dismiss button
  — is a real `<button>`, `<input>` or `<select>`, reachable by Tab and operable by
  Enter/Space, with no click-only handler on a non-interactive element.
- **Visible focus.** `:focus-visible` outlines are defined for every interactive
  component in `site/styles/components.css` rather than suppressed; nothing relies
  on hover alone to show what is focused.
- **Correct roles and names.** The tab strip uses `role="tablist"` /
  `role="tab"` / `role="tabpanel"` with `aria-selected` and `aria-controls`; the
  notification region is `aria-live="polite"`; icon-only buttons carry an
  `aria-label`. A skip link at the very top of the page jumps straight to
  `#main-content`.
- **Reduced motion.** `site/styles/tokens.css` zeroes every motion custom property
  under `@media (prefers-reduced-motion: reduce)`, so a user who has asked their
  operating system for less motion gets it here too, rather than the site deciding
  it knows better.
- **Touch targets and scaling.** Interactive elements respect a 44px minimum
  target size (`--target-min` in `site/styles/tokens.css`), and the whole layout is
  responsive from roughly 320px wide with no sideways body scroll.

### The desktop game (planned)

The project's own roadmap names, and has not yet ticked, a game interface that is
"keyboard reachable end to end with visible focus and correct roles" and "verified
at 100, 125, 150 and 200 percent display scale with no clipping". Neither exists
yet: there is no renderer, no interface and no packaged build to check display
scaling against. This article will be updated with real, captured evidence once the
interface lane has something to check, rather than describing an aspiration as
though it were already true.

## Configuration

This site has no separate "accessibility mode" to turn on; the behaviours above are
the default, all the time, for every user. `prefers-reduced-motion` and the
operating system's own font/zoom settings are the only external inputs it responds
to, and it responds to them automatically.

## Failure modes

- **A control with a click handler but no keyboard path.** Every interactive
  element in this site's source is a native focusable element specifically to avoid
  this; a future change that swaps one for a styled `<div>` with an `onclick` would
  reintroduce it.
- **A colour-only status signal.** The status chips on the Features tab carry text
  (`Shipped` / `In progress` / `Planned`) alongside their colour, so the status is
  never conveyed by colour alone.
- **Bilingual crowding.** Showing two languages in the same control can overflow a
  narrow viewport if the secondary line is not deliberately smaller and allowed to
  wrap; see the interface documentation (once published by the interface lane) and
  this site's own bilingual language mode for how that is handled here.

## Security considerations

Not applicable: accessibility features here are presentational and behavioural,
with no separate attack surface of their own.

## How to verify

- `tests/site/` covers the pure logic behind language resolution (so a bilingual
  string never silently falls back to an empty secondary line) and the site
  contract list, which includes accessibility-relevant markers such as
  `:focus-visible` rules, the 44px touch-target token, and the tablist/tab/tabpanel
  roles; run it with `node --test tests/site/`.
- `tools/check-site-contract.mjs` fails the build if any of those markers goes
  missing from the built site.
- Real keyboard and reduced-motion verification of the built site is a manual
  check: open the site, navigate it with Tab and arrow keys alone, and toggle the
  operating system's reduced-motion setting to confirm the interface actually
  respects it.

## Suggested articles

- [The build and the release path](./build-and-release.md)
- [The data model, and where the statistics come from](./data-model.md)
