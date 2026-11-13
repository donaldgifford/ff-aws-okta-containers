# Task runner for ff-aws-okta-containers. Run `just` to list recipes.

set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

# Default: list recipes
_default:
    @just --list --unsorted

# ─── Lint & format ─────────────────────────────────────────────────

# Run every linter
[group('lint')]
lint: lint-md lint-yaml lint-actions lint-shell spike-lint

# Lint Markdown
[group('lint')]
lint-md:
    @markdownlint-cli2 "**/*.md" "#node_modules" "#.claude" "#CHANGELOG.md"

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
    @biome check --write .

# ─── Extension ──────────────────────────────────────────────────────

# Type-check the extension's JavaScript
[group('extension')]
typecheck:
    @tsc -p jsconfig.json

# Run the unit tests
[group('extension')]
test:
    @node --test "extension/test/**/*.test.js"

# Lint and check the formatting of JavaScript and JSON
[group('extension')]
js-lint:
    @biome check .

# Check the extension source for calls it must never make
[group('extension')]
source-check:
    @node scripts/check-source.mjs

# Check that manifest.json matches regions.json
[group('extension')]
manifest-check:
    @node scripts/gen-manifest.mjs --check

# Lint what ships in the extension, the way Mozilla does
[group('extension')]
ext-lint:
    @web-ext lint --source-dir extension --warnings-as-errors \
      --ignore-files "test/**" "types/**"

# Run the extension in a fresh temporary Firefox profile
[group('extension')]
ext-run:
    @web-ext run --source-dir extension

# Load the extension in headless Firefox and check that it starts (local only)
[group('extension')]
smoke:
    @node extension/test/smoke/run.mjs

# Build dist/ff-aws-okta-containers-<version>.zip, e.g. `just package 0.1.0`
[group('extension')]
package version:
    #!/usr/bin/env bash
    set -euo pipefail
    if [[ ! "{{ version }}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "version must look like 1.2.3" >&2
      exit 1
    fi
    work="$(mktemp -d)"
    trap 'rm -rf "$work"' EXIT
    cp -R extension/. "$work/"
    rm -rf "$work/test" "$work/types"
    jq --arg version "{{ version }}" '.version = $version' \
      extension/manifest.json > "$work/manifest.json"
    web-ext build --source-dir "$work" --artifacts-dir dist --overwrite-dest \
      --filename "ff-aws-okta-containers-{{ version }}.zip"

# ─── Spike ──────────────────────────────────────────────────────────

# Lint the spike extension
[group('spike')]
spike-lint:
    @web-ext lint --source-dir spike

# Run the spike extension in a fresh temporary Firefox profile
[group('spike')]
spike-run:
    @web-ext run --source-dir spike

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
check: lint docs-validate typecheck test js-lint source-check manifest-check ext-lint
