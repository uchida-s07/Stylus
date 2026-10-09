# 003 車（車の登録と予約） 実装計画

spec: ./spec.md

<!--
並びは「DB変更 → AC ごとのサイクル」が基本。1タスクは1コミットで収まる粒度。
サイクル: 受入基準のテストを書く → 期待どおりの理由で失敗することを確かめ「Red」欄に書く → 実装 → 対象のテストとテスト全体が通る → リファクタして再び全体が通る。
テストと実装は同じコミットに入れる。Red はコンパイルエラーや import の失敗では数えない。
Red を確かめようがないタスク（DB 変更、廃止した AC のテストの削除など）は「Red: 対象外（理由）」と書く。
-->

進め方の補足：

- 「Red」欄の「未記録（想定：…）」は計画時の見込み。実装のときに、実際に実行したテストと失敗の要点で書き換える
- import の失敗を Red と数えないため、テストを書く前にルート・関数の**中身の無い形**（200 で空の応答を返す・素朴な値を返す）を置いてから走らせる。404 を確かめる AC は、ルートが無いときの Hono の既定の 404 で通ってしまわないよう、本文の code が `not_found` であることまで確かめる
- **Red は Then が崩れることで確かめる**（002 の spec-verify の教訓）。状態コードだけが違って Then（「作られない」「変わらない」「残る」）が満たされたままの失敗は Red と数えない。入力の検証を中身の無い形にも置いてしまって通る AC は、検証と DB の CHECK を一時的に外して「作られる・変わる」ことで失敗するのを確かめ、その旨を記録する
- テストの置き場所：API は `apps/api/src/routes/cars.test.ts`・`car-reservations.test.ts`（PGlite と本物のミドルウェアを通す `createTestApp()`）、判定の単体テストは `apps/api/src/car/*.test.ts`、DB の制約は `apps/api/src/db/car.test.ts`、画面は `apps/web/src/pages/car/*.test.tsx`（`installFakeApi` で API の代わりを置く）、共有のルールは `packages/shared/src/car/*.test.ts`・`date.test.ts`
- AC が「API を呼ぶ」「予約は作られない」「予定に出る」のようにデータの結果を言うものは API のテストで、「〜と出る」「〜は出ない」「キャンセルを選ぶ」のように画面の表示・操作を言うものは画面のテストで確かめる。両方に関わる AC は両方のタスクに挙げ、どちらのテストにも同じタグを付ける
- 「今」：API のテストは `AppConfig.now` を固定する。AC の Given に時刻が無いものは D-3 のとおり **日本時間 2026-10-07 20:00**（`2026-10-07T11:00:00Z`）にする。「開いている間に始まった・終わった」AC（CAR-F-006/AC-13・AC-16、CAR-F-007/AC-6）は、API では要求を送る時点の `now` を境目の後にして確かめ、画面では API の代わりが 409 `state_changed` と最新の予約を返す形で確かめる。画面の「使用中」の印は端末の時計で決まるので、画面のテストは `vi.setSystemTime` で時刻を固定する
- 「同時に呼ばれる」AC（CAR-F-004/AC-6）は、2つの要求を `Promise.all` で送る。PGlite は1本の接続で順に処理するので、後の方が排他制約の違反（`23P01`）になる。本物の同時実行は T-2（stylus-dev）で確かめる
- 家族のテスト用データは既存の `apps/api/test/family.ts` を使う。予約・車をテストの中で直接 DB に入れる部品は `apps/api/test/car.ts`、画面のテスト用の予約・車は `apps/web/test/car.ts` に置く
- 新しい依存パッケージは足さない見込み。PGlite の `btree_gist` は `@electric-sql/pglite` に同梱の contrib（`@electric-sql/pglite/contrib/btree_gist`）を使う（T-1 で確かめる）。日時の入力は、お金の発生日と同じく素の `type="date"`・`type="time"` の入力欄にする（`@mantine/dates` は足さない）
- T-1（V-1）・T-2（V-2）で排他制約が使えないと分かったら、その場で止め、design.md の代替案（advisory lock）に切り替えるために spec を draft に戻して `/spec-new` の流れで直す
- 「実装の前に決めること」（下の節）は、2026-10-07 に D-1〜D-6 とも推奨のとおり決まった。実装はその決定に従う

## 実装の前に決めること（docs/review-notes.md の spec 003 の注意）

spec-review で「/spec-plan と実装の中で拾う」とした6件。どれも spec の要件・AC は変えない範囲の細部。

- [x] D-1: CAR-F-006/AC-9 は開始を 9:30（今と違う値）で送っていて、spec の「値が同じでも 409」を確かめていない
  - 推奨: AC-9 のテストに、車「ノア」・開始 9:00（今の値と同じ）を送る場合も入れ、どちらも 409 で予約が変わらないことを確かめる（同じタグ `[CAR-F-006/AC-9]`）。実装は要求の形（車・開始日時を含むか）だけで判定し、値を比べない（design.md「予約の状態と操作の可否」）
  - 決定: 推奨のとおり（2026-10-07 オーナー決定）
- [x] D-2: 使用中の予約の直し方では開始日時が送られないので、「終了は開始より後」の判定の置き場所が design の判定の順に無い
  - 推奨: 判定の順の「要求の形と今の状態が合うか（409）」の後に、保存してある開始日時と送られた終了日時を比べ、終了が開始と同じか前なら 400 `invalid_input`（`fields.endsAt` に「終了は開始より後にしてください」）。使用中の予約の開始日時は本人しか変えられず、使用中には変えられないので、読んだ値と比べて足りる。DB の CHECK（終了は開始より後）が最後の守りになる。タグなしのテストで確かめる（T-18）。画面は CAR-F-004 と同じ文言を終了日時の欄に出す
  - 決定: 推奨のとおり（2026-10-07 オーナー決定）
- [x] D-3: CAR-F-006/AC-2・3・4・15・18・19・20、CAR-F-007/AC-5・8 の Given に今の時刻が無く、まだ始まっていない予約か使用中かが値から読めない
  - 推奨: テストでは、Given に時刻の無い AC の「今」を日本時間 2026-10-07 20:00 に固定する。これらの AC の予約はどれも 10月10日なので「まだ始まっていない予約」として確かめる（spec の AC-1・AC-14 などと同じ時刻）
  - 決定: 推奨のとおり（2026-10-07 オーナー決定）
