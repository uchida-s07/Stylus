# ADR-0006: API から DB へは Hyperdrive でつなぐ

- 状態: 採用
- 日付: 2026-09-27
- 関連する spec: specs/001-foundation
- 置き換えた ADR: —
- 置き換えられた ADR: —

## 背景

API（Cloudflare Workers）から Supabase Postgres へつなぐ方法を決める必要があった。Workers はリクエストごとに動くので、毎回 DB へ新しく接続すると遅く、DB 側の接続数も増える。Supabase の直接接続は IPv6 だけで、IPv4 で使うには Supavisor（Supabase の接続プーラー）を通す。設計の段階では Hyperdrive を第一候補とし、Workers の無料プランで使えるかは実物で確かめることにしていた（V-3）。

## 決定

- API は Hyperdrive を通して DB につなぐ。Hyperdrive の接続先は Supavisor のセッションモード（IPv4、ポート 5432）
- ドライバーは postgres.js（`nodejs_compat`）。リクエストごとに Hyperdrive 経由で接続して閉じる
- Hyperdrive のクエリのキャッシュは無効にする（2026-09-27 オーナー決定）
- DB の接続情報は Hyperdrive の設定に置き、Worker には Hyperdrive の ID だけを書く。Hyperdrive の設定は本番・開発で分ける（開発 `stylus-dev` は作成済み、本番は本番の準備（T-25）で作る）
- マイグレーション（GitHub Actions）も Supavisor のセッションモードの接続文字列で流す
- 実物での確認（V-3、2026-09-27）：Workers Free の `stylus-api-dev` から Hyperdrive 経由で `select 1` を3回投げ、すべて成功した（20〜70ms）。キャッシュが効いていないことも確かめた

## 検討した代替案

| 案 | 採らなかった理由 |
|----|----------------|
| Workers から Supavisor のトランザクションモードへ直接つなぐ（`prepare: false`） | V-3 がうまくいかなかったときの代替だった。V-3 が合格したので不要。この案では接続文字列を Workers の secret に置くことになる |
| Hyperdrive から Supabase へ直接接続する（Cloudflare の手順が勧める形） | Supabase の直接接続は IPv6 だけのため |
| Hyperdrive のキャッシュを有効のまま使う（既定） | Cron の問い合わせがキャッシュで返ると DB に届かず、Supabase の休止を防げない。書き込んだ直後の読み取りで古い結果が返ることもある。家族4人の規模ではキャッシュの効果が小さい |

## 結果（トレードオフ）

- 良くなること: 接続の使い回しを Hyperdrive に任せられ、無料で使える。DB の接続情報を Worker の secret に置かずに済む
- 悪くなること・受け入れたリスク: 環境ごとに Hyperdrive の設定を作って管理する必要がある（本番の設定が無いまま `main` に入れると本番のデプロイが失敗する）。Hyperdrive と Supavisor の2段の接続プーラーを通る。Hyperdrive が使えなくなったときは、トランザクションモードへ直接つなぐ代替に切り替える
