# Security policy

Maumbile stores people's emails and the coordinates of their land, so we take vulnerabilities
seriously and appreciate responsible reports.

## Supported versions

Security fixes are made on the latest release (see the [changelog](CHANGELOG.md)) and on `main`.
Operators should run the latest tagged release; older releases are not patched.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

1. Preferred: use GitHub's private reporting. On the repository, open **Security → Report a
   vulnerability**
   (<https://github.com/PhilippRamjoue/maumbile_permaculture_planner/security/advisories/new>).
2. If that is unavailable, contact the maintainer through the contact published on their
   [GitHub profile](https://github.com/PhilippRamjoue) and ask for a private channel, without
   including technical details in the first message.

Please include what you found, how to reproduce it, the affected version or commit, and the impact
you see. You can expect an acknowledgement within **5 working days** and a first assessment within
**14 days**. We will keep you informed, fix confirmed issues as quickly as is practical, and credit
you in the release notes unless you prefer to stay anonymous.

## Scope

In scope: the code in this repository, the published container images, and the default Compose
configuration. Particularly interesting: authentication and session handling, access control between
users and plans (including share links), injection, SSRF through the imagery/terrain proxies, and
anything that could expose users' coordinates.

Out of scope: vulnerabilities in third-party services (Esri, EOX, AWS, Coolify, Docker, your own
reverse proxy), findings that need a malicious local administrator, and missing best-practice headers
without a demonstrated impact.

## Testing the hosted instance

Please test against your own local or self-hosted copy where you can. On the hosted instance, use
only accounts you created, do not access other people's data, and do not run denial-of-service,
brute-force or high-volume scans (the login throttle will block you anyway). Good-faith research
within these limits will not be pursued.

## For operators

Secrets belong in your environment, never in git; see [`docs/DEPLOY.md`](docs/DEPLOY.md). Rotate
`APP_SECRET_KEY` and `POSTGRES_PASSWORD` as described there if you suspect a leak, keep the
database off the public network (the Compose file publishes no host ports), serve only over HTTPS,
and take regular backups ([`docs/OPERATIONS.md`](docs/OPERATIONS.md)).
