import assert from "node:assert/strict";
import test from "node:test";

import { createReviewServerService, ReviewServiceError } from "./review-server-service.mjs";

function repositoryStub() {
  return {
    updateReview: async (input, actor) => ({ input, actor }),
    deleteReview: async (reviewId, actor) => ({ reviewId, actor }),
    updateReply: async (input, actor) => ({ input, actor }),
    deleteReply: async (reviewId, actor) => ({ reviewId, actor }),
    reportReview: async (input, actor) => ({ input, actor }),
  };
}

test("server service requires authenticated actor and request id", async () => {
  const service = createReviewServerService({ repository: repositoryStub() });
  await assert.rejects(() => service.deleteReview({ reviewId: "r1", requestId: "x" }), (error) => error.status === 401);
  await assert.rejects(() => service.deleteReview({ reviewId: "r1", actor: { id: "a" } }), (error) => error.status === 422);
});

test("server service uses session actor and returns an idempotent response", async () => {
  const audits = [];
  const service = createReviewServerService({ repository: repositoryStub(), auditWriter: async (event) => audits.push(event) });
  const request = { reviewId: "r1", actor: { id: "session-user" }, requestId: "req-1", input: { reviewId: "r1" } };
  const first = await service.deleteReview(request);
  const second = await service.deleteReview({ ...request, actor: { id: "spoofed" } });
  assert.deepEqual(second, first);
  assert.equal(first.result.actor.id, "session-user");
  assert.equal(audits.length, 1);
});

test("server service maps repository authorization and conflict errors", async () => {
  const repository = { ...repositoryStub(), reportReview: async () => { throw Object.assign(new Error("duplicate"), { code: "DUPLICATE_REPORT" }); } };
  const service = createReviewServerService({ repository });
  await assert.rejects(() => service.reportReview({ actor: { id: "v" }, requestId: "req-2", input: { reviewId: "r1" } }), (error) => error instanceof ReviewServiceError && error.status === 409);
});

test("server service writes audit metadata after a successful update", async () => {
  const audits = [];
  const service = createReviewServerService({ repository: repositoryStub(), auditWriter: async (event) => audits.push(event), now: () => "2026-08-19T00:00:00.000Z" });
  await service.updateReview({ actor: { id: "a" }, requestId: "req-3", input: { reviewId: "r1", comment: "ok" } });
  assert.deepEqual(audits[0], { requestId: "req-3", actorId: "a", action: "update-review", reviewId: "r1", at: "2026-08-19T00:00:00.000Z" });
});
