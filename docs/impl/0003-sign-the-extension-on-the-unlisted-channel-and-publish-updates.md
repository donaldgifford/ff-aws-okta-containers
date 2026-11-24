---
id: IMPL-0003
title: "Sign the extension on the unlisted channel and publish updates"
status: In Progress
author: Donald Gifford
created: 2026-11-24
---

<!-- markdownlint-disable-file MD024 MD025 MD041 -->

# IMPL-0003: Sign the extension on the unlisted channel and publish updates

<!--toc:start-->
<!-- markdownlint-capture -->
<!-- markdownlint-disable MD013 -->
- [Objective](#objective)
- [Scope](#scope)
  - [In Scope](#in-scope)
  - [Out of Scope](#out-of-scope)
- [Conventions for every phase](#conventions-for-every-phase)
- [How a release will work](#how-a-release-will-work)
- [Implementation Phases](#implementation-phases)
  - [Phase 1: Sign 0.1.0 by hand](#phase-1-sign-010-by-hand)
    - [Tasks](#tasks)
    - [Success Criteria](#success-criteria)
  - [Phase 2: The update feed](#phase-2-the-update-feed)
    - [Tasks](#tasks-1)
    - [Success Criteria](#success-criteria-1)
  - [Phase 3: Signing in the release workflow](#phase-3-signing-in-the-release-workflow)
    - [Tasks](#tasks-2)
    - [Success Criteria](#success-criteria-2)
  - [Phase 4: Install, watch an update, and document](#phase-4-install-watch-an-update-and-document)
    - [Tasks](#tasks-3)
    - [Success Criteria](#success-criteria-3)
- [File Changes](#file-changes)
- [Testing Plan](#testing-plan)
- [Dependencies](#dependencies)
- [Open Questions](#open-questions)
  - [1. Where does the update_url live?](#1-where-does-the-update_url-live)
  - [2. What version is the first workflow-signed release?](#2-what-version-is-the-first-workflow-signed-release)
  - [3. How long does the release wait for Mozilla?](#3-how-long-does-the-release-wait-for-mozilla)
  - [4. Where do the credentials live for the hand-signed trial?](#4-where-do-the-credentials-live-for-the-hand-signed-trial)
  - [5. How is a release recovered when Mozilla signed it but the job failed?](#5-how-is-a-release-recovered-when-mozilla-signed-it-but-the-job-failed)
  - [6. Who sets up the GitHub environment?](#6-who-sets-up-the-github-environment)
  - [7. Does just package stay?](#7-does-just-package-stay)
- [References](#references)
<!-- markdownlint-restore -->
<!--toc:end-->

<!--docz:objective:start-->
## Objective

Give the extension a permanent install in release Firefox and automatic
updates, without a public listing. Each release is signed by Mozilla on
the unlisted channel, and the GitHub release carries the signed `.xpi`
and an `updates.json` that installed copies read once a day.

**Implements:** [INV-0002](../investigation/0002-unlisted-signing-and-self-hosted-updates-for-the-extension.md)

<!--docz:objective:end-->

<!--docz:scope:start-->
## Scope

<!--docz:in-scope:start-->
### In Scope

- A trial run that signs version 0.1.0 by hand and records what the
  investigation could not verify.
- Recipes that stage, sign and describe a build: `stage`, `sign` and
  `updates-json`.
- An `update_url` in the manifest and a script that writes `updates.json`.
- A signing job in the release workflow, behind a GitHub environment that
  asks for approval and holds the credentials.
- Releases that carry the signed `.xpi` and `updates.json`, and no
  unsigned zip.
- Install and release instructions for the signed build, and a recorded
  check that an installed copy updates itself.

<!--docz:in-scope:end-->

<!--docz:out-of-scope:start-->
### Out of Scope

- A public listing on addons.mozilla.org. A listed version may not carry
  an `update_url`, so listing later would need its own build. Nothing
  here prevents that.
- Hosting the feed anywhere other than GitHub releases.
- Firefox for Android. A signed file installs there only from a file, and
  the extension depends on containers, which Android does not have.
- Changes to what the extension does. No file under `extension/src/`
  changes.
- The checks in IMPL-0002 that still need a real portal and tenants. They
  are easier with a permanent install, but they are tracked there.

<!--docz:out-of-scope:end-->
<!--docz:scope:end-->

## Conventions for every phase

- **Who does what.** A task marked **(you)** needs the author: a Mozilla
  account, a secret, an approval click or a real Firefox profile. The
  rest can be done without them.
- **Credentials never reach the repository.** The API key and secret are
  not written to any tracked file, commit message, pull request or log.
  The key looks like `user:12345:67` and counts as an identifier.
  `.gitignore` already covers `.env`, `.web-ext-config.*`, `.amo-*`,
  `*.xpi` and `web-ext-artifacts/`.
- **This repository is public.** The placeholder rule from IMPL-0002
  still applies, and the diff is checked before each commit.
- **Labels.** Pull requests are labelled `dont-release` unless a task
  names another label. A release now means a submission to Mozilla, so a
  release label is a deliberate choice.
- **Every release is signed.** A release without `updates.json` would
  make the feed address return 404 until the next one, so the workflow
  never creates a release without both files.
- **Manual checks are recorded** in this document under the phase, as
  IMPL-0002 did.
- **`just check` passes** before a phase is called complete.

## How a release will work

```text
merge to main with major / minor / patch
        |
  bump-version   tags vX.Y.Z                      (as today)
        |
  sign           waits for approval; stages the tagged source at X.Y.Z,
        |        submits it to Mozilla, writes updates.json,
        |        uploads both as workflow artifacts
        |        (signing credentials; read-only repository token)
        |
  release        downloads the artifacts and creates the GitHub release
                 with both attached
                 (repository write token; no signing credentials)
```

The two secrets and the write token are never in the same job. If `sign`
fails, the tag exists and the release does not, so the feed keeps
pointing at the previous release.

The update feed address, fixed from the first workflow-signed build:

```text
https://github.com/donaldgifford/ff-aws-okta-containers/releases/latest/download/updates.json
```

## Implementation Phases

Each phase builds on the previous one. A phase is complete when all its tasks
are checked off and its success criteria are met.

---

<!--docz:phase:start-->
### Phase 1: Sign 0.1.0 by hand

A trial run before any workflow code is written. It answers the five
points INV-0002 left unverified and leaves a permanently installed 0.1.0
on the author's Firefox. Version 0.1.0 is free to use: it was released on
GitHub but never submitted to Mozilla.

<!--docz:tasks:start-->
#### Tasks

- [x] Split the `package` recipe: a `stage <version> <dir>` recipe that
      copies `extension/` into a directory, removes `test/`, `types/` and
      `regions.json`, and sets the version; `package` then builds its zip
      from a staged directory.
- [x] Add a `sign <version>` recipe: stage into a temporary directory,
      run `web-ext sign --channel unlisted` with the artifacts directory
      set to `dist/`, and leave the result at
      `dist/ff-aws-okta-containers-<version>.xpi`. It reads
      `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` from the environment and
      stops with a clear message when either is missing.
- [ ] **(you)** Sign in to addons.mozilla.org with a Mozilla account,
      accept the developer agreement, and generate API credentials at
      <https://addons.mozilla.org/developers/addon/api/key/>.
- [ ] **(you)** Export settings from the options page as a safeguard.
- [ ] **(you)** Run `just sign 0.1.0` from `main` with the credentials in
      the environment, exported in that terminal session only and written
      to no file. The extension source on
      `main` is the same as at tag `v0.1.0`.
- [ ] Record: how long signing took; the file name `web-ext` wrote;
      whether any lint message stopped it; and the full output with the
      credentials removed.
- [ ] **(you)** Run `just sign 0.1.0` a second time and record what
      happens for a version that is already uploaded. Fix the recipe if
      it can recover the signed file.
- [ ] **(you)** Remove the temporary add-on, install the signed file from
      `about:addons`, gear menu, "Install Add-on From File", and record:
      whether organizations, granted access, settings and containers
      survived; and whether the extension is still there after a restart.
- [ ] Write the results into INV-0002 under "Not yet verified", and set
      it to Concluded once the redirect check in phase 4 is also in.
- [ ] If a result contradicts this plan, change the later phases before
      starting them.

<!--docz:tasks:end-->

<!--docz:criteria:start-->
#### Success Criteria

- A signed `ff-aws-okta-containers-0.1.0.xpi` exists and is installed
  permanently in release Firefox.
- The extension survives a Firefox restart with its settings.
- Four of the five unverified points in INV-0002 have a recorded result
  (all but the redirect check).
- `just check` passes, and `just package 0.1.0` still builds a zip.
- No credential appears in `git status`, the diff, or the recorded
  output.

<!--docz:criteria:end-->
<!--docz:phase:end-->

---

<!--docz:phase:start-->
### Phase 2: The update feed

Everything a signed build needs to find its updates, built and tested
without touching Mozilla.

<!--docz:tasks:start-->
#### Tasks

- [ ] Add `browser_specific_settings.gecko.update_url` to the manifest,
      set to the feed address above. It is committed, not added at
      packaging time.
- [ ] Add `--self-hosted` to the `ext-lint` recipe. Without it,
      `web-ext lint` reports `update_url` as not allowed, because that is
      true for listed add-ons, and the recipe treats warnings as errors.
- [ ] Extend `extension/test/manifest.test.js`: the `update_url` is the
      exact feed address, it is HTTPS, and it is on `github.com` under
      this repository.
- [ ] Write `scripts/gen-updates.mjs`. Given a version and a signed
      `.xpi`, it writes `updates.json` with one entry for the add-on ID
      read from the manifest: `version`, `update_link` pointing at
      `releases/download/v<version>/ff-aws-okta-containers-<version>.xpi`,
      `update_hash` as `sha256:` plus the file's digest, and
      `applications.gecko.strict_min_version` copied from the manifest.
- [ ] Have the script open the `.xpi`, read its `manifest.json`, and
      refuse to continue unless the ID and version match and
      `META-INF/` is present. An unsigned or mislabelled file never
      reaches a release.
- [ ] Unit test the script's pure parts: the entry it builds, the link
      shape, the hash format, a version that is not `X.Y.Z`, and each
      refusal.
- [ ] Add an `updates-json <version>` recipe that runs the script against
      `dist/` and writes `dist/updates.json`.
- [ ] Add a CI step that runs `just package` and the script's
      non-signature checks against the unsigned zip, so the release path
      is exercised on every pull request without credentials.
- [ ] Confirm `git status` stays clean after the recipes run. `dist/` is
      already ignored, so no ignore rule should be needed.

<!--docz:tasks:end-->

<!--docz:criteria:start-->
#### Success Criteria

- `just check` passes locally and in CI, with `web-ext lint` still
  reporting no errors or warnings.
- `just updates-json 0.1.0`, run against the file signed in phase 1,
  writes an `updates.json` whose hash matches `shasum -a 256` of that
  file.
- The script refuses the unsigned zip from `just package`.
- The pull request is merged with `dont-release`. No release is cut, so
  nothing is submitted to Mozilla.

<!--docz:criteria:end-->
<!--docz:phase:end-->

---

<!--docz:phase:start-->
### Phase 3: Signing in the release workflow

The release job signs and publishes. This phase ends with the first
workflow-signed release.

<!--docz:tasks:start-->
#### Tasks

- [ ] Create a GitHub environment named `amo-signing`: the author as
      required reviewer, deployments limited to `main`. Done with
      `gh api`.
- [ ] **(you)** Add `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` as secrets
      of that environment, not of the repository:
      `gh secret set WEB_EXT_API_KEY --env amo-signing`.
- [ ] Add a `sign` job to `.github/workflows/release.yml`, after
      `bump-version` and with the same condition as `release`:
      `environment: amo-signing`, `permissions: contents: read`, check
      out the tag, set up mise, run `just sign` and `just updates-json`
      with the version taken from the tag, and upload both files as one
      workflow artifact.
- [ ] Give `sign` an approval timeout of 30 minutes and a job
      `timeout-minutes` above it. Revisit the number if phase 1 measures
      a signing anywhere near it.
- [ ] Change the `release` job to need `sign`, download the artifact, and
      pass both files to `gh release create`. It keeps
      `contents: write` and gets no signing secrets.
- [ ] Set workflow-level `permissions` to none and grant each job only
      what it uses.
- [ ] Replace the "packaging and signing are added once the extension
      exists" comment at the top of the workflow with a description of
      the three jobs.
- [ ] Add a "Releasing" section to `CONTRIBUTING.md`: what each label
      does now, the approval step, and what to do when signing fails or
      times out: download the signed file from the AMO developer page, run
      `just updates-json`, and create the release with
      `gh release create`. Adjust for what phase 1 found about
      re-running.
- [ ] **(you)** Merge this phase's pull request with the `minor` label,
      so the release is `0.2.0`, approve the `amo-signing` deployment, and watch the
      run.
- [ ] Record the run: time waiting for Mozilla, the assets on the
      release, and that
      `releases/latest/download/updates.json` now resolves and names the
      new version.

<!--docz:tasks:end-->

<!--docz:criteria:start-->
#### Success Criteria

- The newest GitHub release has exactly two assets:
  `ff-aws-okta-containers-<version>.xpi` and `updates.json`.
- The `sha256` in the published `updates.json` matches the published
  `.xpi`.
- The `sign` job ran only after an approval, and its log shows neither
  secret.
- The `release` job's definition references no signing secret, and the
  `sign` job's token cannot write to the repository.
- A pull request from a fork cannot reach the secrets: the workflow runs
  only on pushes to `main`, and the environment accepts only `main`.

<!--docz:criteria:end-->
<!--docz:phase:end-->

---

<!--docz:phase:start-->
### Phase 4: Install, watch an update, and document

The author moves to the workflow-signed build, and one further release
proves that updates arrive on their own. The documentation pull request
is that further release.

<!--docz:tasks:start-->
#### Tasks

- [ ] **(you)** Install the `.xpi` from the phase 3 release over the
      hand-signed 0.1.0, from `about:addons`. This is the last manual
      install: 0.1.0 has no `update_url`.
- [ ] Rewrite the README's "Install" section for the signed file:
      download from the latest release, install from file, and updates
      arrive by themselves. Remove "After a Firefox restart" from the
      user path and keep `about:debugging` under "Development".
- [ ] Add to the README's "What access it holds, and why" that Firefox
      asks GitHub once a day whether a newer version exists, and that
      this is Firefox's updater, not a request made by the extension.
- [ ] Add a "Signed install and updates" section to
      `extension/TESTING.md`: install from file, restart, and the update
      check below.
- [ ] Update the README's development commands for the new recipes.
- [ ] Mark the signing, dry-run and update rows in IMPL-0002's "Deferred"
      table as done here, leaving the public listing row.
- [ ] **(you)** Merge that pull request with the `patch` label and
      approve the signing job.
- [ ] **(you)** In `about:config`, set `extensions.update.interval` to
      `120`, wait for the installed copy to move to the patch version
      without being touched, then reset the preference. `about:addons`,
      gear menu, "Check for Updates" does the same thing at once.
- [ ] Record the result. This is the redirect check from INV-0002: it
      shows Firefox following GitHub's redirects for both the feed and
      the file.
- [ ] **(you)** Load a checkout through `about:debugging` while the
      signed copy is installed, and record whether the two interfere and
      whether Firefox tries to update the temporary one.
- [ ] Set INV-0002 to Concluded and this document to Completed.

<!--docz:tasks:end-->

<!--docz:criteria:start-->
#### Success Criteria

- The installed extension updated itself from one workflow-signed version
  to the next with no manual step, keeping its settings, granted access
  and containers.
- The README tells a new user how to install without `about:debugging`.
- All five unverified points in INV-0002 have a recorded result.
- INV-0002 is Concluded and IMPL-0003 is Completed.

<!--docz:criteria:end-->
<!--docz:phase:end-->

---

<!--docz:file-changes:start-->
## File Changes

| File | Action | Description |
| ---- | ------ | ----------- |
| `justfile` | Modify | Add `stage`, `sign`, `updates-json`; rebuild `package` on `stage`; `--self-hosted` on `ext-lint` |
| `extension/manifest.json` | Modify | Add `update_url` |
| `extension/test/manifest.test.js` | Modify | Pin the `update_url` |
| `scripts/gen-updates.mjs` | Create | Writes `updates.json`; checks the `.xpi` it describes |
| `extension/test/gen-updates.test.js` | Create | Unit tests for the script |
| `.github/workflows/release.yml` | Modify | `sign` job behind the `amo-signing` environment; release assets; per-job permissions |
| `.github/workflows/ci.yml` | Modify | Exercise packaging and the feed script on pull requests |
| `README.md` | Modify | Install from the signed file; updater note; recipes |
| `CONTRIBUTING.md` | Modify | "Releasing": labels, approval, recovery |
| `extension/TESTING.md` | Modify | "Signed install and updates" |
| `docs/investigation/0002-…md` | Modify | Results of the unverified points; status to Concluded |
| `docs/impl/0002-…md` | Modify | Close the deferred rows this covers |

Outside the repository: the `amo-signing` GitHub environment with its two
secrets, and the add-on's entry in the author's AMO developer account.

<!--docz:file-changes:end-->

<!--docz:testing:start-->
## Testing Plan

- [ ] Unit tests for `scripts/gen-updates.mjs`: entry shape, link, hash
      format, version validation, and each refusal.
- [ ] Manifest test pinning the `update_url`.
- [ ] `web-ext lint --self-hosted` with warnings as errors, in
      `just check` and CI.
- [ ] CI exercises `just package` and the feed script on every pull
      request, with no credentials.
- [ ] By hand, phase 1: sign, re-sign, install over the temporary copy,
      restart.
- [ ] By hand, phase 3: the first workflow-signed release and its two
      assets.
- [ ] By hand, phase 4: one unattended update, and a temporary load
      beside the signed install.

What is not tested automatically: the signing call itself. It needs the
credentials and consumes a version number on every run, so its only test
is a real release.

<!--docz:testing:end-->

<!--docz:dependencies:start-->
## Dependencies

- **A Mozilla account with AMO API credentials.** Only the author can
  create these. Phase 1 cannot start without them.
- **Mozilla's signing service.** Automated validation "can take up to 24
  hours", longer if a manual review starts. A release waits on it.
- **GitHub environments with required reviewers**, which public
  repositories have on the free plan.
- **GitHub release asset addresses staying stable.** The feed address is
  permanent for every installed copy. GitHub redirects after a repository
  rename or transfer, but a deleted repository strands installed copies
  on their current version.
- **web-ext 10.8.0**, already pinned in `mise.toml`.
- **Order.** Phase 1 before everything. Phase 2 can be written while
  waiting for phase 1, but is not merged until phase 1's results are in.

<!--docz:dependencies:end-->

## Open Questions

All seven were resolved by the author on 2026-11-24. The options are
kept for the record.

### 1. Where does the `update_url` live?

- a) Committed in `extension/manifest.json`. The signed manifest then
  differs from the repository only in its version number, a test pins
  the address, and `web-ext lint` sees it. A checkout loaded through
  `about:debugging` carries it too; phase 4 checks that this is
  harmless.
- b) Added by the `stage` recipe, like the version. The committed
  manifest stays free of release details, but what ships is two edits
  away from what is committed, and the lint and the test would have to
  run against a staged copy to see it.

**Decision:** a

> **Resolved 2026-11-24:** a) Committed in `extension/manifest.json`.

### 2. What version is the first workflow-signed release?

Version 0.1.0 is used up by the trial run.

- a) `0.2.0`, by labelling the phase 3 pull request `minor`. A permanent
  install with automatic updates is a new capability for users.
- b) `0.1.1`, with `patch`. Nothing the extension does has changed.
- c) `1.0.0`, with `major`. IMPL-0002 considered and rejected calling
  the first signed build `1.0.0`; listed for completeness.

**Decision:** a

> **Resolved 2026-11-24:** a) `0.2.0`; the phase 3 pull request is labelled `minor`.

### 3. How long does the release wait for Mozilla?

To be settled after phase 1 measures a real signing.

- a) Wait up to 30 minutes, then fail. The tag exists, no release is
  created, and the job is re-run later. Simple, and a slow signing is
  visible.
- b) Wait as long as GitHub allows a job to run, about six hours. Fewer
  re-runs, but a stuck job holds the release without saying why.
- c) Upload without waiting, and fetch the signed file in a second
  workflow run on a schedule. Survives a 24-hour review, at the cost of
  a second workflow and a polling script.

**Decision:** a

> **Resolved 2026-11-24:** a) Wait up to 30 minutes, then fail and re-run. Revisit if phase 1 measures a signing anywhere near that.

### 4. Where do the credentials live for the hand-signed trial?

- a) Exported in one terminal session and gone when it closes. Nothing
  is written to disk.
- b) In a git-ignored `.env` in the checkout, loaded by mise. Convenient
  for repeat runs, but a secret then sits in the working tree, where a
  tool that reads the directory can see it.
- c) In the macOS keychain, read by the recipe with `security`. Nothing
  in the working tree, and it survives the session; ties the recipe to
  macOS.

**Decision:** a

> **Resolved 2026-11-24:** a) Exported in one terminal session. Nothing is written to disk.

### 5. How is a release recovered when Mozilla signed it but the job failed?

A version can be submitted once, so a plain re-run may be refused. What
phase 1 finds about re-running decides how much of this is needed.

- a) By hand, documented in `CONTRIBUTING.md`: download the signed file
  from the AMO developer page, run `just updates-json`, and create the
  release with `gh release create`. Rare enough not to automate.
- b) A manually triggered workflow that takes a tag, fetches the
  already-signed file from Mozilla with the same credentials, and
  publishes it. No local steps, but more workflow to maintain for a rare
  case.
- c) Abandon the version: merge a `patch` change and let the next number
  go through. No recovery code at all; leaves a tag with no release.

**Decision:** a

> **Resolved 2026-11-24:** a) By hand, documented in `CONTRIBUTING.md`.

### 6. Who sets up the GitHub environment?

- a) Created from the command line with `gh api` as a phase 3 task, with
  the author as reviewer and `main` as the only allowed branch. The
  author then adds the two secrets, which nobody else should see.
- b) The author does all of it in the repository settings.

**Decision:** a

> **Resolved 2026-11-24:** a) Created with `gh api`; the author adds the two secrets.

### 7. Does `just package` stay?

Releases no longer carry the unsigned zip.

- a) Keep it. It builds an unsigned copy locally for inspection, and CI
  uses it to exercise the release path without credentials.
- b) Remove it and have CI use `stage` directly. One recipe fewer; no
  quick way to produce the exact package contents as a file.

**Decision:** a

> **Resolved 2026-11-24:** a) Keep it.

<!--docz:references:start-->
## References

- [INV-0002: Unlisted signing and self-hosted updates for the extension](../investigation/0002-unlisted-signing-and-self-hosted-updates-for-the-extension.md)
- [IMPL-0002: Build the AWS and Okta admin containers extension](../impl/0002-build-the-aws-and-okta-admin-containers-extension.md)
- [DESIGN-0001: Automatic AWS and Okta admin containers extension](../design/0001-automatic-aws-and-okta-admin-containers-extension.md)
- [web-ext command reference (Extension Workshop)](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/)
- [Updating your extension (Extension Workshop)](https://extensionworkshop.com/documentation/manage/updating-your-extension/)
- [Self-distribution (Extension Workshop)](https://extensionworkshop.com/documentation/publish/self-distribution/)
- [Managing environments for deployment (GitHub Docs)](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)

<!--docz:references:end-->
