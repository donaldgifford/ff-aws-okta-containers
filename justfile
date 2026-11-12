# Task runner for ff-aws-okta-containers. Run `just` to list recipes.

set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

# Default: list recipes
_default:
    @just --list --unsorted

# ─── Lint & format ─────────────────────────────────────────────────

# Run every linter
[group('lint')]
lint: lint-md lint-yaml lint-actions lint-shell

# Lint Markdown
[group('lint')]
lint-md:
    @markdownlint-cli2 "**/*.md" "#node_modules" "#CHANGELOG.md"

# Lint YAML
[group('lint')]
lint-yaml:
    @yamllint .

# Lint GitHub Actions workflows
[group('lint')]
lint-actions:
    @actionlint

# Lint shell scripts
[group('lint')]
lint-shell:
    @shellcheck scripts/*.sh

# Format Markdown, YAML and shell scripts
[group('lint')]
fmt:
    @prettier --write "**/*.md" "!CHANGELOG.md"
    @yamlfmt .
    @shfmt -w -i 2 scripts/*.sh

# ─── Docs ───────────────────────────────────────────────────────────

# Validate the docz documents
[group('docs')]
docs-validate:
    @docz validate

# Regenerate the docz index tables
[group('docs')]
docs-update:
    @docz update

# ─── Repo ───────────────────────────────────────────────────────────

# Regenerate CHANGELOG.md from git history
[group('repo')]
changelog:
    @git-cliff -o CHANGELOG.md

# Create the GitHub labels used by the labeler and release workflows
[group('repo')]
labels *args:
    @scripts/labels.sh {{ args }}

# Everything CI runs
[group('repo')]
check: lint docs-validate