- [x] D-4: `PATCH /cars/:id` でどちらの項目も送らないとき、`PATCH /car-reservations/:id` で送らない項目（行き先・メモ）の扱い
  - 推奨: `PATCH /cars/:id` は、名前と使う／使わないのどちらか1つだけを送る（どちらも無い・両方ある、はどちらも 400 `invalid_input`）。`PATCH /car-reservations/:id` は、終了日時・行き先・メモ・版を毎回すべて送る（行き先・メモは「無し」を `null` か空の文字列で送り、空白だけも含めて NULL で保存する）。項目が欠けていたら 400 `invalid_input`。画面は直す画面の全項目をいつも送る。「送らない項目は元のまま」を作らないので、行き先を消したいのか送り忘れかで迷わない
  - 決定: 推奨のとおり（2026-10-07 オーナー決定）
- [x] D-5: 「片方だけ送ったら 400」の決まりが spec では使用中の予約の箇条の中にだけ書かれていて、AC-22（まだ始まっていない予約で確かめる）と書き場所がずれている
  - 推奨: 実装は design.md の判定の順のとおり、予約の状態を見る前の「形の検証」で片方だけの要求を 400 にする（予約の状態にかかわらず同じ）。spec は変えず、/spec-close で car.md へ移すときに、この1文を使用中の予約の箇条から「例外・バリデーション」の共通の箇条へ移す（振る舞いは変えない、書き場所だけの整理。下の「/spec-close へ引き継ぐこと」に書く）
  - 決定: 推奨のとおり（2026-10-07 オーナー決定）
- [x] D-6: 「使う」の車が無く「使わない」の車だけがあるときも「先に車を登録してください」と出る（実際は「使うに戻す」で足りる）
  - 推奨: spec のまま（「先に車を登録してください」と出し、車の管理の画面へ進めるようにする）。車の管理の画面には「使うに戻す」があるので、そこから戻せる。文言を変えると spec の変更になり draft に戻す必要があるため、今回は変えない。AC-13 のテストは、車が1台も無い場合と「使わない」の車だけがある場合の両方で確かめる
  - 決定: 推奨のとおり（2026-10-07 オーナー決定）

## 1. DB

- [x] T-1: 車の表を足すマイグレーション（V-1：PGlite で `btree_gist` と排他制約が動くか）
  - 対応: spec「3. 変更差分」DB、design.md「データモデル」「重なりの防ぎ方」「そのほかの持ち方」「実物で確かめる項目」V-1、COMMON-N-003（既存の `rls.test.ts` が新しい表も見る）、CAR-F-001 の初期データ「BMW」
  - 対象ファイル: `apps/api/src/db/schema.ts`（`cars`・`car_reservations`。排他制約の名前と中身をコメントで残す）、`apps/api/drizzle/0004_*.sql`（drizzle-kit で作り、手で足す：先頭に `create schema if not exists extensions` と `create extension if not exists btree_gist with schema extensions`、末尾に排他制約と「BMW」の投入）、`apps/api/test/db.ts`（`createTestDb()` で PGlite の `btree_gist` を読み込む）、`apps/api/src/db/car.test.ts`（制約の確認。AC なし）
  - 内容:
    - `cars`：名前（前後の空白を除いて1〜20文字。`char_length`）、一意、`is_active`（既定 true）、`created_at`。`.enableRLS()`
    - `car_reservations`：`car_id`・`member_id`（どちらも RESTRICT）、`starts_at`・`ends_at`（`timestamptz`、秒・ミリ秒が0、終了は開始より後）、行き先 1〜50・メモ 1〜500（NULL 可）、`version`、`request_id`（`(member_id, request_id)` で一意）、`created_at`・`updated_at`、`(ends_at)` の索引。`.enableRLS()`
    - 排他制約：`EXCLUDE USING gist (car_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)`
  - Red: 対象外（DB 変更）
  - 完了条件: マイグレーションが PGlite に当たり、`rls.test.ts` を含むテスト全体が通る。制約のテスト（重なる2行が `23P01`、12:00 に終わる行と 12:00 に始まる行は入る、別の車なら入る、秒のある日時・終了が開始以前・21文字の名前・前後の空白を除いて同じ名前が拒否される、予約のある車と家族の削除が拒否される、「BMW」が1行ある）が通る。V-1 がだめなら止める（上の補足）
  - 結果: 2026-10-09。V-1 は合格：`createTestDb()` で `@electric-sql/pglite/contrib/btree_gist` を読み込み、0004 の先頭で `extensions` スキーマを作ってから拡張を入れると、排他制約つきのマイグレーションが流れ、重なる2行目が `23P01` で拒否された（`src/db/car.test.ts`）。マイグレーションが1本増えて PGlite の準備が1回あたり約 0.4 秒延び（約 3.6 秒）、テスト本体の中で DB を作る `scheduled.test.ts` が並列のときに既定の 5 秒を超えたので、`apps/api/vitest.config.ts` でテストとフックの時間の上限を 30 秒に広げた（テストの中身は変えていない）

- [ ] T-2: stylus-dev で `btree_gist` と排他制約を確かめる（V-2、管理者の手作業を含む）
  - 対応: design.md「実物で確かめる項目」V-2
  - 対象ファイル: なし。結果は design.md の「実物で確かめる項目」に追記する
  - 内容: spec/003-car を push し、Deploy API を手動で実行して stylus-dev にマイグレーション 0004 を流す（002 の T-32 と同じやり方）。流れなければ、Supabase の管理画面（Database → Extensions）で `btree_gist` を先に有効にしてから流し直す。流れたら、開発の DB で同じ車に重なる2行を入れようとして `23P01` で拒否されることを確かめ、確かめた行は消す
  - Red: 対象外（外部の環境の検証）
  - 完了条件: マイグレーションが stylus-dev に当たり、排他制約が働くことが design.md に書かれている。だめなら止めて、spec を直す流れに入っている
  - 経過: 2026-10-09 に T-1 までを push し、Deploy API を spec/003-car で手動実行した（https://github.com/uchida-s07/Stylus/actions/runs/37876975499 ）。実行の結果と、開発の DB での `23P01` の確認は、まだ済んでいない（オーナーの確認待ち）

## 2. 共有のルール

