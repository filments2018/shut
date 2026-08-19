/**
 * Small persistence boundary for the framework-free SHUT PWA.
 *
 * The adapter is deliberately storage-agnostic: production code can replace
 * the backing callbacks while retaining the same authorization and mutation
 * contract tested here.
 */

import {
  applyModerationAction,
  createReplyDeletion,
  createReplyUpdate,
  createReviewDeletion,
  createReviewReport,
  createReviewUpdate,
} from "./review-moderation.mjs";

export class ReviewPersistenceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ReviewPersistenceError";
    this.code = code;
  }
}

function requiredId(value, label) {
  const id = String(value ?? "").trim();
  if (!id) throw new ReviewPersistenceError("INVALID_ID", `${label} is required`);
  return id;
}

export function createReviewPersistence(seed = {}) {
  const reviews = new Map(Object.entries(seed.reviews ?? {}));
  const reportKeys = new Set(seed.reportKeys ?? []);
  const auditEvents = structuredClone(seed.auditEvents ?? []);

  function recordAudit(action, reviewId, actorId, metadata = {}) {
    auditEvents.push({
      sequence: auditEvents.length + 1,
      action,
      reviewId,
      actorId,
      createdAt: new Date().toISOString(),
      ...metadata,
    });
  }

  function getReview(reviewId) {
    const id = requiredId(reviewId, "reviewId");
    const review = reviews.get(id);
    if (!review) throw new ReviewPersistenceError("NOT_FOUND", "Review was not found");
    return structuredClone(review);
  }

  function saveAction(action, actor) {
    const review = getReview(action.payload.reviewId);
    const actorId = requiredId(actor?.id, "actorId");
    const expectedAuthorId = String(review.authorId ?? "");
    const expectedOwnerId = String(review.templateOwnerId ?? "");
    if ((action.action === "update-review" || action.action === "delete-review") && expectedAuthorId !== actorId) {
      throw new ReviewPersistenceError("FORBIDDEN", "Only the review author may change this review");
    }
    if ((action.action === "update-reply" || action.action === "delete-reply") && expectedOwnerId !== actorId) {
      throw new ReviewPersistenceError("FORBIDDEN", "Only the template owner may change this reply");
    }
    const next = applyModerationAction(review, action);
    reviews.set(review.id, next);
    recordAudit(action.action, review.id, actorId);
    return structuredClone(next);
  }

  function updateReview(input, actor) {
    const reviewId = requiredId(input?.reviewId, "reviewId");
    const review = getReview(reviewId);
    try {
      return saveAction(createReviewUpdate(review, actor, { rating: input.rating, comment: input.comment }), actor);
    } catch (error) {
      if (error instanceof ReviewPersistenceError) throw error;
      throw new ReviewPersistenceError("FORBIDDEN", error.message);
    }
  }

  function deleteReview(reviewId, actor) {
    const id = requiredId(reviewId, "reviewId");
    const review = getReview(id);
    return saveAction(createReviewDeletion(review, actor), actor);
  }

  function updateReply(input, actor) {
    const reviewId = requiredId(input?.reviewId, "reviewId");
    const review = getReview(reviewId);
    const template = { ownerId: review.templateOwnerId };
    try {
      return saveAction(createReplyUpdate(review, template, actor, input.reply), actor);
    } catch (error) {
      if (error instanceof ReviewPersistenceError) throw error;
      throw new ReviewPersistenceError(error.message === "Reply cannot be empty" ? "INVALID_REPLY" : "FORBIDDEN", error.message);
    }
  }

  function deleteReply(reviewId, actor) {
    const id = requiredId(reviewId, "reviewId");
    const review = getReview(id);
    const template = { ownerId: review.templateOwnerId };
    return saveAction(createReplyDeletion(review, template, actor), actor);
  }

  function reportReview(input, actor) {
    const review = getReview(input?.reviewId);
    const actorId = requiredId(actor?.id, "actorId");
    const existingReports = [...reportKeys].map((key) => {
      const [reporterId, reviewId] = key.split(":");
      return { actorId: reporterId, reviewId };
    });
    let action;
    try {
      action = createReviewReport(review, actor, input, existingReports);
    } catch (error) {
      const code = error.message.includes("already reported") ? "DUPLICATE_REPORT" : "FORBIDDEN";
      throw new ReviewPersistenceError(code, error.message);
    }
    reportKeys.add(`${actorId}:${review.id}`);
    recordAudit("report-review", review.id, actorId, { reason: action.payload.reason });
    return { ...action.payload, createdAt: action.createdAt };
  }

  return {
    getReview,
    updateReview,
    deleteReview,
    updateReply,
    deleteReply,
    reportReview,
    snapshot: () => ({ reviews: structuredClone(Object.fromEntries(reviews)), reportKeys: [...reportKeys], auditEvents: structuredClone(auditEvents) }),
    auditLog: () => structuredClone(auditEvents),
  };
}
