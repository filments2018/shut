# SHUT — スマホ撮影レシピ 仕様書

> Version: v41 | Updated: 2026-07-15

---

## 1. プロダクト概要

**SHUT** は、スマホだけでトランジション動画を撮影できる PWA（Progressive Web App）。カメラワークを「レシピ」として提供し、シーンAとシーンBを画面のガイドに従って撮ると、WhipPan・HandCover・MotionMatch・ObjectWipe のつながった動画を1本で保存できる。

### コアコンセプト
- **レシピ選択 → シーンA → トランジション → シーンB** の撮影フロー
- シーン間の移動・着替え・構図準備は完成動画から自動で除外
- BPM（テンポ）に合わせたビートガイドでリズミカルに撮影
- 加速度センサーまたは画面タップでトランジション動作を確定
- タイミング精度をスコア評価（PERFECT / GOOD / OK / MISS）

### ターゲットユーザー
- ショート動画クリエイター（TikTok / Instagram Reels / YouTube Shorts）
- 動画制作初心者〜中級者
- スマホのみで撮影したい人

---

## 2. 技術スタック

| 項目 | 技術 |
|------|------|
| フロントエンド | バニラ JavaScript（フレームワークなし） |
| スタイリング | CSS3（カスタムプロパティ、アニメーション、Grid/Flex） |
| フォント | Google Fonts（Plus Jakarta Sans + M PLUS Rounded 1c + JetBrains Mono、非同期読み込み） |
| 音声 | Web Audio API（ビートスケジューラ、BGM再生、BPM検出） |
| カメラ | getUserMedia API |
| 録画 | MediaRecorder API（H.264優先、5Mbps） |
| センサー | DeviceMotion API（ハイパス/ローパスフィルタ） |
| 共有 | Web Share API + フォールバックダウンロード |
| PWA | Service Worker（Stale-While-Revalidate）、Web App Manifest |
| デプロイ | Netlify（静的ホスティング） |

---

## 3. ファイル構成

```
shut/
  index.html        -- メインHTML（全画面定義）
  styles.css         -- 全スタイル（~1750行）
  app.js             -- メインロジック・ステートマシン（~1000行）
  ui.js              -- UI操作・アニメーション・完成画面構築（~1140行）
  audio.js           -- Web Audio API ビート・BGM・効果音（~480行）
  motion.js          -- 加速度センサーモジュール（~130行）
  camera.js          -- カメラ制御（~150行）
  recorder.js        -- MediaRecorder管理（~220行）
  share.js           -- シェア・ダウンロード（~140行）
  sw.js              -- Service Worker（~80行）
  manifest.json      -- PWAマニフェスト
  netlify.toml       -- Netlify設定（ヘッダー・リダイレクト）
  icon-192.svg       -- PWAアイコン（192x192）
  icon-512.svg       -- PWAアイコン（512x512）
  SPEC.md            -- この仕様書
```

---

## 4. 画面フロー（ステートマシン）

```
splash → [iOS] permission → [初回] tutorial → select → countdown → recording(A) → shutter
                                                  ↑                              ↓
                                                  └────── complete ← recording(B) ← prepare
```

### フェーズ一覧

| フェーズ | 説明 | 遷移先 |
|----------|------|--------|
| `splash` | ロゴ表示（0.7-1.2s） | `permission` or `tutorial` or `select` |
| `permission` | iOS センサー許可画面 | `tutorial` or `select` |
| `tutorial` | 初回チュートリアル（3ステップ） | `select` |
| `select` | レシピ（モード）選択 | `countdown`（via `startMode`） |
| `countdown` | 3→2→1→GO! カウントダウン | `recording` |
| `recording` | シーンA/Bを録画中（BPM同期） | Aは`shutter`、Bは`complete` |
| `shutter` | トランジション動作の検出・タップ待機 | `executing` or `prepare` |
| `executing` | 動作の余韻を録画して一時停止 | `prepare` |
| `processing` | タイムアウト時などの遷移処理 | `prepare` |
| `prepare` | 録画を一時停止し、場所・衣装・構図を準備 | `countdown` |
| `complete` | 完成画面（スコア・プレビュー・シェア） | `select`（リトライ） |

---

## 5. 撮影レシピ（モード）

### プリセットレシピ

| ID | ラベル | BPM | カメラワーク | 種別 |
|----|--------|-----|-------------|------|
| `whip` | WHIP | 96 | 素早い横パンでカットA/Bをつなぐ | transition |
| `cover` | COVER | 88 | 手でレンズを覆って場面切替 | transition |
| `match` | MATCH | 100 | 同じ動きでカットを合わせる | action |
| `wipe` | WIPE | 92 | 遮蔽物の裏で場面転換 | foreground |

### レシピデータ構造

