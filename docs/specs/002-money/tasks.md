# 002 お金（請求・支払いの記録） 実装計画

spec: ./spec.md

<!--
並びは「DB変更 → AC ごとのサイクル」が基本。1タスクは1コミットで収まる粒度。
サイクル: 受入基準のテストを書く → 期待どおりの理由で失敗することを確かめ「Red」欄に書く → 実装 → 対象のテストとテスト全体が通る → リファクタして再び全体が通る。
テストと実装は同じコミットに入れる。Red はコンパイルエラーや import の失敗では数えない。
Red を確かめようがないタスク（DB 変更、廃止した AC のテストの削除など）は「Red: 対象外（理由）」と書く。
-->

進め方の補足：

- 「Red」欄の「未記録（想定：…）」は計画時の見込み。実装のときに、実際に実行したテストと失敗の要点で書き換える
- import の失敗を Red と数えないため、テストを書く前にルート・関数の**中身の無い形**（200 で空の応答を返す・素朴な値を返す）を置いてから走らせる。特に 404 を確かめる AC は、ルートが無いときの Hono の既定の 404 で通ってしまわないよう、本文の code が `not_found` であることまで確かめる
- テストの置き場所：API は `apps/api/src/routes/*.test.ts`（PGlite と本物のミドルウェアを通す `createTestApp()`）、関係者の判定・状態の更新の単体テストは `apps/api/src/money/*.test.ts`、画面は `apps/web/src/pages/money/*.test.tsx`（`installFakeApi` で API の代わりを置く）、共有のルールは `packages/shared/src/money/*.test.ts`
- AC が「API を呼ぶ」「請求は作られない」「一覧に出る」のようにデータの結果を言うものは API のテストで、「〜と出る」「キャンセルを選ぶ」のように画面の表示・操作を言うものは画面のテストで確かめる。両方に関わる AC は両方のタスクに挙げ、どちらのテストにも同じタグを付ける
- 「今」は `AppConfig` に `now: () => Date` を足して差し替えられるようにする（発生日の上限、経過の日時。MONEY-F-001/AC-6・AC-17、MONEY-F-005/AC-1）。本番は `() => new Date()`
- 「途中で保存に失敗する」AC（MONEY-F-009/AC-6、F-011/AC-7、F-012/AC-5）は、テストの中で PGlite にトリガーを仕込み、2件目の請求の更新で例外を出して確かめる（本物のトランザクションが巻き戻ることを見る）
- 家族のテスト用データ（父・母・せいご・くうご）は `apps/api/test/family.ts` に1か所で置き、各テストから使う
- 新しい依存パッケージは足さない見込み（Mantine・Zod・Drizzle の範囲で作る）。足すときは Workers で動くかを先に確かめる（CLAUDE.md）
- T-2 の結果で design.md の方針（トランザクション・`FOR UPDATE`）が使えないと分かったら、その場で止め、spec を draft に戻して `/spec-new` の流れで直す
- 「実装の前に決めること」（下の節）は、2026-10-04 に D-1〜D-5 とも決まった。実装はその決定に従う

## 実装の前に決めること（docs/review-notes.md の spec 002 の注意）

spec-review で「細部は /spec-plan と実装の中で決める」とした5件。どれも spec の要件・AC は変えない範囲の細部。

- [x] D-1: 件名・メモ・カテゴリー名・差し戻しの理由の、前後の空白と文字数の数え方（MONEY-F-001・F-008・F-013）
  - 推奨: 前後の空白（「空白」の定義のとおり）を除いてから文字数を数え、除いた値を保存する。メモは除いた後に空なら「メモなし」（NULL）にする。文字数は見た目の1文字を1と数える（コードポイント。絵文字1つも1文字）。DB の CHECK も同じ数え方（`char_length`）にする
  - 決定: 推奨のとおり（2026-10-04 オーナー決定）
- [x] D-2: 存在しない家族の ID の扱いと、403（名義）と 400（組み合わせ）が同時に当てはまるときの順番（MONEY-F-001・F-010）
  - 推奨: 存在しない家族の ID は 400 `invalid_input`（請求先・相手の項目に「選び直してください」）。判定の順は「形の検証（400）→ 名義の権限（403）→ 組み合わせ・相手の実在（400）」。例：親でない家族が「家庭」の名義で請求先「父」を選んだら 403
  - 決定: 推奨のとおり（2026-10-04 オーナー決定）
- [x] D-3: `POST /settlements` で送るものと、精算の関係者・側の判定（MONEY-F-011・F-012・F-009）
  - 推奨: 送るものは `{ as: 'self' | 'household', counterpart: <家族の ID> | 'household', bills: [{ id, version }], amount }`（`amount` は払う側から受け取る側への額、0 以上）と、払う側・受け取る側が画面の見ていたとおりかを確かめるための `payer`（`'self' | 'counterpart'`）。精算の関係者は請求と同じ条件（払う側・受け取る側のどちらかが自分、または自分が親でどちらかが「家庭」）で判定し、関係者でなければ 404、側が違えば 403
  - 決定: 推奨のとおり（2026-10-04 オーナー決定）。API は精算額と払う側を計算し直し、送られたものと1つでも違えば 409 `state_changed`
- [x] D-4: 「まとめて払った」を続けて2回押したとき（MONEY-F-011）
  - 推奨: 送っている間はボタンを押せなくし（「請求する」と同じ）、成功したら精算の中身の画面（`/money/settlements/:id`）へ移る。API では二重の要求を特別扱いしない（2回目は版が合わないので 409 になり、何も変わらない）
  - 決定: 推奨のとおり（2026-10-04 オーナー決定）
