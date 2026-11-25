# ff-aws-okta-containers

A Firefox extension that keeps AWS and Okta admin sessions apart by opening
each one in its own automatically created
[container](https://support.mozilla.org/kb/containers).

- **AWS consoles.** Choosing an account and role in an IAM Identity Center
  access portal opens the console in a container for that account and role,
  named `account(label) / role`. The container is created on first use and
  reused afterwards, so consoles for several accounts stay signed in side by
  side.
- **AWS access portals.** Each portal opens in a container of its own, so
  portals for different organizations can stay signed in at once.
- **Okta admin consoles.** Each tenant's admin console
  (`<org>-admin.okta.com`) opens in a container of its own. The tenant's
  ordinary sign-in page (`<org>.okta.com`) is deliberately left alone.

> [!NOTE]
> Releases are signed by Mozilla for self-distribution and install like any
> other extension. It is not in the Mozilla add-ons directory; you get it
> from this repository's releases.

## Why another one

Extensions like this sit in the middle of sign-in for production accounts.
This one is meant to be small enough to read in an afternoon:

- It contains only code written for it. There are no runtime dependencies
  and no build step, so the files in `extension/src` are the files that run.
- It has no access to any site until you give it one, an organization at a
  time.
- It makes no network requests, never touches cookies, runs no code in web
  pages, and never logs or stores a sign-in token. CI fails if the source
  says otherwise. The only request made on its behalf is Firefox's own daily
  check for a newer version; see [Updates](#updates).

## Install

You need Firefox 140 or later on a desktop.

1. Download `ff-aws-okta-containers-<version>.xpi` from the
   [latest release](https://github.com/donaldgifford/ff-aws-okta-containers/releases/latest).
2. If Firefox offers to install it, go to step 3. If it only saves the
   file, open `about:addons`, choose the gear menu, then
   **Install Add-on From File…**, and pick the file.
3. Confirm the prompt. It lists no site access, because none is granted at
   install.
4. Pin the toolbar button if you want it in view.

Containers do not need to be switched on first; installing the extension
turns them on.

### Updates

Updates install themselves. About once a day Firefox reads a small file,
`updates.json`, from this repository's latest release, and installs a newer
version if one is listed and its checksum matches. Your organizations, the
access you granted, your settings and the containers are kept.

To check at once, use the gear menu in `about:addons` and choose
**Check for Updates**. To stop automatic updates for this extension, open it
in `about:addons` and set **Allow automatic updates** to **Off**.

To check a download yourself, compare `shasum -a 256` of the file with the
`update_hash` in the release's `updates.json`.

## Enrol a portal or a tenant

The extension does nothing for a site until you enrol it.

**From the site.** Open your AWS access portal, or an Okta admin console,
and click the extension's toolbar button. The options page opens with the
address filled in.

**By typing.** Open the options page (toolbar button, or the add-on manager)
and type the address into **Add a portal or an Okta tenant**, for example
`d-1234567890.awsapps.com` or `acme-admin.okta.com`.

Then:

1. Give it a **label**. This is the organization name used in container
   names, such as `payments-prod(acme) / AdminAccess`.
2. For a portal, choose the **AWS region** your IAM Identity Center is in.
   It is shown in the AWS console under IAM Identity Center, Settings.
3. Click **Add**. Firefox asks you to allow exactly the addresses listed on
   the form. Allow them.

If you started from the site, its tab reopens in the new container. Sign in
there once; after that the session lives in the container.

If a role click opens a console in the portal's container instead of its
own and the toolbar button shows a `!`, the portal's region is probably
wrong. Change it on the options page.

## What access it holds, and why

Nothing at install. Each enrolment grants only these:

| You enrol | Firefox grants | Used for |
| --------- | -------------- | -------- |
| An AWS access portal | The portal's own address, such as `d-1234567890.awsapps.com` | Moving the portal into its container, and seeing the requests the portal page makes |
| An AWS access portal | `portal.sso.<region>.amazonaws.com` for its region | Reading the portal's sign-in response, to open the console in the right container, and its account list, for account names |
| An Okta tenant | `<org>-admin.<okta domain>` | Moving the admin console into its container |

Its other permissions:

| Permission | Why |
| ---------- | --- |
| `contextualIdentities` | Create and rename containers. |
| `cookies` | Firefox requires it to open a tab in a container. The cookies API itself is never called. |
| `tabs`, `activeTab` | See which container a tab is in, open and close tabs, and read the current tab's address when you click the toolbar button. |
| `storage` | Keep your settings, labels, account names and the map of containers, in this Firefox profile only. |
| `webRequest`, `webRequestBlocking`, `webRequestFilterResponse` | Reopen a navigation in a container, and hold the portal's sign-in response while the console is opened. |

Firefox's updater, not the extension, asks GitHub once a day whether a newer
version exists. That request goes to `github.com` and carries nothing about
your organizations or settings.

If anything goes wrong while a console is being opened, the extension steps
aside: the portal signs you in as it would without the extension, and the
toolbar button shows a warning.

The design, with its reasoning, is in
[DESIGN-0001](docs/design/0001-automatic-aws-and-okta-admin-containers-extension.md).

## Options

- **Organizations**: labels, regions, access, add and remove.
- **Naming**: the three name templates.
- **Colours**: rules that colour containers by name. By default `prod` is
  red, `stag` or `stage` yellow, and `dev`, `test` or `sandbox` green.
- **Behaviour**: a switch for each of the three kinds.
- **Managed containers**: what the extension created, and cleanup of those
  with no open tabs. It never renames or removes a container it did not
  create, and stops renaming one you rename yourself.
- **Backup**: export and import of settings. An export holds no container
  IDs, account names or access.

## Remove it

1. On the options page, remove each organization. That gives up its site
   access.
2. Remove the extension in the add-on manager, `about:addons`.

The containers it created stay, with their sessions. Delete them in
Firefox's settings under **Tabs**, **Manage Containers** if you no longer
want them.

## Development

```sh
mise install    # toolchain pinned in mise.toml; there is no package.json
just            # list recipes
just check      # lint, type-check, unit tests, source checks
just smoke      # load the extension in headless Firefox
just ext-run    # run it in a throwaway Firefox profile
just package 0.1.0   # build an unsigned dist/ff-aws-okta-containers-0.1.0.zip
just feed-check      # exercise packaging and the update feed, unsigned
```

To run a checkout instead of a release, open
`about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on…**
and pick `extension/manifest.json`. Firefox unloads a temporary add-on when
it quits, so load it again after a restart; your settings and containers are
kept.

Releases are signed and published by the release workflow, not by hand. See
"Releasing" in [CONTRIBUTING.md](CONTRIBUTING.md).

The manual checklist is in [extension/TESTING.md](extension/TESTING.md). See
[CONTRIBUTING.md](CONTRIBUTING.md) for how to propose a change.

## Documentation

Design work is tracked with [docz](https://github.com/donaldgifford/docz)
under [`docs/`](docs/):

- [INV-0001](docs/investigation/0001-firefox-extension-for-automatic-aws-sso-and-okta-containers.md):
  survey of existing extensions and the approach chosen.
- [IMPL-0001](docs/impl/0001-spike-validate-aws-and-okta-container-interception.md):
  the spike that proved the approach.
- [DESIGN-0001](docs/design/0001-automatic-aws-and-okta-admin-containers-extension.md):
  the design.
- [IMPL-0002](docs/impl/0002-build-the-aws-and-okta-admin-containers-extension.md):
  the build, phase by phase.

## License

[Apache 2.0](LICENSE)
