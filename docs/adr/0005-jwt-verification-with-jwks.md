# ADR-0005: API は Supabase の JWT を JWKS（非対称鍵）で検証する

- 状態: 採用
- 日付: 2026-09-27
- 関連する spec: specs/001-foundation
- 置き換えた ADR: —
- 置き換えられた ADR: —

## 背景

フロントは Supabase Auth のアクセストークン（JWT）を `Authorization: Bearer` で API に送る（ADR-0001）。API はリクエストのたびにトークンが正しいかを確かめる必要がある。Workers Free は CPU 10ms の制約があり、秘密情報はできるだけ置く場所を減らしたい。Supabase の新しいプロジェクトは、JWT の署名に非対称鍵を使うのが標準になっている。

## 決定

- API は Supabase の JWKS（`/auth/v1/.well-known/jwks.json`）の公開鍵で JWT の署名を検証する。ライブラリは `jose`
- 署名方式は ES256 だけを受け付け、発行元（Supabase の Auth の URL）と宛先（`authenticated`）も確かめる。無効なら 401 `unauthenticated`
- JWKS の鍵は Worker のメモリに置いて使い回す（`createRemoteJWKSet`）
- Supabase の JWT の署名鍵は ECC（P-256）にし、古い形式の共有シークレットの API キーは無効にする（開発の `stylus-dev` は最初から ECC だった）

## 検討した代替案

| 案 | 採らなかった理由 |
|----|----------------|
| 共有シークレット（HS256）で検証する | Supabase の新しいプロジェクトは非対称鍵が標準。共有シークレットを Worker に置くことになり、漏れればトークンを偽造できる |

## 結果（トレードオフ）

- 良くなること: 秘密情報を Worker に置かずに検証できる。鍵を一度取れば、リクエストごとに Supabase へ問い合わせずに済み、ES256 の検証は CPU 10ms に十分収まる見込み
- 悪くなること・受け入れたリスク: 署名鍵の入れ替え直後などに、端末では期限内に見えるトークンが 401 になることがある（フロントはセッションを1回だけ更新して送り直す）。JWKS に届かないと API は 500 になる。トークンを API の中だけで検証するので、ログアウトなどでセッションを取り消しても、発行済みのアクセストークンは期限まで通る