- [x] D-5: お金の記録がある家族の登録を外す手順（members への外部キーが RESTRICT のため。/spec-close で architecture.md に書く）
  - 推奨: `members` の行は消さず、`auth_user_id` を NULL にする（ログインできなくなり、403 `not_a_member` になる。記録と表示名は残る）。Supabase の Auth の利用者は消してよい
  - 決定: 推奨のとおり（2026-10-04 オーナー決定）

## 0. 準備と検証

- [x] T-1: ADR-0007・0008 を書く
  - 対応: design.md「残すべき ADR の候補」（2026-10-04 オーナー決定：実装の前に書く）
  - 対象ファイル: `docs/adr/0007-party-as-member-id-with-household-null.md`（請求の当事者を `members` の ID で表し、「家庭」を NULL で表す。代替案：members に1行足す・当事者の表）、`docs/adr/0008-optimistic-locking-with-version.md`（状態の更新を版つきの条件付き更新で行う。代替案：1件の操作も `FOR UPDATE`）。雛形は `docs/adr/0000-template.md`
  - Red: 対象外（文書）
  - 完了条件: 2本の ADR が雛形の節を満たし、design.md の該当箇所から参照されている

- [x] T-2: Hyperdrive 経由でトランザクションと `FOR UPDATE` が使えるかを開発環境で確かめる（管理者の手作業を含む）
  - 対応: design.md「リスクと懸念」の1行目
  - 対象ファイル: なし（確認用の一時的なルートはコミットしない）。結果は design.md の「リスクと懸念」に追記する
  - 内容: 確認用のルートを一時的に置いて stylus-api-dev で動かし（手元からのデプロイ、または `wrangler dev --env dev --remote`）、`db.transaction` の中で (1) `select txid_current()` を2回呼んで同じ値になる（同じ接続・同じトランザクション）、(2) `select … from members … for update` と更新ができる、(3) 例外を投げると更新が巻き戻る、を確かめる。終わったらコミット済みの版をデプロイし直す
  - Red: 対象外（外部の環境の検証）
  - 完了条件: 3点の結果が design.md に書かれている。だめなら止めて、spec を直す流れに入っている

## 1. DB

- [x] T-3: お金の表を足すマイグレーション
  - 対応: spec「3. 変更差分」DB、design.md「データモデル」「当事者（『家庭』）の表し方」、COMMON-N-003（既存の `rls.test.ts` が新しい表も見る）、MONEY-F-013（最初の5つのカテゴリー）
  - 対象ファイル: `apps/api/src/db/schema.ts`、`apps/api/drizzle/0003_*.sql`（drizzle-kit で作る。カテゴリー5つの投入は同じマイグレーションに手で足す）、`apps/api/src/db/money.test.ts`（制約の確認。AC なし）
  - 内容:
    - `bill_categories`・`bills`・`bill_events`・`settlements` を作り、どれも `.enableRLS()`（ポリシーは作らない）
    - CHECK：当事者の両方が NULL でない・同じ家族でない、金額 1〜9,999,999（精算は 0 以上）、件名 1〜50・メモ 500 まで・カテゴリー名 1〜20・理由 200 まで（数え方は D-1）、状態の値、発生日 2020-01-01 以降
    - 一意：カテゴリー名（前後の空白を除いた値）、`(created_by, request_id)`
    - 外部キー：`members` へはすべて `ON DELETE RESTRICT`、`bills.category_id` も RESTRICT
    - 索引：`bills` の当事者と状態（一覧・合計・精算の絞り込み）、`bill_events.bill_id`
  - Red: 対象外（DB 変更）
  - 完了条件: マイグレーションが PGlite に当たり、`rls.test.ts` を含むテスト全体が通る。制約のテスト（両方 NULL・同じ家族・範囲外の金額・使われているカテゴリーの削除・家族の削除が拒否される）が通る

## 2. 共有のルール

- [x] T-4: 状態遷移の表・精算額の計算・Zod スキーマ・エラーの code
  - 対応: design.md「状態遷移」「合計と精算額」、spec「3. 変更差分」API（エラーの code、`packages/shared` に足すもの）。各 AC の土台
  - 対象ファイル: `packages/shared/src/money/transitions.ts`（どの状態で、どちらの側が、どの操作をできるか・次の状態・経過の種類）、`packages/shared/src/money/settlement.ts`（向きごとの小計と差し引き・払う側）、`packages/shared/src/schemas/money.ts`（請求の入力・請求・経過・一覧・精算・カテゴリーの Zod）、`packages/shared/src/schemas/error.ts`（`invalid_input`・`not_found`・`state_changed`・`in_use`・`duplicate_name`・`already_registered`）、`packages/shared/src/index.ts`、各 `*.test.ts`（AC なし）
  - 内容: 表は design.md の状態遷移の表をそのまま写す。表そのものと計算を単体テストする（全部の「状態 × 操作 × 側」の組み合わせ、差し引き 0円、片方向だけ）。入力のスキーマは D-1 の数え方で、空白の定義は members の表示名（AUTH-F-001）と同じ文字にする
  - Red: 対象外（AC を持たない土台。表と計算の単体テストは、素朴な形で失敗するのを見てから通す）
  - 完了条件: 単体テストとテスト全体が通る

## 3. API

