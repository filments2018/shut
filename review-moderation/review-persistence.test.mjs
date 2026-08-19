import assert from "node:assert/strict";
import test from "node:test";

import {
  createReviewPersistence,
  ReviewPersistenceError,
} from "./review-persistence.mjs";

const seed = {
  reviews: {
    r1: {
      id: "r1",
      authorId: "author1",
      templateOwnerId: "owner1",
      rating: 3,
      comment: "最初のコメント",
      creatorReply: "ありがとう",
    },
  },
};

test("review persistence updates and deletes only for the review author", () => {
  const store = createReviewPersistence(seed);
  const updated = store.updateReview({ reviewId: "r1", rating: 5, comment: "更新後" }, { id: "author1" });
  assert.equal(updated.rating, 5);
  assert.equal(updated.comment, "更新後");
  const deleted = store.deleteReview("r1", { id: "author1" });
  assert.equal(deleted.deletedAt !== undefined, true);
  assert.equal(deleted.comment, "");
});

test("review persistence rejects review changes by a different actor", () => {
  const store = createReviewPersistence(seed);
  assert.throws(
    () => store.updateReview({ reviewId: "r1", rating: 1, comment: "不正" }, { id: "other" }),
    (error) => error instanceof ReviewPersistenceError && error.code === "FORBIDDEN",
  );
});

test("template owners can update and delete creator replies", () => {
  const store = createReviewPersistence(seed);
  const updated = store.updateReply({ reviewId: "r1", reply: "新しい返信" }, { id: "owner1" });
  assert.equal(updated.creatorReply, "新しい返信");
  const deleted = store.deleteReply("r1", { id: "owner1" });
  assert.equal(deleted.creatorReply, null);
});

test("reply changes reject non-owners and empty replies", () => {
  const store = createReviewPersistence(seed);
  assert.throws(
    () => store.updateReply({ reviewId: "r1", reply: "不正" }, { id: "other" }),
    (error) => error.code === "FORBIDDEN",
  );
  assert.throws(() => store.updateReply({ reviewId: "r1", reply: "" }, { id: "owner1" }), /Reply cannot be empty/);
});

test("reports are persisted once per actor and review", () => {
  const store = createReviewPersistence(seed);
  const report = store.reportReview({ reviewId: "r1", reason: "spam" }, { id: "viewer1" });
  assert.equal(report.reviewId, "r1");
  assert.equal(report.actorId, "viewer1");
  assert.throws(
    () => store.reportReview({ reviewId: "r1", reason: "spam" }, { id: "viewer1" }),
    (error) => error.code === "DUPLICATE_REPORT",
  );
});

test("authors cannot report their own review and missing records are explicit", () => {
  const store = createReviewPersistence(seed);
  assert.throws(
    () => store.reportReview({ reviewId: "r1" }, { id: "author1" }),
    (error) => error.code === "FORBIDDEN",
  );
  assert.throws(() => store.getReview("missing"), (error) => error.code === "NOT_FOUND");
});

test("audit log records successful mutations and reports in order", () => {
  const store = createReviewPersistence(seed);
  store.updateReview({ reviewId: "r1", rating: 4, comment: "更新" }, { id: "author1" });
  store.reportReview({ reviewId: "r1", reason: "spam" }, { id: "viewer1" });
  const events = store.auditLog();
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event.action), ["update-review", "report-review"]);
  assert.equal(events[1].actorId, "viewer1");
  assert.equal(events[1].reason, "spam");
  assert.equal(events[0].sequence, 1);
  assert.equal(events[1].sequence, 2);
});

test("audit log and snapshots are defensive copies", () => {
  const store = createReviewPersistence(seed);
  store.deleteReview("r1", { id: "author1" });
  const snapshot = store.snapshot();
  const auditLog = store.auditLog();
  snapshot.reviews.r1.comment = "外部変更";
  auditLog[0].action = "外部変更";
  assert.equal(store.getReview("r1").comment, "");
  assert.equal(store.auditLog()[0].action, "delete-review");
});
