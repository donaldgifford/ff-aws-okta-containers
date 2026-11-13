---
id: IMPL-0001
title: "Spike: validate AWS and Okta container interception"
status: In Progress
author: Donald Gifford
created: 2026-11-12
---

<!-- markdownlint-disable-file MD024 MD025 MD041 -->

# IMPL-0001: Spike: validate AWS and Okta container interception

<!--toc:start-->
<!-- markdownlint-capture -->
<!-- markdownlint-disable MD013 -->
- [Objective](#objective)
- [Scope](#scope)
  - [In Scope](#in-scope)
  - [Out of Scope](#out-of-scope)
- [Ground Rules](#ground-rules)
- [Implementation Phases](#implementation-phases)
  - [Phase 1: Harness](#phase-1-harness)
    - [Tasks](#tasks)
    - [Results](#results)
    - [Success Criteria](#success-criteria)
  - [Phase 2: AWS console and portal](#phase-2-aws-console-and-portal)
    - [Tasks](#tasks-1)
    - [Results so far](#results-so-far)
    - [Results against a real portal](#results-against-a-real-portal)
    - [Success Criteria](#success-criteria-1)
  - [Phase 3: Okta admin console](#phase-3-okta-admin-console)
    - [Tasks](#tasks-2)
    - [Results so far](#results-so-far-1)
    - [Results against real tenants](#results-against-real-tenants)
    - [Success Criteria](#success-criteria-2)
  - [Phase 4: Signing dry run and write-up](#phase-4-signing-dry-run-and-write-up)
    - [Tasks](#tasks-3)
    - [Success Criteria](#success-criteria-3)
- [File Changes](#file-changes)
- [Testing Plan](#testing-plan)
- [Dependencies](#dependencies)
- [References](#references)
<!-- markdownlint-restore -->
<!--toc:end-->

<!--docz:objective:start-->
## Objective

Prove, in a real Firefox against a real AWS access portal and real Okta admin
consoles, that the approach recommended in INV-0001 works, and close that
investigation's unverified items. The output is findings, not a product: the
spike code is throwaway and the real extension is designed afterwards.

**Implements:** INV-0001 (spike; no DESIGN exists yet)

<!--docz:objective:end-->

<!--docz:scope:start-->
## Scope

<!--docz:in-scope:start-->
### In Scope

- A minimal Manifest V3 extension under `spike/`, loaded from
  `about:debugging`.
- AWS: intercept the federation response and open the console in a container;
  route an access portal into its own container.
- Okta: route `<org>-admin` hosts into a per-tenant admin container.
- Answers to the five unverified items in INV-0001, plus which cookie makes
  Okta tenants sign each other out without containers.
- A dry run of Mozilla's unlisted signing.

<!--docz:in-scope:end-->

<!--docz:out-of-scope:start-->
### Out of Scope

- Options page, editable labels, colour rules, container cleanup.
- TypeScript, bundling, unit tests, CI, release automation.
- A stored key-to-container map. The spike looks containers up by name.
- Any code intended to survive into the real extension.

<!--docz:out-of-scope:end-->
<!--docz:scope:end-->

## Ground Rules

This repository is public. While running the spike:

- Never commit captured responses, sign-in tokens, cookies, account IDs,
  account names, portal hostnames or Okta tenant names. Record the shape of
  what was seen, with placeholders such as `acme` and `111122223333`.
- Keep any local notes or captures that contain real values under a
  git-ignored path.
- Spike logging goes to the extension console only, and never logs token or
  cookie values.

## Implementation Phases

Each phase builds on the previous one. A phase is complete when all its tasks
are checked off and its success criteria are met.

---

<!--docz:phase:start-->
### Phase 1: Harness

A loadable extension that can create a container and open a tab in it. This
also settles the platform questions that do not need AWS or Okta.

<!--docz:tasks:start-->
#### Tasks

- [x] Add `spike/manifest.json` (Manifest V3, explicit `gecko.id`,
      `data_collection_permissions` of `none`, non-persistent background
      script) and `spike/background.js`.
- [x] Add a git-ignored path for local captures and notes.
- [x] Implement get-or-create of a container by name and opening a URL in it.
- [x] Load the extension in a fresh Firefox profile and record whether the
      `contextualIdentities` permission alone turns containers on.
- [x] Record what happens when a tab is opened with a container from a
      private window.
- [x] Add `web-ext` to `mise.toml` and confirm `web-ext lint` and
      `web-ext run` work against `spike/`.

<!--docz:tasks:end-->

#### Results

Observed on Firefox 159.0.1 with `web-ext run`, which starts a fresh
temporary profile:

- The `contextualIdentities` permission alone is enough. Containers were
  usable immediately, and the fresh profile already had the four default
  containers (Personal, Work, Banking, Shopping).
- Creating a container by name and asking for it again returned the same
  container; only one container with that name existed afterwards.
- A tab opened with the container's `cookieStoreId` reported that same
  store.
- Opening a container tab also needs the `cookies` permission.
- The local-capture path is `.local/`, ignored in `.gitignore`.
- Private window, with the extension allowed to run there (normal Firefox
  profile, loaded from `about:debugging`): the button click reached the
  background script and it declined to route, logging
  `private window: not routing`. No tab was opened.
- While the extension's DevTools toolbox is open, Firefox does not stop the
  background script when idle. The idle wake-up test in phase 2 has to be
  run with the toolbox closed.
- Normal window, same profile: the first button click logged
  `created container` and opened the tab in it; the second logged
  `reusing container` with the same `cookieStoreId` and opened a second tab
  there.
- Not checked: whether the button is absent from private windows when the
  extension is not allowed there. This does not affect the design.

<!--docz:criteria:start-->
#### Success Criteria

- The extension loads from `about:debugging` with no manifest warnings.
- Triggering the test action creates a named container once and reuses it on
  the second run.
- `web-ext lint` reports no errors.

<!--docz:criteria:end-->
<!--docz:phase:end-->

---

<!--docz:phase:start-->
### Phase 2: AWS console and portal

Confirm the federation-response technique on the current access portal, and
that a portal can live in its own container.

<!--docz:tasks:start-->
#### Tasks

- [x] With the network panel open, click a role in the portal and record: the
      federation request URL pattern, the response field names, and how the
      page reaches the console afterwards.
- [x] Record the portal's hostname form (for example `*.awsapps.com/start`,
      `*.portal.<region>.app.aws`) and the hosts its API calls go to.
- [x] Add a blocking listener with `filterResponseData` on the federation
      request. Record which permissions Manifest V3 needs for it, including
      whether `webRequestFilterResponse` is required.
- [x] Build the sign-in URL from the response, open it in a container named
      for the account and permission set, and close the original tab.
- [x] Find where the account name comes from: record which portal API
      response carries it and whether it is always seen before a role click.
- [ ] Open a bookmarked shortcut link
      (`…/#/console?account_id=…&role_name=…`) and confirm it is handled the
      same way.
- [ ] Open two roles in two accounts and confirm both console sessions stay
      signed in side by side.
- [ ] Route the portal host from a tab with no container into a portal
      container. Confirm the sign-in redirect to Okta completes inside it and
      that a second portal for another organization can be signed in at the
      same time.
- [ ] Click the AWS tile on an Okta dashboard in an ordinary tab. Confirm the
      portal moves to its container and asks for one Okta sign-in there.
- [ ] Let the background script go idle, then click a role, to confirm the
      listener still fires after the script is woken.

<!--docz:tasks:end-->

#### Results so far

Observed headless on Firefox 159.0.1 in a fresh profile, without AWS:

- `webRequest.filterResponseData` under Manifest V3 needs three
  permissions: `webRequest`, `webRequestBlocking` and
  `webRequestFilterResponse`. Without the last one the call throws
  `Missing required "webRequestFilterResponse" permission`. With it, a
  response body was read and passed through intact.
- Host permissions declared in `host_permissions` were all granted to a
  temporarily loaded extension without a prompt.
- `storage.session` is available, and is used to keep account names across
  the background script going idle.

The interception code in `spike/background.js` is written from the
behaviour described in INV-0001 and has not yet been run against a real
access portal.

#### Results against a real portal

Observed on Firefox 159.0.1 in a normal profile. Identifiers are replaced
with placeholders.

- **Portal host:** `<directory-id>.awsapps.com/start/`, where the first
  label is the IAM Identity Center directory ID (`d-1234567890`). The portal
  page makes its API calls to `portal.sso.<region>.amazonaws.com`.
- **Requests seen from the portal page** (each preceded by an OPTIONS
  preflight):

  | Method | Path | Purpose |
  | ------ | ---- | ------- |
  | POST | `/auth/sso-token` | Portal session |
  | GET | `/token/whoAmI`, `/user` | Signed-in user |
  | POST | `/instance/appinstances` | Account list |
  | POST | `/instance/appinstance/<ins-id>/profiles` | Roles for one account |
  | GET | `/federation/console?account_id=…&role_name=…` | Console sign-in token |

- **Federation response:** JSON with exactly three fields, `signInToken`,
  `signInFederationLocation` and `destination`. The sign-in location is on
  `<region>.signin.aws.amazon.com`.
- **Hand-off works.** Withholding that response and opening
  `<signInFederationLocation>?Action=login&SigninToken=…&Issuer=…&Destination=…`
  in a container produced a console tab in a container per account and
  role. Five role clicks across three accounts and two portals each got
  their own container.
- **Portal routing works.** A portal opened in a tab with no container was
  reopened in its portal container; a later visit reused that container.
- **A second portal was not moved**, and its consoles were still named for
  that portal. To confirm: that it was opened from a tab already in a
  container, which is the accepted behaviour.
- **Bug found:** account names were never learned, so containers were named
  with the account ID. The account list is a POST and the spike only read
  GET responses. Fixed and confirmed: after the fix a console container
  was named `<directory-id> <account-name> / <PermissionSet>`. The account
  name comes from `result[].searchMetadata.AccountName` in the account-list
  response, keyed by `AccountId`.
- **Default organization label** is the directory ID, which is not
  readable. The editable label in the design matters more than expected,
  and the design should look for a better default (the portal's display
  name, if the API exposes one).

<!--docz:criteria:start-->
#### Success Criteria

- Clicking a role opens the console in a container named for that account and
  permission set; clicking it again reuses the container.
- Two accounts and two portals stay signed in at the same time.
- The required permissions and host patterns are written down.
- A fallback is identified for when the account name is not yet known.

<!--docz:criteria:end-->
<!--docz:phase:end-->

---

<!--docz:phase:start-->
### Phase 3: Okta admin console

Confirm admin-only routing gives concurrent admin sessions across tenants.

<!--docz:tasks:start-->
#### Tasks

- [ ] Without the extension, reproduce the sign-out when switching between two
      tenants' admin consoles. Record which cookie is shared (name, domain
      and path only, never the value).
- [ ] Record how the admin console signs in: the redirects between
      `<org>-admin` and `<org>` hosts, and whether any step is a POST.
- [x] Route top-level GET requests to `<org>-admin` hosts from a tab with no
      container into a container for that tenant. Leave tabs already in a
      container alone.
- [ ] Confirm the sign-in redirect to `<org>.okta.com` completes inside the
      container.
- [ ] Sign in to two tenants' admin consoles and confirm both stay signed in
      while switching tabs.
- [ ] Confirm `<org>.okta.com` in an ordinary tab is not moved.
- [ ] Check the pattern against every Okta base domain in use (for example
      `oktapreview.com`) and note any custom domains that need manual
      mapping.

<!--docz:tasks:end-->

#### Results so far

Observed headless on Firefox 159.0.1 in a fresh profile, using a hostname
for a tenant that does not exist:

- A GET to an `<org>-admin.okta.com` host in a tab with no container was
  cancelled and reopened in a container named for the tenant, and the empty
  tab it came from was closed.
- A GET to the matching `<org>.okta.com` host stayed in its tab with no
  container.

Still to do against real tenants: the sign-in flow inside the container,
two tenants signed in at once, and the cause of the sign-out without
containers.

#### Results against real tenants

- Admin consoles for two tenants, one on `okta.com` and one on
  `oktapreview.com`, were each moved into their own container on first
  visit.
- To confirm: that sign-in completed inside each container and both stayed
  signed in while switching tabs.

<!--docz:criteria:start-->
#### Success Criteria

- Two tenants' admin consoles stay signed in at the same time, each in its
  own container.
- The cause of the sign-out without containers is identified, or recorded as
  not found with what was checked.
- The admin sign-in flow is written down well enough to design the routing
  rule.

<!--docz:criteria:end-->
<!--docz:phase:end-->

---

<!--docz:phase:start-->
### Phase 4: Signing dry run and write-up

<!--docz:tasks:start-->
#### Tasks

- [ ] Sign the spike build on the unlisted channel with `web-ext sign`.
      Record whether `data_collection_permissions` is enforced and how long
      signing takes. Install the signed build in release Firefox.
- [ ] Update INV-0001: replace the unverified items with what was observed,
      correct any finding that turned out wrong, and set its status to
      Concluded.
- [ ] List the inputs the DESIGN doc needs: final permissions and host
      patterns, the account-name source, routing rules, and anything that
      behaved differently from INV-0001.
- [ ] Decide whether `spike/` is deleted or kept for reference, and do it.

<!--docz:tasks:end-->

<!--docz:criteria:start-->
#### Success Criteria

- INV-0001 is Concluded with no unverified items left.
- Nothing committed contains a real account, tenant, token or cookie value.
- There is enough recorded to start the DESIGN doc without re-running the
  spike.

<!--docz:criteria:end-->
<!--docz:phase:end-->

---

<!--docz:file-changes:start-->
## File Changes

| File | Action | Description |
| ---- | ------ | ----------- |
| `spike/manifest.json` | Create | Manifest V3 manifest for the throwaway extension |
| `spike/background.js` | Create | Container helper, AWS and Okta listeners |
| `.gitignore` | Create | Ignore local captures, `web-ext` artifacts |
| `mise.toml` | Modify | Add `web-ext` |
| `docs/investigation/0001-…md` | Modify | Record observed results and conclude |

<!--docz:file-changes:end-->

<!--docz:testing:start-->
## Testing Plan

The spike is tested by hand; each phase's tasks are the test steps.

- [ ] Every observation is made in a real Firefox, not inferred from code.
- [ ] Each success criterion is checked with at least two accounts or two
      tenants, since the goal is concurrent sessions.
- [ ] Before each commit, review the diff for real identifiers.

<!--docz:testing:end-->

<!--docz:dependencies:start-->
## Dependencies

- Access to at least one AWS access portal with two or more account and
  permission-set combinations; ideally a second portal in another
  organization.
- Admin access to two Okta tenants.
- A Mozilla add-ons developer account and API credentials, for Phase 4 only.
- Firefox 140 or later.

<!--docz:dependencies:end-->

<!--docz:references:start-->
## References

- [INV-0001: Firefox extension for automatic AWS SSO and Okta containers](../investigation/0001-firefox-extension-for-automatic-aws-sso-and-okta-containers.md)

<!--docz:references:end-->