- [x] T-5: カテゴリーの一覧・追加・削除の API
  - 対応: MONEY-F-013 / AC-1, AC-2, AC-3, AC-4, AC-5、MONEY-F-014 / AC-1, AC-2, AC-4, AC-5
  - 対象ファイル: `apps/api/src/routes/bill-categories.ts`、`apps/api/src/routes/bill-categories.test.ts`、`apps/api/src/app.ts`、`apps/api/test/family.ts`
  - 内容: `GET /bill-categories`・`POST /bill-categories`（409 `duplicate_name`）・`DELETE /bill-categories/:id`（外部キーの違反で 409 `in_use`、無ければ 404 `not_found`）。F-014/AC-4 は「確認を開いた後に請求が登録された」を、削除の要求の前に DB へ請求を入れて再現する
  - Red: 2026-10-05 実行。中身の無いルート（一覧は空、追加・削除は 200 で何もしない）で 10件失敗：F-013/AC-1 は追加が 201 でなく 200、AC-2 は一覧が `[]`、AC-3・AC-5 は一覧に5つ無い（入力の検証は中身の無い形にも置いたので 400 は通っていた）、AC-4 は 409 でなく 200、F-014/AC-1・AC-5 は削除が 204 でなく 200、AC-2・AC-4 は 409 `in_use` でなく 200
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-6: 請求の登録と一覧の基本・家族の一覧
  - 対応: MONEY-F-001 / AC-1, AC-2、MONEY-N-001 / AC-3
  - 対象ファイル: `apps/api/src/money/parties.ts`（当事者・関係者・側の判定、一覧の WHERE）、`apps/api/src/money/parties.test.ts`、`apps/api/src/routes/bills.ts`、`apps/api/src/routes/bills.test.ts`、`apps/api/src/routes/members.ts`（`GET /members`：`id`・`displayName`・`isParent` だけ）、`apps/api/src/routes/members.test.ts`（AC なし。メールアドレスを返さないこと）、`apps/api/src/app.ts`
  - 内容: `POST /bills`（請求中で保存し、経過 `created` を足す）、`GET /bills?view=open`（関係する請求の行だけ。合計は T-9）。`:id` は uuid の形で検証する
  - Red: 未記録（想定：中身の無いルートで、AC-1 の母の一覧に請求が無い、AC-2 の父の一覧に「家庭」の請求が無い、N-001/AC-3 の父の一覧に せいご→家庭 が無い）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-7: 請求の登録の入力の検証
  - 対応: MONEY-F-001 / AC-3（API）, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11（API）, AC-15, AC-17, AC-18
  - 対象ファイル: `apps/api/src/routes/bills.ts`、`apps/api/src/money/bills.ts`、`apps/api/src/routes/bills.test.ts`、`apps/api/src/app.ts`（`now` を足す）、`apps/api/src/index.ts`、`apps/api/test/app.ts`
  - 内容: Zod で形と範囲（400 `invalid_input`、項目ごとのメッセージ）、発生日の上限は `toJstDate(now())`、名義の権限（親でなければ 403）と組み合わせ（自分宛て・親から「家庭」宛て・「家庭」から親宛て）、カテゴリーが無ければ 400（「カテゴリーが見つかりません。選び直してください」）。順番は D-2
  - Red: 未記録（想定：T-6 の時点の実装で、0・10,000,000・1.5・-100、空白だけの件名、51文字の件名、未来・2019-12-31 の発生日、自分宛てなどがどれも 201 で作られてしまう。AC-10 が 403 にならない。AC-6 は UTC の日付で判定する誤りを一時的に入れて落ちることも確かめる。AC-5・AC-17 は境界の内側なので T-6 の実装でも通る見込み。そのときは上限・下限を1つずらす誤りを一時的に入れて落ちることを確かめる）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-8: 請求の二重登録を防ぐ
  - 対応: MONEY-F-001 / AC-14（API）, AC-16（API）
  - 対象ファイル: `apps/api/src/money/bills.ts`、`apps/api/src/routes/bills.test.ts`
  - 内容: `(created_by, request_id)` が同じ要求が来たら、すでにある請求と中身を比べ、同じなら既存の請求を返し、違えば 409 `already_registered`
  - Red: 未記録（想定：同じ `request_id` の2回目が一意の制約の違反で 500 になる。AC-16 は 409 `already_registered` が返らない）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-9: 一覧の合計・並び順・「片付いた」
  - 対応: MONEY-F-004 / AC-1, AC-2, AC-3, AC-4（API）, AC-5, AC-6、MONEY-N-001 / AC-2（一覧）
  - 対象ファイル: `apps/api/src/money/list.ts`、`apps/api/src/routes/bills.ts`、`apps/api/src/routes/bills.test.ts`
  - 内容: 合計（自分の払う額・受け取る額、親には「家庭」の払う額・受け取る額）は SQL の集計で `status = 'requested'` だけ。並びは発生日の新しい順、同じ日は登録の新しい順。`view=closed` は確認済・取消。差し戻し・支払済・確認済・取消の請求は、テストの中で DB に直接入れて用意する（操作の API は後のタスクで作る）
  - Red: 未記録（想定：合計が返らない・0 のまま、AC-3 で差し戻し・支払済も合計に入る、AC-5 の並びが登録の順、AC-6 で確認済・取消が「片付いていない」に出る、N-001/AC-2 で管理者のせいごの一覧に 母→父 が入る）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-10: 請求の中身と経過・関係者でなければ 404（操作の入り口）
  - 対応: MONEY-F-005 / AC-4（API）、MONEY-N-001 / AC-1, AC-2（中身）, AC-4
  - 対象ファイル: `apps/api/src/money/load.ts`（請求を読み、関係者でなければ 404 `not_found`。操作のルートが共通で使う）、`apps/api/src/routes/bills.ts`（`GET /bills/:id` と、`PATCH /bills/:id`・`POST /bills/:id/{pay,return,cancel}` の中身の無い形）、`apps/api/src/routes/bills.test.ts`
  - 内容: 中身は請求する側・請求先・金額・カテゴリー・件名・メモ・発生日・状態・版と、経過（種類・操作した家族の表示名・理由・精算・日時を古い順）
  - Red: 未記録（想定：中身の無い形で、くうご・管理者のせいごが呼んでも 200 が返る（N-001/AC-1・AC-2・AC-4）、存在しない ID でも 200（F-005/AC-4））
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-11: 「払った」（1件ずつ）
  - 対応: MONEY-F-006 / AC-1, AC-3, AC-4（API）, AC-5（API）、MONEY-F-005 / AC-2
  - 対象ファイル: `apps/api/src/money/operate.ts`（側の判定 → 状態遷移の表 → 版つきの条件付き更新 → 経過、を1つのトランザクションで。後の操作も使う）、`apps/api/src/money/operate.test.ts`、`apps/api/src/routes/bills.ts`、`apps/api/src/routes/bills.test.ts`
  - Red: 未記録（想定：中身の無い `pay` で、AC-1 の状態が請求中のまま、AC-3 が 403 にならない、AC-4 で2回目も 200、AC-5 で古い版でも通る、F-005/AC-2 の経過に「払った（父）」が無い）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-12: 差し戻す
  - 対応: MONEY-F-008 / AC-1, AC-2（API）, AC-3, AC-4, AC-5、MONEY-F-005 / AC-3
  - 対象ファイル: `apps/api/src/routes/bills.ts`、`apps/api/src/routes/bills.test.ts`
  - Red: 未記録（想定：中身の無い `return` で、AC-1 の状態が請求中のまま・合計から外れない、AC-2・AC-3 の理由が空白だけ・201文字でも 200、AC-4 で支払済でも 200、AC-5 が 403 にならない、F-005/AC-3 の経過に理由が無い）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-13: 直す・出し直す
  - 対応: MONEY-F-002 / AC-1, AC-2, AC-3, AC-4, AC-5（API）, AC-6, AC-7, AC-8
  - 対象ファイル: `apps/api/src/routes/bills.ts`、`apps/api/src/routes/bills.test.ts`
  - 内容: 請求中なら `edited`、差し戻しなら請求中に戻して `resubmitted`。請求する側・請求先は直せない（入力に含めない）。値の検証は T-7 と同じスキーマ
  - Red: 未記録（想定：中身の無い `PATCH` で、AC-1 の金額が 3,000 のまま、AC-2 が差し戻しのまま、AC-3 で支払済でも 200、AC-4 が 403 にならない、AC-5 で古い版でも 200、AC-6 の経過に「直した（父）」が無い、AC-7・AC-8 で 200）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-14: 取り消す
  - 対応: MONEY-F-003 / AC-1, AC-3, AC-4, AC-5
  - 対象ファイル: `apps/api/src/routes/bills.ts`、`apps/api/src/routes/bills.test.ts`
  - Red: 未記録（想定：中身の無い `cancel` で、AC-1 の状態が請求中のまま・合計から外れない、AC-3 で支払済でも 200、AC-4 が 403 にならない、AC-5 で2回目も 200 になり経過が2回残る）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-15: 「受け取った」（1件ずつ）
  - 対応: MONEY-F-007 / AC-1, AC-2, AC-3, AC-5、MONEY-F-005 / AC-1
  - 対象ファイル: `apps/api/src/routes/bills.ts`、`apps/api/src/routes/bills.test.ts`
  - Red: 未記録（想定：ルートが無い間は中身の無い形を置き、AC-1 の状態が支払済のまま・「片付いた」に出ない、AC-2 で請求中でも 200、AC-3 が 403 にならない、AC-5 の経過に「受け取った（父）」が無い、F-005/AC-1 の経過が3件そろわない）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-16: 支払済を請求中へ戻す（1件ずつ）
  - 対応: MONEY-F-009 / AC-1, AC-2, AC-4
  - 対象ファイル: `apps/api/src/routes/bills.ts`、`apps/api/src/routes/bills.test.ts`
  - 内容: `POST /bills/:id/revert`。操作した人が請求先側なら `payment_canceled`、請求する側なら `not_received`
  - Red: 未記録（想定：中身の無い `revert` で、AC-1・AC-2 が支払済のまま・経過が無い、AC-4 で確認済でも 200）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-17: 精算額（相手ごとの差し引き）
  - 対応: MONEY-F-010 / AC-1（API）, AC-2, AC-5, AC-6, AC-7
  - 対象ファイル: `apps/api/src/money/settlements.ts`、`apps/api/src/routes/settlements.ts`、`apps/api/src/routes/settlements.test.ts`、`apps/api/src/app.ts`
  - 内容: `GET /settlements/preview?as=…&counterpart=…`。2者の間の請求中の請求（両方向）と、`packages/shared` の計算による小計・払う側・精算額。`preview` を `:id` より先に登録する。判定の順は D-2
  - Red: 未記録（想定：中身の無い形で、AC-1 の小計・精算額が返らない、AC-2 で せいご→母 が入る、AC-5 が 403 にならない、AC-6・AC-7 が 400 にならない）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-18: まとめて払った
  - 対応: MONEY-F-011 / AC-1（API）, AC-3, AC-5, AC-6、MONEY-F-005 / AC-5、MONEY-F-007 / AC-4、MONEY-F-009 / AC-5
  - 対象ファイル: `apps/api/src/money/settlements.ts`、`apps/api/src/routes/settlements.ts`、`apps/api/src/routes/settlements.test.ts`、`apps/api/src/money/list.ts`（一覧に受け取り待ちの精算を足す）、`apps/api/src/routes/bills.test.ts`
  - 内容: design.md「同時の操作」の手順1〜6を1つのトランザクションで。送るものと精算の関係者の判定は D-3。差し引き 0円 は押した側を払う側にする。精算に入った請求は、1件ずつの「受け取った」「戻す」を 409 `state_changed` にする（状態遷移の表の「精算に入っていない」の条件）
  - Red: 未記録（想定：中身の無い `POST /settlements` で、AC-1 の3件が請求中のまま・せいごの一覧に受け取り待ちが無い、AC-3 が 403 にならない、AC-5 の 0円 の精算ができない、AC-6 で精算ができてしまう（または 201）、F-005/AC-5 の経過に精算の相手・額が無い。F-007/AC-4・F-009/AC-5 は精算に入った請求を1件ずつ受け取れる・戻せてしまう）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-19: まとめて払ったの競合と失敗
  - 対応: MONEY-F-011 / AC-4（API）, AC-7（API）
  - 対象ファイル: `apps/api/src/money/settlements.ts`、`apps/api/src/routes/settlements.test.ts`
  - Red: 未記録（想定：T-18 の実装で、AC-4 の請求が増えた後でも見ていた一覧で精算できてしまう場合はその失敗を書く。T-18 で一致の確認まで入れて通ってしまったら、確認を一時的に外して落ちることを確かめる。AC-7 はトリガーで2件目を失敗させ、トランザクションを使わない形を一時的に入れて1件目だけ支払済になることを確かめる）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-20: 精算の中身とまとめて受け取った
  - 対応: MONEY-F-012 / AC-1, AC-2, AC-4, AC-5, AC-6（API）、MONEY-N-001 / AC-5
  - 対象ファイル: `apps/api/src/money/settlements.ts`、`apps/api/src/routes/settlements.ts`、`apps/api/src/routes/settlements.test.ts`
  - 内容: `GET /settlements/:id`（相手・精算額・含まれる請求・状態）、`POST /settlements/:id/confirm`（精算の状態を条件にした更新で二重の操作を防ぐ）
  - Red: 未記録（想定：中身の無い形で、AC-1 の3件が支払済のまま、AC-2 が 403 にならない、AC-4 で2回目も 200、AC-5 で一部だけ確認済になる（トリガー）、AC-6・N-001/AC-5 が `not_found` にならない）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-21: 精算ごと戻す
  - 対応: MONEY-F-009 / AC-3, AC-6, AC-7, AC-8, AC-9、MONEY-F-012 / AC-3
  - 対象ファイル: `apps/api/src/money/settlements.ts`、`apps/api/src/routes/settlements.ts`、`apps/api/src/routes/settlements.test.ts`
  - 内容: `POST /settlements/:id/revert`。払う側なら `settlement_payment_canceled`、受け取る側なら `settlement_not_received`。含まれる請求を請求中に戻して `settlement_id` を外し、精算を「戻した」にする
  - Red: 未記録（想定：中身の無い形で、AC-3・AC-7 の2件が支払済のまま、AC-6 で一部だけ戻る（トリガー）、AC-8 で確認済の精算でも 200、AC-9 で2回目も 200、F-012/AC-3 で戻された精算を受け取れてしまう）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

