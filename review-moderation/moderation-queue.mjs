export const REPORT_STATUSES = Object.freeze(["pending", "reviewing", "resolved", "dismissed"]);

export class ModerationQueueError extends Error {
  constructor(code, message) { super(message); this.name = "ModerationQueueError"; this.code = code; }
}

export function createModerationQueue({ adminIds = [], reports = [] } = {}) {
  const admins = new Set(adminIds);
  const entries = new Map(reports.map((report) => [report.id, structuredClone(report)]));

  function requireAdmin(actor) {
    if (!actor?.id || !admins.has(actor.id)) throw new ModerationQueueError("FORBIDDEN", "Administrator access is required");
  }
  function getReport(id) {
    const report = entries.get(String(id ?? ""));
    if (!report) throw new ModerationQueueError("NOT_FOUND", "Report was not found");
    return structuredClone(report);
  }
  function addReport(report) {
    const id = String(report?.id ?? "").trim();
    if (!id) throw new ModerationQueueError("INVALID_ID", "report.id is required");
    if (entries.has(id)) throw new ModerationQueueError("DUPLICATE", "Report already exists");
    const entry = { ...structuredClone(report), id, status: "pending", history: [] };
    entries.set(id, entry);
    return structuredClone(entry);
  }
  function updateStatus(id, status, actor, note = "") {
    requireAdmin(actor);
    if (!REPORT_STATUSES.includes(status)) throw new ModerationQueueError("INVALID_STATUS", "Unsupported report status");
    const entry = getReport(id);
    const next = {
      ...entry,
      status,
      history: [...entry.history, { status, note: String(note).slice(0, 500), actorId: actor.id, at: new Date().toISOString() }],
    };
    entries.set(next.id, next);
    return structuredClone(next);
  }
  function list(actor, status = null) {
    requireAdmin(actor);
    return [...entries.values()].filter((entry) => !status || entry.status === status).map((entry) => structuredClone(entry));
  }
  return { addReport, getReport, updateStatus, list, statuses: REPORT_STATUSES };
}
