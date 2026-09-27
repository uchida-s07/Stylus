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

- [ ] T-2: 外部サービスを準備し、V-1・V-2・V-3・V-5 を確かめる（管理者の手作業）
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

## 1. DB

- [ ] T-3: テスト用 DB の仕組みと `members` の表（列だけ）を作る
  - 対応: AUTH-F-001（土台）
  - 対象ファイル: `apps/api/drizzle.config.ts`、`apps/api/src/db/schema.ts`、`apps/api/drizzle/*.sql`、`apps/api/test/db.ts`（PGlite にマイグレーションを当てるヘルパー）
  - 内容: design.md「データモデル」の列を作る（主キー・既定値まで。一意・空不可・小文字・空白だけ不可の制約は T-4 で足す）。テストは PGlite に Drizzle のマイグレーションを当てて使う
  - Red: 対象外（DB 変更）
  - 完了条件: マイグレーションが PGlite に当たり、テスト全体が通る

- [ ] T-4: 家族の登録で、重複・空・大文字を拒否する
  - 対応: AUTH-F-001 / AC-2, AC-3, AC-4, AC-5
  - 対象ファイル: `apps/api/src/db/schema.ts`、`apps/api/drizzle/*.sql`（制約を足すマイグレーション）、`apps/api/src/db/members.test.ts`
  - Red: 未記録（想定：同じメールの2件目、表示名 "" と "　"、メール空、`Yuriko@example.com` の INSERT がどれも成功してしまい、件数が 1 / 0 のままにならない）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-5: public スキーマの全テーブルで RLS を有効にし、ポリシーを作らない
  - 対応: COMMON-N-003 / AC-1
  - 対象ファイル: `apps/api/drizzle/*.sql`（RLS を有効にするマイグレーション）、`apps/api/src/db/rls.test.ts`
  - Red: 未記録（想定：`pg_class.relrowsecurity` が `members` で false）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

## 2. 共有のルール

- [ ] T-6: 日本時間の日付を求める共通のルール
  - 対応: COMMON-N-009 / AC-1, AC-2
  - 対象ファイル: `packages/shared/src/date.ts`、`packages/shared/src/date.test.ts`
  - Red: 未記録（想定：素朴な形（UTC の日付を返す）で AC-1 が 2026-10-01 を返して失敗）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

## 3. API

- [ ] T-7: CORS（本番用・開発用の設定）
  - 対応: COMMON-N-005 / AC-1, AC-2, AC-3, AC-4, AC-5
  - 対象ファイル: `apps/api/src/app.ts`（アプリの組み立て。設定を受け取って作る形）、`apps/api/src/middleware/cors.ts`、`apps/api/src/middleware/cors.test.ts`、`apps/api/wrangler.toml`（許可するオリジンの設定を本番・`[env.dev]` に）
  - Red: 未記録（想定：CORS が無く、AC-1・AC-3 で `Access-Control-Allow-Origin` が返らない）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-8: アクセストークンの検証・家族の照合と `GET /me`
  - 対応: COMMON-N-001 / AC-1, AC-2, AC-3, AC-4, AC-5、AUTH-F-001 / AC-1
  - 対象ファイル: `apps/api/src/middleware/auth.ts`（JWKS による検証、`jose`）、`apps/api/src/middleware/member.ts`（`sub` → `auth_user_id` の照合）、`apps/api/src/routes/me.ts`、`packages/shared/src/schemas/me.ts`（Zod）、`apps/api/src/app.ts`（`AppType` を export）、`apps/api/test/jwt.ts`（テスト用の鍵・JWKS の差し替え）、`apps/api/src/routes/me.test.ts`
  - 内容: エラーの形は `{ error: { code, message } }`（401 `unauthenticated`、403 `not_a_member`）。JWKS は Worker のメモリで使い回す
  - Red: 未記録（想定：`GET /me` が無く 404 になり、401 / 403 / 200 と本人の情報のどれも返らない）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-9: ロール・立場の判定
  - 対応: COMMON-N-002 / AC-1, AC-2, AC-3, AC-4
  - 対象ファイル: `apps/api/src/middleware/guards.ts`（`requireAdmin()`、`requireAttribute('cook')` など）、`apps/api/src/middleware/guards.test.ts`（判定を付けたルートはテストの中だけで組み立てる）
  - Red: 未記録（想定：何もしない形の判定では、息子のトークンで料理担当ルート、母のトークンで管理者ルートが 200 になり 403 にならない）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る。本番のアプリに判定確認用のルートが含まれていない

