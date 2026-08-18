# Review Moderation Scaffold

This directory is the implementation boundary for SHUT review moderation. The repository is a framework-free PWA, so the feature uses a small, dependency-free domain module that can be integrated into `ui.js` and the existing `window.State` flow without changing the camera or recording state machine.

## Scope of this scaffold

The module defines the client-side contract for editing and deleting a user's own review, editing and deleting a template owner's reply, and reporting a review as inappropriate or spam. It intentionally does not treat client-side checks as authorization. A future server or storage adapter must repeat every permission check before persisting a mutation.

| Action | Allowed actor | Required server-side check |
|---|---|---|
| Edit review | Review author | `review.authorId === actor.id` |
| Delete review | Review author | `review.authorId === actor.id` |
| Edit reply | Template owner | `template.ownerId === actor.id` |
| Delete reply | Template owner | `template.ownerId === actor.id` |
| Report review | Authenticated user | One report per actor and review, with audit timestamp |

## Integration points

The existing PWA keeps global state in `window.State` and builds screens from `ui.js`. The next implementation step should import `review-moderation.mjs` from the application entry point, pass authenticated identity and template ownership into the review screen, and connect the returned actions to the eventual persistence adapter. The existing `tests/e2e-additions.mjs` suite should gain browser-level coverage after the UI is connected.

## Current implementation

`review-moderation.mjs` now builds validated mutations for review updates and deletions, creator-reply updates and deletions, and review reports. It also applies review mutations immutably for local UI previews and counts reports for a target review. The helpers normalize ratings, comments, replies, report reasons, and notes at the boundary.

The test suite covers authorized and unauthorized actors, missing identifiers, empty replies, self-report prevention, duplicate reports, payload length limits, immutable mutation application, unsupported actions, and report aggregation. Run it with `node --experimental-test-coverage --test review-moderation/review-moderation.test.mjs`.

## Remaining integration work

This commit does not add a visible screen, network endpoint, authentication provider, database table, or moderation console. Those changes should be implemented by connecting the domain actions to `ui.js`, a persistence adapter, and server-side authorization and audit logging.
