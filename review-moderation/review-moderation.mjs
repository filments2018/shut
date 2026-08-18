/**
 * Pure domain helpers for the SHUT review moderation flow.
 *
 * These helpers are deliberately storage-agnostic. They provide predictable
 * client-side behavior for the UI while leaving authorization to the server.
 */

export const REPORT_REASONS = Object.freeze([
  "inappropriate",
  "spam",
  "harassment",
  "off_topic",
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

export function normalizeReport(input = {}) {
  const reason = REPORT_REASONS.includes(input.reason)
    ? input.reason
    : "inappropriate";
  return {
    reason,
    note: String(input.note ?? "").trim().slice(0, 240),
  };
}

export function buildModerationAction(action, payload) {
  return Object.freeze({
    action,
    payload,
    createdAt: new Date().toISOString(),
  });
}
