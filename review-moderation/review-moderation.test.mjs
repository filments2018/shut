import assert from "node:assert/strict";
import test from "node:test";

import {
  MODERATION_ACTIONS,
  REPORT_REASONS,
  applyModerationAction,
  buildModerationAction,
  canEditReply,
  canEditReview,
  canReportReview,
  countReportsForReview,
  createModerationState,
  createReplyDeletion,
  createReplyUpdate,
  createReviewDeletion,
  createReviewReport,
  createReviewUpdate,
  normalizeReply,
  normalizeReport,
  normalizeReviewDraft,
} from "./review-moderation.mjs";

const review = {
  id: "r1",
  authorId: "u1",
  rating: 3,
  comment: "Original",
};
const author = { id: "u1" };
const otherUser = { id: "u2" };
const template = { id: "t1", ownerId: "owner1" };
const owner = { id: "owner1" };

 test("review author can edit and delete their own review", () => {
  assert.equal(canEditReview(review, author), true);
  assert.equal(canEditReview(review, otherUser), false);
  assert.equal(createReviewDeletion(review, author).action, "delete-review");
});

test("review update creates a normalized mutation for the author", () => {
  const action = createReviewUpdate(review, author, {
    rating: 8,
    comment: "  Updated review  ",
  });
  assert.equal(action.action, "update-review");
  assert.deepEqual(action.payload, {
    reviewId: "r1",
    actorId: "u1",
    rating: 5,
    comment: "Updated review",
  });
});

test("review mutations reject unauthorized users and malformed ids", () => {
  assert.throws(
    () => createReviewUpdate(review, otherUser, { rating: 5, comment: "Nope" }),
    /Only the review author/,
  );
  assert.throws(
    () => createReviewDeletion({ ...review, id: "" }, author),
    /review.id is required/,
  );
});

test("template owner can edit and delete a reply", () => {
  assert.equal(canEditReply(template, owner), true);
  assert.equal(canEditReply(template, otherUser), false);
  const update = createReplyUpdate(review, template, owner, "  Thanks!  ");
  assert.equal(update.payload.reply, "Thanks!");
  assert.equal(createReplyDeletion(review, template, owner).action, "delete-reply");
});

test("reply updates reject non-owners and empty content", () => {
  assert.throws(
    () => createReplyUpdate(review, template, otherUser, "Nope"),
    /Only the template owner/,
  );
  assert.throws(
    () => createReplyUpdate(review, template, owner, "   "),
    /Reply cannot be empty/,
  );
});

test("authenticated users can report another user's review", () => {
  assert.equal(canReportReview(review, otherUser), true);
  assert.equal(canReportReview(review, author), false);
  assert.deepEqual(REPORT_REASONS, ["inappropriate", "spam", "harassment", "off_topic"]);
});

test("reports are normalized and duplicate reports are rejected", () => {
  const action = createReviewReport(
    review,
    otherUser,
    { reason: "spam", note: "  Repeated promotion  " },
  );
  assert.deepEqual(action.payload, {
    reviewId: "r1",
    actorId: "u2",
    reason: "spam",
    note: "Repeated promotion",
  });
  assert.throws(
    () => createReviewReport(review, otherUser, { reason: "spam" }, [
      { reviewId: "r1", actorId: "u2" },
    ]),
    /already reported/,
  );
  assert.throws(
    () => createReviewReport(review, author, { reason: "spam" }),
    /cannot report your own review/,
  );
});

test("draft, reply, and report payloads enforce their size boundaries", () => {
  assert.deepEqual(normalizeReviewDraft({ rating: -2, comment: "x".repeat(600) }), {
    rating: 1,
    comment: "x".repeat(500),
  });
  assert.equal(normalizeReply({ reply: "x".repeat(600) }).length, 500);
  assert.deepEqual(normalizeReport({ reason: "unknown", note: "x".repeat(300) }), {
    reason: "inappropriate",
    note: "x".repeat(240),
  });
});

test("actions update, delete, and reply review state immutably", () => {
  const updated = applyModerationAction(
    review,
    createReviewUpdate(review, author, { rating: 5, comment: "Changed" }),
  );
  assert.equal(updated.comment, "Changed");
  assert.equal(updated.rating, 5);
  assert.equal(review.comment, "Original");

  const withReply = applyModerationAction(
    review,
    createReplyUpdate(review, template, owner, "Welcome"),
  );
  assert.equal(withReply.creatorReply, "Welcome");
  const withoutReply = applyModerationAction(
    withReply,
    createReplyDeletion(review, template, owner),
  );
  assert.equal(withoutReply.creatorReply, null);

  const deleted = applyModerationAction(review, createReviewDeletion(review, author));
  assert.equal(deleted.comment, "");
  assert.equal(typeof deleted.deletedAt, "string");
});

test("irrelevant and unsupported actions do not mutate a review", () => {
  assert.deepEqual(
    applyModerationAction(review, buildModerationAction("report-review", { reviewId: "r1" })),
    review,
  );
  assert.equal(applyModerationAction(review, { action: "unknown", payload: {} }), review);
  assert.equal(applyModerationAction(review, null), review);
  assert.throws(
    () => buildModerationAction("unknown", {}),
    /Unsupported moderation action/,
  );
  assert.deepEqual(MODERATION_ACTIONS, [
    "update-review",
    "delete-review",
    "update-reply",
    "delete-reply",
    "report-review",
  ]);
});

test("report counts are scoped to the target review", () => {
  assert.equal(
    countReportsForReview("r1", [
      { reviewId: "r1" },
      { reviewId: "r2" },
      { reviewId: "r1" },
    ]),
    2,
  );
  assert.equal(countReportsForReview("missing"), 0);
});

test("state and action objects are stable primitives for UI integration", () => {
  assert.deepEqual(createModerationState(), {
    editingReviewId: null,
    editingReplyId: null,
    pendingReportReviewId: null,
  });
  const action = buildModerationAction("report-review", { reviewId: "r1" });
  assert.equal(action.action, "report-review");
  assert.deepEqual(action.payload, { reviewId: "r1" });
  assert.equal(typeof action.createdAt, "string");
});