```javascript
{
  id: 'whip',
  label: 'WHIP',
  bpm: 96,
  color: '#00D4FF',       // テーマカラー
  accent: '#10B981',      // アクセントカラー
  bg: '#020909',          // 背景色
  guide: 'PAN RIGHT FAST',
  arrow: '→',
  emoji: '⚡',
  completeMsg: 'WHIP PAN. 振るスピードと方向をそろえて場面をつなぐ。',
  hashtags: '#SHUT #WHIP #スマホ撮影 #映像で遊ぼう',
  beatsPerClip: 5,        // 1シーンあたりの拍数
  recipeType: 'transition',
  recipeSummary: '素早いパンのブレでカットA/Bをつなぐ',
  shots: [                // シーンA/Bの撮影ガイド
    { guide: '被写体を正面に止めて映す', arrow: '•', hud: 'SCENE A  静止' },
    { guide: '振りながら入り、被写体で止める', arrow: '→', hud: 'SCENE B  IN → 静止' },
  ],
  transition: {
    label: 'WHIP',
    arrow: 'any',
    trigger: 'motion',    // motion または tap
    tailMs: 260,          // 動作後に録画へ残す余韻
    prompt: '好きな方向へ、すぐに振り切る',
    prepare: '次の場所へ移動し、同じ方向から構える。',
    ready: 'カウントダウン中に開始位置へ向ける。',
  },
}
```

### カスタムBPMモード
- タップテンポ（直近5タップの平均間隔からBPM算出）
- スライダー（60-200 BPM）
- `beatsPerClip = Math.round(bpm * 3.5 / 60)`

---

## 6. コアモジュール仕様

### 6.1 app.js — ステートマシン

**グローバル状態 (`window.State`)**
```javascript
{
  phase: 'splash',       // 現在のフェーズ
  mode: null,            // 選択中のレシピ
  clips: 0,              // 撮影済みシーン数
  recEnabled: false,     // MediaRecorder が有効か
  scores: [],            // 各トランジションの {grade, offset}
  combo: 0,              // 連続 GOOD 以上
  maxCombo: 0,           // 最大コンボ
  transitionCommitted: false,
  lastWhipDir: null,     // シーンAで検出した振り方向
  _cachedBlob: null,     // 完成動画 Blob のキャッシュ
}
```

**タイミング評価グレード**
- BPM 依存の窓設定（拍間隔の比率）
- PERFECT: ±12% | GOOD: ±25% | OK: ±45% | MISS: それ以外
- 例: BPM100 → PERFECT ±72ms, GOOD ±150ms, OK ±270ms

**称号判定 (`_calcTitle`)**
| 条件 | 称号 | 星 |
|------|------|----|
| 全 PERFECT | FULL PERFECT! | 5 |
| ratio ≥ 0.9 | EXCELLENT! | 4 |
| ratio ≥ 0.7 | GREAT SHOT! | 3 |
| ratio ≥ 0.4 | NICE TRY! | 2 |
| その他 | KEEP RHYTHM! | 1 |

### 6.2 audio.js — Web Audio API

**ビートスケジューラ**
- Lookahead: 150ms / Schedule interval: 50ms
- 4拍子（BEATS_PER_BAR = 4）
- モードごとに音色が異なる（sine/square/triangle）
- 強拍（1拍目）と弱拍で音量・周波数が変化

**BGM機能**
- `loadBgm(file)` → `decodeAudioData` → AudioBuffer
- `detectBpm(buffer)` → エネルギーベースのオンセット検出 → BPM 推定
- `startBgm()` → loop=true, 再生位置引き継ぎ（`_bgmOffset`）
- `stopBgm()` → 再生位置を保存
- `resetBgmPosition()` → gotoSelect 時にリセット

**タイミング評価**
- `freezeForTiming()` → ビート停止だが _nextBeat/_bpm を保持
- `getTimingOffset()` → 直近のビートとのズレ(ms) を返す

### 6.3 motion.js — 加速度センサー

- ハイパスフィルタ（α=0.85）で重力成分を除去
- ローパスフィルタ（α=0.4）でゲージ表示用平滑化
- シュット閾値: 22 m/s²（デバッグパネルで調整可能）
- クールダウン: 750ms
- シュット方向を記録（ブラーエフェクトの方向決定に使用）

### 6.4 camera.js — カメラ制御

- 解像度プリセット: low(480p) / medium(720p) / high(1080p)
- `ideal` 制約で要求、失敗時は制約緩和で再試行
- フロントカメラはCSS `scaleX(-1)` でミラー表示
- フリップは `processing`/`shutter` 中はブロック

### 6.5 recorder.js — 録画

- モバイル: H.264/MP4 優先（ハードウェアエンコード）
- デスクトップ: VP9/WebM 優先
- ビットレート: 映像 5Mbps / 音声 128kbps
- チャンクサイズ: 250ms
- シーンAからBまで1つの`MediaRecorder`で連続収録
- トランジションの余韻後に`pauseClip()`、シーンBのGOで`resumeClip()`
- 一時停止中の移動・着替え・構図準備は完成動画へ含めない
- MP4最終化は最大12秒待機し、空Blob・タイムアウト・録画エラーを結果として返す
- 保存失敗時は完成演出を行わず、権限確認と再撮影を案内する
- マイクストリームは一度取得したら再利用

