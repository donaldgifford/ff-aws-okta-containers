# Contributing to ff-aws-okta-containers

Thank you for your interest in contributing. This document covers how to report
issues, propose changes, and submit pull requests.

## Quick start

```bash
mise install                      # toolchain pinned in mise.toml
just lint                         # lint
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
just lint    # runs linters
```

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
- Run `just lint` before pushing.
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

## License

By contributing you agree that your contributions will be licensed under the
[Apache 2.0 License](LICENSE).