- [x] T-3: 予約の状態・日本時間の日時の表示・Zod スキーマ・エラーの code
  - 対応: spec「3. 変更差分」API（エラーの code、`packages/shared` に足すもの）、design.md「全体構成」「そのほかの持ち方」。各 AC の土台
  - 対象ファイル: `packages/shared/src/car/phase.ts`（開始・終了・今から「これから・使用中・終わった」を求める。`[開始, 終了)`）、`packages/shared/src/date.ts`（`toJstDate()` を土台に、`10月10日(土)` の日付の見出し・`9:00` の時刻・`10月10日(土) 9:00` の日時の表示、日本時間の日付と時刻の入力から日時を作る部品）、`packages/shared/src/schemas/car.ts`（車・車の一覧・車の登録と変更・予約・予約の入力（`request_id` つき）・予約を直す入力（D-4、D-5）・予定と履歴の一覧・カーソルの Zod）、`packages/shared/src/schemas/error.ts`（`overlap`・`car_unavailable` と、任意の `conflict: { displayName, startsAt, endsAt }`）、`packages/shared/src/index.ts`、各 `*.test.ts`（AC なし）
  - 内容: 入力のスキーマは、空白の定義（半角空白・タブ・改行と全角空白）で前後を除いてから文字数を数える（お金と同じ）。日時は分まで（秒が0）。予約を直す入力は「車と開始日時を両方含む」か「両方含まない」かの2つの形で、片方だけは形が違う（D-5）。表示の部品は Intl を使わず UTC+9 の足し算で求める
  - Red: 対象外（AC を持たない土台。状態の境目（開始ちょうど・終了ちょうど）、日をまたぐ表示、曜日、空白の扱いの単体テストは、素朴な形で失敗するのを見てから通す）
  - 完了条件: 単体テストとテスト全体が通る
  - 結果: 2026-10-09。単体テストは素朴な形で失敗するのを見てから通した：状態を常に「まだ始まっていない」にする形で境目の4件、表示の部品が空の文字列・null を返す形で5件、スキーマは期間の判定・行き先とメモの空白の扱い・直す要求の形の判定を外した形で7件が失敗した。予約の中身の応答には、本人かどうか（`isMine`。ボタンの出し分けだけに使う）を足した（お金の `sides` と同じ考え方）。予約の状態の名前は `not_started`・`in_use`・`ended`

## 3. API（車）

- [x] T-4: 車の一覧と登録
  - 対応: CAR-F-001 / AC-1（API）, AC-2（API）, AC-3（API）, AC-4（API）, AC-5, AC-6（API）
  - 対象ファイル: `apps/api/src/routes/cars.ts`、`apps/api/src/routes/cars.test.ts`、`apps/api/src/app.ts`、`apps/api/test/car.ts`
  - 内容: `GET /cars`（ID・名前・使うかどうか・予約があるか・これからの予約の件数。名前の順）、`POST /cars`（一意の違反で 409 `duplicate_name`）。予約があるか・件数は T-5・T-7 で中身を確かめる
  - Red: 2026-10-09 実行。中身の無いルート（一覧は空、登録は 201 で車の形を返すが保存しない）で、AC-1 は母の一覧に「ノア」が無い（`undefined`）、AC-6 は一覧が `[]`（「BMW」が無い）で失敗。AC-2〜AC-5 はこの形だと状態コードで落ちるだけで Then（登録されない）は満たされたままだったので、入力の検証を外し（本文の名前をそのまま挿入）、マイグレーションの `cars_name_unique`・`cars_name_valid` も一時的に外して走らせた：AC-2 は「　」が、AC-3 は「　ノア　」が、AC-4 は2台目の「ノア」が、AC-5 は21文字の名前が一覧に出て失敗した（テストは、データの結果を知らせより先に確かめる並びにした）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [x] T-5: 車を「使わない」にする・「使う」に戻す
  - 対応: CAR-F-002 / AC-1（API）, AC-2（API）, AC-3（API）, AC-5（API）, AC-6（API）
  - 対象ファイル: `apps/api/src/routes/cars.ts`、`apps/api/src/routes/cars.test.ts`
  - 内容: `PATCH /cars/:id` に `{ isActive }` だけを送る。同じ値にする操作はそのまま成功（版は持たない）。無ければ 404 `not_found`。`GET /cars` のこれからの予約の件数（`ends_at > now`）を確かめる（AC-3 の確認に出す件数）
  - Red: 2026-10-09 実行。中身の無い `PATCH`（200 で `{}` を返し何もしない）で 6件失敗：AC-1 は「ノア」が `isActive: true` のまま、AC-2 は `false` のまま、AC-3 は件数1は出たが「使わない」にした後も `isActive: true` のまま、AC-5 は 404 `not_found` でなく 200、AC-6 は先のせいごの操作も何もしないので母の操作の後も `isActive: true` のまま（Then の「『使わない』になっている」が崩れた）、タグなしの uuid でない ID は 404 でなく 200。最初の実行で、T-4 の一覧の「予約があるか」「件数」が予約を入れても false・0 になる誤りが見つかった（1つの表だけの select では Drizzle が列を表の名前なしで出し、サブクエリの中の `id` が予約の表の id を指していた）。外側の `cars.id` を表の名前つきで書いて直した
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [x] T-6: 車の名前を変える
  - 対応: CAR-F-009 / AC-2（API）, AC-3（API）, AC-4, AC-5（API）。D-4（どちらも無い・両方ある要求は 400）
  - 対象ファイル: `apps/api/src/routes/cars.ts`、`apps/api/src/routes/cars.test.ts`
  - 内容: `PATCH /cars/:id` に `{ name }` だけを送る。一意の違反で 409 `duplicate_name`。自分と同じ名前のまま保存したら成功（タグなしのテスト）。D-4 の 400 もタグなしのテストで確かめる
  - Red: 2026-10-09 実行。T-5 で `PATCH` に名前の変更も入れていたので、名前の入力の検証（本文の名前をそのまま使う）・0行のときの 404 と、マイグレーションの `cars_name_unique`・`cars_name_valid` を一時的に外して走らせ、6件失敗：AC-2 は名前が「　 」に、AC-3 は「フィット」が「ノア」に、AC-4 は21文字に変わった。AC-5 は 404 でなく 200。タグなしの前後の空白は除かれずに保存され、D-4 のどちらも無い要求は 400 でなく 500
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [x] T-7: 予約の無い車を削除する
  - 対応: CAR-F-003 / AC-1（API）, AC-2（API）, AC-3, AC-4, AC-5（API）, AC-7（API）
  - 対象ファイル: `apps/api/src/routes/cars.ts`、`apps/api/src/routes/cars.test.ts`
  - 内容: `DELETE /cars/:id`。外部キーの違反（`23503`）で 409 `in_use`、無ければ 404 `not_found`。`GET /cars` の「予約があるか」（`EXISTS`）を確かめる（AC-2 の「削除」を出さない土台）。AC-5 は「確認を開いた後に予約が入った」を、削除の要求の前に DB へ予約を入れて再現する
  - Red: 2026-10-09 実行。中身の無い `DELETE`（200 で `{}` を返し何もしない）で、AC-1・AC-4 は「ノア」が一覧に残り、AC-7 は 404 でなく 200 で失敗。AC-3・AC-5 はこの形だと状態コードで落ちるだけで「ノア」は残ったままだったので、その車の予約を先に消してから車を消す誤りを入れて走らせ、どちらも「ノア」が一覧から消えて失敗するのを確かめた。AC-2（予約があるか）は T-5 で直した一覧の実装ですでに通っていた（予約のある車で true になることは T-5 の最初の実行で失敗を見ている）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