## 4. 画面

- [ ] T-22: 押せる部分の大きさの数値の条件を外す（COMMON-N-008 の変更）
  - 対応: COMMON-N-008（変更。受入基準なし）、spec「3. 変更差分」画面の `/`・`/login`
  - 対象ファイル: `apps/web/src/app/theme.ts`（ボタンの標準の大きさ `lg` を外す）、`apps/web/src/app/tap-targets.test.tsx`（削除）、`apps/web/src/components/LogoutConfirm.tsx`（×を出さない理由のコメントを「『キャンセル』があるので要らない」に直す）
  - Red: 対象外（要件の変更で数値の条件を外す。テストの削除）
  - 完了条件: テスト全体が通る。ログアウトの確認に×が出ないこと（既存の AUTH-F-004 のテスト）は変わらず通る

- [ ] T-23: 403 は `not_a_member` のときだけ未登録として扱う
  - 対応: spec「3. 変更差分」画面の 403 の扱い（AC なし。architecture.md の規約とコードを揃える）
  - 対象ファイル: `apps/web/src/api/responses.ts`（API の応答から「未登録・通信できない・読み込めない／保存できない・中身」を見分ける共通の処理。お金の画面も使う）、`apps/web/src/api/responses.test.ts`、`apps/web/src/pages/HomePage.tsx`
  - Red: 対象外（AC なし）。タグなしのテスト「ホームで `/me` が 403 `forbidden` を返すと、読み込めない知らせが出てセッションは残る」が今のコードで未登録として扱われて失敗することを確かめ、ここに書く
  - 完了条件: 対象のテストとテスト全体が通る（AUTH-F-002/AC-2・AUTH-F-003/AC-6 の既存テストも通る）。リファクタ後にもう一度テスト全体が通る

