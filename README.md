# ff-aws-okta-containers

A Firefox extension that keeps AWS and Okta admin sessions apart by opening
each one in its own automatically created
[container](https://support.mozilla.org/kb/containers).

> [!NOTE]
> This project is at the investigation stage. There is no installable
> extension yet.

## What it will do

- **AWS consoles:** choosing an account and permission set in an IAM Identity
  Center access portal opens the console in a container named for that
  account and permission set. The container is created on first use and
  reused afterwards.
- **AWS access portals:** each portal opens in its own container, so portals
  for different organizations can stay signed in side by side.
- **Okta admin consoles:** each tenant's admin console
  (`<org>-admin.okta.com`) opens in its own container, so several tenants can
  stay signed in at once.

Container names carry an organization label that can be edited.

## Why another one

Extensions like this sit in the middle of sign-in flows for production
accounts. This one aims to be small enough to audit, to ask for narrow
permissions, and to contain only code written for it.

## Documentation

Design work is tracked with [docz](https://github.com/donaldgifford/docz)
under [`docs/`](docs/):

- [INV-0001](docs/investigation/0001-firefox-extension-for-automatic-aws-sso-and-okta-containers.md):
  survey of existing extensions, the chosen approach and the decisions made.

## Development

```sh
mise install   # toolchain pinned in mise.toml
just           # list recipes
just lint      # markdown, YAML, workflow and shell linting
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache 2.0](LICENSE)