- [ ] T-10: 予期しないエラーを 500 にして Sentry へ送る（API）
  - 対応: COMMON-N-011 / AC-1, AC-2
  - 対象ファイル: `apps/api/src/middleware/error.ts`、`apps/api/src/sentry.ts`（送信の差し替え口、送る内容から `Authorization` を消す処理）、`apps/api/src/middleware/error.test.ts`
  - 内容: 本番・開発を environment で分ける。エラーの形は 500 `internal`
  - Red: 未記録（想定：例外で 500 は返るが Sentry への送信が0回。送る内容に `Authorization` の値が残っている）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-11: Cron で毎日 Supabase に問い合わせる
  - 対応: COMMON-N-006 / AC-1, AC-2
  - 対象ファイル: `apps/api/src/scheduled.ts`、`apps/api/src/index.ts`（`fetch` と `scheduled` の export）、`apps/api/wrangler.toml`（`[triggers] crons`、本番・`[env.dev]`）、`apps/api/src/scheduled.test.ts`
  - 内容: 手段は T-2 の V-2 の結果に従う。Hyperdrive のキャッシュで DB に届かないことが無いようにする（design.md「そのほかの懸念」）
  - Red: 未記録（想定：何もしない形の処理で、問い合わせが0回。失敗時に Sentry への送信が0回）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

## 4. リポジトリ全体の検査

- [ ] T-12: `apps/web` から `apps/api` の実行コードを import したら lint で止める
  - 対応: COMMON-N-010 / AC-1, AC-2
  - 対象ファイル: `eslint.config.js`（`apps/web` への制限。`import type` は許す）、`packages/repo-checks/src/import-boundary.test.ts`、`packages/repo-checks/fixtures/*`（検査用の例）
  - Red: 未記録（想定：ルールが無く、実行コードを import する例でエラーが0件）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-13: 追跡ファイルに秘密情報の形が無いことを検査する
  - 対応: COMMON-N-004 / AC-1
  - 対象ファイル: `packages/repo-checks/src/secret-patterns.ts`（検査する形の定義。検査から除く唯一のファイル）、`packages/repo-checks/src/secrets.test.ts`
  - 内容: CI のビルド成果物の検査（T-22）も同じ定義ファイルから形を読む。`ci.yml` に形をじかに書かない（review-notes の指摘「ci.yml 自身が検査に引っかかる」への対応）
  - Red: 未記録（想定：形を含む一時ファイルを `git add` した状態で実行し、そのファイルが見つかって失敗する。確かめたら一時ファイルは消す）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

## 5. フロント

- [ ] T-14: ログイン状態によって画面を振り分ける
  - 対応: AUTH-F-002 / AC-4, AC-5
  - 対象ファイル: `apps/web/src/main.tsx`、`apps/web/src/router.tsx`（`/login`、`/`、`/auth/callback`）、`apps/web/src/auth/supabase.ts`、`apps/web/src/auth/session.tsx`、`apps/web/src/pages/LoginPage.tsx`、`apps/web/src/pages/HomePage.tsx`、`apps/web/src/router.test.tsx`、`apps/web/test/setup.ts`（supabase-js の差し替え）
  - Red: 未記録（想定：振り分けが無く、未ログインで `/` にホーム、ログイン済みで `/login` にログイン画面が出る）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

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
  - 内容: 開発に家族（少なくとも管理者）を登録（design.md「家族の登録の仕方」）→ プレビュー URL で次を確かめる
    - Google ログイン（登録済み・未登録）
    - Android の Chrome で端末のホーム画面に追加し、アドレスバーなしで開く。新しい版に切り替わる
    - standalone でログアウト → Google で再ログインしてホームに戻れる
    - 2台の端末で、片方のログアウトがもう片方に響かない
    - 公開キーで Data API を呼んで読めない・書けない（開発。本番は T-25）
    - CPU 時間が 10ms 以内（COMMON-N-007）、幅 360px・1280px と押せる大きさ 44px（COMMON-N-008）
    - 開発で API・フロントのエラーが Sentry に届く
  - Red: 対象外（手動確認）
  - 完了条件: すべての項目の結果が書かれ、問題が無い（あれば直すタスクを足す）

- [ ] T-25: 本番に出す（`/spec-close` の後でもよい）
  - 対応: design.md「移行計画」6・7
  - 対象ファイル: なし
  - 内容: `develop` を `main` にマージ → `stylus` にマイグレーション・`stylus-api` にデプロイ → 本番に家族4人を登録 → 公開キーで本番の Data API を読めない・書けないことを確かめる → 各自のスマホでログインし、ホーム画面に追加する
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
