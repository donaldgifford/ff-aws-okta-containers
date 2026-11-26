---
id: INV-0002
title: "Unlisted signing and self-hosted updates for the extension"
status: Concluded
author: Donald Gifford
created: 2026-11-24
---

<!-- markdownlint-disable-file MD025 MD041 -->

# INV-0002: Unlisted signing and self-hosted updates for the extension

<!--toc:start-->
<!-- markdownlint-capture -->
<!-- markdownlint-disable MD013 -->
- [Question](#question)
- [Hypothesis](#hypothesis)
- [Context](#context)
- [Approach](#approach)
- [Environment](#environment)
- [Findings](#findings)
  - [Signing is required, listing is not](#signing-is-required-listing-is-not)
  - [What web-ext sign needs](#what-web-ext-sign-needs)
  - [The manifest already qualifies](#the-manifest-already-qualifies)
  - [Updates need a feed we host](#updates-need-a-feed-we-host)
  - [A GitHub release asset can be the feed](#a-github-release-asset-can-be-the-feed)
  - [Installing the signed file](#installing-the-signed-file)
  - [What can go wrong in the release workflow](#what-can-go-wrong-in-the-release-workflow)
  - [Not yet verified](#not-yet-verified)
- [Conclusion](#conclusion)
- [Recommendation](#recommendation)
  - [Do first: sign 0.1.0 by hand](#do-first-sign-010-by-hand)
  - [Then: an implementation plan covering](#then-an-implementation-plan-covering)
  - [Decisions](#decisions)
- [References](#references)
<!-- markdownlint-restore -->
<!--toc:end-->

<!--docz:question:start-->

## Question

Can the release workflow produce a build of the extension that release Firefox
installs permanently and keeps up to date, without listing it on
addons.mozilla.org, and what does that take?

Three parts:

1. What does signing on the unlisted channel require from us: an account,
   credentials, manifest changes, packaging changes?
2. Can a signed build update itself from a feed we host, and can that feed be a
   GitHub release asset?
3. What can go wrong in the release workflow, and what does it cost when it
   does?

<!--docz:question:end-->

<!--docz:hypothesis:start-->

## Hypothesis

Yes. `web-ext sign --channel unlisted` returns a signed `.xpi` within minutes,
the manifest already meets Mozilla's requirements, and an `updates.json`
attached to each GitHub release can serve as the update feed. The work is a
signing step in the release job, one manifest key and two repository secrets.

<!--docz:hypothesis:end-->

<!--docz:context:start-->

## Context

Release Firefox only keeps an unsigned extension until it restarts, so the
extension has to be loaded again through `about:debugging` every time. IMPL-0002
deferred everything involving Mozilla so the extension could be built and used
first. It now works well enough that reloading it is the main annoyance.

A public listing is still not wanted. The extension is for the author's own use,
and the repository is where anyone else would find it.

**Triggered by:** the "Deferred" section of
[IMPL-0002](../impl/0002-build-the-aws-and-okta-admin-containers-extension.md).

<!--docz:context:end-->

<!--docz:approach:start-->

## Approach

1. Read Mozilla's documentation for signing, self-distribution, updates, source
   code submission and data collection consent.
2. Read the Firefox update checker source to see how it treats redirects and
   insecure links, because GitHub serves release assets through a redirect.
3. Check how GitHub serves `releases/latest/download/<file>`.
4. Compare the manifest, the `package` recipe and the release workflow against
   what was found.

No build has been signed yet. That needs credentials only the author can create,
so the findings below come from documentation and source code, and the points
that still need a real run are listed under
[Not yet verified](#not-yet-verified).

<!--docz:approach:end-->

<!--docz:environment:start-->

## Environment

| Component    | Version / Value                                     |
| ------------ | --------------------------------------------------- |
| Firefox      | 160 (release channel)                               |
| web-ext      | 10.8.0, pinned in `mise.toml`                       |
| Extension    | 0.1.0, manifest version 3, `strict_min_version` 140 |
| Add-on ID    | `ff-aws-okta-containers@donaldgifford`              |
| Sources read | 2026-11-24                                          |

<!--docz:environment:end-->

<!--docz:findings:start-->

## Findings

### Signing is required, listing is not

Release and Beta Firefox install only extensions Mozilla has signed. Developer
Edition, Nightly and ESR can turn the check off with
`xpinstall.signatures.required`; release Firefox cannot.

Signing has two channels. `listed` publishes the extension on
addons.mozilla.org. `unlisted` signs it for self-distribution: it "cannot be
publicly viewed or installed from AMO". Both go through automated validation
before signing. Mozilla can also review any add-on by hand at any time
afterwards, unlisted ones included, and its add-on policies apply either way.

### What `web-ext sign` needs

```sh
web-ext sign --channel unlisted --source-dir <staged directory>
```

| Input                  | Value                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `--channel`            | Required since web-ext 8. `unlisted` here.                                              |
| `WEB_EXT_API_KEY`      | The JWT issuer from the AMO credentials page.                                           |
| `WEB_EXT_API_SECRET`   | The JWT secret from the same page.                                                      |
| `--approval-timeout`   | How long to wait for signing, in milliseconds. `0` uploads and returns without waiting. |
| `--amo-metadata`       | Only for a listed extension's first version. Not needed here.                           |
| `--upload-source-code` | Only when the shipped code is not the source. See below.                                |

Credentials come from <https://addons.mozilla.org/developers/addon/api/key/> and
need a Mozilla account. web-ext 8 and later handles both the first unlisted
submission and later updates, so no separate first-time step is needed.

The command signs a directory, not a zip. The `package` recipe already stages a
directory before zipping it, so signing can reuse that step.

### The manifest already qualifies

- **Add-on ID.** Updates need an ID in the manifest. It has one.
- **Data collection consent.** New extensions have had to declare
  `data_collection_permissions` since 2025-11-03. The manifest declares `none`,
  and `strict_min_version` 140 is the first desktop version that understands the
  key.
- **Readable source.** Source code must be uploaded when the shipped code comes
  out of a minifier, a bundler, a template engine or "any other custom tool that
  takes files, applies pre-processing, and generates file(s)". There is no
  bundler here. `scripts/gen-manifest.mjs` does write the region list into
  `manifest.json` and `src/core/regions.js`, but both outputs are plain,
  readable and committed. This is expected to pass without a source upload. If a
  reviewer asks, the repository is public.

### Updates need a feed we host

An unlisted build does not update itself. Firefox looks for
`browser_specific_settings.gecko.update_url` in the manifest and fetches an
update manifest from it once a day:

```json
{
  "addons": {
    "ff-aws-okta-containers@donaldgifford": {
      "updates": [
        {
          "version": "0.2.0",
          "update_link": "https://github.com/donaldgifford/ff-aws-okta-containers/releases/download/v0.2.0/ff-aws-okta-containers-0.2.0.xpi",
          "update_hash": "sha256:<hex digest of the xpi>"
        }
      ]
    }
  }
}
```

- The feed must be served over HTTPS.
- `update_link` must be HTTPS or carry an `update_hash`. Supplying the hash
  anyway costs nothing and pins the file.
- An installed copy keeps using the `update_url` it was installed with. The URL
  chosen for the first signed build is permanent for anyone who installs that
  build, so it has to be right the first time.

### A GitHub release asset can be the feed

`https://github.com/<owner>/<repo>/releases/latest/download/updates.json`
answers with a 302 to the same file under the newest release's tag, and that
answers with a second redirect to GitHub's asset storage. Checked against this
repository: the first hop already points at `v0.1.0`.

The Firefox update checker does not reject redirected responses. It checks that
the request succeeded and that the certificate is valid, and nothing more about
the final URL. Other self-distributed extensions use this same URL shape.

Two consequences of using "latest":

- Every release must carry an `updates.json`, or the URL returns 404 until the
  next one does. A 404 is harmless: Firefox logs a failed check and tries again
  the next day.
- A pull request labelled `dont-release` creates no release, so it does not
  disturb the feed.

GitHub Pages would also work and gives a URL that does not depend on release
assets, but it means a second thing to publish and keep in step. It is not
enabled on this repository.

### Installing the signed file

GitHub serves release assets as `application/octet-stream`, not
`application/x-xpinstall`, so clicking the asset downloads it instead of
starting an install. Install it from `about:addons`, gear menu, "Install Add-on
From File". This only matters for the first install; updates after that are
fetched by Firefox itself.

### What can go wrong in the release workflow

| Risk                                                                                                                        | Effect                                               | Mitigation                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signing takes longer than the timeout. Mozilla says validation "can take up to 24 hours", longer if a manual review starts. | The job fails after the tag exists.                  | Sign before creating the release, so a release never exists without its files. Re-run the job later.                                                          |
| A version number can only be submitted once.                                                                                | Re-running after a successful upload may be refused. | To be confirmed with a real run. The fallback is downloading the signed file from the AMO developer page and attaching it by hand.                            |
| Credentials leak.                                                                                                           | Someone can submit versions under this add-on ID.    | Repository secrets are not exposed to pull requests from forks. The release job runs only on pushes to `main`. A GitHub environment can add an approval step. |
| Mozilla rejects or blocks a version after signing.                                                                          | That version stops working for whoever installed it. | Nothing to do in advance. The extension holds no `host_permissions` and declares no data collection, which is what reviewers look for.                        |

### Not yet verified

These needed a real signing run. Version 0.1.0 was signed by hand on
2026-11-24 with web-ext 10.8.0; the details are in IMPL-0003, phase 1.

| Point | Result |
| ----- | ------ |
| How long unlisted signing takes | Under five minutes by hand; 2 minutes 25 seconds and 3 minutes 23 seconds in the first two workflow runs. |
| Whether `web-ext sign` fails on our lint output | No. It validated and signed with no message. |
| Re-running for a version already uploaded | Refused: `Conflict`, "Version 0.1.0 already exists." `web-ext` cannot fetch the file signed earlier. |
| Firefox follows GitHub's redirects for the feed | Yes. An installed 0.2.0 updated itself to 0.2.1 from the release feed on 2026-11-25. |
| A signed install keeps a temporary copy's settings and containers | Not observed. A signed install over a signed install, and an update, both kept them. |

<!--docz:findings:end-->

<!--docz:conclusion:start-->

## Conclusion

**Answer:** Yes. Mozilla signs the extension on the unlisted channel in a
few minutes, the manifest needed only an `update_url`, and an `updates.json`
attached to each GitHub release works as the update feed: an installed copy
updated itself from 0.2.0 to 0.2.1 with no manual step.

The hypothesis held. Its "within minutes" turned out true in three signings,
though Mozilla does not promise it.

One point was never observed: whether a signed install keeps the settings of
a temporarily loaded copy it replaces. It does not affect the answer.

<!--docz:conclusion:end-->

<!--docz:recommendation:start-->

## Recommendation

### Do first: sign 0.1.0 by hand

Version 0.1.0 has been released on GitHub but never submitted to Mozilla, so it
can serve as the trial run and give a permanently installable build straight
away.

1. Create a Mozilla account if needed, accept the developer agreement, and
   generate API credentials.
2. Run `web-ext sign --channel unlisted` locally against a staged 0.1.0 build,
   with the credentials in the environment and nowhere in the repository.
3. Install the result and record the unverified points above.

This build has no `update_url`, so it will not update itself. The first build
from the workflow replaces it by hand, once.

### Then: an implementation plan covering

| Decision           | Recommendation                                                                      | Alternative                                       |
| ------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------- |
| Where signing runs | In the release job, before the release is created                                   | By hand on the author's machine for every release |
| Update feed        | `updates.json` attached to each release, read through `releases/latest/download/`   | GitHub Pages; or no feed and manual updates       |
| Credentials        | Two repository secrets, scoped to a GitHub environment used only by the release job | Plain repository secrets                          |
| Release contents   | The signed `.xpi` and `updates.json`                                                | Also the unsigned zip                             |
| Source upload      | None                                                                                | Attach a source archive on every submission       |

Work the plan would contain:

- Add `update_url` to the manifest and a test that pins it.
- Split the `package` recipe so the staged directory can be signed, and add
  `sign` and `updates-json` recipes.
- Extend the release job: stage, sign, write `updates.json` with the `sha256` of
  the signed file, create the release with both attached.
- Rewrite the README's install section for the signed file, and keep
  `about:debugging` as the development path.
- Close the "Deferred" rows in IMPL-0002 that this covers.

### Decisions

Answered by the author on 2026-11-24:

1. **Sign 0.1.0 by hand first.** Yes. It is the trial run for the points
   under [Not yet verified](#not-yet-verified).
2. **Environment approval on the release job.** Yes. The signing
   credentials live in a GitHub environment that asks for approval.
3. **The unsigned zip.** Dropped. Releases carry the signed `.xpi` and
   `updates.json` only.

<!--docz:recommendation:end-->

<!--docz:references:start-->

## References

- [IMPL-0002: Build the AWS and Okta admin containers extension](../impl/0002-build-the-aws-and-okta-admin-containers-extension.md)
- [DESIGN-0001: Automatic AWS and Okta admin containers extension](../design/0001-automatic-aws-and-okta-admin-containers-extension.md)
- [Signing and distribution overview (Extension Workshop)](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)
- [Self-distribution (Extension Workshop)](https://extensionworkshop.com/documentation/publish/self-distribution/)
- [Updating your extension (Extension Workshop)](https://extensionworkshop.com/documentation/manage/updating-your-extension/)
- [web-ext command reference (Extension Workshop)](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/)
- [Source code submission (Extension Workshop)](https://extensionworkshop.com/documentation/publish/source-code-submission/)
- [Firefox built-in consent for data collection (Extension Workshop)](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
- [AMO API authentication](https://mozilla.github.io/addons-server/topics/api/auth.html)
- [AddonUpdateChecker.sys.mjs (Firefox source)](https://github.com/mozilla-firefox/firefox/blob/main/toolkit/mozapps/extensions/internal/AddonUpdateChecker.sys.mjs)

<!--docz:references:end-->
