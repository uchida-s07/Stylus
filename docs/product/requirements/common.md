<!-- 表・ID の書式は spec-check が読む。書き方を変えるときは spec-check/scripts/spec_check.py も直す。 -->
# 要件: 全体共通の非機能要件（COMMON）

> すべての領域にかかる非機能要件。5カテゴリを必ず埋める（該当なしなら理由を書く）。
> 領域固有の非機能要件は各領域のファイルに書く。ここと領域側がぶつからないようにする。
> 書き方の正典は rules.md（~/.claude/skills/product-requirements/rules.md）。

updated: 2026-10-05

## 非機能要件

| ID | カテゴリ | 要件 | 測り方 | 対応する要求 | 出典 |
|----|---------|------|-------|------------|------|
| COMMON-N-007 | 性能 | API の CPU 時間を1リクエスト 10ms 以内に収める。Workers の無料プランの上限に合わせ、API の1リクエストあたりの CPU 時間を 10ms 以内に収める。重い処理を Workers でしない | リリース前に、主な API を呼んだときの CPU 時間を Workers のダッシュボード（または `wrangler tail`）で確かめる（目安）。自動テストでは確かめない | G-1 | specs/001 |
| COMMON-N-008 | ユーザビリティ | スマホ優先で、PC でも崩れない。幅 360px のスマホの縦持ちを基準に作り、幅 1280px の PC でも崩れない（横スクロールが出ず、すべての操作ができる）。押せる部分の大きさに数値の条件は設けない（家族はみなスマホの操作に慣れているため。vision.md のペルソナの技術スキルと合わせる） | 各 spec で作る・変える画面を、幅 360px と 1280px で表示して確かめる（手動）。自動テストでは確かめない | G-1 | specs/001, specs/002 |

<!-- 1カテゴリに複数の要件があってよい。番号は通しで振り、詰めない。 -->
<!-- 受入基準（AC）を付ける要件は、表ではなく見出し形式（### COMMON-N-00n …）で下に書く。 -->

## 受入基準のある非機能要件

### COMMON-N-001 API はアクセストークンを検証し、家族として登録された人だけを通す

- **概要**: 【セキュリティ】API は、CORS の事前確認を除くすべての要求で、`Authorization: Bearer` の Supabase のアクセストークン（JWT）を検証する。Cookie は使わない。トークンが無い・形式が違う・署名が正しくない・期限切れなら 401、トークンは有効でも家族として登録されていない人なら 403 を返す。有効期限は、アクセストークンが1時間、ログイン状態（リフレッシュトークン）には期限を設けない（どちらも Supabase の既定。AUTH-F-003 の7日は下限の約束）
- **測り方**: API の自動テスト
- **受入基準**:
  - AC-1: Given `Authorization` ヘッダーが無い / When 自分の情報を問い合わせる API を呼ぶ / Then 401 が返る（出典: specs/001）
  - AC-2: Given 署名が正しくないトークン / When 同じ API を呼ぶ / Then 401 が返る（出典: specs/001）
  - AC-3: Given 期限切れのトークン / When 同じ API を呼ぶ / Then 401 が返る（出典: specs/001）
  - AC-4: Given 有効なトークンだが、家族として登録されていない利用者 / When 同じ API を呼ぶ / Then 403 が返る（出典: specs/001）
  - AC-5: Given 家族として登録された利用者の有効なトークン / When 同じ API を呼ぶ / Then 200 と本人の情報が返る（出典: specs/001）
- **対応する要求**: G-1
- **出典**: specs/001

### COMMON-N-002 権限は固定で、判定は API で行う

- **概要**: 【セキュリティ】権限は、ロール「管理者」（せいご）と、立場「親」（父・母）「料理担当」（現在は母）で表す。家族の登録時に決め、アプリの中では変えない（AUTH-F-001）。ロールや立場が要る操作の可否は API が判定し、足りなければ 403 を返す。記録ごとの可否（その記録の関係者か、どの側か）が要る機能では、それも API が判定する。関係者でなければその記録は無いものとして 404、関係者でも側が違えば 403 を返す。フロントのボタンの出し分けは見た目のためだけで、判定には使わない。各機能の spec は、どの操作にどのロール・立場・記録ごとの条件が要るかをこの仕組みで定める
- **測り方**: API の自動テスト
- **受入基準**:
  - AC-1: Given 料理担当だけに許す判定を付けたルート（テストの中だけで組み立てる）と、料理担当ではない家族（息子）のトークン / When そのルートを呼ぶ / Then 403 が返る（出典: specs/001）
  - AC-2: Given AC-1 と同じルートと、料理担当の家族（母）のトークン / When そのルートを呼ぶ / Then 403 にならずに処理される（出典: specs/001）
  - AC-3: Given 管理者だけに許す判定を付けたルート（テストの中だけで組み立てる）と、管理者ではない家族（母）のトークン / When そのルートを呼ぶ / Then 403 が返る（出典: specs/001）
  - AC-4: Given AC-3 と同じルートと、管理者（せいご）のトークン / When そのルートを呼ぶ / Then 403 にならずに処理される（出典: specs/001）
