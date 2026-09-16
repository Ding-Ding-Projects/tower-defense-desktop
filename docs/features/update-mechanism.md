# The update mechanism

The installed application is intended to check for updates automatically, the way
Squirrel.Windows-packaged applications commonly do: a background check, a staged
download, and a non-blocking "ready to restart" banner rather than a forced
restart. **Status: this is entirely a design intent right now. No installer has
ever been published, so there is nothing yet for an update mechanism to update
— this article documents the intended behaviour so it can be built against a
written specification, and it will be updated with real, verified behaviour once an
updater exists.**

## Behaviour (intended)

- **Background checks.** The application is meant to check for updates on startup
  and on a bounded background schedule, without interrupting whatever the user is
  doing.
- **Staged, non-blocking download.** A newer version's update package is meant to
  download and validate in the background; nothing about the current session
  pauses while that happens.
- **An honest, dismissible banner.** Once an update is staged, the plan is a
  persistent but non-blocking banner naming the new version, linking its release
  notes, stating plainly that the installer is unsigned, and offering exactly two
  actions: restart now to install it, or dismiss and keep working. Restart is never
  forced.
- **Unsaved-work protection.** Because this is a desktop game, restarting to apply
  an update is meant to respect whatever the game's own save/pause state requires
  before it is safe to close, rather than closing the window out from under an
  in-progress match.
- **Unsigned, and said so.** Like the installer itself, the update feed is meant to
  be unsigned; the plan is for the update surface to say this plainly rather than
  implying a level of trust the project has not established through a paid or
  shared signing certificate.

## Configuration (intended)

The update feed's location is expected to be a small piece of build-time
configuration (an HTTPS URL Squirrel's updater points at), not a user-facing
setting; the user-facing surface is limited to "an update is ready" and the choice
of when to restart.

## Failure modes (intended design, to be verified once built)

- **A forced restart that discards unsaved progress.** The explicit design
  intent above exists to prevent this; once an updater is built, this is one of the
  first things a real test needs to cover.
- **A silently failed update check** that never tells the user anything went
  wrong, versus a background check that fails open (the application keeps working
  on the current version) and reports the failure honestly rather than retrying
  forever with no visible state.
- **A corrupted or partial download being offered as ready to install.** The plan
  is package hash validation before an update is ever presented as ready, so a
  truncated download cannot masquerade as a valid one.

## Security considerations

Automatic updates are one of the more sensitive things a desktop application does,
because they mean the application can replace itself. The intended design uses
HTTPS transport and package hash validation for integrity even though the package
itself is unsigned, and it is never allowed to claim a level of authenticity
(a "verified publisher", a checkmark, anything implying a paid certificate) that an
unsigned artifact has not actually earned. No update credential of any kind belongs
in renderer code, a release asset, or source history.

## How to verify

There is nothing to verify yet: no updater has been built, and no release has been
published for one to update to or from. Once it exists, the plan is a headless
verification pass covering: no update available, an update available, downloading,
ready-to-restart, actually restarting, working offline, an invalid feed, a corrupt
package, cancelling a pending update, and a rollback path if a downloaded update
turns out to be bad.

## Suggested articles

- [The build and the release path](./build-and-release.md)
- [Deterministic simulation and replay](./simulation-and-replay.md)