## 4. API（予約）

- [x] T-8: 予約の登録と予定の基本
  - 対応: CAR-F-004 / AC-1（API）, AC-3, AC-5, AC-9（API）, AC-11
  - 対象ファイル: `apps/api/src/car/reservations.ts`（登録の文。車が「使う」であることを挿入の条件に入れる）、`apps/api/src/routes/car-reservations.ts`、`apps/api/src/routes/car-reservations.test.ts`、`apps/api/src/app.ts`
  - 内容: `POST /car-reservations`（201 で予約を返す）、`GET /car-reservations?view=upcoming`（`ends_at > now` を開始の早い順、車の名前・「使わない」の印・予約した家族の表示名を結合）。重なり・入力の検証・車の状態・二重登録は後のタスク
  - Red: 2026-10-09 実行。中身の無いルート（登録は 201 で `{}` を返し保存しない、予定は空）で 5件失敗：AC-1 は予約の行が0件（1件のはずが0件）、AC-3・AC-5・AC-9・AC-11 は予定が `[]`（作られるはずの予約が出ない）。テストは、データの結果（行の数・予定）を応答の状態コードより先に確かめる並びにした
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [x] T-9: 予約の登録の入力の検証
  - 対応: CAR-F-004 / AC-7（API）, AC-8（API）, AC-10（API）, AC-18, AC-19
  - 対象ファイル: `apps/api/src/routes/car-reservations.ts`、`apps/api/src/car/reservations.ts`、`apps/api/src/routes/car-reservations.test.ts`
  - 内容: Zod で形と範囲（400 `invalid_input`、項目ごとの知らせ）。「終了の日時が過ぎています」は `AppConfig.now` で判定する（`fields.endsAt`）
  - Red: 2026-10-09 実行。T-3 のスキーマを T-8 で置いていたので、書いた時点では6件とも通っていた。そこで入力の検証（スキーマと終了の日時の判定）を外して本文をそのまま使い、マイグレーションの `car_reservations_period_valid`・`destination_valid`・`memo_valid` と `ends_at` の NOT NULL を一時的に外して走らせ、6件失敗：AC-7（終了なし）・AC-8（12:00〜12:00。12:00〜11:00 は範囲を作れず 500）・AC-10（18:00〜20:00）・AC-18（行き先51文字）・AC-19（メモ501文字）はどれも予約が1件作られた（0件のはずが1件）、タグなしの空白の扱いは行き先が「　大学 」のまま保存された。計画の「UTC で比べる誤り」「上限を1つずらす誤り」は、終了の日時の判定と文字数の上限がどちらも `packages/shared` のスキーマの単体テスト（T-3）で境目まで確かめてあるので行わなかった
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [x] T-10: 時間が重なる予約を止める
  - 対応: CAR-F-004 / AC-2（API）, AC-4, AC-6
  - 対象ファイル: `apps/api/src/car/reservations.ts`、`apps/api/src/car/conflict.ts`（制約違反を受けた後に重なった相手を1回だけ引く）、`apps/api/src/routes/car-reservations.test.ts`
  - 内容: 排他制約の違反（`23P01`）を 409 `overlap` にし、`conflict: { displayName, startsAt, endsAt }` を付ける
  - Red: 2026-10-09 実行。T-9 の実装では4件とも排他制約の違反が 500 になり（AC-6 は `[201, 500]`）、予約は作られず Then の「作られない」は満たされたままだった。そこでマイグレーションの `car_reservations_no_overlap` を一時的に外して走らせ、4件失敗：AC-2 は母の予約に加えてくうごの予約もできた、AC-4・AC-6 は1件のはずが2件、タグなしの自分の予約との重なりは 409 でなく 201。AC-2 の `conflict` は、外す前の実行で 500（`conflict` なし）だったことで確かめた
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-11: 選んだ車が「使わない」・削除されていたとき
  - 対応: CAR-F-004 / AC-12（API）, AC-20（API）
  - 対象ファイル: `apps/api/src/car/reservations.ts`、`apps/api/src/routes/car-reservations.test.ts`
  - 内容: 挿入が0行なら車を取り直し、無ければ 400 `invalid_input`（`fields.carId` に「この車は見つかりません。」）、「使わない」なら 409 `car_unavailable`。外部キーの違反（`23503`）も同じ 400
  - Red: 未記録（想定：T-8 で挿入の条件に「使う」を入れるので AC-12 は予約が作られない見込み。挿入の条件を一時的に外し、「使わない」の車に予約が作られることで失敗するのを確かめる。AC-20 は存在しない車の ID で外部キーの違反の 500、または0行の 201。条件を外した形で 500 のとき Then は満たされたままなので、記録にはその旨と、`fields.carId` が無いことを書く）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-12: 予約の二重登録を防ぐ
  - 対応: CAR-F-004 / AC-16（API）, AC-17（API）
  - 対象ファイル: `apps/api/src/car/reservations.ts`、`apps/api/src/routes/car-reservations.test.ts`
  - 内容: 挿入の前に `(member_id, request_id)` で引き、同じ中身なら作った予約を返し、違えば 409 `already_registered`。同時に挿入が走って `23505`・`23P01` を受けたときも `request_id` で引き直す（design.md「予約の登録」）
  - Red: 未記録（想定：T-11 の実装で、AC-16 は2回目が `23505` か `23P01` で 409 `overlap` か 500（予約は1件のままなので、2回目の応答が1回目と同じ予約でないことで失敗）、AC-17 は 409 `already_registered` でなく `overlap`）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-13: 予定の一覧と予約の中身
  - 対応: CAR-F-005 / AC-1（API）, AC-2（API）, AC-3（API）, AC-4（API）, AC-5（API）
  - 対象ファイル: `apps/api/src/car/list.ts`、`apps/api/src/routes/car-reservations.ts`、`apps/api/src/routes/car-reservations.test.ts`
  - 内容: `view=upcoming` の並び（開始の早い順、同じなら車の名前の順）と終わった予約の除外、`GET /car-reservations/:id`（メモを含む。無ければ 404 `not_found`）。予約は DB に直接入れて用意する（終わった予約は API では作れないため）
  - Red: 未記録（想定：T-8 の一覧に終わった予約の除外を入れているので、AC-1・AC-2 は通る見込み。除外の条件を `ends_at >= now` にする誤りで AC-2 が、並びを登録の順にする誤りで AC-1 が失敗するのを確かめる。AC-5 は中身の無い `GET /:id`（200 で `{}`）でメモが無い。AC-3・AC-4 は終了の日時・「使わない」の印が応答に無い）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-14: 履歴の一覧
  - 対応: CAR-F-008 / AC-1（API）, AC-2（API）, AC-3（API）、CAR-F-009 / AC-1
  - 対象ファイル: `apps/api/src/car/list.ts`、`apps/api/src/routes/car-reservations.ts`、`apps/api/src/routes/car-reservations.test.ts`
  - 内容: `view=past&before=<カーソル>`。`ends_at <= now` を `(ends_at desc, id desc)` で30件と次のカーソル。CAR-F-009/AC-1 は、名前を変えた後に予定と履歴の両方で新しい名前が出ることを確かめる
  - Red: 未記録（想定：中身の無い `view=past`（空の一覧）で、AC-1・AC-3 は予約が出ない、F-009/AC-1 は履歴に「ヴォクシー」が無い。AC-2 は空の一覧で通るので、終わった予約を除かない誤り（これからの予約も返す）で失敗するのを確かめる）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-15: 予約を直す（まだ始まっていない予約）
  - 対応: CAR-F-006 / AC-1, AC-2, AC-3, AC-4（API）
  - 対象ファイル: `apps/api/src/car/update.ts`（判定の順と、版・時刻の条件つきの更新1文）、`apps/api/src/car/update.test.ts`、`apps/api/src/routes/car-reservations.ts`、`apps/api/src/routes/car-reservations.test.ts`
  - 内容: `PATCH /car-reservations/:id`（車・開始・終了・行き先・メモ・版）。版が合えば `version + 1`。直した結果の重なりは 409 `overlap`（`conflict` つき）。直す前の自分の予約とは重ならない（同じ行の更新なので排他制約は自分と比べない）
  - Red: 未記録（想定：中身の無い `PATCH`（200 で何もしない）で、AC-1・AC-2・AC-3 は予約が 9:00〜12:00 のまま。AC-4 は中身の無い形でも 9:00〜12:00 のままなので、排他制約を一時的に外した形で 9:00〜13:30 に変わることで失敗するのを確かめる）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-16: 予約を直すの入力の検証と形
  - 対応: CAR-F-006 / AC-14（API）, AC-17（API）, AC-18（API）, AC-19, AC-22。D-4（項目が欠けたら 400）、D-5（片方だけは状態にかかわらず 400）
  - 対象ファイル: `apps/api/src/routes/car-reservations.ts`、`apps/api/src/car/update.ts`、`apps/api/src/routes/car-reservations.test.ts`
  - Red: 未記録（想定：T-15 で入力のスキーマを置くので形の AC は通る見込み。検証と DB の CHECK を一時的に外し、AC-14・AC-18・AC-19 の止めるべき直し方で予約が変わること、AC-22 は開始だけが 10:00 に変わることで失敗するのを確かめる。AC-14 は「終了の日時が過ぎています」の判定を外して確かめる）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-17: 予約を直すの本人・状態・版
  - 対応: CAR-F-006 / AC-6, AC-9（D-1）, AC-10（API）, AC-11（API）, AC-12（API）, AC-13（API）, AC-16（API）
  - 対象ファイル: `apps/api/src/car/update.ts`、`apps/api/src/car/update.test.ts`、`apps/api/src/routes/car-reservations.test.ts`
  - 内容: 判定の順（予約があるか 404 → 本人か 403 → 要求の形と今の状態が合うか 409 `state_changed` → 版と更新）。更新の `WHERE` に時刻の条件（まだ始まっていない予約の直し方は `starts_at > now`）を入れ、0行なら取り直して 404・409 を出し分ける
  - Red: 未記録（想定：T-16 の実装（本人・状態・版を見ない）で、AC-6 は母の要求で予約が変わる、AC-9・AC-10 は使用中・終わった予約が変わる、AC-11 は古い版で端末 A の中身に上書きされる、AC-12 は 404 でなく 200（0行のまま 200 なら Then の「見つからない」は応答の code で確かめる）、AC-13・AC-16 は始まった・終わった予約が変わる）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-18: 使用中の予約の直し方
  - 対応: CAR-F-006 / AC-7（API）, AC-8（API）。D-2（終了が開始以前なら 400）
  - 対象ファイル: `apps/api/src/car/update.ts`、`apps/api/src/routes/car-reservations.test.ts`
  - 内容: 車・開始日時を含まない要求（終了・行き先・メモ・版）。終了は今より前でもよい（開始より後なら）。`WHERE` の時刻の条件は `ends_at > now`。終了を今以前にした予約は予定から外れ、履歴に出る
  - Red: 未記録（想定：T-17 の実装では使用中の予約の直し方の要求を受け付けない（409 か 400）ので、AC-7 は予約が 9:00〜12:00 のまま予定に残る、AC-8 は 9:00〜12:00 のまま。D-2 のタグなしのテストは、判定を外すと DB の CHECK で 500 になり Then の「変わらない」は満たされたままなので、CHECK も一時的に外して終了が 9:00 に変わることで確かめる）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-19: 予約を直すときの移す先の車
  - 対応: CAR-F-006 / AC-15（API）, AC-20（API）, AC-21（API）
  - 対象ファイル: `apps/api/src/car/update.ts`、`apps/api/src/routes/car-reservations.test.ts`
  - 内容: 車を変える要求では、移す先の車が「使う」であることを更新の条件に入れる。0行なら予約の側の理由（404・`state_changed`）を先に見て、次に移す先の車が無ければ 400 `invalid_input`（`fields.carId`）、「使わない」なら 409 `car_unavailable`。外部キーの違反も同じ 400。車を変えない要求には車の条件を付けない
  - Red: 未記録（想定：T-18 の実装（車の条件なし）で、AC-15 は「使わない」の「フィット」へ移る、AC-20 は外部キーの違反で 500（予約の車は変わらないので、`fields.carId` が無いことで失敗）。AC-21 は車の条件が無いので通る見込みのため、車を変えない要求にも「使う」の条件を付ける誤りで失敗するのを確かめる）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-20: 予約を取り消す
  - 対応: CAR-F-007 / AC-1（API）, AC-3, AC-4（API）, AC-5（API）, AC-6（API）, AC-7（API）, AC-8（API）
  - 対象ファイル: `apps/api/src/car/cancel.ts`、`apps/api/src/routes/car-reservations.ts`、`apps/api/src/routes/car-reservations.test.ts`
  - 内容: `DELETE /car-reservations/:id`（204）。判定の順（404 → 403 → 使用中・終わったなら 409 `state_changed`）の後、`DELETE … WHERE id = ? AND member_id = ? AND starts_at > now`。0行なら取り直して 404・409。版は見ない
  - Red: 未記録（想定：中身の無い `DELETE`（200 で何もしない）で、AC-1・AC-8 は予約が予定に残る、AC-5 は 404 でなく 200。AC-3・AC-4・AC-6・AC-7 は中身の無い形でも予約が残るので、本人・状態の判定と時刻の条件を外した削除を先に置き、予約が消えることで失敗するのを確かめる）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

