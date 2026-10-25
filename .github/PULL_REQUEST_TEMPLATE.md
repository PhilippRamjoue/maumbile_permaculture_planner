## What and why

<!-- What does this change, and what problem does it solve? Link the issue if there is one. -->

## How it was checked

<!-- Tests added or run, and anything you verified by hand (screenshots help for UI changes). -->

## Checklist

- [ ] Lint, type-check and tests pass locally (see [CONTRIBUTING.md](../CONTRIBUTING.md))
- [ ] New logic has tests
- [ ] Docs updated if behavior, configuration or deployment changed (`CHANGELOG.md` under *Unreleased* for user-visible changes)
- [ ] Schema changes use a **new** Alembic migration (never edit a deployed one)
- [ ] No secrets, tokens, `.env` files or private server details are included
- [ ] Generated frontend contract files were regenerated with the script, not edited by hand
