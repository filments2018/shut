# Changelog

All notable changes to SHUT are documented here.

## [Unreleased]

### Added

- Added the review moderation domain foundation for normalized review updates and deletions, creator-reply updates and deletions, and duplicate-safe review reports.
- Added the first browser-facing review card component with permission-aware edit, delete, reply, and report controls.
- Added `UI.buildReviewCard()` as the framework-free PWA integration point.
- Added `review-persistence.mjs`, an in-memory persistence adapter that validates actor authorization before applying review actions and keeps report uniqueness by reviewer and review.
- Added deterministic tests for persistence authorization, action application, duplicate reports, and missing records.

### Changed

- Promoted the former changelog draft to this formal `CHANGELOG.md`.
- Kept camera, motion, recording, and sharing flows isolated from the review moderation modules.
- Documented the remaining server adapter, audit log, moderation status, and browser E2E work in Issue #2.

### Verification

- The review moderation and persistence test suites pass with Node's built-in test runner.
- `git diff --check` passes.

### Follow-up

- Connect the adapter to the application's durable storage and server-side authorization boundary.
- Add moderation status transitions, audit events, and browser-level UI coverage.

[Unreleased]: https://github.com/filments2018/shut/compare/main...feature/review-persistence