- [ ] T-24: お金の画面（合計・一覧）とホームの「お金」
  - 対応: MONEY-F-004 / AC-4（画面）, AC-7, AC-8
  - 対象ファイル: `apps/web/src/pages/money/MoneyPage.tsx`、`apps/web/src/pages/money/money-page.test.tsx`、`apps/web/src/router.tsx`（`/money` 以下を `RequireSignedIn` の中に足す）、`apps/web/src/pages/HomePage.tsx`（「お金」へ進むボタン）、`apps/web/test/fakeApi.ts`（`/bills/:id` のような形のパスを受けられるようにする）
  - 内容: 合計（親には「家庭」の分も）、受け取り待ちの精算、「片付いていない／片付いた」の切り替え、各行の件名・金額・相手・状態・発生日・カテゴリー
  - Red: 未記録（想定：中身の無い画面で、AC-4 の「請求はありません」と 0円 が出ない、AC-7・AC-8 の知らせが出ない）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-25: 請求の入力の画面
  - 対応: MONEY-F-001 / AC-3（画面）, AC-11（画面）, AC-12, AC-13, AC-14（画面）, AC-16（画面）
  - 対象ファイル: `apps/web/src/pages/money/BillNewPage.tsx`、`apps/web/src/pages/money/BillForm.tsx`（直す画面と共用）、`apps/web/src/pages/money/bill-new.test.tsx`、`apps/web/src/router.tsx`
  - 内容: 請求先・名義（親だけ）・金額・カテゴリー・件名・発生日（既定は今日）・メモ。入力を開いたときに `request_id` を作り、送り直しでも同じ値を送る。送っている間は「請求する」を押せない
  - Red: 未記録（想定：中身の無い画面で、AC-3 の「入力してください」が出ない、AC-11・AC-16 の知らせが出ない、AC-12 の「先にカテゴリーを追加してください」が出ない、AC-13 で知らせが出ない・入力が消える、AC-14 で要求が2回送られる）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-26: 請求の中身の画面（経過・操作のボタン・開いた後に変わっていたとき）
  - 対応: MONEY-F-005 / AC-4（画面）、MONEY-F-003 / AC-2、MONEY-F-006 / AC-2, AC-4（画面）, AC-5（画面）
  - 対象ファイル: `apps/web/src/pages/money/BillDetailPage.tsx`、`apps/web/src/pages/money/bill-detail.test.tsx`、`apps/web/src/router.tsx`
  - 内容: 状態と側に応じたボタン（`packages/shared` の状態遷移の表で出し分け。見た目だけ）、確認の画面（「3,000円を払ったことにしますか？」など）、409 を受けたら取り直して、状態が同じなら「請求の中身が変わりました。…」、違えば「請求の状態が変わりました。…」と出し、最新を出す。精算に入った請求は「受け取った」・戻すを出さず、精算の中身へ進めるようにする
  - Red: 未記録（想定：中身の無い画面で、F-005/AC-4 の「この請求は見つかりません。」が出ない、F-003/AC-2・F-006/AC-2 でキャンセルしても要求が送られる、F-006/AC-4・AC-5 の知らせが出ない・出し分けが逆になる）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-27: 差し戻す・直す・出し直すの画面
  - 対応: MONEY-F-008 / AC-2（画面）、MONEY-F-002 / AC-5（画面）
  - 対象ファイル: `apps/web/src/pages/money/BillDetailPage.tsx`（差し戻すの理由の入力）、`apps/web/src/pages/money/BillEditPage.tsx`、`apps/web/src/pages/money/bill-edit.test.tsx`、`apps/web/src/router.tsx`
  - Red: 未記録（想定：中身の無い形で、F-008/AC-2 の「理由を入力してください」が出ず要求が送られる、F-002/AC-5 の「請求の状態が変わりました。…」が出ない）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-28: 精算の画面（相手の選択・精算額）
  - 対応: MONEY-F-010 / AC-1（画面）, AC-3, AC-4
  - 対象ファイル: `apps/web/src/pages/money/SettlePage.tsx`、`apps/web/src/pages/money/settle.test.tsx`、`apps/web/src/router.tsx`
  - 内容: 名義（親だけ）と相手の選択（自分・組み合わせられない相手は選択肢に出さない）、向きごとの小計、「母がせいごに 2,500円」の形の精算額
  - Red: 未記録（想定：中身の無い画面で、AC-1 の「母がせいごに 2,500円」が出ない、AC-3 の「精算する請求はありません」、AC-4 の「差し引き 0円（お金のやり取りはありません）」が出ない）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-29: 精算の画面の「まとめて払った」
  - 対応: MONEY-F-011 / AC-1（画面）, AC-2, AC-4（画面）, AC-7（画面）
  - 対象ファイル: `apps/web/src/pages/money/SettlePage.tsx`、`apps/web/src/pages/money/settle.test.tsx`、`apps/web/src/pages/money/money-page.test.tsx`（受け取り待ちの精算「母から 2,500円」の表示）
  - 内容: 確認の画面（「母がせいごに 2,500円 払ったことにしますか？」）、送っている間はボタンを押せない（D-4）、409 なら精算額を取り直して「精算の中身が変わりました。…」
  - Red: 未記録（想定：中身の無い形で、AC-1 のせいごのお金の画面に「母から 2,500円」が出ない、AC-2 でキャンセルしても要求が送られる、AC-4 の知らせと 3,500円 が出ない、AC-7 の「保存できませんでした。…」が出ない）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-30: 精算の中身の画面（まとめて受け取った・戻す）
  - 対応: MONEY-F-012 / AC-6（画面）
  - 対象ファイル: `apps/web/src/pages/money/SettlementDetailPage.tsx`、`apps/web/src/pages/money/settlement-detail.test.tsx`、`apps/web/src/router.tsx`
  - 内容: 相手・精算額・含まれる請求、受け取る側には「まとめて受け取った」「受け取っていない」、払う側には「払ったを取り消す」（状態と側で出し分け）。開いた後に変わっていたら「精算の中身が変わりました。…」
  - Red: 未記録（想定：中身の無い画面で、AC-6 の「この精算は見つかりません。」が出ない）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-31: カテゴリーの画面
  - 対応: MONEY-F-013 / AC-3（画面）, AC-4（画面）、MONEY-F-014 / AC-2（画面）, AC-3, AC-5（画面）
  - 対象ファイル: `apps/web/src/pages/money/CategoriesPage.tsx`、`apps/web/src/pages/money/categories.test.tsx`、`apps/web/src/router.tsx`
  - Red: 未記録（想定：中身の無い画面で、F-013/AC-3 の「入力してください」、AC-4 の「同じ名前のカテゴリーがあります」、F-014/AC-2 の「…使われているため削除できません」、AC-5 の「このカテゴリーは見つかりません」が出ない、F-014/AC-3 でキャンセルしても要求が送られる）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

