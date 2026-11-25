# Contributing to ff-aws-okta-containers

Thank you for your interest in contributing. This document covers how to report
issues, propose changes, and submit pull requests.

## Quick start

```bash
mise install                      # toolchain pinned in mise.toml
just check                        # lint, type-check, unit tests, source checks
just smoke                        # load the extension in headless Firefox
```

`just --list` enumerates every recipe.

## Reporting Issues

Use [GitHub Issues](https://github.com/donaldgifford/ff-aws-okta-containers/issues) for:

- **Bug reports** — include the extension and Firefox versions, what you
  clicked, and what happened. Never include real account IDs, tenant names,
  tokens or cookies.
- **Feature requests** — describe the problem you are trying to solve, not just
  the solution you have in mind
- For larger proposals, open an RFC document via `docz create rfc` and
  link it from the issue.

## Development Setup

### Prerequisites

- [mise](https://mise.jdx.dev) — installs the pinned toolchain (including
  `just`) from `mise.toml`

```bash
git clone https://github.com/donaldgifford/ff-aws-okta-containers.git
cd ff-aws-okta-containers
mise install
just check   # lint, type-check, unit tests, source checks
```

There is no `package.json`. The extension is plain JavaScript with JSDoc
types, and the tools that check it are pinned in `mise.toml`.

## Making Changes

### 1. Create a branch

Branch names follow the pattern `<type>/<short-description>`:

```bash
git checkout -b feat/okta-admin-routing
git checkout -b fix/container-reuse
git checkout -b docs/contributing-guide
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`

### 2. Make your changes

- Keep changes focused. One logical change per PR.
- Add or update tests for any code you change.
- Run `just check` before pushing, and `just smoke` if you touched the
  background script.
- If you changed how requests are handled, run the relevant part of
  [extension/TESTING.md](extension/TESTING.md).
- This repository is public. Do not commit real account IDs, account names,
  portal hostnames, Okta tenant names, tokens or cookies. Use placeholders
  such as `acme` and `111122223333`.

### 3. Commit

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat(okta): route admin consoles into tenant containers
fix(aws): reuse the container when the account name changes
docs: update README with install steps
test(naming): add label template edge cases
```

Format:

```text
<type>(<scope>): <imperative subject>

<optional body explaining why, not what>
```

### 4. Open a pull request

Push your branch and open a PR against `main`. The PR description should:

- Explain what changed and why
- Link to the related issue (if any) with `Fixes #123` or `Refs #123`
- Include a test plan or describe how you verified the change
- Carry exactly one of the labels `major`, `minor`, `patch` or `dont-release`;
  it decides the release cut when the PR merges

## Releasing

Merging a pull request to `main` is what releases. The label decides how.

| Label | What happens |
| ----- | ------------ |
| `major`, `minor`, `patch` | A new version is tagged, submitted to Mozilla for signing, and released |
| `dont-release` | Nothing is tagged, signed or released |

A release label is a submission to Mozilla, and a version number can be
submitted only once. Use `dont-release` for anything that does not need to
reach installed copies: documentation, tests, CI.

### What the release workflow does

1. **Bump Version** tags `vX.Y.Z` from the label.
2. **Sign Extension** waits for a maintainer to approve the `amo-signing`
   deployment on the workflow run's page. It then stages the tagged source,
   has Mozilla sign it on the unlisted channel, and writes `updates.json`.
3. **GitHub Release** creates the release with two files attached:
   `ff-aws-okta-containers-X.Y.Z.xpi` and `updates.json`.

Installed copies read
`releases/latest/download/updates.json` about once a day, so a release
reaches them without anyone doing anything.

The signing credentials are secrets of the `amo-signing` environment, not
of the repository. Only the signing job can read them, only on `main`, and
only after approval. Never put them in a file in the checkout.

### When signing fails

If **Sign Extension** fails, the tag exists but no release does. Installed
copies are unaffected: the feed still points at the previous release.

First find out whether Mozilla received the upload. The job log says
"Waiting for validation..." once it has, and the version then appears
under the add-on in the
[AMO developer hub](https://addons.mozilla.org/developers/addons).

- **Mozilla never received it** (credentials, network, a failure before
  the upload): fix the cause and re-run the failed job.
- **Mozilla has the version** (the job timed out waiting, or failed
  afterwards): re-running is refused with "Version X.Y.Z already exists".
  Finish the release by hand once Mozilla has signed it:

  ```sh
  git checkout vX.Y.Z
  # Download the signed file from the AMO developer hub, then:
  mkdir -p dist
  mv ~/Downloads/<downloaded>.xpi dist/ff-aws-okta-containers-X.Y.Z.xpi
  just updates-json X.Y.Z
  gh release create vX.Y.Z --title vX.Y.Z --generate-notes --verify-tag \
    dist/ff-aws-okta-containers-X.Y.Z.xpi dist/updates.json
  ```

  `just updates-json` refuses a file that is unsigned, for another add-on,
  or at a different version, so a wrong download cannot be published this
  way.

- **Mozilla rejected the version**: fix what it reported and merge the fix
  with a `patch` label. The rejected number is skipped.

## License

By contributing you agree that your contributions will be licensed under the
[Apache 2.0 License](LICENSE).