## 5. 画面

- [ ] T-21: お金の画面の部品を `apps/web/src/components` へ移す
  - 対応: spec「3. 変更差分」画面（領域をまたぐ部品の共有。AC なし）
  - 対象ファイル: `apps/web/src/pages/money/{useApiLoad.ts,NoticeScreen.tsx,ConfirmDialog.tsx}` → `apps/web/src/components/`、お金の画面の import、`NoticeScreen` の戻り先（「お金へ」と `/money`）を引数にする
  - Red: 対象外（振る舞いを変えない移動）
  - 完了条件: お金の画面の既存テストを変えずに、テスト全体と lint が通る

- [ ] T-22: 車の画面とホームの「車」
  - 対応: CAR-F-005 / AC-1（画面）, AC-2（画面）, AC-3（画面）, AC-4（画面）, AC-6, AC-7, AC-8、CAR-F-004 / AC-9（画面）
  - 対象ファイル: `apps/web/src/pages/car/CarPage.tsx`、`apps/web/src/pages/car/ReservationRow.tsx`（履歴と共用）、`apps/web/src/pages/car/car-page.test.tsx`、`apps/web/src/pages/HomePage.tsx`（「車」へ進むボタン）、`apps/web/src/router.tsx`（`/car` 以下を `RequireSignedIn` の中に足す）、`apps/web/test/car.ts`
  - 内容: これからの予約を開始の日付ごとに（`10月7日(水)` の見出し）、各行に車の名前（「使わない」の印）・表示名・時刻（日をまたぐなら終了に日付）・行き先、使用中の印（`packages/shared` の状態の求め方と端末の時計）。「予約する」、右上のメニュー（「履歴」「車の管理」）。車が1台も無いときは「車が登録されていません」と車の管理への入口
  - Red: 未記録（想定：中身の無い画面（`<main aria-label="車" />` だけ）で、AC-1・AC-3・AC-4・AC-9 は日付の見出しと予約の行が無い、AC-2 は「これからの予約はありません」が無い、AC-6・AC-7 は知らせ（role=alert）が無い、AC-8 は「車が登録されていません」が無い。タグなしのホームの「車」もボタンが無い）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-23: 予約の入力の画面（入力と車の選択肢）
  - 対応: CAR-F-004 / AC-1（画面）, AC-7（画面）, AC-8（画面）, AC-13（D-6）、CAR-F-001 / AC-1（画面）, AC-6（画面）、CAR-F-002 / AC-1（画面）, AC-2（画面）
  - 対象ファイル: `apps/web/src/pages/car/ReservationNewPage.tsx`、`apps/web/src/pages/car/ReservationForm.tsx`（直す画面と共用）、`apps/web/src/pages/car/reservationFormValues.ts`、`apps/web/src/pages/car/reservation-new.test.tsx`、`apps/web/src/router.tsx`
  - 内容: 車（「使う」の車だけ。1台だけなら最初から選ぶ）・開始の日付と時刻・終了の日付と時刻・行き先・メモ。開始を選ぶと、終了が空なら開始の1時間後を入れる（タグなしのテスト）。入力を開いたときに `request_id` を作る。空の項目は送らずに「入力してください」。「使う」の車が無いときは「先に車を登録してください」と車の管理への入口（D-6：車が無い場合と「使わない」の車だけの場合の両方）
  - Red: 未記録（想定：中身の無い画面（`<main aria-label="予約する" />` だけ）で、F-001/AC-1・AC-6、F-002/AC-1・AC-2 は車の選択肢が無い、F-004/AC-1・AC-7・AC-8 は入力の欄が無い、AC-13 は「先に車を登録してください」が無い。タグなしの「終了は開始の1時間後」も欄が無い）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-24: 予約の入力の画面（送った後の知らせ）
  - 対応: CAR-F-004 / AC-2（画面）, AC-10（画面）, AC-12（画面）, AC-14, AC-15, AC-16（画面）, AC-17（画面）, AC-20（画面）
  - 対象ファイル: `apps/web/src/pages/car/ReservationNewPage.tsx`、`apps/web/src/pages/car/reservation-new.test.tsx`
  - 内容: 409 `overlap` は `conflict` を日本時間で表示して「その時間は母の予約（10月10日(土) 10:00〜11:00）と重なっています」、`car_unavailable`・`fields.carId`・`fields.endsAt`・`already_registered` の文言、通信できない・500 の知らせ（入力は残す）。送っている間は「予約する」を押せない。送り直しでも同じ `request_id` を送る。成功したら車の画面へ戻る
  - Red: 未記録（想定：T-23 の画面（送った後の応答を見ない）で、AC-2・AC-10・AC-12・AC-17・AC-20 は知らせの文言が無い、AC-14・AC-15 は知らせ（role=alert）が無い、AC-16 は要求が2回送られる）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-25: 予約の中身の画面と取り消す
  - 対応: CAR-F-005 / AC-5（画面）、CAR-F-006 / AC-5, AC-10（画面）、CAR-F-007 / AC-1（画面）, AC-2, AC-4（画面）, AC-5（画面）, AC-6（画面）, AC-7（画面）, AC-8（画面）
  - 対象ファイル: `apps/web/src/pages/car/ReservationDetailPage.tsx`、`apps/web/src/pages/car/reservation-detail.test.tsx`、`apps/web/src/router.tsx`
  - 内容: 中身（車・表示名・日時・行き先・メモ）。本人で、まだ始まっていなければ「直す」「取り消す」、使用中なら「直す」だけ、終わっていれば何も出さない（見た目だけ。`packages/shared` の状態の求め方）。「この予約を取り消しますか？」の確認。404 なら「この予約は見つかりません。」、409 なら取り直して「この予約はもう始まっているため取り消せません。終了の日時を直してください。」
  - Red: 未記録（想定：中身の無い画面（`<main aria-label="予約" />` だけ）で、F-005/AC-5 はメモが無い、F-007/AC-1・AC-2・AC-5・AC-6・AC-8 は「取り消す」のボタンが無い。F-006/AC-5・AC-10、F-007/AC-4・AC-7 は「出ない」ことを言うので中身の無い形で通る。中身を出した後に、本人・状態でボタンを出し分けない誤りを一時的に入れて失敗するのを確かめる）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-26: 予約を直す画面
  - 対応: CAR-F-006 / AC-4（画面）, AC-7（画面）, AC-11（画面）, AC-12（画面）, AC-13（画面）, AC-14（画面）, AC-15（画面）, AC-16（画面）, AC-17（画面）, AC-18（画面）, AC-20（画面）, AC-21（画面）
  - 対象ファイル: `apps/web/src/pages/car/ReservationEditPage.tsx`、`apps/web/src/pages/car/ReservationForm.tsx`、`apps/web/src/pages/car/reservation-edit.test.tsx`、`apps/web/src/router.tsx`
  - 内容: まだ始まっていない予約は全項目、使用中の予約は終了・行き先・メモだけ（車・開始日時の欄を出さず、送らない）。車の選択肢は「使う」の車と今の車（「使わない」でも）。D-4 のとおり全項目と版を送る。409 `state_changed` を受けたら取り直し、見ていたときと比べて「始まっていた」「終わっていた」「中身が変わっていた」で知らせを出し分け、最新を出す。404 は「この予約は見つかりません。」
  - Red: 未記録（想定：中身の無い画面（`<main aria-label="予約を直す" />` だけ）で、どの AC も入力の欄（終了の日付）が無く、入力も送信もできない）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-27: 履歴の画面
  - 対応: CAR-F-008 / AC-1（画面）, AC-2（画面）, AC-3（画面）
  - 対象ファイル: `apps/web/src/pages/car/CarHistoryPage.tsx`、`apps/web/src/pages/car/car-history.test.tsx`、`apps/web/src/router.tsx`
  - 内容: 終わった予約を新しい順に、`ReservationRow` で。続きのカーソルがあれば「もっと見る」
  - Red: 未記録（想定：中身の無い画面（`<main aria-label="車の履歴" />` だけ）で、AC-1 は予約の行が無い、AC-2 は「終わった予約はありません」が無い、AC-3 は「もっと見る」が無い）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-28: 車の管理の画面（登録・名前を変える）
  - 対応: CAR-F-001 / AC-2（画面）, AC-3（画面）, AC-4（画面）、CAR-F-009 / AC-2（画面）, AC-3（画面）, AC-5（画面）
  - 対象ファイル: `apps/web/src/pages/car/CarsPage.tsx`、`apps/web/src/pages/car/cars.test.tsx`、`apps/web/src/router.tsx`
  - 内容: 車の一覧（「使わない」の印）、名前の入力と「登録する」、「名前を変える」と「保存する」。空白だけなら送らずに「入力してください」、409 `duplicate_name` は「同じ名前の車があります」、404 は「この車は見つかりません。」。書き込みの失敗の知らせは入力を残す
  - Red: 未記録（想定：中身の無い画面（`<main aria-label="車の管理" />` だけ）で、どの AC も名前の入力・「名前を変える」が無い）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-29: 車の管理の画面（使わない・使う・削除）
  - 対応: CAR-F-002 / AC-1（画面）, AC-3（画面）, AC-4, AC-5（画面）, AC-6（画面）、CAR-F-003 / AC-1（画面）, AC-2（画面）, AC-5（画面）, AC-6, AC-7（画面）
  - 対象ファイル: `apps/web/src/pages/car/CarsPage.tsx`、`apps/web/src/pages/car/cars.test.tsx`
  - 内容: 「使わないにする」（「『ノア』を使わないにしますか？」、これからの予約があれば件数を添える）・「使うに戻す」（確認なし）・「削除」（予約の無い車だけ。「『ノア』を削除しますか？」）。409 `in_use` は「この車には予約があるため削除できません。使わないにしてください。」、404 は「この車は見つかりません。」
  - Red: 未記録（想定：T-28 の画面（ボタンが無い）で、F-002/AC-1・AC-3・AC-4・AC-5・AC-6、F-003/AC-1・AC-5・AC-6・AC-7 は「使わないにする」「削除」のボタンが無い。F-003/AC-2 は「削除」が「出ない」ことを言うので、「使わないにする」が無いことで失敗し、その後に予約の有無で出し分けない誤りを入れて確かめる）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

