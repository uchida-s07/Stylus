# 001 基盤 実装計画

spec: ./spec.md

<!--
並びは「DB変更 → AC ごとのサイクル」が基本。1タスクは1コミットで収まる粒度。
サイクル: 受入基準のテストを書く → 期待どおりの理由で失敗することを確かめ「Red」欄に書く → 実装 → 対象のテストとテスト全体が通る → リファクタして再び全体が通る。
テストと実装は同じコミットに入れる。Red はコンパイルエラーや import の失敗では数えない。
Red を確かめようがないタスク（DB 変更、廃止した AC のテストの削除など）は「Red: 対象外（理由）」と書く。
-->

進め方の補足：

- 「Red」欄の「未記録（想定：…）」は計画時の見込み。実装のときに、実際に実行したテストと失敗の要点で書き換える
- import の失敗を Red と数えないため、テストを書く前に関数・ミドルウェアの**中身の無い形**（何もしない・素朴な値を返す）を置いてからテストを走らせる
- 新しい依存パッケージは、入れる前に Workers で動くかを確かめる（CLAUDE.md）。`jose`・`drizzle-orm`・`postgres`（postgres.js）・Sentry の SDK は API で使う。PGlite はテスト専用（devDependencies）
- V-1〜V-3 の結果で spec を直す必要が出たら、その場で実装を止め、spec を draft に戻して `/spec-new` の流れで直す（design.md「リスクと懸念」の「要件への影響」）

## 0. 土台と検証

