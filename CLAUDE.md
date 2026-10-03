# Stylus

家族4人（父・母・息子2人）で使う Web アプリ。車の予約、お金の請求、ご飯のいる・いらない、ご飯を作れない日の連絡を扱う。
オーナーはせいご（息子の一人。アプリの管理者）。やり取りは日本語で行う。

## 決め方

- 決まっていないことを Claude が独断で決めない。選択肢と推奨案を示し、オーナーに確認する
- 設計フェーズで決まったことは `handoff/design-phase-decisions.md` にある（常設文書・spec へ移し終えたら削除する一時資料）

## 制約

- 完全無料の範囲で完結させる（クレジットカードの登録は可だが、課金が発生する使い方はしない）
- フロントエンドとバックエンドは完全に分離する
- 独自ドメインは使わない（`*.pages.dev` / `*.workers.dev`）

## 技術スタック

| 役割 | 採用 | 置き場所 |
|---|---|---|
| フロントエンド | Vite + React（TypeScript）、SPA、PWA | Cloudflare Pages（`apps/web`） |
| バックエンド API | Hono（TypeScript） | Cloudflare Workers（`apps/api`） |
| 認証 | Supabase Auth（Google ログイン） | Supabase |
| DB | Supabase Postgres（Drizzle / Drizzle Kit） | Supabase |
| その他 | pnpm、Zod、Hono RPC、Vitest | — |
| lint・整形 | ESLint + Prettier | — |

環境は本番と開発の2組：Worker `stylus-api` / `stylus-api-dev`、Supabase `stylus` / `stylus-dev`。Pages のプレビューデプロイは開発用 API につなぐ。

## 守ること

- フロントは `supabase-js` をログイン・ログアウト・セッション管理にだけ使う。データの読み書きはすべて Hono API を経由する
- API 呼び出しはアクセストークンを `Authorization: Bearer` で送る。Cookie は使わない
- 認可（権限チェック）は API 側で行う。フロントの表示の出し分けは見た目のためだけ
- Supabase の Data API 経由の直接アクセスは塞ぐ
- サービスロールキーと DB 接続情報は Workers の secret（Hyperdrive を使うならその設定）にだけ置く。例外として、マイグレーション用の DB 接続情報は GitHub Actions の secret にも置き、ローカル開発用の値は git の管理外のファイル（`.dev.vars` / `.env`）に置く。フロントには秘密情報を置かない。フロントに置くのは Supabase の URL と公開キー、API の URL、Sentry の DSN（どれも公開してよい値）だけ
- 一般公開のサインアップは無効。家族のアカウントは管理者が事前登録する
- CORS で許可するのは、自分のフロントのオリジン、（開発環境のみ）プレビュー用 URL、開発用の localhost だけ
- `apps/web` から `apps/api` の実行コードを import しない（`import type` のみ可）。共有するもの（型・スキーマ・ルール）は `packages/` に置く
- 日付の区切りは日本時間で揃える。Workers の Cron は UTC で動くことに注意する
- Workers Free はリクエストあたり CPU 10ms。重い処理を Workers でしない
- Supabase Free は7日間アクセスが無いと停止する。本番・開発の両方に Cron で定期アクセスする
- 新しい依存パッケージを追加するときは、Workers で動くか確かめる
- シークレットやキーをコードやコミットに含めない

## 開発環境

- Windows に直接構築する（WSL・Dev Container は使わない）。pnpm は corepack で有効にする
- 改行コードは `.gitattributes` で LF に揃える。package.json のスクリプトは OS に依存しない書き方にする
- 開発用 DB はクラウドの `stylus-dev` を使う

## 開発ワークフロー

このプロジェクトは仕様駆動ワークフローで開発する。常設の要求（`docs/product/vision.md`）と要件（`docs/product/requirements/`）を「今の姿」として積み上げ、変更ごとに spec（`docs/specs/NNN-<name>/`）を1枚作る。
要件と受入基準の書き方は `~/.claude/skills/product-requirements/rules.md` に従う。

### 設定

<!-- spec-check と spec-verify がこの節を読む。項目名を変えない。 -->

