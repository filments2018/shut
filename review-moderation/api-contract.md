# Review Moderation API Contract

This document is an implementation contract for the next SHUT community feature. It is intentionally transport-neutral so the future adapter can use a REST endpoint, a serverless function, or the existing project storage strategy without changing the UI domain helpers.

| Operation | Payload | Authorization | Result |
|---|---|---|---|
| Update review | `reviewId`, `rating`, `comment` | Review author only | Updated review |
| Delete review | `reviewId` | Review author only | Empty success |
| Update reply | `reviewId`, `reply` | Template owner only | Updated review reply |
| Delete reply | `reviewId` | Template owner only | Empty success |
| Report review | `reviewId`, `reason`, optional `note` | Authenticated user; one report per user/review | Report receipt |

## Error behavior

The UI should distinguish an unauthenticated request, a forbidden mutation, a missing review, a duplicate report, and a temporary persistence failure. Destructive actions should require an explicit confirmation in the UI, while the server must remain the source of truth for authorization and duplicate-report prevention.

## Privacy and moderation notes

Reports should store the actor, review, normalized reason, creation time, and optional free-text note. The report list must not be exposed to ordinary community users. A future moderation surface should provide a review identifier, report count, reasons, current state, and an audit trail for resolution.