## 6. 仕上げ

- [ ] T-30: 開発環境で確かめる（管理者の手作業）
  - 対応: COMMON-N-008（幅 360px・1280px の手動確認）、COMMON-N-003（Data API）、COMMON-N-007（CPU 時間）、design.md「移行計画」「リスクと懸念」
  - 対象ファイル: なし。結果はこのタスクの「結果」に書く
  - 内容: spec/003-car を push し、Deploy API を手動で実行して stylus-dev と stylus-api-dev に流す。Pages のプレビューで、車のすべての画面（`/car` 以下の6つと、変えた `/`）を幅 360px と 1280px で開き、横スクロールが出ず、すべての操作ができることを確かめる。車の登録 → 予約 → 重なりで止まる → 直す → 取り消す、使わないにする → 使うに戻す、予約の無い車の削除、を一通り通す（2人の家族に分かれて）。公開キーで Data API を呼び、新しい2つの表を読めない・書けないことを確かめる。Cloudflare で 1102（CPU 時間の超過）が出ていないことを確かめる
  - Red: 対象外（手動の確認）
  - 完了条件: すべての確認が済み、結果が書かれている

## 7. この spec の外のリリース作業（/spec-close の後）

002 と同じく、本番へのデプロイは spec を閉じて `develop` にマージした後、`develop` → `main` のマージで行う（要件を作る作業ではなく、できたものを配るリリースの作業のため、この spec のタスクに入れない）。

