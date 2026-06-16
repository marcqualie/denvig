---
name: tag-release
description: Tag and publish a release (stable or prerelease)
disable-model-invocation: true
---
Releases are handled by the deterministic `bin/tag-release` script. Your job is
to settle on the target tag and run the script — never bump versions, edit the
changelog, commit, or tag by hand.

The script's interactive menus need a real TTY, which you don't have, so always
run it with an explicit tag (and `--yes` once the user has confirmed deploying).

Steps:

1. Show the current version (from `./package.json`) for reference.
2. Determine the target tag:
   - If the user gave one (e.g. `/tag-release v0.7.0-alpha.8`), use it.
   - Otherwise ask, via AskUserQuestion, for the **channel** (latest / alpha /
     beta / rc). Ask for a **bump** (patch / minor / major) only when one is
     needed — i.e. for a `latest` release, or when starting a prerelease from a
     stable version. A continuing or promoting prerelease needs no bump.
   - Derive the tag the same way the script does:
     - `latest`: drop any prerelease suffix and apply the bump
       (`0.7.0-alpha.7` + patch → `v0.7.0`; `0.7.0` + minor → `v0.8.0`).
     - prerelease, same channel: increment the number
       (`0.7.0-alpha.7` + alpha → `v0.7.0-alpha.8`).
     - prerelease, higher channel: reset to `.1` on the same base
       (`0.7.0-alpha.7` + beta → `v0.7.0-beta.1`).
     - prerelease from a stable version: apply the bump, then `-<channel>.1`
       (`0.7.0` + alpha + minor → `v0.8.0-alpha.1`).
3. Confirm the computed tag and that the user wants to deploy it (AskUserQuestion).
4. Run `bin/tag-release <tag> --yes`. The script validates the tag, refuses a
   non-increasing version, bumps every package.json in lockstep, adds a dated
   changelog entry below `[Unreleased]`, commits and tags on `main`, pushes, and
   creates the GitHub release (prereleases are marked `--prerelease`).
   - If the user has NOT yet confirmed deploying, run without `--yes`: the script
     still commits and tags locally but stops before pushing, so you can confirm
     first and then push.
5. After it pushes, the publish workflow deploys to npm under the matching
   dist-tag (`latest`, or e.g. `npm install denvig@alpha`). Link the user to the
   action: https://github.com/marcqualie/denvig/actions?query=branch%3Amain
