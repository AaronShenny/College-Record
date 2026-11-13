# Security

Do not post passwords, OAuth refresh/access tokens, signing credentials, student
records or unredacted diagnostic logs in public issues or pull requests.

Use the repository's private vulnerability reporting feature if the owner has
enabled it. Otherwise contact the repository owner privately and agree on a
secure reporting channel before sharing sensitive evidence. Maintainers must
enable private reporting and publish a monitored contact before public launch.

## Releases

Update packages require a valid Tauri signature and a valid Windows Authenticode
signature from the configured approved publisher. Do not disable either check.
HTTPS, version consistency, timestamping and draft-release review are required.
Keep the Tauri private key backed up in owner-controlled secure storage; losing
it can break the update path for installed clients. Never generate or store a
production private key in this repository.

Restrict signing/release secrets to a protected GitHub environment and trusted
release workflows. Do not expose them to fork pull requests. Use GitHub-hosted
runners and require SignPath signing approval. Review workflow changes like code.

Before making an existing repository public, inspect its entire Git history for
credentials and private material. Archive exclusions and `.gitignore` do not
remove historical content. If uncertain, publish a reviewed source snapshot to
a new repository instead; preserve the original repository privately.
