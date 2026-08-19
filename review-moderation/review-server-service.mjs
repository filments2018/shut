export class ReviewServiceError extends Error {
  constructor(status, code, message) { super(message); this.name = "ReviewServiceError"; this.status = status; this.code = code; }
}

function requireActor(request) {
  const actorId = String(request?.actor?.id ?? "").trim();
  if (!actorId) throw new ReviewServiceError(401, "UNAUTHENTICATED", "Authentication is required");
  return actorId;
}

function requireRequestId(request) {
  const requestId = String(request?.requestId ?? "").trim();
  if (!requestId) throw new ReviewServiceError(422, "REQUEST_ID_REQUIRED", "requestId is required for writes");
  return requestId;
}

export function createReviewServerService({ repository, auditWriter = async () => {}, now = () => new Date().toISOString() } = {}) {
  if (!repository) throw new TypeError("repository is required");
  const processed = new Map();

  async function execute(request, operation) {
    const actorId = requireActor(request);
    const requestId = requireRequestId(request);
    if (processed.has(requestId)) return structuredClone(processed.get(requestId));
    try {
      const result = await operation(actorId);
      const response = { ok: true, result, requestId, processedAt: now() };
      processed.set(requestId, response);
      await auditWriter({ requestId, actorId, action: request.action, reviewId: request.reviewId ?? request.input?.reviewId, at: response.processedAt });
      return structuredClone(response);
    } catch (error) {
      if (error instanceof ReviewServiceError) throw error;
      if (error.code === "FORBIDDEN") throw new ReviewServiceError(403, error.code, error.message);
      if (error.code === "NOT_FOUND") throw new ReviewServiceError(404, error.code, error.message);
      if (error.code === "DUPLICATE_REPORT") throw new ReviewServiceError(409, error.code, error.message);
      if (error.code === "INVALID_REPLY" || error.code === "INVALID_ID") throw new ReviewServiceError(422, error.code, error.message);
      throw error;
    }
  }

  return {
    updateReview: (request) => execute({ ...request, action: "update-review" }, (actorId) => repository.updateReview(request.input, { id: actorId })),
    deleteReview: (request) => execute({ ...request, action: "delete-review" }, (actorId) => repository.deleteReview(request.reviewId, { id: actorId })),
    updateReply: (request) => execute({ ...request, action: "update-reply" }, (actorId) => repository.updateReply(request.input, { id: actorId })),
    deleteReply: (request) => execute({ ...request, action: "delete-reply" }, (actorId) => repository.deleteReply(request.reviewId, { id: actorId })),
    reportReview: (request) => execute({ ...request, action: "report-review" }, (actorId) => repository.reportReview(request.input, { id: actorId })),
  };
}