- **対応する要求**: G-1
- **出典**: specs/001, specs/002

### COMMON-N-003 Supabase の Data API から直接読み書きできない

- **概要**: 【セキュリティ】Supabase の公開キーや利用者のアクセストークンを使っても、Data API（PostgREST）経由ではアプリのデータを読むことも書くこともできない。データの読み書きはすべて Hono API を通す
- **測り方**: マイグレーションの自動テスト。あわせて、公開キーで Data API を呼んでアプリのデータを読めない・書けないことを、本番・開発の両方でリリース前に手で確かめる
- **受入基準**:
  - AC-1: Given すべてのマイグレーションを当てた DB / When public スキーマのテーブルを調べる / Then すべてのテーブルで RLS が有効で、ポリシーは1つも無い（出典: specs/001）
- **対応する要求**: G-1
- **出典**: specs/001

### COMMON-N-004 秘密情報は決めた場所にだけ置き、フロントの成果物に含めない

- **概要**: 【セキュリティ】秘密情報の置き場所を次に限る。どれもリポジトリに入れず、ローカル開発用の値は git の管理外のファイルに置く。フロントには秘密情報を渡さない。フロントに渡すのは、Supabase の URL と公開キー（`sb_publishable_`）、API の URL、Sentry の DSN（どれも公開してよい値）だけ。Supabase のキーは新しい形式（`sb_publishable_` / `sb_secret_`）だけを使い、古い形式（JWT の anon / service_role キー）は使わない
  - サービスロールキー（`sb_secret_`）：Workers の secret
  - DB の接続情報：Workers の secret（Hyperdrive を使うならその設定）。例外として、マイグレーション用は GitHub Actions の secret にも置く
  - Cloudflare の API トークン（デプロイ用）：GitHub Actions の secret
  - Google OAuth のクライアントシークレット：Supabase の管理画面（Auth の設定）
- **測り方**: 自動テストでリポジトリの追跡ファイルを検査する。あわせて CI で、フロントのビルド成果物に秘密情報の値の形（`sb_secret_` の後ろにキーの文字が続くもの、`postgres://`・`postgresql://` の後ろにユーザーとパスワードが続く接続文字列）が無いことを検査する。成果物では値の形で探すのは、ライブラリ（supabase-js）がキーの種類の見分けに `sb_secret_` の文字列そのものを持つため
- **受入基準**:
  - AC-1: Given git で追跡しているファイル（`docs/` と、検査する形を定義したファイル自身を除く） / When 秘密情報の形（`sb_secret_`、`postgres://`、`postgresql://`）を探す / Then 1件も見つからない（出典: specs/001）
- **対応する要求**: G-1
- **出典**: specs/001

### COMMON-N-005 CORS で許可するのは決めたオリジンだけ

- **概要**: 【セキュリティ】本番の API（`stylus-api`）が許可するのは、本番のフロントのオリジン（`https://stylus-family.pages.dev`）だけ。開発の API（`stylus-api-dev`）が許可するのは、Pages のプレビュー URL（`https://<任意の1階層>.stylus-family.pages.dev`）と、ローカル開発サーバーのオリジン（`http://localhost:5173`）だけ
- **測り方**: API の自動テスト（本番用・開発用の設定それぞれで）
- **受入基準**:
  - AC-1: Given 本番用の設定 / When `https://stylus-family.pages.dev` から CORS の事前確認を送る / Then `Access-Control-Allow-Origin: https://stylus-family.pages.dev` が返る（出典: specs/001）
  - AC-2: Given 本番用の設定 / When `https://example.com`、`https://stylus.pages.dev`（他人のサイト）、`http://localhost:5173`、`https://spec-001-foundation.stylus-family.pages.dev` から事前確認を送る / Then どれも許可されない（`Access-Control-Allow-Origin` が返らない）（出典: specs/001）
  - AC-3: Given 開発用の設定 / When `https://spec-001-foundation.stylus-family.pages.dev`、`https://develop.stylus-family.pages.dev`、`http://localhost:5173` から事前確認を送る / Then どれも許可される（出典: specs/001）
  - AC-4: Given 開発用の設定 / When `https://example.com` から事前確認を送る / Then 許可されない（出典: specs/001）
  - AC-5: Given 開発用の設定 / When よく似たオリジン `https://stylus-family.pages.dev.example.com`、`https://xstylus-family.pages.dev`、`https://other.pages.dev`、`http://develop.stylus-family.pages.dev`、`https://a.b.stylus-family.pages.dev` から事前確認を送る / Then どれも許可されない（出典: specs/001）