## 5. 仕上げ

- [ ] T-32: 開発環境で確かめる（管理者の手作業）
  - 対応: COMMON-N-008（幅 360px・1280px の手動確認）、design.md「移行計画」「リスクと懸念」（CPU 時間、Data API）
  - 対象ファイル: なし。結果はこのタスクの「結果」に書く
  - 内容: develop へのマージで開発の DB へのマイグレーションと stylus-api-dev のデプロイが流れたことを確かめる。Pages のプレビューで、お金のすべての画面（`/money` 以下の7つと、変えた `/`・`/login`）を幅 360px と 1280px で開き、横スクロールが出ず、すべての操作ができることを確かめる。登録 → 払った → 受け取った、精算 → まとめて払った → まとめて受け取った、を一通り通す。公開キーで Data API を呼び、新しい4つの表を読めない・書けないことを確かめる。Workers のダッシュボード（または `wrangler tail`）で 1102 が出ていないことを確かめる
  - Red: 対象外（手動の確認）
  - 完了条件: すべての確認が済み、結果が書かれている

- [ ] T-33: 本番に出す（管理者の手作業）
  - 対応: design.md「移行計画」
  - 対象ファイル: なし
  - 内容: develop → main のマージで、本番の DB へのマイグレーションと stylus-api のデプロイが流れたことを確かめる。本番で公開キーで Data API を呼び、新しい4つの表を読めない・書けないことを確かめる。1102 が出ていないことを確かめる
  - Red: 対象外（リリース）
  - 完了条件: 本番でお金の画面が開け、Data API の確認が済んでいる

