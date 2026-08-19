export class ReviewInteractionController {
  constructor({ persistence, confirm = async () => true, notify = () => {} } = {}) {
    this.persistence = persistence;
    this.confirm = confirm;
    this.notify = notify;
    this.busy = new Set();
  }

  isBusy(key) { return this.busy.has(key); }

  async run(key, action, successMessage) {
    if (this.busy.has(key)) return { ok: false, code: "BUSY" };
    this.busy.add(key);
    try {
      const value = await action();
      this.notify({ type: "success", message: successMessage });
      return { ok: true, value };
    } catch (error) {
      this.notify({ type: "error", message: error.message, retry: () => this.run(key, action, successMessage) });
      return { ok: false, code: error.code ?? "FAILED", error };
    } finally {
      this.busy.delete(key);
    }
  }

  async deleteReview(reviewId, actor) {
    const confirmed = await this.confirm({ type: "delete-review", reviewId });
    if (!confirmed) return { ok: false, code: "CANCELLED" };
    return this.run(`delete-review:${reviewId}`, () => this.persistence.deleteReview(reviewId, actor), "レビューを削除しました");
  }

  async deleteReply(reviewId, actor) {
    const confirmed = await this.confirm({ type: "delete-reply", reviewId });
    if (!confirmed) return { ok: false, code: "CANCELLED" };
    return this.run(`delete-reply:${reviewId}`, () => this.persistence.deleteReply(reviewId, actor), "返信を削除しました");
  }

  editReview(input, actor) {
    return this.run(`edit-review:${input.reviewId}`, () => this.persistence.updateReview(input, actor), "レビューを更新しました");
  }

  editReply(input, actor) {
    return this.run(`edit-reply:${input.reviewId}`, () => this.persistence.updateReply(input, actor), "返信を更新しました");
  }

  async reportReview(input, actor) {
    const confirmed = await this.confirm({ type: "report-review", reviewId: input.reviewId, reason: input.reason });
    if (!confirmed) return { ok: false, code: "CANCELLED" };
    return this.run(`report-review:${input.reviewId}:${actor?.id}`, () => this.persistence.reportReview(input, actor), "通報を受け付けました");
  }
}
