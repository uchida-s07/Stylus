# ADR-0004: 認証と DB は Supabase にし、Data API は塞いで API 経由にする

- 状態: 採用
- 日付: 2026-09-27
- 関連する spec: specs/001-foundation
- 置き換えた ADR: —
- 置き換えられた ADR: —

## 背景

完全無料の範囲で、ログインの仕組みと DB が要る。Supabase は Auth と Postgres を無料で使えるが、そのままではフロントが公開キーで Data API（PostgREST）からテーブルを直接読み書きでき、権限の判断が DB のポリシー（RLS）とフロントに分かれる。権限の判断は API にまとめたい（ADR-0001）。

## 決定

- 認証は Supabase Auth、DB は Supabase Postgres を使う（本番 `stylus`、開発 `stylus-dev`）
- Data API は無効にする。あわせて全テーブルで RLS を有効にし、ポリシーは作らない（二重の備え。RLS はマイグレーションでも有効にする）
- フロントは `supabase-js` をログイン・ログアウト・セッション管理にだけ使い、データの読み書きはすべて Hono の API を通す
- 権限の判断は API で行う（`requireAdmin()`・`requireAttribute()` のような関数を各ルートに付ける）
- サービスロールキーと DB の接続情報は Workers の secret（または Hyperdrive の設定。ADR-0006）にだけ置く。マイグレーション用の DB 接続情報だけは GitHub Actions の secret にも置く。フロントに置くのは Supabase の URL と公開キーだけ。古い形式の API キー（JWT の anon / service_role）は無効にする

## 検討した代替案

| 案 | 採らなかった理由 |
|----|----------------|
| フロントから `supabase-js` で直接読み書きし、RLS のポリシーで権限を判断する | 権限の判断が SQL のポリシーとフロントに散らばる。ネイティブアプリへ移るときに同じ規則を持ち直すことになる。規則を API と `packages/` の TypeScript にまとめたい |

## 結果（トレードオフ）

- 良くなること: 権限の判断が API の1か所にまとまり、テスト（PGlite にマイグレーションを当てたもの）で確かめられる。公開キーが漏れてもアプリのデータは読み書きできない。フロントに秘密情報が無い
- 悪くなること・受け入れたリスク: すべての読み書きが Worker を通るので、Workers Free の CPU 10ms の制約を受ける。Supabase Free は7日間アクセスが無いと休止するので、本番・開発の両方に Cron で毎日問い合わせる必要がある（Data API を塞いだまま DB への `select` で足りると判断した。V-2）。無料で同時に動かせるプロジェクトは2つまでで、本番と開発で使い切る。無料枠ではバックアップが無い