### 6.6 share.js — 共有

1. Web Share API (files) → ファイル付きシェア
2. Web Share API (URL) → URL のみシェア
3. フォールバック → Blob ダウンロード

### 6.7 ui.js — UI管理

- `showScreen(name)` → aria-hidden 連動
- `buildCompleteScreen()` → スコアパネル、タイミングチャート、パーティクル
- `beatPulse()` → ビートリング・矢印・録画バーマーカーの同期アニメーション
- `showGradePopup()` → PERFECT/GOOD/OK/MISS のフローティング評価表示
- MATCHではシーンAのタップ瞬間をCanvasへ保持し、シーンB準備・カウントダウン中に半透明の構図ゴーストとして表示
- 構図ゴーストは画面表示のみで、MediaRecorderの完成動画には合成しない

---

## 7. PWA 仕様

### manifest.json
- `display: "standalone"` + `display_override: ["fullscreen", "standalone"]`
- `orientation: "portrait"`
- ショートカット: WHIP / COVER / MATCH レシピへの直接起動

### Service Worker (sw.js)
- 戦略: Stale-While-Revalidate
- キャッシュ名: `shut-v41`（手動バージョニング）
- `e.waitUntil(fetchPromise)` でバックグラウンド更新を保護
- オフラインフォールバック: `index.html`

### Netlify ヘッダー
- `Permissions-Policy: accelerometer=*, gyroscope=*, camera=*, microphone=*`
- `Strict-Transport-Security` (HSTS)
- `Cross-Origin-Opener-Policy: same-origin`
- sw.js: `Cache-Control: no-cache, no-store, must-revalidate`

---

## 8. アクセシビリティ

- 全インタラクティブ要素に `aria-label` 設定
- `showScreen()` で非アクティブ画面に `aria-hidden="true"` を自動付与
- チュートリアルステップに `role="tabpanel"` + 動的 `aria-hidden`
- トーストに `role="status"` + `aria-live="polite"`
- `:focus-visible` でキーボードフォーカススタイル
- `noscript` フォールバック

---

## 9. パフォーマンス最適化

| 最適化 | 手法 |
|--------|------|
| フォント | Google Fonts 非同期読み込み（`media="print" onload`） |
| レンダリング | `content-visibility: auto` で非表示画面の描画をスキップ |
| アニメーション | `filter` 排除 → `text-shadow`/`box-shadow` でGPU合成 |
| 録画中 | `backdrop-filter: blur()` 除去、beatPulse内マーカーキャッシュ |
| メモリ | Blob キャッシュ再利用、ObjectURL 追跡・解放 |
| スクロール | `overscroll-behavior: contain` でバウンス防止 |
| タッチ | `touch-action: none`（カメラ画面）/ `manipulation`（その他） |

---

## 10. ブラウザ互換性

| ブラウザ | サポート状況 |
|----------|-------------|
| iOS Safari 16+ | フル対応（DeviceMotion許可ダイアログ、MP4録画） |
| Android Chrome 90+ | フル対応（VP8/H.264録画、振動API） |
| デスクトップ Chrome/Edge | カメラ・録画対応、センサーなし（タップで代替） |
| Firefox | 基本動作（MediaRecorder 互換） |
| アプリ内ブラウザ (LINE/Twitter) | センサー制限あり、タップフォールバック |

---

## 11. デバッグ機能

画面を **7回連打** でデバッグパネルを表示/非表示:

- 加速度値リアルタイム表示
- シュット感度スライダー（8-40 m/s²）
- 解像度切替（480p/720p/1080p）
- シーン数切替（通常は2、デバッグ時のみ4/6）
- フェーズ・録画状態・センサー状態の表示

---

## 12. URL パラメータ

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| `mode` | `whip` / `cover` / `match` / `wipe` | 指定レシピで即開始 |
| `clips` | `2` / `4` / `6` | シーン数を変更（通常は2） |

例: `https://shut.app/?mode=whip&clips=2`

---

## 13. データ永続化

| キー | 用途 |
|------|------|
| `shut_last_mode` | 最後に使用したレシピID |
| `shut_onboarded` | チュートリアル完了フラグ (`"1"`) |
| `shut_hi_{modeId}` | モード別ハイスコア（星数） |

---

## 14. ビルド・デプロイ

ビルドステップなし（バニラ JS）。Netlify にプッシュするだけでデプロイ完了。

```bash
# ローカルテスト（HTTPS必須のためngrokまたはlocalhost推奨）
npx serve .

# デプロイ
git push origin main  # Netlify が自動デプロイ
```

### SW キャッシュ更新手順
1. `sw.js` の `CACHE` 定数を `shut-vN+1` にインクリメント
2. デプロイ後、ブラウザが24時間以内にSW更新を検出
3. `activate` イベントで旧キャッシュを自動削除


---
※注記（2026-07-12 ナレッジ棚卸し）: ブランド表記注記: ターゲット記述に「映像制作初心者〜中級者」が残存しています。→ 2026-07-12 深瀬承認により「動画制作初心者〜中級者」へ修正済み。