## /spec-close へ引き継ぐこと

- money.md：spec の「この領域で使うことば」「この領域で共通の振る舞い」の2節を要件一覧の前に節として移す。glossary に「家庭」「当事者」「関係者」「名義」「側」「精算」を足す
- common.md：COMMON-N-002 の概要、COMMON-N-008 を表の形のまま変更後の姿に
- architecture.md：規約の「押せる部分は 44×44px 以上」の行、レイヤーと責務の表に `apps/api/src/money/`、エラーの code 6つ、API のルートの欄の領域ごとの判定、データの流れの手順5の 403 の扱い、家族の登録の仕方にお金の記録がある家族の行は消せないことと外す手順（D-5）
- docs/review-notes.md：`SC:vision-unused` の P-6〜P-10・G-6・G-7・J-8〜J-10 の行と、COMMON-N-008 の理由の行を消す。spec 002 の注意6件のうち、D-1〜D-5 で決めたものは決定を書き添える

## AC カバレッジ

| AC | タスク |
|----|-------|
| MONEY-F-001/AC-1 | T-6 |
| MONEY-F-001/AC-2 | T-6 |
| MONEY-F-001/AC-3 | T-7, T-25 |
| MONEY-F-001/AC-4 | T-7 |
| MONEY-F-001/AC-5 | T-7 |
| MONEY-F-001/AC-6 | T-7 |
| MONEY-F-001/AC-7 | T-7 |
| MONEY-F-001/AC-8 | T-7 |
| MONEY-F-001/AC-9 | T-7 |
| MONEY-F-001/AC-10 | T-7 |
| MONEY-F-001/AC-11 | T-7, T-25 |
| MONEY-F-001/AC-12 | T-25 |
| MONEY-F-001/AC-13 | T-25 |
| MONEY-F-001/AC-14 | T-8, T-25 |
| MONEY-F-001/AC-15 | T-7 |
| MONEY-F-001/AC-16 | T-8, T-25 |
| MONEY-F-001/AC-17 | T-7 |
| MONEY-F-001/AC-18 | T-7 |
| MONEY-F-002/AC-1 | T-13 |
| MONEY-F-002/AC-2 | T-13 |
| MONEY-F-002/AC-3 | T-13 |
| MONEY-F-002/AC-4 | T-13 |
| MONEY-F-002/AC-5 | T-13, T-27 |
| MONEY-F-002/AC-6 | T-13 |
| MONEY-F-002/AC-7 | T-13 |
| MONEY-F-002/AC-8 | T-13 |
| MONEY-F-003/AC-1 | T-14 |
| MONEY-F-003/AC-2 | T-26 |
| MONEY-F-003/AC-3 | T-14 |
| MONEY-F-003/AC-4 | T-14 |
| MONEY-F-003/AC-5 | T-14 |
| MONEY-F-004/AC-1 | T-9 |
| MONEY-F-004/AC-2 | T-9 |
| MONEY-F-004/AC-3 | T-9 |
| MONEY-F-004/AC-4 | T-9, T-24 |
| MONEY-F-004/AC-5 | T-9 |
| MONEY-F-004/AC-6 | T-9 |
| MONEY-F-004/AC-7 | T-24 |
| MONEY-F-004/AC-8 | T-24 |
| MONEY-F-005/AC-1 | T-15 |
| MONEY-F-005/AC-2 | T-11 |
| MONEY-F-005/AC-3 | T-12 |
| MONEY-F-005/AC-4 | T-10, T-26 |
| MONEY-F-005/AC-5 | T-18 |
| MONEY-F-006/AC-1 | T-11 |
| MONEY-F-006/AC-2 | T-26 |
| MONEY-F-006/AC-3 | T-11 |
| MONEY-F-006/AC-4 | T-11, T-26 |
| MONEY-F-006/AC-5 | T-11, T-26 |
| MONEY-F-007/AC-1 | T-15 |
| MONEY-F-007/AC-2 | T-15 |
| MONEY-F-007/AC-3 | T-15 |
| MONEY-F-007/AC-4 | T-18 |
| MONEY-F-007/AC-5 | T-15 |
| MONEY-F-008/AC-1 | T-12 |
| MONEY-F-008/AC-2 | T-12, T-27 |
| MONEY-F-008/AC-3 | T-12 |
| MONEY-F-008/AC-4 | T-12 |
| MONEY-F-008/AC-5 | T-12 |
| MONEY-F-009/AC-1 | T-16 |
| MONEY-F-009/AC-2 | T-16 |
| MONEY-F-009/AC-3 | T-21 |
| MONEY-F-009/AC-4 | T-16 |
| MONEY-F-009/AC-5 | T-18 |
| MONEY-F-009/AC-6 | T-21 |
| MONEY-F-009/AC-7 | T-21 |
| MONEY-F-009/AC-8 | T-21 |
| MONEY-F-009/AC-9 | T-21 |
| MONEY-F-010/AC-1 | T-17, T-28 |
| MONEY-F-010/AC-2 | T-17 |
| MONEY-F-010/AC-3 | T-28 |
| MONEY-F-010/AC-4 | T-28 |
| MONEY-F-010/AC-5 | T-17 |
| MONEY-F-010/AC-6 | T-17 |
| MONEY-F-010/AC-7 | T-17 |
| MONEY-F-011/AC-1 | T-18, T-29 |
| MONEY-F-011/AC-2 | T-29 |
| MONEY-F-011/AC-3 | T-18 |
| MONEY-F-011/AC-4 | T-19, T-29 |
| MONEY-F-011/AC-5 | T-18 |
| MONEY-F-011/AC-6 | T-18 |
| MONEY-F-011/AC-7 | T-19, T-29 |
| MONEY-F-012/AC-1 | T-20 |
| MONEY-F-012/AC-2 | T-20 |
| MONEY-F-012/AC-3 | T-21 |
| MONEY-F-012/AC-4 | T-20 |
| MONEY-F-012/AC-5 | T-20 |
| MONEY-F-012/AC-6 | T-20, T-30 |
| MONEY-F-013/AC-1 | T-5 |
| MONEY-F-013/AC-2 | T-5 |
| MONEY-F-013/AC-3 | T-5, T-31 |
| MONEY-F-013/AC-4 | T-5, T-31 |
| MONEY-F-013/AC-5 | T-5 |
| MONEY-F-014/AC-1 | T-5 |
| MONEY-F-014/AC-2 | T-5, T-31 |
| MONEY-F-014/AC-3 | T-31 |
| MONEY-F-014/AC-4 | T-5 |
| MONEY-F-014/AC-5 | T-5, T-31 |
| MONEY-N-001/AC-1 | T-10 |
| MONEY-N-001/AC-2 | T-9, T-10 |
| MONEY-N-001/AC-3 | T-6 |
| MONEY-N-001/AC-4 | T-10 |
| MONEY-N-001/AC-5 | T-20 |
| COMMON-N-002/AC-1 | 既存（`apps/api/src/middleware/guards.test.ts`。AC は変えない） |
| COMMON-N-002/AC-2 | 既存（同上） |
| COMMON-N-002/AC-3 | 既存（同上） |
| COMMON-N-002/AC-4 | 既存（同上） |

COMMON-N-008 は受入基準なし（手動で確かめる）。T-22 と T-32 で扱う。

## 影響を受ける既存テスト

| テスト | 理由（要件の変更・廃止 など） | 対応タスク |
|-------|---------------------------|----------|
| `apps/web/src/app/tap-targets.test.tsx`（「押せる部分の大きさ（COMMON-N-008）」の2件。AC のタグなし） | COMMON-N-008 の変更で 44×44px の数値の条件を外す。削除する | T-22 |
| `apps/web/src/pages/login-errors.test.tsx` の `[AUTH-F-002/AC-2]`、`apps/web/src/pages/error-states.test.tsx` の `[AUTH-F-003/AC-6]` | ホームの 403 の判定を `not_a_member` だけに揃える。どちらも 403 `not_a_member` を送っているので中身は変えず、通り続けることを確かめる | T-23 |
| `apps/api/src/db/rls.test.ts` の `[COMMON-N-003/AC-1]` | 新しい4つの表も RLS が有効であることを、変えずにこのテストで確かめる | T-3 |
