# Changelog

All notable changes to this project are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/).

## [unreleased]

### Features

- *(spike)* Add throwaway extension harness for IMPL-0001 phase 1
- *(spike)* Add AWS and Okta interception for IMPL-0001 phases 2 and 3
- *(spike)* Put the account name first in console container names
- *(extension)* Add manifest and background entry point
- *(extension)* Add the AWS region list for portal API hosts
- *(extension)* Generate optional host permissions from the region list
- *(core)* Add shared JSDoc types and target keys
- *(core)* Add container naming, colour rules and icons
- *(core)* Classify enrolled portal and Okta admin addresses
- *(core)* Decide which navigations move into a container
- *(core)* Validate the console sign-in exchange and build the sign-in URL
- *(core)* Read account names from the portal's account list
- *(core)* Plan enrolment and the addresses to request and revoke
- *(storage)* Add the stored data model, defaults and migrations
- *(storage)* Read and write state behind one cached promise
- *(registry)* Add the container registry
- *(background)* Forget a managed container when it is removed in Firefox
- *(enrol)* Add, relabel, move and remove organizations, and track access
- *(options)* Add the options page with the Organizations section
- *(background)* Offer enrolment from the toolbar button and follow grants
- *(aws)* Open each console in the container for its account and role
- *(background)* Register the request listeners and show the warning badge
- *(routing)* Move enrolled portals and Okta admin consoles into containers
- *(registry)* List unused containers before removing the confirmed ones
- *(storage)* Export and import settings
- *(options)* Add naming, colours, behaviour, managed containers and backup
- Add an icon for the toolbar button and the add-on manager
- *(options)* Grant access to every organization that needs it in one prompt

### Bug Fixes

- *(spike)* Learn account names from the portal's POST account list
- *(enrol)* Delete an organization before giving up its addresses
- *(registry)* Treat turquoise and cyan as the same container colour

### Documentation

- Add INV-0001 for the AWS SSO and Okta containers extension
- Add IMPL-0001 spike plan for container interception
- Link INV-0001 from the spike plan
- Record the private-window result in IMPL-0001
- Record the normal-window result in IMPL-0001
- Record the confirmed account-name fix in IMPL-0001
- Conclude INV-0001 and complete the IMPL-0001 spike
- Add DESIGN-0001 for the containers extension
- Add IMPL-0002 implementation plan for the extension
- Record the platform-check fallback and mark IMPL-0002 in progress
- *(test)* Describe the fixtures and the placeholder-only rule
- Close out the registry tasks in IMPL-0002
- Record the platform-check results in IMPL-0002 and DESIGN-0001
- Record the options page checks in IMPL-0002
- Add the manual checklist and rewrite the README for users
- Say exactly which routing checks were run and which are waiting

### Testing

- Add the first node:test suite, covering the manifest
- Add a headless load test for the extension
- Keep browser APIs out of the pure core
- Add an in-memory fake of the browser APIs the stateful code uses
- *(smoke)* Create and reuse a real container through the registry

### Miscellaneous Tasks

- Add repository tooling, CI and release workflows
- Add typescript, biome and jq to the toolchain
- Add strict JavaScript type checking and browser API declarations
- Add Biome lint and format configuration
- Add source checks that enforce the security properties
- Add just recipes for checking, running and packaging the extension
- Run the extension checks on every pull request
- Delete the spike now that the extension does everything it did