- テストの実行: `pnpm test`
- lint の実行: `pnpm lint`
- テストの置き場所: `apps/**/*.test.ts`, `apps/**/*.test.tsx`, `packages/**/*.test.ts`
- 全体レビューを勧める done の件数: 3
- 全体レビューを勧める進行中 spec の件数: 2
- approved のまま注意を出す日数: 30

### ティア

| ティア | 対象 | 用意するもの |
|---|---|---|
| S | バグ修正、文言変更、小さなUI調整 | spec ファイルは作らない。振る舞いが変わったら `/product-requirements update` で常設要件を直す |
| M | 通常の機能追加 | `spec.md`、`tasks.md` |
| L | 新規プロジェクト、アーキテクチャに影響する変更 | `spec.md`、`design.md`、`tasks.md`。必要なら ADR。`vision.md` が必須 |

### 流れ

```
/spec-new → （spec-review で未解決0件・未決事項ゼロ）→ ユーザーが承認 → /spec-plan → 実装（AC ごとのサイクル）→ /spec-close
```

### レビューと点検のタイミング

| # | タイミング | 呼ぶもの | 誰が呼ぶか | 未解決の矛盾・欠落が残ったとき |
|---|---|---|---|---|
| ① | vision.md を作った・更新した直後 | `spec-check` → `docs-review vision` | `/product-vision` が自動で | vision を完成にしない |
| ② | 常設要件を導入した・spec を経ずに直した直後 | `spec-check` → init は `docs-review all`、update は `docs-review requirements <領域>` | `/product-requirements` が自動で | 導入・更新を完了にしない |
| ③ | Lティアの spec を書き始める前 | `spec-check`（全体） | `/spec-new` が自動で | 先に直すか承知で進めるかをユーザーが決める |
| ④ | spec の draft を書き上げた直後 | `spec-check spec NNN` → `spec-review NNN` | `/spec-new` が自動で | approved にしない |
| ⑤ | tasks.md を作る前（承認後に周辺の文書が git 上で変わっていたときだけ） | `spec-review NNN` | `/spec-plan` が自動で | spec を draft に戻して直す |
| ⑥ | spec を閉じる前 | `spec-verify NNN` | `/spec-close` が自動で | 常設要件へ移さない |
| ⑦ | 常設要件へ移した直後 | `spec-check`（全体） | `/spec-close` が自動で | done にしない |
| ⑧ | done にしたとき、前回の全体レビューから done が上の件数以上たまっていたら | `docs-review all` | `/spec-close` が勧める | — |
| ⑨ | リリース前、久しぶりに戻ったとき、進行中の spec が上の件数以上になったとき | `docs-review all` | ユーザーが手動で（`/spec-new` も勧める） | — |

- 関門は「未解決の矛盾・欠落が0件」。ユーザーが「誤検知」「承知で進める」と判断した指摘は、理由を `docs/review-notes.md` に書けば解消扱いになる。
- 自動のレビュー・点検は省略しない。ユーザーが明示して飛ばしたときは `docs/review-notes.md` に「飛ばした」と書く。

### 規則

- ID は常設 ID を使う（spec の中でも）。機能要件 `<領域>-F-nnn`、非機能要件 `<領域>-N-nnn` / `COMMON-N-nnn`、受入基準 `<要件ID>/AC-n`。
- テスト名（または説明文）に `[<要件ID>/AC-n]` を含める。例：`[MEAL-F-004/AC-1] 前日21時に不要を登録すると一覧から除外される`
- DB・API の設計書は持たない。**コードが正。** spec には差分だけ書く。
- 実装は tasks.md のタスクを AC ごとのサイクルで進める：受入基準のテストを書く → 実行して**期待どおりの理由で失敗する**ことを確かめ、失敗の要点を tasks.md の「Red」欄に書く（コンパイルエラーや import の失敗は数えない）→ 実装する（込み入った部分は単体テストを先に書きながら）→ 対象のテストとテスト全体が通る → リファクタしてもう一度全体が通る → テストと実装を1コミットにする。Red の記録は `spec-verify` が確かめる。
