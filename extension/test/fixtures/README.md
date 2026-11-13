# Test fixtures

Response bodies in the shapes the AWS access portal returns, as recorded in
[IMPL-0001](../../../docs/impl/0001-spike-validate-aws-and-okta-container-interception.md).

Every value is a placeholder. This repository is public: never paste a real
response here. Account IDs, account names, role names, directory IDs and
tokens must all be invented.

| File                                 | Shape                                                 |
| ------------------------------------ | ----------------------------------------------------- |
| `federation-valid.json`              | `GET /federation/console` response                    |
| `federation-extra-fields.json`       | The same, with fields the extension does not know     |
| `federation-missing-token.json`      | No `signInToken`                                      |
| `federation-missing-location.json`   | No `signInFederationLocation`                         |
| `federation-untrusted-location.json` | A sign-in address that is not on the AWS sign-in host |
| `account-list.json`                  | `POST /instance/appinstances` response                |
