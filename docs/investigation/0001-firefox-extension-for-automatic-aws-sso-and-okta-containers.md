---
id: INV-0001
title: "Firefox extension for automatic AWS SSO and Okta containers"
status: Concluded
author: Donald Gifford
created: 2026-11-12
---

<!-- markdownlint-disable-file MD013 MD025 MD041 -->

# INV-0001: Firefox extension for automatic AWS SSO and Okta containers

<!--toc:start-->
<!-- markdownlint-capture -->
<!-- markdownlint-disable MD013 -->
- [Question](#question)
- [Hypothesis](#hypothesis)
- [Context](#context)
- [Approach](#approach)
- [Environment](#environment)
- [Findings](#findings)
  - [1. The container API is native; no dependency on Multi-Account Containers](#1-the-container-api-is-native-no-dependency-on-multi-account-containers)
  - [2. AWS: prior art and three interception techniques](#2-aws-prior-art-and-three-interception-techniques)
  - [3. Okta: no purpose-built prior art; routing is by hostname](#3-okta-no-purpose-built-prior-art-routing-is-by-hostname)
  - [4. Platform: Manifest V3 is viable in Firefox](#4-platform-manifest-v3-is-viable-in-firefox)
  - [5. Fork or write our own](#5-fork-or-write-our-own)
  - [Spike results](#spike-results)
- [Conclusion](#conclusion)
- [Recommendation](#recommendation)
  - [Proposed shape](#proposed-shape)
  - [Decisions](#decisions)
  - [Still open](#still-open)
  - [Next steps](#next-steps)
- [References](#references)
<!-- markdownlint-restore -->
<!--toc:end-->

<!--docz:question:start-->
## Question

Can we build and own a small Firefox extension that:

1. Opens each AWS console session started from an IAM Identity Center (AWS SSO)
   access portal in a container named for the account and permission set,
   creating the container on first use and reusing it afterwards.
2. Does the same for Okta: each tenant (end-user dashboard and admin console)
   opens in its own container, created on first visit and reused afterwards.

And if so: do we start from an existing extension, or write our own, and which
interception technique do we use for each provider?

<!--docz:question:end-->

<!--docz:hypothesis:start-->
## Hypothesis

Yes. Firefox exposes containers to extensions natively through the
`contextualIdentities` API, so no dependency on Mozilla's Multi-Account
Containers add-on is needed. The AWS half is a solved problem with several
open-source implementations to learn from. The Okta half is expected to be
simpler mechanically (route by hostname) but has no purpose-built prior art,
and the interaction with SSO redirects needs care.

The expected outcome is a new, small extension that reuses known techniques,
not a fork.

<!--docz:hypothesis:end-->

<!--docz:context:start-->
## Context

The goal is to keep many live sessions open side by side: several AWS accounts
and roles, across more than one AWS organization, and several Okta tenants
(for example production and test) with their admin consoles.

Existing extensions cover parts of this, but the extension would sit in the
middle of sign-in flows for production AWS accounts and Okta admin consoles.
That is a position of high trust, so the preference is to own the code, keep
it small enough to audit, and keep its permissions narrow. Copying from
existing projects is acceptable where licences allow.

Explicitly out of scope: automatically deciding which container a downstream
Okta-integrated app runs in. If a tenant's container exists, the user can open
an app there by hand (or by launching it from that tenant's dashboard, which
inherits the container).

**Triggered by:** initial project idea; no parent document.

<!--docz:context:end-->

<!--docz:approach:start-->
## Approach

1. Survey existing Firefox extensions for AWS and Okta container handling.
2. Clone the relevant repositories and read the source to see exactly how each
   one intercepts a sign-in and moves it into a container, what permissions it
   asks for, and how it has broken in the past (issue history).
3. Check the Firefox platform constraints: container API, Manifest V2 versus
   V3, blocking `webRequest`, signing and distribution.
4. Work out how the Okta flows interact with container routing.
5. Compare options and recommend a direction, listing the decisions that need
   discussion.

6. Test the items that reading could not settle in a throwaway spike
   (IMPL-0001). The outcome is under [Spike results](#spike-results).

<!--docz:approach:end-->

<!--docz:environment:start-->
## Environment

Source was read at the following commits (shallow clones, 2026-11-12).

| Component | Version / Value | Last commit | Licence (repo `LICENSE`) |
| ------- | ------- | ----------- | ------------------------ |
| pyro2927/AWS_SSO_Containers | 1.18 | 2026-08-02 | MPL-2.0 |
| iMilad/containoodle | 1.2.0 | 2026-09-08 | MIT |
| dangh/firefox-aws-apps-container | 1.7.0 | 2024-11-22 | none |
| mcmathews/aws-saml-containers | 1.1.0 | 2026-06-25 | MIT |
| fwdcloudsec/granted-containers | 1.1.2 | 2026-03-22 | MIT |
| kaushikgopal/ff-container-traffic-control | 26.11.1 | 2026-11-06 | Apache-2.0 |
| honsiorovskyi/open-url-in-container | n/a | 2020-07-18 | MPL-2.0 |

<!--docz:environment:end-->

<!--docz:findings:start-->
## Findings

### 1. The container API is native; no dependency on Multi-Account Containers

Every extension surveyed uses `browser.contextualIdentities` (`query`,
`create`, `update`, `remove`) plus `browser.tabs.create({ cookieStoreId })`.
None of them talks to Mozilla's Multi-Account Containers add-on. That add-on is
only a UI over the same browser feature, and containers we create show up in
it automatically.

The core "get or create" logic is about ten lines and is the same everywhere:

```js
const found = await browser.contextualIdentities.query({ name });
const container = found[0] ??
  await browser.contextualIdentities.create({ name, color, icon });
await browser.tabs.create({ url, cookieStoreId: container.cookieStoreId });
```

Constraints that follow from the API:

- Colours and icons come from fixed lists (8 colours plus `toolbar`, 13
  icons). With many accounts, colours repeat.
- Lookup by name is the common approach but is fragile: renaming a container
  in the UI makes the extension create a duplicate. Containoodle avoids this by
  storing its own key-to-`cookieStoreId` map and checking that first.
- Containers do not exist in private windows, so routing must be skipped
  there.

### 2. AWS: prior art and three interception techniques

| Extension | Technique | Manifest | Host permissions | Notes |
| --------- | --------- | -------- | ---------------- | ----- |
| AWS SSO Containers (pyro2927) | A: rewrite the federation response | MV2 | AWS portal and federation hosts only | About 400 lines in one file. Most used. Actively maintained. |
| AWS Apps Container (dangh) | B: click interception plus own federation call | MV2 | `<all_urls>` | Hard-codes naming rules for one specific company. No licence. |
| Containoodle | C: click interception plus cookie copy | MV3 | optional, granted per portal | Over 4,000 lines; sidebar, tab groups, optional local Python helper. |
| AWS SAML Containers (mcmathews) | Replays the SAML form POST in a container | MV2 | `signin.aws.amazon.com/saml` | Only for the legacy IAM SAML role picker, not Identity Center. |
| Granted Containers | `ext+granted-containers:` protocol handler | MV2 | none | Driven by the `granted` CLI, not by browsing. |

**How the access portal signs you in to the console.** When a role is
clicked (or a shortcut link of the form
`https://<portal>/start/#/console?account_id=…&role_name=…` is opened), the
portal page makes an XHR to
`https://portal.sso.<region>.amazonaws.com/federation/console?account_id=…&role_name=…`.
The JSON response contains `signInToken`, `signInFederationLocation` and
`destination`. The page then navigates to
`<signInFederationLocation>?Action=login&SigninToken=…&Destination=…`, which
sets the console session cookies.

The sign-in token URL is self-contained. This is what makes containers work:
nothing has to be copied between cookie stores, the URL is simply opened in
the target container.

**Technique A: rewrite the federation response (pyro2927).** A blocking
`webRequest.onBeforeRequest` listener on the federation URL attaches
`webRequest.filterResponseData`, reads the JSON, withholds it from the page,
builds the sign-in URL itself, opens it in the container, and closes the
original tab. Account ID and role name come from the request's query string.
Account names come from passively reading a second portal API response
(`/instance/appinstances`).

- Works for clicks, shortcut links and bookmarks alike, because all of them
  end in the same XHR.
- Never reads the portal's long-lived session cookie. It only sees the
  short-lived sign-in token that the page was about to use anyway.
- Does not depend on the portal's DOM.
- Depends on undocumented endpoints and response fields. See breakage history
  below.

**Technique B: click interception plus own federation call (dangh).** A
content script on the portal finds role links
(`a[data-testid="federation-link"]`), cancels the click, reads the
`x-amz-sso_authn` cookie from `document.cookie`, and calls the federation
endpoint itself with that value as a bearer token.

- Can skip federation when the container's console session is still valid
  (it checks the `aws-creds` cookie expiry) and just focus the console.
- Depends on DOM selectors, which changed in the 2023 portal redesign, and
  the extension handles the portal's session credential directly.

**Technique C: copy the portal session cookie (Containoodle).** Copies
`x-amz-sso_authn` into the target container with `cookies.set`, then opens the
documented shortcut URL there.

- Leans on the documented shortcut URL format.
- Puts a copy of the portal session, which can assume every role the user
  has, into every account container. This defeats part of the isolation that
  containers are meant to provide.

**Breakage history of technique A** (pyro2927 issues), as a measure of
maintenance cost:

- 2023-11 (#12, #15): the redesigned access portal broke account-name lookup.
  The container handoff kept working; containers were named with the literal
  placeholder. A related race in name loading was fixed later.
- #39: new portal hostnames (`*.portal.amazonaws.com`, `*.portal.app.aws`)
  needed adding. AWS documentation now also shows
  `https://<tenant>.account-access.<region>.app.aws/` and
  `https://ssoins-….portal.<region>.app.aws` start URLs.
- #7, #9: two portals with the same account and role names collided, fixed by
  adding the portal subdomain as a naming variable.
- #6: an early rule to only act on tabs in the default container was removed,
  because people open the portal itself inside a container.
- Open requests: map account-name patterns to colours (#41), avoid adjacent
  accounts sharing a colour (#16), default region (#13).

Roughly one breaking change every one to two years, each a small fix.

**AWS's own multi-session support** (opt-in, 2025) allows up to five
identities in one browser profile. It does not give named, persistent,
visually distinct containers and the limit is too low for this use, so it is
not a substitute. It also does not conflict: each container is its own cookie
store.

### 3. Okta: no purpose-built prior art; routing is by hostname

No extension was found that creates a container per Okta tenant. The
closest tools are general URL routers: Container Traffic Control,
Containerise, and Multi-Account Containers' "always open in". All of them
need the container and the rule to be created by hand first. Okta's official
browser plugin is not container-aware.

The mechanism those routers use is what we need, with auto-creation added: a
blocking `webRequest.onBeforeRequest` listener for `main_frame` requests,
which cancels the request and reopens the URL in a tab with the right
`cookieStoreId` when the tab is in the wrong container.

**Tenant identity.** Okta hostnames follow a pattern:

- `<org>.okta.com` for the end-user dashboard and sign-in.
- `<org>-admin.okta.com` for the admin console.
- The same pair under `oktapreview.com`, `okta-emea.com`, `okta-gov.com` and
  `okta.mil`.
- Custom domains (for example `login.example.com`) cannot be detected from the
  hostname and need a user-supplied mapping.

Stripping `-admin` gives a tenant key such as `acme.okta.com` or
`acme.oktapreview.com`.

**The hard part is SSO redirects, not routing.** Okta is an identity provider,
so other sites send the browser to Okta hostnames mid-flow:

- An app in the default container redirects to `acme.okta.com/app/…/sso/saml`
  or `/oauth2/v1/authorize` to sign in. If we move that navigation into the
  tenant container, the app's session ends up there too. If we do not, the
  user is asked to sign in to Okta again in the default container.
- Some SAML requests arrive as a form POST. A cancelled POST cannot simply be
  reopened as a URL; the body would be lost.
- If the AWS access portal uses Okta as its identity provider, the portal
  redirects to Okta whenever its session expires.

This leads to a simple rule set, which also matches the lesson from pyro2927
issue #6:

| Tab is in | Navigation to an Okta tenant host | Action |
| --------- | --------------------------------- | ------ |
| That tenant's container | any | Leave alone |
| Any other container (ours or the user's) | any | Leave alone. The user or a flow put it there on purpose. |
| Default (no container) | GET | Move to the tenant container, creating it if needed |
| Default (no container) | POST | Leave alone |

**Interaction with AWS.** With this rule set the two halves compose well. If
the access portal is launched from a tile on the Okta dashboard, it opens in
the Okta tenant's container (new tabs inherit their opener's container), and
each role clicked there is handed off to its own AWS container by the sign-in
token URL. AWS account containers never need an Okta session.

### 4. Platform: Manifest V3 is viable in Firefox

- Firefox keeps blocking `webRequest` in Manifest V3 and has not announced an
  end to Manifest V2. Container Traffic Control and Containoodle are both MV3.
- MV3 background scripts are non-persistent event pages. Container Traffic
  Control documents a real race: a request can arrive when the script wakes
  up, before configuration has loaded from storage. The listener has to await
  initialisation. pyro2927 hit a similar race with account names.
- Extensions must be signed by Mozilla to install permanently on release
  Firefox. The options are:
  - Unlisted (self-distributed) signing with `web-ext sign --channel=unlisted`.
    Produces a signed `.xpi` that is not listed on addons.mozilla.org. Updates
    can be served from our own `update_url`, for example a file published with
    GitHub releases.
  - Listing on addons.mozilla.org.
  - `about:debugging` temporary install for development; it is removed on
    restart.
- MV3 requires an explicit `browser_specific_settings.gecko.id`. Since
  2025-11-03 new submissions must also declare
  `gecko.data_collection_permissions` (ours would be `"required": ["none"]`),
  which needs `strict_min_version` of at least 140.

### 5. Fork or write our own

- **pyro2927/AWS_SSO_Containers** is the closest fit for AWS. The repository
  licence is MPL-2.0 (the addons.mozilla.org listing says MIT). MPL is
  file-level copyleft: copied files stay MPL. It is MV2, plain JavaScript in
  one file with shared mutable globals, and has no tests for the interception
  path. It also still carries legacy SAML handling that parses `Set-Cookie`
  headers by hand, which we do not need.
- **Containoodle** is well engineered but much larger than the problem, and
  uses the cookie-copy technique.
- **Container Traffic Control** is a general rule engine. Its routing listener
  is a good reference for the Okta half.

The techniques are small and well understood; the code is not worth
inheriting. A new implementation of both halves is estimated at 500 to 800
lines of TypeScript including the options page, with the pure logic (URL
parsing, naming, routing decisions) unit-testable without a browser.

### Spike results

The items that could only be settled hands-on were tested in the IMPL-0001
spike on Firefox 159.0.1, against a real access portal and real Okta
tenants.

1. **Federation response and account names: confirmed.** The portal page
   calls `portal.sso.<region>.amazonaws.com`. The federation response has
   exactly `signInToken`, `signInFederationLocation` and `destination`.
   Account names come from the account-list response, which is a POST, not
   a GET as first assumed. Only `<directory-id>.awsapps.com` portals were
   available; the newer `*.app.aws` portal hostnames remain untested.
2. **`filterResponseData` under Manifest V3: needs
   `webRequestFilterResponse`.** Without it the call throws.
3. **Okta admin session: works inside one container.** The admin console
   signed in and stayed signed in within its tenant's container, and two
   tenants stayed signed in at once. The exact redirects were not recorded.
4. **Containers in a fresh profile: enabled by the permission alone.**
5. **Whether unlisted signing enforces `data_collection_permissions`: not
   tested.** Deferred to the release work; the manifest declares the key
   either way.

Two things turned out differently from what this document assumed:

- The default organization label taken from the portal hostname is the
  Identity Center directory ID, which is not readable. Editable labels are
  a requirement.
- Account-first names read better. The default console container name is
  now `<account-name>(<org>) / <PermissionSet>`.

<!--docz:findings:end-->

<!--docz:conclusion:start-->
## Conclusion

**Answer:** Yes. Confirmed by the IMPL-0001 spike against a real access
portal and real Okta tenants.

Both halves are feasible with standard, stable WebExtension APIs and no
dependency on another add-on. AWS is a re-implementation of a proven
technique. Okta is new but mechanically simple; its risk is in the routing
rules around SSO redirects, which is a design question, not a feasibility
one.

<!--docz:conclusion:end-->

<!--docz:recommendation:start-->
## Recommendation

Write a new extension that we own and maintain. Do not fork, and do not copy
code from existing extensions.

### Proposed shape

- Firefox only, Manifest V3, TypeScript, no runtime dependencies, bundled with
  esbuild and packaged with `web-ext`.
- All code is written for this project. Existing extensions are references for
  technique only. pyro2927's main file opens with "Container code mostly taken
  from honsiorovskyi/open-url-in-container", a project last updated in 2020;
  that kind of inherited code is what we want to avoid owning.
- Host permissions limited to AWS portal and federation hosts and the Okta
  base domains. Custom Okta domains are added as optional host permissions
  when the user configures them. No `<all_urls>`.
- **AWS consoles:** technique A (rewrite the federation response). It keeps
  the extension away from the portal session cookie, does not depend on the
  DOM, and covers shortcut links. Account names are read passively from the
  portal's own API responses, with the account ID as the fallback and a
  user-editable alias map as an override.
- **AWS access portals:** each portal gets its own container (decision 3).
- **Okta:** hostname routing for admin consoles only. One admin container
  per tenant (decisions 1 and 2).
- **Container identity:** a stored map from a stable key to `cookieStoreId`,
  falling back to name lookup. Renaming a container in the Firefox UI then
  does not cause duplicates, and editing a label in our options renames the
  existing containers in place.
- **Colours:** rule-based (for example names matching `prod` are red), falling
  back to a stable hash of the key so a container keeps its colour.
- **Distribution:** releases signed by Mozilla (decision 5).

### Decisions

Agreed 2026-11-12.

1. **Okta: one admin container per tenant, and nothing else.** Only
   `<org>-admin` hosts trigger routing. The admin console is the reason this
   half exists: without containers, switching between tenants' admin consoles
   forces a new sign-in each time. The console's sign-in redirect to
   `<org>.okta.com` happens inside the container and is left alone, so the
   container holds the admin console and the sign-in it depends on.
2. **Okta: user dashboards are not routed.** Visits to `<org>.okta.com` in a
   tab with no container stay where they are, and so do apps launched from
   there. An earlier draft moved these into a tenant container; that was
   dropped because an AWS portal launched from a dashboard tile would then
   have stayed in the Okta container instead of its own (decision 3). To run
   an app against a specific tenant, open it in that tenant's admin container
   by hand.
3. **AWS: each access portal gets its own container.** Different portals are
   backed by different Okta tenants, and the Okta session used to sign in to
   a portal should stay with that portal and its AWS organization. A portal
   opened in a tab with no container moves into its portal container. Its
   sign-in redirect to Okta then happens inside that container and is left
   alone, so each portal container holds its own Okta session.
4. **Editable organization labels on both sides.** Each portal and each Okta
   tenant has a label, defaulting to the portal subdomain or the Okta org
   name, editable in the options page.

5. **Signed releases through Mozilla, listed in the add-ons directory once
   stable.** The source is already public, so a listing exposes nothing new,
   and a listed add-on gets automatic updates without us hosting an update
   feed. Until the first stable release, builds are loaded from
   `about:debugging` or signed on the unlisted channel, so nothing
   half-finished is published and there is no review wait. A listing does
   mean submitting source alongside the bundled build for review.

Resulting containers:

| Kind | Key | Default name |
| ---- | --- | ------------ |
| AWS access portal | `aws-portal:<portal-host>` | `<org> portal` |
| AWS console | `aws:<account-id>:<permission-set>` | `<account-name>(<org>) / <PermissionSet>` |
| Okta admin console | `okta-admin:<tenant-host>` | `<tenant> okta admin` |

Resulting routing rule, the same for portal hosts and Okta admin hosts:

| Tab is in | Action |
| --------- | ------ |
| No container, GET | Move to the host's container, creating it if needed |
| No container, POST | Leave alone |
| Any container | Leave alone |

Two accepted consequences of decisions 1 to 3:

- A portal launched from an Okta dashboard tile in an ordinary tab moves into
  its portal container. The session that Okta just handed to AWS stays behind
  in the ordinary tab's cookie store, so the first launch into a portal
  container asks for an Okta sign-in inside that container. After that the
  container keeps its own session.
- A portal launched from inside an Okta admin container (by browsing from the
  admin console to the dashboard and clicking the tile) stays in that admin
  container, because tabs already in a container are never moved.

### Still open

These do not block a design. The first version will take the stated default
unless decided otherwise.

1. **Reuse behaviour.** Default: always federate again in a new tab in the
   existing container. Alternative: detect a live console session and focus
   an existing tab.
2. **Cleanup.** Default: no automatic removal; a button in options removes
   managed containers that have no open tabs.
3. **Later scope.** A protocol handler so CLI tools (`granted`,
   `aws-sso-cli`) can open a console in the right container. Not in the
   first version.

### Next steps

1. Write a DESIGN doc for the real extension, using the inputs listed at the
   end of IMPL-0001.
2. Write the IMPL plan for it. Release work includes the signing dry run
   that the spike deferred.

<!--docz:recommendation:end-->

<!--docz:references:start-->
## References

Existing extensions:

- [pyro2927/AWS_SSO_Containers](https://github.com/pyro2927/AWS_SSO_Containers)
  ([listing](https://addons.mozilla.org/en-US/firefox/addon/aws-sso-containers/))
- [iMilad/containoodle](https://github.com/iMilad/containoodle)
- [dangh/firefox-aws-apps-container](https://github.com/dangh/firefox-aws-apps-container)
- [mcmathews/aws-saml-containers](https://github.com/mcmathews/aws-saml-containers)
- [fwdcloudsec/granted-containers](https://github.com/fwdcloudsec/granted-containers)
- [kaushikgopal/ff-container-traffic-control](https://github.com/kaushikgopal/ff-container-traffic-control)
- [honsiorovskyi/open-url-in-container](https://github.com/honsiorovskyi/open-url-in-container)

AWS:

- [Creating shortcut links to AWS Management Console destinations](https://docs.aws.amazon.com/singlesignon/latest/userguide/createshortcutlink.html)
- [User access to AWS accounts (account access portal URLs)](https://docs.aws.amazon.com/IAM/latest/UserGuide/aam-user-access-to-aws-accounts.html)
- [Configuring IAM Identity Center authentication with the AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html)
- [AWS console multi-session support](https://docs.aws.amazon.com/awsconsolehelpdocs/latest/gsg/multisession.html)

Okta:

- [Okta Sessions API](https://developer.okta.com/docs/api/resources/sessions)
- [What are the sid, jsessionid and srefresh cookies for?](https://devforum.okta.com/t/what-are-the-sid-jsessionid-and-srefresh-cookies-for/27115)

Firefox:

- [browser_specific_settings (MDN)](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)
- [web-ext command reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/)

<!--docz:references:end-->
