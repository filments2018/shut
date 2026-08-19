import assert from "node:assert/strict";
import test from "node:test";

import { ReviewInteractionController } from "./review-interaction.mjs";
import { createModerationQueue } from "./moderation-queue.mjs";

function persistenceStub() {
  return {
    updateReview: (input) => ({ ...input, saved: true }),
    deleteReview: (id) => ({ id, deleted: true }),
    updateReply: (input) => ({ ...input, saved: true }),
    deleteReply: (id) => ({ id, deleted: true }),
    reportReview: (input) => ({ ...input, accepted: true }),
  };
}

test("interaction controller confirms destructive actions and reports success", async () => {
  const notices = [];
  const controller = new ReviewInteractionController({ persistence: persistenceStub(), confirm: async () => true, notify: (notice) => notices.push(notice) });
  const result = await controller.deleteReview("r1", { id: "author1" });
  assert.equal(result.ok, true);
  assert.equal(notices[0].type, "success");
});

test("interaction controller prevents duplicate work while an operation is pending", async () => {
  let release;
  const persistence = { ...persistenceStub(), updateReview: () => new Promise((resolve) => { release = resolve; }) };
  const controller = new ReviewInteractionController({ persistence });
  const first = controller.editReview({ reviewId: "r1", comment: "x" }, { id: "a" });
  const second = await controller.editReview({ reviewId: "r1", comment: "y" }, { id: "a" });
  assert.equal(second.code, "BUSY");
  release({ saved: true });
  assert.equal((await first).ok, true);
});

test("interaction controller exposes retry metadata on failure", async () => {
  const notices = [];
  const controller = new ReviewInteractionController({ persistence: { reportReview: () => { throw Object.assign(new Error("network"), { code: "NETWORK" }); } }, notify: (notice) => notices.push(notice) });
  const result = await controller.reportReview({ reviewId: "r1", reason: "spam" }, { id: "v" });
  assert.equal(result.code, "NETWORK");
  assert.equal(typeof notices[0].retry, "function");
});

test("moderation queue restricts listing and status transitions to admins", () => {
  const queue = createModerationQueue({ adminIds: ["admin"], reports: [{ id: "rep1", reviewId: "r1", status: "pending", history: [] }] });
  assert.throws(() => queue.list({ id: "viewer" }), (error) => error.code === "FORBIDDEN");
  const updated = queue.updateStatus("rep1", "resolved", { id: "admin" }, "確認済み");
  assert.equal(updated.status, "resolved");
  assert.equal(updated.history[0].actorId, "admin");
  assert.equal(queue.list({ id: "admin" }, "resolved").length, 1);
});

test("moderation queue rejects invalid and duplicate reports", () => {
  const queue = createModerationQueue({ adminIds: ["admin"] });
  queue.addReport({ id: "rep1", reviewId: "r1" });
  assert.throws(() => queue.addReport({ id: "rep1", reviewId: "r1" }), (error) => error.code === "DUPLICATE");
  assert.throws(() => queue.updateStatus("rep1", "unknown", { id: "admin" }), (error) => error.code === "INVALID_STATUS");
});
