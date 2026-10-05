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
| 家庭 | 父母を1つにまとめた、請求・精算の相手。父母のどちらが操作してもよい | DB では当事者の列が `NULL`、API・画面では `'household'`（`partyRefSchema`） | 家族全体、親 |
| 当事者 | 請求する側と請求先（精算なら払う側と受け取る側）。家族の1人か「家庭」 | `bills.from_member_id`・`to_member_id`、`settlements.payer_member_id`・`receiver_member_id` | 対象者 |
| 関係者 | その請求・精算を見られ、操作できる家族。当事者が家族の1人ならその人、「家庭」なら父と母 | `loadRelatedBill()`・`loadRelatedSettlement()`（関係者でなければ 404） | 参加者 |
| 名義 | 請求・精算を誰として行うか。「自分」か「家庭」。「家庭」の名義は親だけが使える | `as`（`'self' \| 'household'`、`asSchema`） | 立場（立場「親」「料理担当」とは別もの） |
| 側 | 請求する側・請求先側、精算の払う側・受け取る側。どの操作ができるかは側で決まる | `BillSide`（`'from' \| 'to'`）、`SettlementSide`（`'payer' \| 'receiver'`）、`billSidesOf()`・`settlementSidesOf()` | 役割 |
| 精算 | 2人の当事者の間の請求中の請求を、両方向とも差し引いてまとめて払う・受け取ること | 表 `settlements`、`/settlements`、`/money/settle` | 清算、相殺 |
| 履歴 | 片付いた請求（確認済・取消）の一覧。お金の画面の右上のメニューから開く | `/money/history`、`HistoryPage`、`GET /bills?view=closed` | 片付いた |
| 「支払い」「受け取り」 | お金の画面の一覧のタブ。自分（親なら「家庭」も）が請求先側の請求が「支払い」、請求する側の請求が「受け取り」 | `MoneyPage` の `Tab`（`'pay' \| 'receive'`）、localStorage のキー `stylus.money.billTab` | 支出・収入 |
