import assert from "node:assert/strict";
import test from "node:test";

import {
  REPORT_REASONS,
  buildModerationAction,
  canEditReply,
  canEditReview,
  canReportReview,
  createModerationState,
  normalizeReport,
  normalizeReviewDraft,
} from "./review-moderation.mjs";

test("review author can edit and delete their own review", () => {
  const review = { id: "r1", authorId: "u1" };
  assert.equal(canEditReview(review, { id: "u1" }), true);
  assert.equal(canEditReview(review, { id: "u2" }), false);
});

test("template owner can edit and delete a reply", () => {
  const template = { id: "t1", ownerId: "u1" };
  assert.equal(canEditReply(template, { id: "u1" }), true);
  assert.equal(canEditReply(template, { id: "u2" }), false);
});

test("authenticated users can report another user's review", () => {
  const review = { id: "r1", authorId: "u1" };
  assert.equal(canReportReview(review, { id: "u2" }), true);
  assert.equal(canReportReview(review, { id: "u1" }), false);
  assert.deepEqual(REPORT_REASONS, ["inappropriate", "spam", "harassment", "off_topic"]);
});

test("draft and report payloads are normalized at the boundary", () => {
  assert.deepEqual(normalizeReviewDraft({ rating: 9, comment: "  hello  " }), {
    rating: 5,
    comment: "hello",
  });
  assert.deepEqual(normalizeReport({ reason: "unknown", note: "  details  " }), {
    reason: "inappropriate",
    note: "details",
  });
});

test("state and action objects are stable primitives for UI integration", () => {
  assert.deepEqual(createModerationState(), {
    editingReviewId: null,
    editingReplyId: null,
    pendingReportReviewId: null,
  });
  const action = buildModerationAction("report", { reviewId: "r1" });
  assert.equal(action.action, "report");
  assert.deepEqual(action.payload, { reviewId: "r1" });
  assert.equal(typeof action.createdAt, "string");
});
