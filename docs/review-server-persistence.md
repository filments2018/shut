# SHUT Review Server Persistence Design

## 目的

`review-moderation` の純粋なドメイン処理と、現在のインメモリ永続化アダプターを、実DBおよびサーバーAPIへ安全に接続するための設計方針を定義する。クライアントUIから直接DBへアクセスさせず、認証済みユーザーをサーバー側で再検証する。

## 境界と責務

| 層 | 責務 | 禁止事項 |
|---|---|---|
| UI | 入力、確認、進行中表示、再試行、アクセシビリティ | actorの権限を信頼しない |
| API service | 認証、認可、入力検証、冪等性、トランザクション境界 | DB内部モデルをそのまま返さない |
| Repository | SQL/ORM、ユニーク制約、更新競合、ページング | HTTPやUI状態を知らない |
| Audit writer | 操作主体・対象・結果・時刻の監査記録 | 通報者の情報を一般APIへ露出しない |

## 推奨データモデル

`reviews` は `id`, `template_id`, `author_id`, `rating`, `comment`, `creator_reply`, `updated_at`, `deleted_at`, `version` を持つ。`review_reports` は `id`, `review_id`, `reporter_id`, `reason`, `note`, `status`, `created_at`, `resolved_at`, `resolved_by` を持ち、`(review_id, reporter_id)` に一意制約を付ける。`review_audit_events` は `id`, `review_id`, `actor_id`, `action`, `metadata_json`, `request_id`, `created_at` を持つ。

削除は物理削除ではなくソフトデリートを基本とし、表示APIでは`deleted_at IS NULL`を適用する。編集・削除は`version`を条件にした楽観的ロックで、古い画面からの上書きを拒否する。

## API契約

`PATCH /api/templates/:templateId/reviews/:reviewId`、`DELETE /api/templates/:templateId/reviews/:reviewId`、`PATCH /api/templates/:templateId/reviews/:reviewId/reply`、`DELETE /api/templates/:templateId/reviews/:reviewId/reply`、`POST /api/templates/:templateId/reviews/:reviewId/reports` を提供する。すべての書き込みはセッションから得た`actorId`を使用し、リクエストボディのactorIdは無視する。

成功時は更新後の公開可能なレビュー表現を返し、通報登録時は通報IDと受付状態だけを返す。`401`は未認証、`403`は権限拒否、`404`は対象不存在、`409`はバージョン競合または重複通報、`422`は入力不正、`429`は通報レート超過として扱う。

## セキュリティ・運用

通報理由とコメントはサーバー側で長さ・許可値を再検証し、HTMLとして保存・返却しない。通報APIはユーザー・レビュー単位の一意制約に加えてレート制限を適用する。管理者用キューは別権限で保護し、通常のレビュー一覧には通報者IDと内部メモを含めない。監査イベントには相関用`request_id`を付け、個人情報を過剰に複製しない。

## 段階的な実装計画

まず今回のブランチでAPI serviceの入力・認可・冪等性契約を固定する。次に本番DB用Repositoryを追加し、トランザクション、ユニーク制約、競合テストを導入する。最後にHTTPルーターと認証ミドルウェア、E2Eテスト、マイグレーション、ロールバック手順を追加する。DB接続情報は環境変数経由とし、ログに値を出さない。

## ロールバック

新しい書き込みAPIは段階的に有効化し、障害時はfeature flagで読み取り専用へ戻す。監査イベントと通報データは削除せず、リポジトリ実装だけを旧版へ切り替える。マイグレーションは後方互換な追加から開始し、破壊的変更を避ける。
