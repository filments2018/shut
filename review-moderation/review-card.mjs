export function normalizeReviewCardInput(review = {}) {
  const rating = Number(review.rating);
  return {
    id: String(review.id ?? ""),
    authorId: String(review.authorId ?? ""),
    authorName: String(review.authorName ?? "匿名ユーザー"),
    rating: Number.isInteger(rating) ? Math.min(5, Math.max(1, rating)) : 0,
    comment: String(review.comment ?? ""),
    creatorReply: review.creatorReply ? String(review.creatorReply) : "",
    updatedAt: review.updatedAt ? String(review.updatedAt) : "",
  };
}

export function getReviewCardPermissions(review, actor, template) {
  const actorId = actor?.id ?? null;
  return {
    canEditReview: Boolean(actorId && review.authorId === actorId),
    canDeleteReview: Boolean(actorId && review.authorId === actorId),
    canEditReply: Boolean(actorId && template?.ownerId === actorId && review.creatorReply),
    canDeleteReply: Boolean(actorId && template?.ownerId === actorId && review.creatorReply),
    canReport: Boolean(actorId && review.authorId !== actorId),
  };
}

function actionButton(label, action, reviewId) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `review-card-action review-card-${action}`;
  button.dataset.reviewAction = action;
  button.dataset.reviewId = reviewId;
  button.setAttribute("aria-label", `${label}（レビュー）`);
  button.textContent = label;
  return button;
}

export function renderReviewCard(container, input, { actor = null, template = null } = {}) {
  if (!container || typeof document === "undefined") return null;
  const review = normalizeReviewCardInput(input);
  const permissions = getReviewCardPermissions(review, actor, template);
  const card = document.createElement("article");
  card.className = "review-card";
  card.dataset.reviewId = review.id;
  card.setAttribute("aria-label", `${review.authorName}のレビュー`);

  const header = document.createElement("header");
  header.className = "review-card-header";
  const author = document.createElement("strong");
  author.textContent = review.authorName;
  const rating = document.createElement("span");
  rating.className = "review-card-rating";
  rating.setAttribute("aria-label", `星${review.rating}個`);
  rating.textContent = `${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}`;
  header.append(author, rating);

  const comment = document.createElement("p");
  comment.className = "review-card-comment";
  comment.textContent = review.comment || "コメントなし";
  card.append(header, comment);

  if (review.creatorReply) {
    const reply = document.createElement("p");
    reply.className = "review-card-reply";
    const label = document.createElement("strong");
    label.textContent = "作成者の返信";
    const text = document.createElement("span");
    text.textContent = ` ${review.creatorReply}`;
    reply.append(label, text);
    card.appendChild(reply);
  }

  const actions = document.createElement("div");
  actions.className = "review-card-actions";
  const addAction = (label, action) => {
    const button = actionButton(label, action, review.id);
    button.addEventListener("click", () => card.dispatchEvent(new CustomEvent("review-card-action", {
      bubbles: true,
      detail: { action, reviewId: review.id, review, actor, template },
    })));
    actions.appendChild(button);
  };
  if (permissions.canEditReview) addAction("編集", "edit-review");
  if (permissions.canDeleteReview) addAction("削除", "delete-review");
  if (permissions.canEditReply) addAction("返信を編集", "edit-reply");
  if (permissions.canDeleteReply) addAction("返信を削除", "delete-reply");
  if (permissions.canReport) addAction("通報する", "report-review");
  if (actions.childElementCount) card.appendChild(actions);
  if (review.updatedAt) {
    const note = document.createElement("small");
    note.textContent = "編集済み";
    card.appendChild(note);
  }
  container.appendChild(card);
  return card;
}

if (typeof window !== "undefined") window.ReviewCard = { normalizeReviewCardInput, getReviewCardPermissions, renderReviewCard };
