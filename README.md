# Stylus

家族4人で使う Web アプリ。概要と決まりごとは [CLAUDE.md](CLAUDE.md)、文書の歩き方は [docs/README.md](docs/README.md) を見る。

## 構成

| 場所 | 中身 |
|---|---|
| `apps/web` | フロント（Vite + React、React Router、Mantine）。Cloudflare Pages に置く |
| `apps/api` | API（Hono）。Cloudflare Workers に置く |
| `packages/shared` | フロントと API で共有する型・スキーマ・ルール（`@stylus/shared`） |
| `packages/repo-checks` | リポジトリ全体の検査（テストだけ） |

## 準備（Windows）

1. Node.js 24 以上を入れる
2. corepack で pnpm を有効にする。`C:\Program Files\nodejs` に書き込めない場合は、PATH の通った自分用のフォルダーを指定する

   ```bash
   corepack enable pnpm --install-directory "%USERPROFILE%\.local\bin"
   ```

3. 依存パッケージを入れる：`pnpm install`

## よく使うコマンド

| コマンド | 中身 |
|---|---|
| `pnpm lint` | ESLint と Prettier の検査 |
| `pnpm format` | Prettier で整形する |
| `pnpm test` | 全パッケージの Vitest |
| `pnpm typecheck` | 全パッケージの型検査 |
| `pnpm --filter web dev` | フロントの開発サーバー（`http://localhost:5173`） |
| `pnpm --filter api dev` | API のローカル実行（`wrangler dev --env dev`、`http://localhost:8787`） |

## ローカルの設定ファイル

値の入ったファイルは git の管理外。例のファイル（キー名だけ）をコピーして値を入れる。

| 例のファイル | コピー先 | 中身 |
|---|---|---|
| `apps/web/.env.example` | `apps/web/.env.local` | フロントの接続先（Supabase の URL・公開キー、API の URL、Sentry の DSN） |
| `apps/api/.dev.vars.example` | `apps/api/.dev.vars` | Worker が読む secret・変数 |
| `apps/api/.env.example` | `apps/api/.env` | wrangler 自身が読む環境変数。Hyperdrive のローカル用接続文字列 `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` |

- ローカルの `wrangler dev` は Hyperdrive を通らず、`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` の接続文字列で開発用の Supabase（`stylus-dev`）に直接つなぐ。この値は `.dev.vars` ではなく `apps/api/.env` に置く（wrangler が Worker の外で読む値のため）
