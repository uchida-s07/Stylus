# 用語集

> 文書（vision・要件・spec）とコードで同じものを同じ名前で呼ぶための表。
> 新しい用語が出たら /spec-close のときに足す。

| 用語 | 意味 | コード上の名前 | 使わない言い方 |
|-----|------|--------------|--------------|
| 家族 | アプリを使う4人（父・母・息子2人）。管理者が事前に登録した人だけが家族として扱われる | 表 `members`、API の `c.var.member` | ユーザー、会員 |
| 利用者（Auth の） | Supabase Auth のアカウント。家族の登録で家族と1対1に結びつける | `auth.users`、`members.auth_user_id`、トークンの `sub` | 家族（Auth の利用者と家族は別もの） |
| 表示名 | 画面に出す家族の名前 | `members.display_name`、`displayName` | ニックネーム、ユーザー名 |
| ロール「管理者」 | アプリの管理者（せいご）。家族の登録をする | `members.is_admin`、`isAdmin`、`requireAdmin()` | 権限、admin 権限 |
| 立場「親」「料理担当」 | 家族の役割。操作の可否を API が判定するときに使う | `members.is_parent`・`is_cook`、`isParent`・`isCook`、`requireAttribute('parent' \| 'cook')` | 属性、グループ |
| 未登録 | Google アカウントが家族として登録されていない状態。サインアップ無効で弾かれるか、API が 403 を返す | エラーの code `not_a_member`、ログイン画面の知らせ `unregistered` | 権限なし |
| ログイン状態 | 端末に残っている Supabase のセッション（リフレッシュトークンを含む）。ログアウトするまで続く | supabase-js の `session`、保存領域のキー `stylus-auth` | セッション切れ（期限の無いもの） |
| アクセストークン | API に送る Supabase の JWT（1時間で切れ、自動で更新する） | `Authorization: Bearer`、`access_token` | ログイン状態（別もの） |
| ログイン画面 | 「Google でログイン」ボタンのある画面 | `/login`、`LoginPage` | サインイン画面 |
| アプリのホーム | ログインした後に最初に出る画面。自分の表示名を出す | `/`、`HomePage` | トップページ |
| 公開キー | フロントに置いてよい Supabase のキー | `sb_publishable_…`、`VITE_SUPABASE_PUBLISHABLE_KEY` | anon キー（古い形式。使わない） |