- [x] T-1: モノレポの雛形を作る
  - 対応: COMMON-N-010（土台）、design.md「リポジトリ構成」
  - 対象ファイル: `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、`eslint.config.js`、`.prettierrc`、`vitest.workspace.ts`（または各パッケージの `vitest.config.ts`）、`apps/web/*`（Vite + React + TypeScript、Mantine、React Router の最小構成）、`apps/api/*`（Hono、`wrangler.toml` に本番と `[env.dev]`）、`packages/shared/*`（`@stylus/shared`）、`packages/repo-checks/*`、`.gitignore`、`apps/api/.dev.vars.example`、`apps/web/.env.example`
  - 内容:
    - pnpm は corepack で有効にし、`packageManager` を固定する。スクリプトは OS に依存しない書き方にする
    - `pnpm test`（全パッケージの Vitest）と `pnpm lint`（ESLint + Prettier の検査）をルートから回せるようにする
    - `.gitignore` の `.dev.vars.*` に `!.dev.vars.example` を足す（review-notes の指摘「.dev.vars.example が無視される」への対応）
    - 例のファイルにはキー名だけを書き、値は空にする（design.md「テストの方針」）
    - ローカルの `wrangler dev` から DB へつなぐ接続文字列の渡し方（Hyperdrive のローカル用接続文字列を環境変数で渡す方式）を決め、`.dev.vars.example` と README 相当の場所にキー名だけ書く（review-notes の指摘「ローカルの Hyperdrive の接続文字列の渡し方」への対応）
  - Red: 対象外（雛形のみで振る舞いが無い）
  - 完了条件: `pnpm install`・`pnpm lint`・`pnpm test` が Windows で通る。`pnpm --filter web dev` と `pnpm --filter api dev` が起動する
  - 結果: 完了条件をすべて満たした（pnpm 12.6.0）。ローカルの Hyperdrive の接続文字列は、wrangler が読む `apps/api/.env` に `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`（バインディング名 `HYPERDRIVE`）で置く。`.dev.vars` は Worker が読む値なので使わない。`wrangler dev --env dev` でも `.env` が読まれることを確かめた。キー名は `apps/api/.env.example` と `README.md` に書いた

- [x] T-2: 外部サービスを準備し、V-1・V-2・V-3・V-5 を確かめる（管理者の手作業）
  - 対応: design.md「移行計画」1〜4、「リスクと懸念」V-1〜V-5
  - 対象ファイル: なし（Supabase・Cloudflare・GitHub・Sentry・Google Cloud の設定）。結果は design.md の「リスクと懸念」に追記する
  - 内容:
    - Supabase `stylus`・`stylus-dev`：サインアップ無効、Google ログイン有効（Google Cloud で OAuth クライアント作成）、Google 以外のログイン方法を無効、Site URL・Redirect URLs、JWT 署名鍵が ES256 か確認、古い形式の API キーを無効、Data API を無効
    - Cloudflare：Pages のプロジェクト `stylus-family` を GitHub とつなぎ、**環境変数（本番・プレビュー別）を入れる**。Workers `stylus-api`・`stylus-api-dev`、Hyperdrive の設定、Workers の secret
    - **Sentry のプロジェクトを作る**（API・フロント、本番・開発を分けて見られる形）。DSN を控える
    - GitHub の Environments（`development` / `production`）に Cloudflare の API トークンとマイグレーション用の DB 接続情報を入れる
    - （上2つの太字は review-notes の指摘「最初の準備に Pages の環境変数と Sentry が無い」への対応）
    - V-1：開発で、管理画面から（メールを送らない方法で）利用者を作り、Supabase の authorize URL から Google ログインして、同じメールの利用者に紐づくかを確かめる。**Google 以外のログイン方法を無効にした後でも、管理画面からメールアドレスで利用者を作れるか**もあわせて確かめる（review-notes の指摘への対応）。ログイン後の `app_metadata`（`provider` / `providers`）を記録する
    - V-1 がだめで代替を採るときは、オーナーに確認したうえで spec を直す。直す先は design.md に挙げたものに加え、**AUTH-F-001 の正常フロー**も含める（review-notes の指摘「直す先の一覧に AUTH-F-001 の正常フローが漏れている」への対応）
    - V-2：Data API を無効にした状態で、DB への問い合わせが休止を防ぐアクセスに数えられるかを、Supabase の公式情報で確かめる。判断がつかなければ、T-11 は第一候補（DB への `select`）で作り、公開後に運用で見る
    - V-3：Workers の無料プランで Hyperdrive から Supabase につながるかを、T-1 の API から最小の問い合わせで確かめる。だめなら Supavisor のトランザクションモード（`prepare: false`）に切り替える
    - V-5：Pages の URL が `https://stylus-family.pages.dev` になったかを確かめる
  - Red: 対象外（外部の設定と検証）
  - 完了条件: V-1・V-3・V-5 の結果（と V-2 の判断）が design.md に書かれている。spec を直す必要が無い、または直して再承認を得ている
  - 結果: V-1・V-3・V-5 は合格、V-2 は第一候補（DB への `select`）で作ると判断し、design.md の「検証の結果（T-2）」と「T-2 で決めたこと」に書いた。spec を直す必要は無い。開発側の準備（Supabase `stylus-dev`、Google の OAuth クライアント、Pages `stylus-family` と本番・プレビューの環境変数、Hyperdrive `stylus-dev`、Worker `stylus-api-dev`、Sentry `stylus-web`・`stylus-api`、GitHub の Environments と secret）は済んだ。本番側の準備はオーナーの判断で T-25 の手前に回した（T-25 の内容に足した）

## 1. DB

- [x] T-3: テスト用 DB の仕組みと `members` の表（列だけ）を作る
  - 対応: AUTH-F-001（土台）
  - 対象ファイル: `apps/api/drizzle.config.ts`、`apps/api/src/db/schema.ts`、`apps/api/drizzle/*.sql`、`apps/api/test/db.ts`（PGlite にマイグレーションを当てるヘルパー）
  - 内容: design.md「データモデル」の列を作る（主キー・既定値まで。一意・空不可・小文字・空白だけ不可の制約は T-4 で足す）。テストは PGlite に Drizzle のマイグレーションを当てて使う
  - Red: 対象外（DB 変更）
  - 完了条件: マイグレーションが PGlite に当たり、テスト全体が通る
  - 結果: 完了条件を満たした（drizzle-orm 0.45.3、drizzle-kit 0.31.11、PGlite 0.5.8）。マイグレーションは `apps/api/drizzle/0000_members.sql`、作り直しは `pnpm --filter api db:generate`。`email`・`display_name` は NULL 可のまま置き、空不可（NOT NULL と空・空白だけの禁止）は T-4 でまとめて足す。既定値を持つ `is_admin`・`is_parent`・`is_cook`・`created_at` は NOT NULL にした。ヘルパー `createTestDb()` はテストごとにメモリ上の PGlite を作ってマイグレーションを当てる。ヘルパー自体の確認に `apps/api/test/db.test.ts`（AC なし）を置いた。drizzle-orm＋postgres.js が Workers 向けにバンドルできることを `wrangler deploy --dry-run` で確かめた（約 310 KiB）。テスト・設定ファイルが Node の API を使うため `@types/node` を足し、`apps/api/tsconfig.json` の対象に `test` と `drizzle.config.ts` を加えた。drizzle-kit が生成する `drizzle/meta/` は Prettier の対象から外した

- [x] T-4: 家族の登録で、重複・空・大文字を拒否する
  - 対応: AUTH-F-001 / AC-2, AC-3, AC-4, AC-5
  - 対象ファイル: `apps/api/src/db/schema.ts`、`apps/api/drizzle/*.sql`（制約を足すマイグレーション）、`apps/api/src/db/members.test.ts`
  - Red: `pnpm exec vitest run apps/api/src/db/members.test.ts` で 8件失敗（AC-2・AC-3（""・"　"・NULL）・AC-4（""・NULL）・AC-5 と `auth_user_id` の重複）。どれも「登録が拒否されなかった: expected undefined to be defined」で、制約が無く INSERT が成功してしまうため。正しい登録の1件だけ通った
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る
  - 結果: 完了条件を満たした。マイグレーション `0001_members_constraints.sql` で、`email`・`display_name` の NOT NULL、`email`・`auth_user_id` の一意、`email` の空禁止と小文字だけ、`display_name` の空白だけ禁止を足した。空白の判定は、ロケール次第で全角空白が `[[:space:]]` に入らないため、`btrim` で除く文字（半角空白・タブ・改行・全角空白 U+3000）を明示した。テストは拒否の理由まで確かめるため SQLSTATE（23502 / 23505 / 23514）を見る。NULL の登録は型で書けないので、管理者が SQL を手で書く場合を想定して生の SQL で入れる。`auth_user_id` の一意（design.md の制約、AC なし）もタグなしのテストで確かめた

- [x] T-5: public スキーマの全テーブルで RLS を有効にし、ポリシーを作らない
  - 対応: COMMON-N-003 / AC-1
  - 対象ファイル: `apps/api/drizzle/*.sql`（RLS を有効にするマイグレーション）、`apps/api/src/db/rls.test.ts`
  - Red: `pnpm exec vitest run apps/api/src/db/rls.test.ts` で失敗。「expected [ 'members' ] to deeply equal []」（RLS が無効のテーブルとして `members` が挙がった。`pg_class.relrowsecurity` が false）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る
  - 結果: 完了条件を満たした。`schema.ts` の `members` に Drizzle の `.enableRLS()` を付け、drizzle-kit でマイグレーション `0002_members_rls.sql`（`ENABLE ROW LEVEL SECURITY`）を作った。今後のテーブルも schema 側で `.enableRLS()` を付ける（付け忘れはこのテストが止める）。テストは、調べる対象が空で素通りしないように `members` が含まれることも確かめる。`FORCE ROW LEVEL SECURITY` は付けない（API はテーブルの持ち主のロールでつなぐので RLS を受けず、ポリシーなしでも読み書きできる）

## 2. 共有のルール

- [x] T-6: 日本時間の日付を求める共通のルール
  - 対応: COMMON-N-009 / AC-1, AC-2
  - 対象ファイル: `packages/shared/src/date.ts`、`packages/shared/src/date.test.ts`
  - Red: 素朴な形（`toISOString()` の UTC の日付を返す）を置いて `pnpm exec vitest run packages/shared/src/date.test.ts` で AC-1 が失敗。「expected '2026-10-01' to be '2026-10-02'」。AC-2 は UTC でも 10月1日のため素朴な形でも通った
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る
  - 結果: 完了条件を満たした。`toJstDate(instant: Date): string`（`YYYY-MM-DD`）を `@stylus/shared` から export した。日本時間は夏時間が無いので、Intl を使わず UTC に 9 時間足して求める（Workers の CPU 時間を節約）。AC のほかに、年・月をまたぐ境界をタグなしのテストで確かめた

## 3. API

- [x] T-7: CORS（本番用・開発用の設定）
  - 対応: COMMON-N-005 / AC-1, AC-2, AC-3, AC-4, AC-5
  - 対象ファイル: `apps/api/src/app.ts`（アプリの組み立て。設定を受け取って作る形）、`apps/api/src/middleware/cors.ts`、`apps/api/src/middleware/cors.test.ts`、`apps/api/wrangler.toml`（許可するオリジンの設定を本番・`[env.dev]` に）
  - Red: 何もしない形の `corsMiddleware` を置いて `pnpm exec vitest run apps/api/src/middleware/cors.test.ts` で 4件失敗（AC-1 と AC-3 の3オリジン）。どれも「expected null to be '<オリジン>'」で、`Access-Control-Allow-Origin` が返らない。許可しない側（AC-2・AC-4・AC-5）は何もしない形でも通った
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る
  - 結果: 完了条件を満たした。許可するオリジンは `wrangler.toml` の vars `CORS_ALLOWED_ORIGINS`（配列）に本番用と `[env.dev.vars]` 用を分けて書いた。書き方は完全一致で、`*` はサブドメイン1階層（英小文字・数字・ハイフン）だけに当たる。判定は Hono の `cors` に関数で渡し、許可しないオリジンには `Access-Control-Allow-Origin` を付けない。`createApp(config)` で組み立て、`index.ts` は最初の要求で env から設定を作ってアプリを使い回す。テストは wrangler の `unstable_readConfig` で実際の `wrangler.toml`（本番・`dev`）を読み、そこからアプリを組み立てる（設定の書き間違いもテストで止まる。名前に unstable が付く API なので、wrangler を上げて壊れたら TOML を直接読む形に替える）。ほかに、許可するヘッダーを `Authorization`・`Content-Type`、メソッドを GET・POST・PUT・PATCH・DELETE、事前確認の結果をブラウザに 600 秒覚えさせる設定にした（`Authorization` の許可と、事前確認でない要求にも付くことはタグなしのテストで確かめた）。ローカルの `wrangler dev --env dev` でも、localhost とプレビューは許可、`https://example.com` は許可しないことを確かめた

- [x] T-8: アクセストークンの検証・家族の照合と `GET /me`
  - 対応: COMMON-N-001 / AC-1, AC-2, AC-3, AC-4, AC-5、AUTH-F-001 / AC-1
  - 対象ファイル: `apps/api/src/middleware/auth.ts`（JWKS による検証、`jose`）、`apps/api/src/middleware/member.ts`（`sub` → `auth_user_id` の照合）、`apps/api/src/routes/me.ts`、`packages/shared/src/schemas/me.ts`（Zod）、`apps/api/src/app.ts`（`AppType` を export）、`apps/api/test/jwt.ts`（テスト用の鍵・JWKS の差し替え）、`apps/api/src/routes/me.test.ts`
  - 内容: エラーの形は `{ error: { code, message } }`（401 `unauthenticated`、403 `not_a_member`）。JWKS は Worker のメモリで使い回す
  - Red: CORS だけを付けたアプリと何も確かめない `createTokenVerifier` を置いて `pnpm exec vitest run apps/api/src/routes/me.test.ts` で 14件すべて失敗。AC の6件（COMMON-N-001/AC-1〜5、AUTH-F-001/AC-1）はどれも「expected 404 to be 401 / 403 / 200」で、`GET /me` が無いため。AUTH-F-001/AC-1 は最初、404 の本文を JSON として読んで SyntaxError で落ちたので、先に状態コードを確かめる形に直して「expected 404 to be 200」を確かめ直した
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る
  - 結果: 完了条件を満たした（jose 6.2.12、zod 4.6.5）。ミドルウェアは CORS → トークンの検証 → DB を開く → 家族の照合 → `/me` の順で、トークンが無効な要求では DB を開かない（タグなしのテストで確かめた）。トークンの検証は `jwtVerify` で、署名（JWKS）と期限に加えて、発行元（`<SUPABASE_URL>/auth/v1`）・宛先（`authenticated`）・アルゴリズム（ES256 だけ）・`sub` が UUID の形であることを確かめる（開発の Supabase の JWKS と OpenID の設定で、ES256 と発行元の形を確かめた）。JWKS を取りに行けないなど、トークンのせいでない失敗は 401 にせず投げ直す（T-10 で 500 と Sentry）。DB は要求ごとに postgres.js（`max: 5`、`fetch_types: false`）で開き、応答の後に `waitUntil` で閉じる。テストでは PGlite を渡す。エラーの形の Zod スキーマ（`apiErrorSchema`）も `@stylus/shared` に置いた。`wrangler.toml` の `[env.dev.vars]` に `SUPABASE_URL`（stylus-dev）を入れた。本番の値は T-25 で入れる（T-25 の内容に足した）。`AppType` で `hc<AppType>` から `/me` の応答の型が引けることを確かめた。ローカルの `wrangler dev --env dev` で、トークンなしと、本物の kid を名乗る偽の署名がどちらも 401 になること（本物の JWKS を取りに行って検証した）を確かめた。登録済みの本人のトークンでの確認は T-24 で行う

- [x] T-9: ロール・立場の判定
  - 対応: COMMON-N-002 / AC-1, AC-2, AC-3, AC-4
  - 対象ファイル: `apps/api/src/middleware/guards.ts`（`requireAdmin()`、`requireAttribute('cook')` など）、`apps/api/src/middleware/guards.test.ts`（判定を付けたルートはテストの中だけで組み立てる）
  - Red: 何もしない形の `requireAdmin()`・`requireAttribute()` を置いて `pnpm exec vitest run apps/api/src/middleware/guards.test.ts` で失敗。AC-1（息子のトークンで料理担当ルート）と AC-3（母のトークンで管理者ルート）がどちらも「expected 200 to be 403」。AC-2・AC-4 は何もしない形でも通った（ほかにタグなしの「親だけ」のテストで、せいご・息子が 200 になって失敗）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る。本番のアプリに判定確認用のルートが含まれていない
  - 結果: 完了条件を満たした。`requireAdmin()` と `requireAttribute('parent' | 'cook')` は家族の照合の後ろで `c.var.member` を見て、足りなければ 403 `forbidden` を返す。判定を付けたルートはテストの中で `createTestApp()` のアプリ（本番と同じ組み立て）に足した。`createApp()` のルートに判定確認用のパスが無く `/me` があることをタグなしのテストで確かめた。立場「親」（父・母は 200、せいご・息子は 403）もタグなしのテストで確かめた

- [x] T-10: 予期しないエラーを 500 にして Sentry へ送る（API）
  - 対応: COMMON-N-011 / AC-1, AC-2
  - 対象ファイル: `apps/api/src/middleware/error.ts`、`apps/api/src/sentry.ts`（送信の差し替え口、送る内容から `Authorization` を消す処理）、`apps/api/src/middleware/error.test.ts`
  - 内容: 本番・開発を environment で分ける。エラーの形は 500 `internal`
  - Red: `pnpm exec vitest run apps/api/src/middleware/error.test.ts` で確かめた。AC-1：`onError` の無い形で「expected [] to have a length of 1 but got +0」（Hono の既定の 500 は返るが、Sentry への送信が0回）。AC-2：送る前の処理（`beforeSend`）を何もしない形（受け取った内容をそのまま返す）にして、トークン入りの内容を渡すと「expected '{"request":…' not to contain 'eyJhbGciOiJFUzI1NiIs…'」（トークンが残る）。AC-2 のもう1つのテスト（本物の SDK を通して実際に送る内容を見る）は、何もしない形でも通った。SDK 11 が既定で `Authorization` と `Cookie` の値を `[Filtered]` にするため（ただし `cookies` の中身は送っていた）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る
  - 結果: 完了条件を満たした（@sentry/cloudflare 11.0.0）。Worker の入り口は `createWorker()` で組み立てて `withSentry` で包む（T-11 の scheduled も同じ仕組みで包まれる）。捕まえていない例外は Hono の `onError` で 500 `internal` にして `reportError`（本番は `captureException`）で送る。Hono の `HTTPException` はそのまま返す。送る前の処理 `scrubEvent` で、要求のヘッダーの `Authorization`・`Cookie` とクッキーを消す。SDK 11 は既定で要求の本文や DB の値まで集めるので、`dataCollection` で、利用者情報・クッキー・本文・応答のヘッダー・DB の値を集めない設定にした（要求のヘッダーは `Authorization`・`Cookie` 以外を集める）。テストは送信口（transport）を差し替えて、本物の SDK が送る直前の中身を受け止めて調べる。SDK は client をプロセスに1つだけ持つので、テストでは Worker と送信口を使い回し、例外の文言をテストごとに変える（同じ例外が続くと重複として落とされる）。500 の応答にも CORS のヘッダーが付くこと（フロントが 500 と通信エラーを見分けるため）はタグなしのテストで確かめた。本番・開発は vars `SENTRY_ENVIRONMENT`（`production` / `development`）で分ける。DSN は T-1 の `.dev.vars.example` のとおり Worker の secret `SENTRY_DSN` から読み、無ければ送らない（T-24 の前に開発の Worker に入れる。T-24 の内容に足した）。バンドルは約 923 KiB（gzip 197 KiB）になった。ローカルの `wrangler dev --env dev` で 401 と CORS のヘッダーが変わらず返ることを確かめた

- [x] T-11: Cron で毎日 Supabase に問い合わせる
  - 対応: COMMON-N-006 / AC-1, AC-2
  - 対象ファイル: `apps/api/src/scheduled.ts`、`apps/api/src/index.ts`（`fetch` と `scheduled` の export）、`apps/api/wrangler.toml`（`[triggers] crons`、本番・`[env.dev]`）、`apps/api/src/scheduled.test.ts`
  - 内容: 手段は T-2 の V-2 の結果に従う。Hyperdrive のキャッシュで DB に届かないことが無いようにする（design.md「そのほかの懸念」）
  - Red: 何もしない形の `keepAlive()` を置いて `pnpm exec vitest run apps/api/src/scheduled.test.ts` で失敗。AC-1「expected [] to have a length of 1 but got +0」（問い合わせが0回）、AC-2「expected [] to have a length of 1 but got +0」（Sentry への送信が0回）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る
  - 結果: 完了条件を満たした。V-2 の判断のとおり、`keepAlive()` が DB に `select 1` を1回投げて接続を閉じる（失敗しても閉じる）。失敗したら例外をそのまま投げ、`withSentry` が Sentry に送る（再試行はしない）。Worker の `scheduled` は `createWorker()` に足し、DB の開き方は fetch と同じ設定（`openDb`）を使う。Cron は `wrangler.toml` の本番・`[env.dev]` の両方に `0 19 * * *`（UTC。日本時間の毎朝 4:00）。テストは本物の Sentry の SDK で包んだ Worker の `scheduled` を呼び、PGlite に届いた問い合わせの数（`createTestDb` の `onQuery`）と、Sentry へ送る直前の中身を数える。両方の環境に毎日1回の Cron があることはタグなしのテストで確かめた。ローカルの `wrangler dev --env dev --test-scheduled` で `/cdn-cgi/handler/scheduled` を呼び、`select 1` を投げに行くこと（ダミーの接続先なので失敗して例外になる）を確かめた。本物の DB での成功は T-24 で確かめる（T-24 に足した）。なお、この確認の途中で、T-7〜T-10 の確認で起動した `wrangler dev` が止まらずに残っていたことに気づいたので止め、サーバー1つで T-7（CORS）・T-8（トークンなしと偽の署名で 401）の確認をやり直して同じ結果を得た

## 4. リポジトリ全体の検査

- [x] T-12: `apps/web` から `apps/api` の実行コードを import したら lint で止める
  - 対応: COMMON-N-010 / AC-1, AC-2
  - 対象ファイル: `eslint.config.js`（`apps/web` への制限。`import type` は許す）、`packages/repo-checks/src/import-boundary.test.ts`、`packages/repo-checks/fixtures/*`（検査用の例）
  - Red: 何もしない形のルール（報告しない）を `eslint.config.js` につないで `pnpm exec vitest run packages/repo-checks/src/import-boundary.test.ts` で失敗。AC-1 の2件（相対パス・パッケージ名）が「expected [] to have a length of 1 but got +0」（エラーが0件）。AC-2 は何もしない形でも通った（`import type` の例が、ほかのルールも含めてエラー0件であることもここで確かめた）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る
  - 結果: 完了条件を満たした。新しいプラグインは入れず、ESLint のルール `packages/repo-checks/eslint/no-api-runtime-import.js` を自作して `eslint.config.js` で `apps/web/**/*.{ts,tsx}` に付けた（`stylus/no-api-runtime-import`）。相対パスは文字列ではなく解決した先が `apps/api` の中かで判定する（T-15 で作る `apps/web/src/api/` を誤って止めないため）。パッケージ名 `api`（`apps/api/package.json` の name）とその下も止める。許すのは `import type { … }`・`export type { … }`・`typeof import(…)` だけで、`import { type X }` は止める（`verbatimModuleSyntax` では JS に読み込みが残るため）。読み込みだけの import・再 export・動的 import も止める。テストはリポジトリの `eslint.config.js` を ESLint の API で読み、`apps/web` の中のファイルとしてコードを検査する（`packages/repo-checks/fixtures/*` は使わなかった）。あわせて、一時ファイルを `apps/web/src` に置いて `pnpm lint` そのものでも、実行コードの import の行だけがエラーになることを確かめ、一時ファイルは消した。`packages/repo-checks` に `eslint` と `@types/node` を足した

- [x] T-13: 追跡ファイルに秘密情報の形が無いことを検査する
  - 対応: COMMON-N-004 / AC-1
  - 対象ファイル: `packages/repo-checks/src/secret-patterns.ts`（検査する形の定義。検査から除く唯一のファイル）、`packages/repo-checks/src/secrets.test.ts`
  - 内容: CI のビルド成果物の検査（T-22）も同じ定義ファイルから形を読む。`ci.yml` に形をじかに書かない（review-notes の指摘「ci.yml 自身が検査に引っかかる」への対応）
  - Red: 何もしない形の `findSecretPatterns()`（何も返さない）では、形の見つけ方のテスト（タグなし）が「expected [] to deeply equal [ 'sb_secret_' ]」などで失敗。見つける処理を入れた後、形（`postgresql://` の接続文字列）を含む一時ファイル `tmp-secret-check.txt` を `git add` した状態で `pnpm exec vitest run packages/repo-checks/src/secrets.test.ts` を実行し、AC-1 が「expected [ Array(1) ] to deeply equal []」（`tmp-secret-check.txt: postgresql://` が見つかった）で失敗することを確かめた。一時ファイルは索引からも作業ツリーからも消した
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る
  - 結果: 完了条件を満たした。形は `packages/repo-checks/src/secret-patterns.ts` の `SECRET_PATTERNS` だけに書き、検査は `findSecretPatterns()`（大文字・小文字を区別しない）で行う（T-22 も同じものを使う）。テストは `git ls-files` の追跡ファイルから `docs/` と定義ファイル自身を除き、1 バイト 1 文字で読んで探す（バイナリも調べられる）。調べる対象が空で素通りしないように `package.json` が含まれることも確かめる。途中で、テストファイル自身に形を大文字でじかに書いていて、追跡すると AC-1 に引っかかることに気づき、定義から組み立てる形に直した（ファイルを `git add` した状態で通ることを確かめた）。今後のテストでも、形は定義から組み立てて書く

## 5. フロント

- [x] T-14: ログイン状態によって画面を振り分ける
  - 対応: AUTH-F-002 / AC-4, AC-5
  - 対象ファイル: `apps/web/src/main.tsx`、`apps/web/src/router.tsx`（`/login`、`/`、`/auth/callback`）、`apps/web/src/auth/supabase.ts`、`apps/web/src/auth/session.tsx`、`apps/web/src/pages/LoginPage.tsx`、`apps/web/src/pages/HomePage.tsx`、`apps/web/src/router.test.tsx`、`apps/web/test/setup.ts`（supabase-js の差し替え）
  - Red: 振り分けの無いルート（3つの画面を並べただけ）で `pnpm exec vitest run apps/web/src/router.test.tsx` を実行して失敗。AC-4「Unable to find role="main" and name "ログイン"」（未ログインで `/` にホームが出た）、AC-5「Unable to find role="main" and name "ホーム"」（ログイン済みで `/login` にログイン画面が出た）。振り分けが無くても正しい組み合わせ（未ログインで `/login`、ログイン済みで `/`）のタグなしのテストは通り、テストの環境が動いていることを確かめた
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る
  - 結果: 完了条件を満たした（@supabase/supabase-js 2.117.2。テストに @testing-library/react・jest-dom・user-event と jsdom）。`RequireSignedIn`・`RedirectIfSignedIn`（`src/auth/guards.tsx`）でルートを包み、端末のセッションを読み終えるまでは読み込み中を出す（ログイン画面が一瞬出ないことをタグなしのテストで確かめた）。ログイン状態は supabase-js の `onAuthStateChange` の最初の通知（`INITIAL_SESSION`）から取る（`SessionProvider`）。画面全体の組み立ては `src/app/AppRoot.tsx` にまとめ、`main.tsx` とテスト（`test/render.tsx`、メモリ上のルーター）で同じものを使う。supabase-js は `test/setup.ts` で `test/fakeSupabase.ts` の偽物に差し替える。Mantine が使う `matchMedia`・`ResizeObserver` は setup で補った。画面はそれぞれ `<main>` に名前（「ログイン」「ホーム」）を付けて見分ける。ログイン画面の「Google でログイン」ボタンは置いただけで、押したときの動きは T-15。`/auth/callback` は読み込み中を出すだけの形（中身は T-15）。環境変数の型は `src/vite-env.d.ts`。本番用ビルドも通った（JS 585 kB・gzip 170 kB で 500 kB 超えの注意が出るが、大半が Mantine と supabase-js で、T-20 で端末に保存するので分割はしない）

- [ ] T-15: Google でログインしてホームに表示名を出す
  - 対応: AUTH-F-002 / AC-1
  - 対象ファイル: `apps/web/src/api/client.ts`（Hono RPC の `hc<AppType>`、`import type` のみ、`Authorization: Bearer` を付ける）、`apps/web/src/pages/LoginPage.tsx`（「Google でログイン」）、`apps/web/src/pages/AuthCallbackPage.tsx`、`apps/web/src/pages/HomePage.tsx`、`apps/web/src/pages/login-flow.test.tsx`
  - Red: 未記録（想定：ホームが `GET /me` を呼ばず「母」が表示されない）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-16: ログインの失敗・未登録・キャンセルの扱い
  - 対応: AUTH-F-002 / AC-2, AC-3, AC-6, AC-7
  - 対象ファイル: `apps/web/src/pages/AuthCallbackPage.tsx`、`apps/web/src/pages/LoginPage.tsx`、`apps/web/src/auth/errors.ts`（戻り先のエラーの読み分け：`signup_disabled` 等・403 `not_a_member` → 未登録、`access_denied` → 何も出さない、それ以外 → 失敗）、`apps/web/src/pages/login-errors.test.tsx`
  - Red: 未記録（想定：エラー付きで戻ってもメッセージが出ない／セッションが残り、開き直すとログイン画面にならない）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-17: ログインしたまま使い続けられる
  - 対応: AUTH-F-003 / AC-1, AC-2, AC-4, AC-5
  - 対象ファイル: `apps/web/src/auth/session.tsx`、`apps/web/src/api/client.ts`（401 のときに1回だけ更新して送り直す）、`apps/web/src/auth/session.test.tsx`、`apps/web/src/api/client.test.ts`
  - 内容: 401 を受けたときの分かれ道（更新が無効で失敗 → ログイン画面、通信エラー → 通信できない表示、送り直しても 401 → 読み込み失敗の表示）は単体テストで確かめる（review-notes の「401 の経路は単体テストで確かめる」）
  - Red: 未記録（想定：期限切れのセッションの更新を待たずに判定してログイン画面を出す／無効なログイン状態でもホームを出す）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-18: 通信できない・読み込めない・登録から外されたときの表示
  - 対応: AUTH-F-003 / AC-3, AC-6, AC-7、APP-F-001 / AC-3
  - 対象ファイル: `apps/web/src/components/ErrorScreen.tsx`（「通信できません。…」「うまく読み込めませんでした。…」）、`apps/web/src/auth/session.tsx`、`apps/web/src/pages/HomePage.tsx`、`apps/web/src/pages/error-states.test.tsx`
  - 内容: セッションを消すのは、ログアウト・Supabase が無効と返したとき・API が 403 `not_a_member` を返したときだけ（design.md「フロント」）
  - Red: 未記録（想定：ネットワークエラー・500 でメッセージが出ない、または端末のセッションが消える。403 で未登録のメッセージが出ない）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-19: ログアウト
  - 対応: AUTH-F-004 / AC-1, AC-2, AC-3, AC-4
  - 対象ファイル: `apps/web/src/pages/HomePage.tsx`（「ログアウト」ボタン）、`apps/web/src/components/LogoutConfirm.tsx`（Mantine のダイアログ）、`apps/web/src/auth/logout.ts`（`signOut({ scope: 'local' })`、失敗時は保存領域のセッションを自分で消す）、`apps/web/src/pages/logout.test.tsx`
  - Red: 未記録（想定：確認で「ログアウト」を選んでもログイン画面にならない／通信エラー時にセッションが残る／`scope: 'local'` 以外で呼んでいる）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-20: PWA のマニフェストと Service Worker
  - 対応: APP-F-001 / AC-1, AC-2
  - 対象ファイル: `apps/web/vite.config.ts`（vite-plugin-pwa。使っている最中には切り替えず次に開いたときに新しい版を使う設定）、`apps/web/public/icons/icon-192.png`・`icon-512.png`、`apps/web/src/pwa/build-output.test.ts`（本番用ビルドを一時ディレクトリに出して調べる）
  - Red: 未記録（想定：プラグインが無く、ビルド結果にマニフェストと Service Worker が無い）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-21: フロントの予期しないエラーを Sentry へ送る
  - 対応: COMMON-N-011（フロント側。AC は API 側だけ）
  - 対象ファイル: `apps/web/src/sentry.ts`、`apps/web/src/main.tsx`
  - 内容: DSN は Pages の環境変数から渡す。本番・開発を environment で分ける。送る内容にアクセストークンを含めない
  - Red: 対象外（AC が無い。開発環境でわざとエラーを起こして届くことを T-24 で手で確かめる）
  - 完了条件: テスト全体と lint が通る

## 6. CI・デプロイ

- [ ] T-22: PR ごとの CI
  - 対応: COMMON-N-010（CI）、COMMON-N-004（ビルド成果物の検査）
  - 対象ファイル: `.github/workflows/ci.yml`、`packages/repo-checks/src/scan-build.ts`（ビルド成果物を T-13 の定義で検査するスクリプト）
  - 内容: `develop`・`main` への PR で `pnpm lint`、`pnpm test`、フロントのビルドと成果物の検査
  - Red: 対象外（CI の設定）
  - 完了条件: この spec の PR で CI が走り、結果が PR に出る

- [ ] T-23: マイグレーションと API のデプロイ
  - 対応: design.md「デプロイ」
  - 対象ファイル: `.github/workflows/deploy-api.yml`
  - 内容: `develop` への push で `stylus-dev` へマイグレーション → `stylus-api-dev` へ `wrangler deploy`。`main` への push で本番。`workflow_dispatch` で `spec/*` から開発にだけ流せる（本番には流せない）。Environments `development` / `production` の secret を使う。マイグレーションは Supavisor のセッションモードの接続文字列で流す
  - Red: 対象外（デプロイの設定）
  - 完了条件: `spec/001-foundation` から手動実行して、`stylus-dev` にマイグレーションが当たり、`stylus-api-dev` がデプロイされる

## 7. 通しの確認

- [ ] T-24: 開発環境で家族を登録し、手で確かめる
  - 対応: design.md「移行計画」5、「テストの方針」の手で確かめるもの、COMMON-N-003 / COMMON-N-007 / COMMON-N-008 の測り方
  - 対象ファイル: なし（結果は tasks.md のこの欄に書く）
  - 内容: 開発の Worker に Sentry の DSN を入れる（`wrangler secret put SENTRY_DSN --env dev`。T-10 で足した）→ 開発に家族（少なくとも管理者）を登録（design.md「家族の登録の仕方」）→ プレビュー URL で次を確かめる
    - Google ログイン（登録済み・未登録）
    - Android の Chrome で端末のホーム画面に追加し、アドレスバーなしで開く。新しい版に切り替わる
    - standalone でログアウト → Google で再ログインしてホームに戻れる
    - 2台の端末で、片方のログアウトがもう片方に響かない
    - 公開キーで Data API を呼んで読めない・書けない（開発。本番は T-25）
    - CPU 時間が 10ms 以内（COMMON-N-007）、幅 360px・1280px と押せる大きさ 44px（COMMON-N-008）
    - 開発で API・フロントのエラーが Sentry に届く
    - 開発の Cron が毎日成功している（Workers のダッシュボードの Cron の履歴。T-11 で足した）
  - Red: 対象外（手動確認）
  - 完了条件: すべての項目の結果が書かれ、問題が無い（あれば直すタスクを足す）

- [ ] T-25: 本番に出す（`/spec-close` の後でもよい）
  - 対応: design.md「移行計画」6・7
  - 対象ファイル: なし
  - 内容: 先に、T-2 で後回しにした本番側の準備をする（Supabase `stylus` を Tokyo で作り、Auth・API キー・Data API を開発と同じに設定する。Site URL・Redirect URLs は `https://stylus-family.pages.dev`。本番用の Google の OAuth クライアントを作り、同意画面を「テスト中」のまま使うか公開するかを決める。Hyperdrive の本番の設定（キャッシュ無効）を作って `wrangler.toml` の本番に入れる。本番の Supabase の URL を `wrangler.toml` の本番の vars `SUPABASE_URL` に入れる（T-8 で開発だけ入れた）。Pages の本番の環境変数 `VITE_SUPABASE_URL`・`VITE_SUPABASE_PUBLISHABLE_KEY`・`VITE_API_URL` と、GitHub の Environment `production` の `DATABASE_URL` を入れる）→ `develop` を `main` にマージ → `stylus` にマイグレーション・`stylus-api` にデプロイ → 本番に家族4人を登録 → 公開キーで本番の Data API を読めない・書けないことを確かめる → 各自のスマホでログインし、ホーム画面に追加する
  - Red: 対象外（手作業）
  - 完了条件: 家族4人が本番にログインでき、端末のホーム画面から開ける

## AC カバレッジ

| AC | タスク |
|----|-------|
| AUTH-F-001/AC-1 | T-8 |
| AUTH-F-001/AC-2 | T-4 |
| AUTH-F-001/AC-3 | T-4 |
| AUTH-F-001/AC-4 | T-4 |
| AUTH-F-001/AC-5 | T-4 |
| AUTH-F-002/AC-1 | T-15 |
| AUTH-F-002/AC-2 | T-16 |
| AUTH-F-002/AC-3 | T-16 |
| AUTH-F-002/AC-4 | T-14 |
| AUTH-F-002/AC-5 | T-14 |
| AUTH-F-002/AC-6 | T-16 |
| AUTH-F-002/AC-7 | T-16 |
| AUTH-F-003/AC-1 | T-17 |
| AUTH-F-003/AC-2 | T-17 |
| AUTH-F-003/AC-3 | T-18 |
| AUTH-F-003/AC-4 | T-17 |
| AUTH-F-003/AC-5 | T-17 |
| AUTH-F-003/AC-6 | T-18 |
| AUTH-F-003/AC-7 | T-18 |
| AUTH-F-004/AC-1 | T-19 |
| AUTH-F-004/AC-2 | T-19 |
| AUTH-F-004/AC-3 | T-19 |
| AUTH-F-004/AC-4 | T-19 |
| APP-F-001/AC-1 | T-20 |
| APP-F-001/AC-2 | T-20 |
| APP-F-001/AC-3 | T-18 |
| COMMON-N-001/AC-1 | T-8 |
| COMMON-N-001/AC-2 | T-8 |
| COMMON-N-001/AC-3 | T-8 |
| COMMON-N-001/AC-4 | T-8 |
| COMMON-N-001/AC-5 | T-8 |
| COMMON-N-002/AC-1 | T-9 |
| COMMON-N-002/AC-2 | T-9 |
| COMMON-N-002/AC-3 | T-9 |
| COMMON-N-002/AC-4 | T-9 |
| COMMON-N-003/AC-1 | T-5 |
| COMMON-N-004/AC-1 | T-13 |
| COMMON-N-005/AC-1 | T-7 |
| COMMON-N-005/AC-2 | T-7 |
| COMMON-N-005/AC-3 | T-7 |
| COMMON-N-005/AC-4 | T-7 |
| COMMON-N-005/AC-5 | T-7 |
| COMMON-N-006/AC-1 | T-11 |
| COMMON-N-006/AC-2 | T-11 |
| COMMON-N-009/AC-1 | T-6 |
| COMMON-N-009/AC-2 | T-6 |
| COMMON-N-010/AC-1 | T-12 |
| COMMON-N-010/AC-2 | T-12 |
| COMMON-N-011/AC-1 | T-10 |
| COMMON-N-011/AC-2 | T-10 |

COMMON-N-007・COMMON-N-008 は自動テストの AC を持たない（spec のとおり手で確かめる）。T-24 で扱う。

## 影響を受ける既存テスト

なし（既存のコード・テストが無い。この spec の要件はすべて新規）

| テスト | 理由（要件の変更・廃止 など） | 対応タスク |
|-------|---------------------------|----------|
