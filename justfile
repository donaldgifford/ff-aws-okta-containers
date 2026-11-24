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
    @web-ext lint --source-dir extension --warnings-as-errors --self-hosted \
      --ignore-files "test/**" "types/**" "regions.json"

# Run the extension in a fresh temporary Firefox profile
[group('extension')]
ext-run:
    @web-ext run --source-dir extension

# Load the extension in headless Firefox and check that it starts (local only)
[group('extension')]
smoke:
    @node extension/test/smoke/run.mjs

# Copy what ships into <dir> at <version>, e.g. `just stage 0.1.0 /tmp/staged`
[group('extension')]
stage version dir:
    #!/usr/bin/env bash
    set -euo pipefail
    if [[ ! "{{ version }}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "version must look like 1.2.3" >&2
      exit 1
    fi
    mkdir -p "{{ dir }}"
    if [[ -n "$(ls -A "{{ dir }}")" ]]; then
      echo "{{ dir }} is not empty" >&2
      exit 1
    fi
    cp -R extension/. "{{ dir }}/"
    # Tests, type declarations and the region source list do not ship.
    rm -rf "{{ dir }}/test" "{{ dir }}/types" "{{ dir }}/regions.json"
    jq --arg version "{{ version }}" '.version = $version' \
      extension/manifest.json > "{{ dir }}/manifest.json"

# Build an unsigned dist/ff-aws-okta-containers-<version>.zip, e.g. `just package 0.1.0`
[group('extension')]
package version:
    #!/usr/bin/env bash
    set -euo pipefail
    work="$(mktemp -d)"
    trap 'rm -rf "$work"' EXIT
    "{{ just_executable() }}" stage "{{ version }}" "$work/staged"
    web-ext build --source-dir "$work/staged" --artifacts-dir dist --overwrite-dest \
      --filename "ff-aws-okta-containers-{{ version }}.zip"

# Have Mozilla sign <version> for self-distribution: dist/ff-aws-okta-containers-<version>.xpi
[group('extension')]
sign version:
    #!/usr/bin/env bash
    set -euo pipefail
    # The credentials come from the environment and are never written down.
    for name in WEB_EXT_API_KEY WEB_EXT_API_SECRET; do
      if [[ -z "${!name:-}" ]]; then
        echo "$name is not set. Export the AMO API credentials in this shell first." >&2
        exit 1
      fi
    done
    work="$(mktemp -d)"
    trap 'rm -rf "$work"' EXIT
    "{{ just_executable() }}" stage "{{ version }}" "$work/staged"
    # Every submission uses up its version number, so this is not a dry run.
    web-ext sign --channel unlisted --source-dir "$work/staged" \
      --artifacts-dir "$work/signed" --approval-timeout 1800000
    shopt -s nullglob
    signed=("$work"/signed/*.xpi)
    if [[ "${#signed[@]}" -ne 1 ]]; then
      echo "expected one signed .xpi from web-ext, found ${#signed[@]}" >&2
      exit 1
    fi
    echo "web-ext wrote: $(basename "${signed[0]}")"
    mkdir -p dist
    mv "${signed[0]}" "dist/ff-aws-okta-containers-{{ version }}.xpi"
    echo "signed: dist/ff-aws-okta-containers-{{ version }}.xpi"

# Write dist/updates.json for the signed dist/ff-aws-okta-containers-<version>.xpi
[group('extension')]
updates-json version:
    @node scripts/gen-updates.mjs "{{ version }}" \
      "dist/ff-aws-okta-containers-{{ version }}.xpi" dist/updates.json

# Exercise packaging and the update feed without signing anything
[group('extension')]
feed-check:
    #!/usr/bin/env bash
    set -euo pipefail
    work="$(mktemp -d)"
    trap 'rm -rf "$work"' EXIT
    "{{ just_executable() }}" stage 0.0.0 "$work/staged"
    web-ext build --source-dir "$work/staged" --artifacts-dir "$work" \
      --filename package.zip > /dev/null
    node scripts/gen-updates.mjs 0.0.0 "$work/package.zip" "$work/updates.json" \
      --allow-unsigned
    # The same file must be refused once the signature is required.
    if node scripts/gen-updates.mjs 0.0.0 "$work/package.zip" "$work/updates.json" \
      2> /dev/null; then
      echo "an unsigned package was accepted as signed" >&2
      exit 1
    fi
    echo "feed check passed"

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