- **対応する要求**: G-1
- **出典**: specs/001

### COMMON-N-006 Supabase が休止しない

- **概要**: 【可用性】Supabase の無料プランは7日間アクセスが無いと休止するため、Workers の Cron で本番・開発の両方の Supabase に毎日1回アクセスする（手段は問わない）。アクセスに失敗したら Sentry に送る（翌日の実行で取り返せるので、その場で再試行はしない）
- **測り方**: Workers のダッシュボードで Cron が毎日成功していること、Supabase が休止していないことを運用で確かめる。Cron の処理は自動テスト
- **受入基準**:
  - AC-1: Given Cron の処理 / When 実行する / Then Supabase への問い合わせが1回送られ、成功の応答を受け取る（出典: specs/001）
  - AC-2: Given Supabase への問い合わせが失敗する / When Cron の処理を実行する / Then エラーが Sentry に1回送られる（出典: specs/001）
- **対応する要求**: G-1
- **出典**: specs/001

### COMMON-N-009 日付の区切りは日本時間に揃える

- **概要**: 【ユーザビリティ】画面・API・DB で日付を扱うときは、日本時間（UTC+9）の0時で区切る。Workers の Cron は UTC で動くので、Cron の処理でも日付は日本時間で求める。日付の求め方は `packages/` の共通のルール1つにまとめる
- **測り方**: 共通のルールの自動テスト
- **受入基準**:
  - AC-1: Given 日時 2026-10-01T15:00:00Z（日本時間 10月2日 0:00） / When 日付を求める / Then 2026-10-02 になる（出典: specs/001）
  - AC-2: Given 日時 2026-10-01T14:59:59Z（日本時間 10月1日 23:59:59） / When 日付を求める / Then 2026-10-01 になる（出典: specs/001）
- **対応する要求**: G-1
- **出典**: specs/001

### COMMON-N-010 フロントから API の実行コードを import しない。test と lint を CI で回す

- **概要**: 【保守性】`apps/web` は `apps/api` の実行コードを import しない（`import type` だけ許す）。共有するもの（型・スキーマ・ルール）は `packages/` に置く。`develop`・`main` への PR ごとに、GitHub Actions で `pnpm test` と `pnpm lint` を回す。失敗した PR はマージしない（ブランチ保護が使えないため運用で守る）
- **測り方**: lint のルールの自動テスト。PR ごとに GitHub Actions が走り、結果が PR に出ることは、最初の PR で手で確かめる
- **受入基準**:
  - AC-1: Given `apps/web` のファイルに `apps/api` の実行コードを import する行がある / When `pnpm lint` を実行する / Then エラーになる（出典: specs/001）
  - AC-2: Given `apps/web` のファイルに `apps/api` からの `import type` の行だけがある / When `pnpm lint` を実行する / Then その行ではエラーにならない（出典: specs/001）
- **対応する要求**: G-1
- **出典**: specs/001

### COMMON-N-011 予期しないエラーを Sentry で拾う

- **概要**: 【保守性】API とフロントで起きた予期しないエラー（処理で捕まえていない例外）を Sentry（無料の Developer プラン）に送る。本番と開発は分けて見られるようにする。送る内容にアクセストークンや秘密情報を含めない
- **測り方**: API の自動テスト。あわせて、開発環境でわざとエラーを起こして Sentry に届くかを手動で確かめる
- **受入基準**:
  - AC-1: Given API の処理が予期しない例外を投げる / When その API を呼ぶ / Then 500 が返り、Sentry への送信が1回行われる（出典: specs/001）
  - AC-2: Given `Authorization` ヘッダー付きの要求で予期しない例外が起きる / When Sentry に送る内容を作る / Then 内容にアクセストークンが含まれない（出典: specs/001）
- **対応する要求**: G-1
- **出典**: specs/001

## 廃止した要件

| ID | 要件名 | 廃止日 | 理由 | 出典 |
|----|-------|-------|------|------|
