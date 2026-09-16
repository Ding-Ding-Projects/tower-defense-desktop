# Release checklist

Run by hand, before pushing to the default branch. Not wired into the workflow, and
that is deliberate.

## Why this is not automated

The workflow for this project runs **no tests and no lint**. That is a standing
decision by the owner. The workflow builds, packages, publishes and attaches evidence,
and nothing in it can withhold a release because of a code-quality verdict.

The honest cost, stated once rather than hidden: a release can ship from a commit
whose checks would have failed, and the first thing to notice will be a person running
the installer. The trade buys unconditional, fast delivery.

What that means in practice is that release readiness is exactly as good as the
discipline of running this list. If you find yourself tempted to "just add a quick
check to the workflow", that is the rule you would be overriding, not a gap you would
be filling.

## Before every push to the default branch

- [ ] `npm run check` passes. That is the type check, the determinism check, the data
      validation, the site contract, the documentation bundle, and every test.
- [ ] `node tools/validate-data.mjs` reports the counts you expect. A tranche that
      quietly shrank is easier to miss than one that fails.
- [ ] `build-installer.bat` produces an installer, and its own verification passes:
      the artifact is present, large enough, newer than its sources, and reports
      `NotSigned`.
- [ ] The application actually launches and a wave actually starts. Source that
      compiles is not an application that runs.

## After the workflow finishes

- [ ] The release exists, is not a draft, and carries exactly three assets: the
      installer, the `RELEASES` file and the full package.
- [ ] The release notes state the unsigned status plainly.
- [ ] The recorded SHA-256 matches the artifact you built locally, or you understand
      why it does not.

## Never

- Never add a test or lint step to the workflow.
- Never sign the installer, or acquire a certificate to do so.
- Never claim a check passed in release notes. The workflow does not run any.
