# Review Moderation Scaffold

This directory is the initial implementation boundary for SHUT review moderation. The repository is a framework-free PWA, so the first step is a small, dependency-free domain module that can be integrated into `ui.js` and the existing `window.State` flow without changing the camera or recording state machine.

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

The existing PWA keeps global state in `window.State` and builds screens from `ui.js`. The next implementation step should import `review-moderation.js` from the application entry point, pass authenticated identity and template ownership into the review screen, and connect the returned actions to the eventual persistence adapter. The existing `tests/e2e-additions.mjs` suite should gain browser-level coverage after the UI is connected.

## Non-goals for this commit

This scaffold does not add a visible screen, network endpoint, authentication provider, database table, or moderation console. Those changes should be implemented in a follow-up commit after the persistence contract and abuse-handling policy are agreed.
