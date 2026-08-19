# SHUT Review Moderation Release Notes

## Release scope

This release consolidates the review moderation foundation merged through PRs #1, #3, and #4. It covers the local PWA review card controls, domain-level authorization, persistence boundary, audit events, report moderation queue, and the server-service contract prepared for the next backend integration phase.

## User-facing changes

Review authors can edit or delete their own reviews. Template owners can edit or delete creator replies. Other authenticated users can report reviews, while authors cannot report their own content. Destructive actions require confirmation, duplicate submissions are suppressed while an operation is in progress, and failures expose retry metadata to the UI.

## Moderation and security

Reports are deduplicated per reporter and review. Administrator-only queue operations support pending, reviewing, resolved, and dismissed states with status history. The persistence boundary rechecks authorization rather than trusting client-supplied actor identifiers. Audit records capture action, review, actor, timestamp, sequence, and report reason where applicable.

## Verification

The merged main branch passed JavaScript syntax checks, 25 moderation tests, static asset existence checks, an HTTP smoke test for `index.html` and the persistence module, and `git diff --check`. The follow-up server-service design branch passes 29 tests, with overall coverage of 97.93% lines, 87.70% branches, and 90.97% functions.

## Known limitations and next phase

The current release uses a storage-agnostic in-memory adapter. The next phase must connect the service boundary to a real database repository and HTTP authentication middleware, add migrations and transactional uniqueness constraints, and run browser E2E tests against a production-like server. Durable storage credentials and deployment configuration are intentionally not included in this release.

## Merged pull requests

| PR | Scope | Status |
|---|---|---|
| #1 | Review moderation domain foundation | Merged |
| #3 | Persistence adapter and audit events | Merged |
| #4 | Review card UI and moderation queue | Merged |
