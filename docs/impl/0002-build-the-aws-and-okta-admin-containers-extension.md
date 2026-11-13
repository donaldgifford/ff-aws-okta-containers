---
id: IMPL-0002
title: "Build the AWS and Okta admin containers extension"
status: In Progress
author: Donald Gifford
created: 2026-11-13
---

<!-- markdownlint-disable-file MD013 MD024 MD025 MD041 -->

# IMPL-0002: Build the AWS and Okta admin containers extension

<!--toc:start-->
<!-- markdownlint-capture -->
<!-- markdownlint-disable MD013 -->
- [Objective](#objective)
- [Scope](#scope)
  - [In Scope](#in-scope)
  - [Out of Scope](#out-of-scope)
- [Conventions for every phase](#conventions-for-every-phase)
- [Implementation Phases](#implementation-phases)
  - [Phase 1: Skeleton, tooling and platform checks](#phase-1-skeleton-tooling-and-platform-checks)
    - [Tasks](#tasks)
    - [Success Criteria](#success-criteria)
  - [Phase 2: Pure core](#phase-2-pure-core)
    - [Tasks](#tasks-1)
    - [Success Criteria](#success-criteria-1)
  - [Phase 3: Storage and container registry](#phase-3-storage-and-container-registry)
    - [Tasks](#tasks-2)
    - [Success Criteria](#success-criteria-2)
  - [Phase 4: Enrolment](#phase-4-enrolment)
    - [Tasks](#tasks-3)
    - [Success Criteria](#success-criteria-3)
  - [Phase 5: AWS consoles](#phase-5-aws-consoles)
    - [Tasks](#tasks-4)
    - [Success Criteria](#success-criteria-4)
  - [Phase 6: Portal and Okta routing, and removing the spike](#phase-6-portal-and-okta-routing-and-removing-the-spike)
    - [Tasks](#tasks-5)
    - [Success Criteria](#success-criteria-5)
  - [Phase 7: Options page](#phase-7-options-page)
    - [Tasks](#tasks-6)
    - [Success Criteria](#success-criteria-6)
  - [Phase 8: Daily-use build](#phase-8-daily-use-build)
    - [Tasks](#tasks-7)
    - [Success Criteria](#success-criteria-7)
- [Deferred](#deferred)
- [File Changes](#file-changes)
- [Testing Plan](#testing-plan)
- [Dependencies](#dependencies)
- [Open Questions](#open-questions)
  - [1. Which test runner?](#1-which-test-runner)
  - [2. Where do the browser API type definitions come from?](#2-where-do-the-browser-api-type-definitions-come-from)
  - [3. A JavaScript linter?](#3-a-javascript-linter)
  - [4. How does the release version get into the manifest?](#4-how-does-the-release-version-get-into-the-manifest)
  - [5. How do updates reach an installed copy?](#5-how-do-updates-reach-an-installed-copy)
  - [6. What is the first version number?](#6-what-is-the-first-version-number)
  - [7. Should the headless load test run in CI?](#7-should-the-headless-load-test-run-in-ci)
- [References](#references)
<!-- markdownlint-restore -->
<!--toc:end-->

<!--docz:objective:start-->
## Objective

Build the Firefox extension designed in DESIGN-0001: AWS consoles, AWS
access portals and Okta admin consoles each open in their own automatically
created container, for organizations the user has enrolled. The work ends
with the extension in daily use, loaded by hand from a checkout, and
`spike/` removed. Signing and anything else involving Mozilla is deferred.

**Implements:** [DESIGN-0001](../design/0001-automatic-aws-and-okta-admin-containers-extension.md)

<!--docz:objective:end-->

<!--docz:scope:start-->
## Scope

<!--docz:in-scope:start-->
### In Scope

- The `extension/` source tree in plain JavaScript modules with JSDoc types.
- Type checking, unit tests, source checks, extension lint and a headless
  load test, all running in CI.
- Enrolment of AWS portals and Okta tenants, with no site access granted at
  install.
- The AWS console hand-off, account names, and navigation routing for
  portals and Okta admin consoles.
- The container registry, naming, labels and colour rules.
- The options page: organizations, naming, colours, switches, managed
  containers, export and import.
- A manual test checklist, a user-facing README, and a recipe that packages
  the extension at a given version.
- Removing `spike/` and its recipes.

<!--docz:in-scope:end-->

<!--docz:out-of-scope:start-->
### Out of Scope

- Anything that involves Mozilla: signing, the signing credentials, an
  update feed and a public listing. See [Deferred](#deferred).
- Everything listed as a non-goal in DESIGN-0001: Okta end-user dashboards,
  moving tabs already in a container, other browsers, non-portal AWS
  sign-in, detecting live console sessions, a CLI protocol handler, Okta
  custom domains.
- Automated end-to-end tests against a fake portal.
- AWS GovCloud and China, and Okta `okta-gov.com` and `okta.mil`.

<!--docz:out-of-scope:end-->
<!--docz:scope:end-->

## Conventions for every phase

- **One phase, one or more pull requests**, each labelled `dont-release`
  until the last one in phase 8.
- **This repository is public.** Fixtures, tests, docs and commit messages
  use placeholders only (`acme`, `d-1234567890`, `111122223333`,
  `ExampleRole`). The diff is checked for real identifiers before each
  commit.
- **Pure code first.** Anything that can be decided from plain data lives
  in `core/` and is unit tested. Code that touches `browser.*` is kept
  thin.
- **Manual checks are recorded.** A task that says "by hand" is done in a
  real Firefox, and what was seen is written into this document under the
  phase, as IMPL-0001 did.
- **`just check` passes** before a phase is called complete.

## Implementation Phases

Each phase builds on the previous one. A phase is complete when all its tasks
are checked off and its success criteria are met.

---

<!--docz:phase:start-->
### Phase 1: Skeleton, tooling and platform checks

An extension that loads and does nothing, with every CI check wired up, and
the two Firefox behaviours the design depends on confirmed by hand before
anything is built on them.

<!--docz:tasks:start-->
#### Tasks

- [x] Create `extension/` with `manifest.json` (Manifest V3, the extension
      ID, `strict_min_version` 140, `data_collection_permissions` of
      `none`, the permissions from DESIGN-0001, no `host_permissions`) and
      a module background script that only logs that it loaded.
- [x] Add `extension/regions.json` listing the commercial AWS regions where
      IAM Identity Center is available, with the AWS documentation page it
      was taken from.
- [x] Add `scripts/gen-manifest.mjs`, which writes the
      `optional_host_permissions` list into `manifest.json` from
      `regions.json`, and a `--check` mode that fails if the two disagree.
- [x] Add `typescript`, `biome` and `jq` to `mise.toml`. There is no
      `package.json`, lockfile or `node_modules` in the repository.
- [x] Add a `jsconfig.json` that turns on strict checking of JavaScript,
      and `extension/types/browser.d.ts`: hand-written declarations for
      only the `browser.*` calls the extension makes, each with a link to
      its MDN page.
- [x] Add a `biome.json` that lints and formats `extension/` and
      `scripts/`.
- [x] Tests run with `node --test` and Node's built-in assertions.
- [x] Add `scripts/check-source.mjs`, which fails if anything under
      `extension/src` uses `fetch`, `XMLHttpRequest`, `WebSocket`,
      `sendBeacon`, `eval`, `new Function`, or `browser.cookies`.
- [x] Add a headless load test under `extension/test/smoke/`: copy the
      extension to a temporary directory, append a test driver, run it
      with `web-ext` in headless Firefox, and assert that it loaded with no
      errors. The driver lives only in the test directory.
- [x] Add `just` recipes `typecheck`, `test`, `js-lint`, `source-check`,
      `manifest-check`, `ext-lint`, `ext-run`, `smoke` and `package`, and
      make `just check` run all but `ext-run`, `smoke` and `package`.
- [x] Add CI jobs for everything `just check` runs, and an `extension` path
      to the labeler. The headless load test is not run in CI.
- [x] By hand: confirm that `permissions.request` grants a single address
      (for example one `awsapps.com` host) when the manifest declares only
      the wildcard under `optional_host_permissions`. **Result (Firefox
      160):** it does. Enrolling a portal granted exactly
      `https://d-1234567890.awsapps.com/*` and
      `https://portal.sso.us-west-2.amazonaws.com/*`; enrolling an Okta
      tenant granted exactly its `-admin` address. Firefox's prompt named
      those hosts and nothing else, and declining it saved nothing.
- [x] By hand: confirm whether a `webRequest` listener registered at
      startup begins receiving events for a host once access to it is
      granted later, without restarting the extension. **Result (Firefox
      160):** it does. With the listeners registered before anything was
      enrolled, a portal and an Okta admin console were both moved into
      their containers straight after enrolment, and `<org>.okta.com` was
      left alone.
- [x] By hand: load the skeleton from `about:debugging`, grant it access to
      one address, write a value to storage, restart Firefox and load it
      again. Record whether the stored value and the granted access
      survive, since this is how the extension will be used day to day.
      **Result (Firefox 160):** both survive. After a normal quit and
      loading the temporary add-on again, the organizations, the container
      map and the granted addresses were all still there, and routing
      worked at once. The extension keeps the same internal ID because the
      manifest sets an explicit add-on ID.
- [x] If either of the first two checks fails, record the fallback being taken: granting the
      whole base domain at enrolment, and re-registering listeners from
      `permissions.onAdded`. Neither failed, so neither fallback is built:
      enrolment requests single addresses only, and listeners are
      registered once, at the top level.
- [x] Update DESIGN-0001 if either result changes the design. The results
      are recorded under "Enrolment" and "Background script lifecycle".

These three checks were run by a throwaway script that drove a real,
headless Firefox 160 through the extension's own options page with a
temporary profile, rather than by hand. It is not part of the repository.
It also found a bug that unit tests had missed; see phase 4.

<!--docz:tasks:end-->

<!--docz:criteria:start-->
#### Success Criteria

- `just check` passes locally and in CI, and `just smoke` passes locally.
- `web-ext lint` reports no errors or warnings.
- The installed skeleton shows no site access in the add-on manager.
- All three platform checks have a recorded result, and any fallback is
  written into DESIGN-0001.

<!--docz:criteria:end-->
<!--docz:phase:end-->

---

<!--docz:phase:start-->
### Phase 2: Pure core

Every decision the extension makes, as functions of plain data with no
browser APIs. This is the bulk of the test suite.

<!--docz:tasks:start-->
#### Tasks

- [x] `core/classify.js`: URL plus the enrolled organizations to a target
      (`aws-portal` or `okta-admin`, with its key) or nothing. Includes the
      `awsapps.com` and `app.aws` portal forms and the three Okta base
      domains.
- [x] `core/routing.js`: request facts (method, tab container, private
      window, target, settings) to a decision with a reason.
- [x] `core/federation.js`: validate the request parameters
      (`account_id`, `role_name`); parse and validate the response body;
      validate the sign-in host; choose the destination; build the sign-in
      URL.
- [x] `core/accounts.js`: extract account IDs and names from an
      account-list response body.
- [x] `core/naming.js`: render name templates from tokens; apply colour
      rules with a stable-hash fallback; fixed icon per kind; validate a
      template and a rule.
- [x] `core/enrol.js`: turn a typed or captured address into an enrolment
      request: organization kind, key, the exact addresses to request, and
      a suggested label.
- [x] JSDoc type definitions for targets, decisions, organizations,
      settings and container records, shared by the later phases.
- [x] Keep `extension/types/browser.d.ts` in step with the calls each phase
      adds; a call with no declaration fails type checking.
- [x] Unit tests for all of the above, including every case listed under
      Testing Strategy in DESIGN-0001.
- [x] Sanitized fixtures for the federation and account-list responses,
      taken from the shapes recorded in IMPL-0001.

<!--docz:tasks:end-->

<!--docz:criteria:start-->
#### Success Criteria

- Nothing under `extension/src/core/` references `browser`.
- Unit tests pass in CI and cover: a POST account list; federation
  responses that are valid, missing a field, carrying extra fields, not
  JSON, and empty; a sign-in location that is not an AWS sign-in host;
  `<org>.okta.com` and a bare `-admin` host not matching; a tab already in
  a container, a POST and a private window all being left alone.
- Type checking passes with strict settings.

<!--docz:criteria:end-->
<!--docz:phase:end-->

---

<!--docz:phase:start-->
### Phase 3: Storage and container registry

The stored data model and the only code allowed to create, rename or forget
containers.

<!--docz:tasks:start-->
#### Tasks

- [x] `storage/schema.js`: the settings, organization, account and managed
      container records from DESIGN-0001, defaults (including the three
      default colour rules), and numbered migrations starting at version 1.
- [x] `storage/store.js`: read and write over `storage.local` behind one
      cached promise; refuse to run on data from a newer schema version.
- [x] `background/registry.js`: get-or-create by key; one creation at a
      time per key; rename in place when the desired name changes;
      hand-rename detection using the recorded managed name; recreate when
      the mapped container no longer exists.
- [x] Handle `contextualIdentities.onRemoved` by forgetting the mapping.
- [x] Never adopt, rename or remove a container the extension did not
      create.
- [x] A small in-memory fake of `contextualIdentities`, `storage.local` and
      `tabs` for tests, kept under `extension/test/`.
- [x] Unit tests: create then reuse; two simultaneous requests for one key
      creating one container; a template change renaming instead of
      creating; a hand-renamed container not being renamed back; a deleted
      container being recreated; migrations; newer-schema refusal.
- [x] Extend the local headless load test to create a container through
      the registry and reuse it on a second call.

<!--docz:tasks:end-->

<!--docz:criteria:start-->
#### Success Criteria

- All registry and storage tests pass in CI.
- `just smoke` shows one container after two get-or-create calls for the
  same key.
- No module other than the registry calls
  `contextualIdentities.create`, `update` or `remove`; the source check
  enforces this.

<!--docz:criteria:end-->
<!--docz:phase:end-->

---

<!--docz:phase:start-->
### Phase 4: Enrolment

Granting access, one organization at a time. After this phase the extension
can be given access to a portal or tenant, but does not yet act on it.

<!--docz:tasks:start-->
#### Tasks

- [x] Toolbar button: on click, read the current tab's address through
      `activeTab` and open the options page, on the add form with the
      address filled in when it is an unenrolled portal or Okta admin
      console.
- [x] Options page shell (`options.html`, `options.js`, plain CSS that
      follows Firefox's light and dark themes) with the Organizations
      section only.
- [x] Add form: address, required label, and for a portal a region chosen
      from `regions.json`. The label is prefilled with a suggestion for
      Okta and left empty for a portal.
- [x] The Add button calls `permissions.request` as the first thing in its
      click handler, for exactly the addresses `core/enrol.js` returns,
      then saves the organization only if access was granted.
- [x] Organizations list: address, region, label, and whether access is
      currently granted; edit label; change region; grant access again;
      remove.
- [x] Removing an organization revokes its addresses, keeping a region's
      API address while another enrolled portal uses it.
- [x] Listen for `permissions.onRemoved` and `onAdded`, and re-check with
      `permissions.contains` at startup, so a grant changed in the add-on
      manager is reflected.
- [x] Unit tests for the enrolment decisions: which addresses to request,
      which to revoke on removal with a shared region, and status after a
      revoked grant.
- [x] By hand: enrol a portal and an Okta tenant, check the prompt names
      exactly the expected addresses, revoke one in the add-on manager and
      see it marked, then remove both and confirm no site access remains.
      **Result (Firefox 160):** all as expected, run by the same headless
      script as the phase 1 checks. The revocation was made through the
      call the add-on manager itself makes; the card changed to "Needs
      access" and "Grant access again" restored it.

The run found one bug. Removing an organization gave up its addresses
before deleting its record; that made the background script re-check access
and write the record back, so the organization reappeared with no access.
The record is now deleted first, and a region change is saved before the
old address is given up. Both orders are pinned by tests.

<!--docz:tasks:end-->

<!--docz:criteria:start-->
#### Success Criteria

- A fresh install shows no site access; after enrolling one portal the
  add-on manager shows exactly that portal's address and its region's API
  address.
- Declining the Firefox prompt leaves nothing saved.
- Removing every organization returns the extension to no site access.
- The options page works in light and dark themes and by keyboard alone.

<!--docz:criteria:end-->
<!--docz:phase:end-->

---

<!--docz:phase:start-->
### Phase 5: AWS consoles

The hand-off that opens each console in its own container, for enrolled
portals.

<!--docz:tasks:start-->
#### Tasks

- [x] `background/index.js`: register every listener synchronously at the
      top level, using the result of the phase 1 check to decide whether
      they are re-registered when access is granted.
- [x] Federation listener: match `GET /federation/console` with both
      parameters on an enrolled portal's region API host; attach the
      response filter synchronously; buffer the body.
- [x] On completion, run `core/federation.js`; on success, get or create
      the container and open the sign-in URL beside the requesting tab; on
      any failure, write the buffered body back unchanged.
- [x] Close the requesting tab only when it is a shortcut tab.
- [x] Account-list listener: pass the response through as it arrives, keep
      a copy, and save names with the portal they came from.
- [x] When a name arrives for an account whose container is named with the
      account ID, rename the container in place.
- [x] Use the portal's label as `{org}` in the container name.
- [x] Warning badge on the toolbar button after a failed hand-off, with the
      reason in the tooltip and on the options page; cleared when viewed.
- [x] Wrong-region warning: a shortcut tab in an enrolled portal's
      container with no federation request seen within a few seconds.
- [x] Respect the "AWS consoles" switch in settings.
- [x] Never log or store a token; logging helpers take field names only.
- [x] Unit tests for the listener glue with the fake browser: success,
      each failure path releasing the body, the shortcut-tab rule, and
      rename on name arrival.
- [ ] Can't do without you at the browser (steps in `extension/TESTING.md`): By hand, against a real portal: a role click, a second account, the
      same role twice, a bookmarked shortcut link, a role click after the
      background script has gone idle with DevTools closed, and a portal
      enrolled with the wrong region.

<!--docz:tasks:end-->

<!--docz:criteria:start-->
#### Success Criteria

- Clicking a role opens the console in a container named
  `<account>(<label>) / <role>`, and a second click reuses the container.
- Consoles for two accounts stay signed in side by side.
- A bookmarked shortcut link behaves the same as a click.
- With the hand-off forced to fail, the console still opens, in the
  portal's container, and the badge appears.
- A portal that is not enrolled is untouched.

<!--docz:criteria:end-->
<!--docz:phase:end-->

---

<!--docz:phase:start-->
### Phase 6: Portal and Okta routing, and removing the spike

Moving enrolled portals and Okta admin consoles out of tabs with no
container. After this phase the extension does everything the spike did.

<!--docz:tasks:start-->
#### Tasks

- [x] Routing listener on top-level requests: gather the request facts,
      call `core/routing.js`, and on a move decision open the URL in the
      target's container and cancel the original request.
- [x] Close the source tab only when it was empty.
- [x] On any failure to create the container or open the tab, let the
      original request proceed.
- [x] Respect the "AWS access portals" and "Okta admin consoles" switches.
- [x] After enrolment succeeds, reopen the tab it was started from in its
      new container.
- [x] Unit tests for the listener glue: move, each leave-alone reason, and
      the failure path.
- [ ] Can't do without you at the browser (steps in `extension/TESTING.md`): By hand: a portal and two Okta tenants from ordinary tabs; sign-in
      completing inside each container; two tenants and two portals signed
      in at once; `<org>.okta.com` not moving; a portal launched from an
      Okta dashboard tile in an ordinary tab; a portal opened from inside
      a container staying there.
- [x] Delete `spike/`, the `spike-*` recipes and the `spike` labeler path.
- [x] Note in this document that containers created by the spike are not
      adopted and are removed by hand.

**Containers left by the spike.** The spike looked containers up by name
and created them without recording them. The extension never adopts a
container it did not create, so those containers are not reused: the first
use of each portal, tenant or console creates a new one alongside. Delete
the spike's containers once, by hand, in Firefox's settings under Tabs,
Manage Containers. Sessions in them are lost; sign in again in the new
containers.

<!--docz:tasks:end-->

<!--docz:criteria:start-->
#### Success Criteria

- Every check in IMPL-0001's phases 2 and 3 passes against the real
  extension, plus the two the spike did not cover.
- `spike/` no longer exists and `just check` still passes.
- With all three switches off, no request is moved or intercepted.

<!--docz:criteria:end-->
<!--docz:phase:end-->

---

<!--docz:phase:start-->
### Phase 7: Options page

The rest of the settings, on top of the Organizations section from phase 4.

<!--docz:tasks:start-->
#### Tasks

- [x] Naming section: the three templates, validated as typed, with a live
      preview built from an example or a real managed container.
- [x] Colours section: the ordered rule list with add, remove and reorder.
- [x] Behaviour section: the three switches.
- [x] Saving labels, templates or colour rules recomputes every managed
      container and renames or recolours those that changed, skipping any
      renamed by hand.
- [x] Managed containers section: key, name, last used, and whether it was
      renamed by hand, with a button to hand naming back to the extension.
- [x] Cleanup: list managed containers with no open tabs, and remove them
      only after the list is confirmed.
- [x] Backup: export settings and organization labels to a JSON file with
      `schemaVersion`; import with validation. The container map, account
      names and site access are not exported.
- [x] After an import, organizations that lack site access are shown as
      needing it, with the grant button.
- [x] Unit tests: which containers a settings change renames; cleanup
      selection; export contents; import validation and rejection of a
      newer schema.
- [x] By hand: edit a label and watch containers rename without
      duplicates; rename one in Firefox and confirm it is left alone; run
      cleanup; export, reset, import. **Result (Firefox 160):** all as
      expected, run by the same headless script as the earlier checks,
      through the real options page. A label edit and a template change
      renamed containers in place with the count unchanged; a container
      renamed outside the extension kept its name, was shown as "Renamed
      by hand", and took its computed name back when asked; a new colour
      rule recoloured without renaming; with a switch off its kind was left
      alone; cleanup listed only the container with no open tabs and
      removed it after confirmation; an export downloaded as a file with no
      container IDs or account data; a newer-version file and a file that
      was not JSON changed nothing and said why; a good file was applied
      and its new organization was shown as needing access.

The run found one bug. Firefox 160 reports the container colour
"turquoise" as "cyan", so a turquoise container looked out of date on every
use and had its colour set again each time. The two names are now treated
as the same colour.

<!--docz:tasks:end-->

<!--docz:criteria:start-->
#### Success Criteria

- Changing a label or template renames existing containers in place; the
  number of containers does not change.
- A hand-renamed container keeps its name until naming is handed back.
- An exported file contains no `cookieStoreId`, account ID or account name.
- Import of a malformed or newer-version file changes nothing and says why.

<!--docz:criteria:end-->
<!--docz:phase:end-->

---

<!--docz:phase:start-->
### Phase 8: Daily-use build

The extension in daily use, loaded by hand, with the documents needed to
use and test it. Nothing in this phase involves Mozilla.

<!--docz:tasks:start-->
#### Tasks

- [ ] Write `extension/TESTING.md`: the manual checklist, gathered from the
      "by hand" tasks above.
- [ ] Rewrite `README.md` for users: what it does, how to load it from
      `about:debugging`, what has to be redone after a Firefox restart, how
      to enrol a portal and a tenant, what access it holds and why, and
      how to remove it.
- [ ] Add an icon drawn for this project, for the toolbar button and the
      add-on manager.
- [ ] Set the committed manifest version to `0.1.0`.
- [ ] `just package <version>`: copy `extension/` without its tests to a
      build directory, set the version in the copy with `jq`, and produce
      a `.zip` with `web-ext build`.
- [ ] Based on the phase 1 restart check, make the after-restart routine as
      short as it can be: one reload from `about:debugging`, and if access
      is lost, one button on the options page that asks for every enrolled
      organization's access again.
- [ ] Run the full manual checklist against the extension loaded from a
      clean checkout of `main`.
- [ ] Merge the final pull request with the `minor` label, so the release
      workflow tags `v0.1.0` and creates the GitHub release.
- [ ] Use it daily. Record problems as issues, and note here anything that
      should change before signing is taken up.
- [ ] Set DESIGN-0001 to Implemented and this document to Completed.

<!--docz:tasks:end-->

<!--docz:criteria:start-->
#### Success Criteria

- Loaded from `about:debugging` out of a clean checkout, the extension
  passes the manual checklist in full.
- The add-on manager shows no site access before enrolment.
- After a Firefox restart, getting back to a working state takes no more
  than a reload and, if needed, one click.
- The repository contains no `spike/`, README describes the real
  extension, and `v0.1.0` is tagged.

<!--docz:criteria:end-->
<!--docz:phase:end-->

---

## Deferred

Everything that involves Mozilla is left for a later plan, to be written
once the extension has been in daily use for a while.

| Deferred | Why it can wait | What it needs later |
| -------- | --------------- | ------------------- |
| Signing on the unlisted channel | Loading by hand is enough to use and test it | A Mozilla developer account, API credentials as repository secrets, a signing step in the release workflow |
| The signing dry run from IMPL-0001 | Only matters once signing is taken up | Records signing time and whether `data_collection_permissions` is enforced |
| Automatic updates | Needs a signed build | An `updates.json` attached to each GitHub release, with the manifest's `update_url` pointing at the latest release's copy |
| A public listing | Decided after daily use | Listing text, screenshots, and Mozilla's review |

What deferring costs: release Firefox only keeps an unsigned extension
until it restarts. Until signing is done, the extension is loaded again
from `about:debugging` after each restart. Containers and their sessions
are unaffected. Whether settings and granted access also survive is the
third platform check in phase 1.

<!--docz:file-changes:start-->
## File Changes

| File | Action | Description |
| ---- | ------ | ----------- |
| `extension/manifest.json` | Create | Manifest V3; optional host permissions written by a script |
| `extension/regions.json` | Create | AWS regions for portal API addresses |
| `extension/src/core/*.js` | Create | `classify`, `routing`, `federation`, `accounts`, `naming`, `enrol` |
| `extension/src/storage/*.js` | Create | `schema`, `store` |
| `extension/src/background/*.js` | Create | `index`, `registry`, `accounts` |
| `extension/src/options/*` | Create | `options.html`, `options.js`, `options.css` |
| `extension/icons/*` | Create | Project icon |
| `extension/test/**` | Create | Unit tests, fixtures, browser fake, headless load test |
| `extension/TESTING.md` | Create | Manual checklist |
| `scripts/gen-manifest.mjs` | Create | Writes and checks the optional host permission list |
| `scripts/check-source.mjs` | Create | Enforces the security properties on the source |
| `jsconfig.json`, `biome.json` | Create | Strict type checking of JavaScript; lint and format rules |
| `extension/types/browser.d.ts` | Create | Hand-written declarations for the browser APIs used |
| `justfile` | Modify | Add extension recipes; remove `spike-*` |
| `mise.toml` | Modify | Add `typescript`, `biome` and `jq` |
| `.github/workflows/ci.yml` | Modify | Type check, tests, JavaScript lint, source and manifest checks, `web-ext lint` |
| `.github/labeler.yml`, `scripts/labels.sh` | Modify | `extension` path only, once `spike/` is gone |
| `README.md` | Modify | User-facing documentation |
| `docs/design/0001-…md` | Modify | Platform check results; status to Implemented |
| `spike/` | Delete | Replaced by `extension/` in phase 6 |

<!--docz:file-changes:end-->

<!--docz:testing:start-->
## Testing Plan

- [ ] Unit tests for every function in `core/`, with the cases named in
      DESIGN-0001's testing strategy.
- [ ] Unit tests for storage migrations and the registry against the
      browser fake.
- [ ] Unit tests for the listener glue in phases 5 and 6 against the
      browser fake.
- [ ] Source checks enforcing no network calls, no cookies API, no dynamic
      code, and that only the registry manages containers.
- [ ] Manifest check that the optional host permissions match
      `regions.json`.
- [ ] The headless load test, run locally with `just smoke` before each
      phase is called complete.
- [ ] The manual checklist, run at the end of phases 5, 6 and 7 for the
      parts that exist, and in full in phase 8.
- [ ] A diff review for real identifiers before every commit.

<!--docz:testing:end-->

<!--docz:dependencies:start-->
## Dependencies

- **Firefox 140 or later**, for `data_collection_permissions` and module
  background scripts.
- **A real AWS access portal and two Okta tenants**, with the author signed
  in, for the "by hand" tasks in phases 1, 4, 5, 6 and 7. These cannot be
  done from CI.
- **The three platform checks in phase 1.** Enrolment (phase 4), listener
  registration (phase 5) and the after-restart routine (phase 8) are
  written differently depending on the results.
- **Tools from the npm registry.** The repository has no `package.json`,
  but two tools `mise` installs are published on npm: `web-ext`, already
  in use, and `typescript`, which has no dependencies of its own. Both
  are pinned in `mise.toml`. Biome and `jq` are standalone binaries.

<!--docz:dependencies:end-->

<!--docz:open-questions:start-->
## Open Questions

Each question lists lettered options. Option a is the recommendation and
the rest are alternatives. Write the chosen letter, or your own answer, on
the **Decision** line.

### 1. Which test runner?

- a) Node's built-in test runner (`node --test`) and its built-in
  assertions. Nothing to install beyond Node, which `mise.toml` already
  pins. Fewer conveniences: no watch UI, plainer output.
- b) Vitest. Nicer output, watch mode and mocking helpers, at the cost of a
  development dependency with a large tree of its own.

**Decision:** a

> **Resolved 2026-11-13:** a) Node's built-in test runner.

### 2. Where do the browser API type definitions come from?

Type checking needs to know the shape of `browser.tabs`,
`browser.webRequest` and the rest.

- a) A root `package.json` with two development dependencies, `typescript`
  and `@types/firefox-webext-browser`, pinned by a lockfile and installed
  with scripts disabled. Accurate, maintained types. Adds `node_modules`
  for development only; nothing from it ships.
- b) No `package.json`. Install `typescript` through `mise` and hand-write
  a small declaration file covering only the dozen or so API calls the
  extension makes. No npm packages at all, but the declarations are ours
  to keep correct, and a mistake in them hides real bugs.

**Decision:** b

> **Resolved 2026-11-13:** b) No `package.json`. `typescript` is installed through `mise` and the browser API declarations are hand-written.

### 3. A JavaScript linter?

- a) None. Rely on strict type checking, `web-ext lint`, the source checks
  and Prettier for formatting. Prettier is already in `mise.toml`.
- b) Add ESLint with a small rule set. Catches some mistakes type checking
  does not, such as unused variables and unhandled promises, at the cost
  of another development dependency tree.

**Decision:** other

> **Resolved 2026-11-13:** Biome, installed through `mise` as a standalone binary from its GitHub releases, so no npm is involved. It lints and formats the extension's JavaScript, JSON and CSS.

### 4. How does the release version get into the manifest?

The release workflow decides the version from the merged pull request's
label, after the code is merged.

- a) The release job writes the tag's version into `manifest.json` in the
  packaged copy only. The committed manifest keeps a placeholder such as
  `0.0.0`. This is the one place the shipped file differs from the
  repository, and it is a single line.
- b) The version is committed in `manifest.json` by each release pull
  request, and the release job fails if it does not match the tag. What
  ships is exactly what is committed, but every release needs the number
  worked out and edited by hand first.

**Decision:** other

> **Resolved 2026-11-13:** A `just package <version>` recipe copies the extension and sets the version in the copy with `jq`. The committed manifest carries the current development version.

### 5. How do updates reach an installed copy?

A build signed on the unlisted channel does not update itself unless the
manifest points at an update feed we host.

- a) By hand for now. Download the new signed `.xpi` from the GitHub
  release and install it over the old one. Nothing to host. A public
  listing later would bring automatic updates.
- b) Host an update feed (`updates.json`) on GitHub Pages or as a release
  asset, and point the manifest's `update_url` at it. Updates install
  themselves, but the feed has to be generated on each release, and
  Firefox then checks that address periodically for every installed copy.

**Decision:** a

> **Resolved 2026-11-13:** a) By hand for now. When signing is taken up, the update feed can be a GitHub release asset; see Deferred.

### 6. What is the first version number?

- a) `0.1.0`. Signals that naming, settings and behaviour may still change
  before a `1.0.0`.
- b) `1.0.0`. The first signed build is the first real release.

**Decision:** a

> **Resolved 2026-11-13:** a) `0.1.0`.

### 7. Should the headless load test run in CI?

- a) Yes, on every pull request, using the Firefox already on the GitHub
  runner. Catches a broken manifest or a startup error before merge. Adds
  about a minute to CI.
- b) Locally only, through `just smoke`. Faster CI, but a startup error can
  reach `main`.

**Decision:** b

> **Resolved 2026-11-13:** b) Not in CI. The headless load test stays as a local recipe, `just smoke`.

<!--docz:open-questions:end-->

<!--docz:references:start-->
## References

- [DESIGN-0001: Automatic AWS and Okta admin containers extension](../design/0001-automatic-aws-and-okta-admin-containers-extension.md)
- [INV-0001: Firefox extension for automatic AWS SSO and Okta containers](../investigation/0001-firefox-extension-for-automatic-aws-sso-and-okta-containers.md)
- [IMPL-0001: Spike: validate AWS and Okta container interception](0001-spike-validate-aws-and-okta-container-interception.md)
- [permissions.request (MDN)](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/permissions/request)
- [optional_host_permissions (MDN)](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/optional_host_permissions)
- [background manifest key (MDN)](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)
- [web-ext command reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/)

<!--docz:references:end-->