- 本番に出す（管理者の手作業）：本番の `stylus` へのマイグレーション 0004（`btree_gist` を含む。V-2 で管理画面から有効にした場合は本番でも先に有効にする）と `stylus-api` のデプロイが流れたこと、公開キーで Data API から新しい2つの表を読めない・書けないこと、1102 が出ていないことを確かめる

## /spec-close へ引き継ぐこと

- spec「3. 変更差分」の「/spec-close で直す先」をそのまま行う（car.md・README・architecture.md・ADR-0008 の注記・排他制約の ADR・glossary・review-notes・handoff）
- D-5：car.md へ移すときに「片方だけを送る要求は形が違うので 400」の1文を、使用中の予約の箇条から CAR-F-006 の「例外・バリデーション」の共通の箇条へ移す（振る舞いは変えない）。オーナーに確かめてから行う
- D-1〜D-6 の決定を docs/review-notes.md の spec 003 の注意6件の行に書き添える
- T-2 で管理画面から `btree_gist` を有効にした場合は、その手順を architecture.md（または ADR）に残し、本番のリリースでも同じ手順を行う

## AC カバレッジ

| AC | タスク |
|----|-------|
| CAR-F-001/AC-1 | T-4, T-23 |
| CAR-F-001/AC-2 | T-4, T-28 |
| CAR-F-001/AC-3 | T-4, T-28 |
| CAR-F-001/AC-4 | T-4, T-28 |
| CAR-F-001/AC-5 | T-4 |
| CAR-F-001/AC-6 | T-4, T-23 |
| CAR-F-002/AC-1 | T-5, T-23, T-29 |
| CAR-F-002/AC-2 | T-5, T-23 |
| CAR-F-002/AC-3 | T-5, T-29 |
| CAR-F-002/AC-4 | T-29 |
| CAR-F-002/AC-5 | T-5, T-29 |
| CAR-F-002/AC-6 | T-5, T-29 |
| CAR-F-003/AC-1 | T-7, T-29 |
| CAR-F-003/AC-2 | T-7, T-29 |
| CAR-F-003/AC-3 | T-7 |
| CAR-F-003/AC-4 | T-7 |
| CAR-F-003/AC-5 | T-7, T-29 |
| CAR-F-003/AC-6 | T-29 |
| CAR-F-003/AC-7 | T-7, T-29 |
| CAR-F-004/AC-1 | T-8, T-23 |
| CAR-F-004/AC-2 | T-10, T-24 |
| CAR-F-004/AC-3 | T-8 |
| CAR-F-004/AC-4 | T-10 |
| CAR-F-004/AC-5 | T-8 |
| CAR-F-004/AC-6 | T-10 |
| CAR-F-004/AC-7 | T-9, T-23 |
| CAR-F-004/AC-8 | T-9, T-23 |
| CAR-F-004/AC-9 | T-8, T-22 |
| CAR-F-004/AC-10 | T-9, T-24 |
| CAR-F-004/AC-11 | T-8 |
| CAR-F-004/AC-12 | T-11, T-24 |
| CAR-F-004/AC-13 | T-23 |
| CAR-F-004/AC-14 | T-24 |
| CAR-F-004/AC-15 | T-24 |
| CAR-F-004/AC-16 | T-12, T-24 |
| CAR-F-004/AC-17 | T-12, T-24 |
| CAR-F-004/AC-18 | T-9 |
| CAR-F-004/AC-19 | T-9 |
| CAR-F-004/AC-20 | T-11, T-24 |
| CAR-F-005/AC-1 | T-13, T-22 |
| CAR-F-005/AC-2 | T-13, T-22 |
| CAR-F-005/AC-3 | T-13, T-22 |
| CAR-F-005/AC-4 | T-13, T-22 |
| CAR-F-005/AC-5 | T-13, T-25 |
| CAR-F-005/AC-6 | T-22 |
| CAR-F-005/AC-7 | T-22 |
| CAR-F-005/AC-8 | T-22 |
| CAR-F-006/AC-1 | T-15 |
| CAR-F-006/AC-2 | T-15 |
| CAR-F-006/AC-3 | T-15 |
| CAR-F-006/AC-4 | T-15, T-26 |
| CAR-F-006/AC-5 | T-25 |
| CAR-F-006/AC-6 | T-17 |
| CAR-F-006/AC-7 | T-18, T-26 |
| CAR-F-006/AC-8 | T-18 |
| CAR-F-006/AC-9 | T-17 |
| CAR-F-006/AC-10 | T-17, T-25 |
| CAR-F-006/AC-11 | T-17, T-26 |
| CAR-F-006/AC-12 | T-17, T-26 |
| CAR-F-006/AC-13 | T-17, T-26 |
| CAR-F-006/AC-14 | T-16, T-26 |
| CAR-F-006/AC-15 | T-19, T-26 |
| CAR-F-006/AC-16 | T-17, T-26 |
| CAR-F-006/AC-17 | T-16, T-26 |
| CAR-F-006/AC-18 | T-16, T-26 |
| CAR-F-006/AC-19 | T-16 |
| CAR-F-006/AC-20 | T-19, T-26 |
| CAR-F-006/AC-21 | T-19, T-26 |
| CAR-F-006/AC-22 | T-16 |
| CAR-F-007/AC-1 | T-20, T-25 |
| CAR-F-007/AC-2 | T-25 |
| CAR-F-007/AC-3 | T-20 |
| CAR-F-007/AC-4 | T-20, T-25 |
| CAR-F-007/AC-5 | T-20, T-25 |
| CAR-F-007/AC-6 | T-20, T-25 |
| CAR-F-007/AC-7 | T-20, T-25 |
| CAR-F-007/AC-8 | T-20, T-25 |
| CAR-F-008/AC-1 | T-14, T-27 |
| CAR-F-008/AC-2 | T-14, T-27 |
| CAR-F-008/AC-3 | T-14, T-27 |
| CAR-F-009/AC-1 | T-14 |
| CAR-F-009/AC-2 | T-6, T-28 |
| CAR-F-009/AC-3 | T-6, T-28 |
| CAR-F-009/AC-4 | T-6 |
| CAR-F-009/AC-5 | T-6, T-28 |

## 影響を受ける既存テスト

この spec の要件はすべて新規で、変更・廃止する要件は無い。要件の変更で直す・消す既存テストは無い。

| テスト | 理由（要件の変更・廃止 など） | 対応タスク |
|-------|---------------------------|----------|
| お金の画面のテスト（`apps/web/src/pages/money/*.test.tsx`） | 部品を `apps/web/src/components` へ移す（振る舞いは変えない）。テストは変えずに通ることを確かめる | T-21 |
| `apps/api/src/db/rls.test.ts`（COMMON-N-003/AC-1） | 新しい表 `cars`・`car_reservations` も対象に入る。テストは変えずに通ることを確かめる | T-1 |
