/**
 * Pure domain helpers for the SHUT review moderation flow.
 *
 * The module is storage-agnostic. It can be called from `ui.js` now and
 * connected to a server adapter later. Authorization must be repeated by the
 * persistence layer; these checks are for predictable UI behavior only.
 */

export const REPORT_REASONS = Object.freeze([
  "inappropriate",
  "spam",
  "harassment",
  "off_topic",
]);

export const MODERATION_ACTIONS = Object.freeze([
  "update-review",
  "delete-review",
  "update-reply",
  "delete-reply",
  "report-review",
]);

export function createModerationState() {
  return {
    editingReviewId: null,
    editingReplyId: null,
    pendingReportReviewId: null,
  };
}

export function canEditReview(review, actor) {
  return Boolean(review && actor && review.authorId === actor.id);
}

export function canEditReply(template, actor) {
  return Boolean(template && actor && template.ownerId === actor.id);
}

export function canReportReview(review, actor) {
  return Boolean(review && actor && review.authorId !== actor.id);
}

export function normalizeReviewDraft(input = {}) {
  const rating = Number(input.rating);
  return {
    rating: Number.isInteger(rating) ? Math.min(5, Math.max(1, rating)) : 5,
    comment: String(input.comment ?? "").trim().slice(0, 500),
  };
}

export function normalizeReply(input = {}) {
  return String(input.reply ?? input.comment ?? "").trim().slice(0, 500);
}

export function normalizeReport(input = {}) {
  const reason = REPORT_REASONS.includes(input.reason)
    ? input.reason
    : "inappropriate";
  return {
    reason,
    note: String(input.note ?? "").trim().slice(0, 240),
  };
}

function requireId(value, fieldName) {
  if (!value || typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
  return value;
}

function requireAction(action) {
  if (!MODERATION_ACTIONS.includes(action)) {
    throw new Error(`Unsupported moderation action: ${action}`);
  }
  return action;
}

function requireActor(actor) {
  return requireId(actor?.id, "actor.id");
}

export function buildModerationAction(action, payload) {
  return Object.freeze({
    action: requireAction(action),
    payload,
    createdAt: new Date().toISOString(),
  });
}

export function createReviewUpdate(review, actor, draft) {
  if (!canEditReview(review, actor)) {
    throw new Error("Only the review author can edit this review");
  }
  return buildModerationAction("update-review", {
    reviewId: requireId(review.id, "review.id"),
    actorId: requireActor(actor),
    ...normalizeReviewDraft(draft),
  });
}

export function createReviewDeletion(review, actor) {
  if (!canEditReview(review, actor)) {
    throw new Error("Only the review author can delete this review");
  }
  return buildModerationAction("delete-review", {
    reviewId: requireId(review.id, "review.id"),
    actorId: requireActor(actor),
  });
}

export function createReplyUpdate(review, template, actor, reply) {
  if (!canEditReply(template, actor)) {
    throw new Error("Only the template owner can edit this reply");
  }
  const normalizedReply = normalizeReply({ reply });
  if (!normalizedReply) {
    throw new Error("Reply cannot be empty");
  }
  return buildModerationAction("update-reply", {
    reviewId: requireId(review?.id, "review.id"),
    actorId: requireActor(actor),
    reply: normalizedReply,
  });
}

export function createReplyDeletion(review, template, actor) {
  if (!canEditReply(template, actor)) {
    throw new Error("Only the template owner can delete this reply");
  }
  return buildModerationAction("delete-reply", {
    reviewId: requireId(review?.id, "review.id"),
    actorId: requireActor(actor),
  });
}

export function createReviewReport(review, actor, input, existingReports = []) {
  if (!canReportReview(review, actor)) {
    throw new Error("You cannot report your own review");
  }
  const reviewId = requireId(review.id, "review.id");
  const actorId = requireActor(actor);
  if (
    existingReports.some(
      (report) => report.reviewId === reviewId && report.actorId === actorId,
    )
  ) {
    throw new Error("You have already reported this review");
  }
  return buildModerationAction("report-review", {
    reviewId,
    actorId,
    ...normalizeReport(input),
  });
}

export function applyModerationAction(review, action) {
  if (!review || !action || !MODERATION_ACTIONS.includes(action.action)) {
    return review;
  }
  if (review.id !== action.payload.reviewId) {
    return review;
  }
  switch (action.action) {
    case "update-review":
      return {
        ...review,
        rating: action.payload.rating,
        comment: action.payload.comment,
        updatedAt: action.createdAt,
      };
    case "delete-review":
      return { ...review, deletedAt: action.createdAt, comment: "" };
    case "update-reply":
      return {
        ...review,
        creatorReply: action.payload.reply,
        creatorReplyUpdatedAt: action.createdAt,
      };
    case "delete-reply":
      return {
        ...review,
        creatorReply: null,
        creatorReplyDeletedAt: action.createdAt,
      };
    default:
      return review;
  }
}

export function countReportsForReview(reviewId, reports = []) {
  return reports.filter((report) => report.reviewId === reviewId).length;
}
