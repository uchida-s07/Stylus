# 004 車の予約のカレンダー 実装計画

spec: ./spec.md

<!--
並びは「DB変更 → AC ごとのサイクル」が基本。1タスクは1コミットで収まる粒度。
サイクル: 受入基準のテストを書く → 期待どおりの理由で失敗することを確かめ「Red」欄に書く → 実装 → 対象のテストとテスト全体が通る → リファクタして再び全体が通る。
テストと実装は同じコミットに入れる。Red はコンパイルエラーや import の失敗では数えない。
Red を確かめようがないタスク（DB 変更、廃止した AC のテストの削除など）は「Red: 対象外（理由）」と書く。
-->

進め方の補足：

- 「Red」欄の「未記録（想定：…）」は計画時の見込み。実装のときに、実際に実行したテストと失敗の要点で書き換える
- DB の変更は無い（spec「3. 変更差分」DB）。先頭は、FullCalendar 7 が jsdom で確かめられるかの調べ（T-1）。だめなら止めて、自動と手の確かめ方の分担をオーナーと見直してから先へ進む（spec のテストの分担を変えるなら、spec を draft に戻して直す）
- import の失敗を Red と数えないため、テストを書く前にルート・部品の**中身の無い形**を置いてから走らせる（003 と同じ）。**Red は Then が崩れることで確かめる**。中身の無い形でも Then が満たされたままになる AC（「出ない」「残らない」「閉じない」など）は、実装の後に誤りを一時的に入れて失敗を確かめ、その旨を記録する
- 「変更」の AC のうち、確かめ方だけが変わったもの（「予定に出る」→「`view=range` と時間割」）は、既存テストを新しい確かめ方に直すところからサイクルにする。直したテストが今のコードで失敗することを Red とする
- テストの置き場所：API は `apps/api/src/routes/car-reservations.test.ts`・`cars.test.ts`（`createTestApp()`）、共有のルールは `packages/shared/src/schemas/car.test.ts`・`date.test.ts`、画面は `apps/web/src/pages/car/*.test.tsx`（`installCarApi`）。時間割で範囲を選ぶテストは `apps/web/src/pages/car/car-select.test.tsx` を新しく作る
- AC が「予約が出る・出ない」のようにデータの結果を言うものは API のテスト（`view=range`）で、「帯が出る」「印が出る」「選ばれている」「入力が出る・閉じる」のように画面の表示・操作を言うものは画面のテストで確かめる。両方に関わる AC は両方のタスクに挙げ、どちらのテストにも同じタグを付ける（003 と同じ）
- 画面のテストでの時間割の確かめ方（spec「3. 変更差分」画面の「テスト」）：jsdom ではドラッグ・長押しを再現できないので、範囲の選択は FullCalendar の API（`select`）で起こす。帯は、帯の文字と、データの属性（予約の ID・色の番号・「使わない」の印など）で確かめる。日の印は日のセルの属性か文字で確かめる。帯の縦の位置・横の並びの見た目、ドラッグ・長押しの手ざわり、最初の表示位置、15分刻み、幅 360px・1280px の見た目は T-13 で手で確かめる
- 「今」：AC の Given に時刻が無いものは、003 の D-3 と同じく**日本時間 2026-10-07 20:00**（`2026-10-07T11:00:00Z`）に固定する（API は `AppConfig.now`、画面は `setDeviceClock`）
- この PC でテストを走らせるときは `node_modules/.bin/vitest run --maxWorkers=4`（既定の並列数だと web・repo-checks の一部が時間切れで落ちる。Bash に `pnpm` は無い）
- 新しい依存は `apps/web` にだけ足す（FullCalendar と `temporal-polyfill`）。`apps/api`・`packages/shared` は import しないので、Workers で動くかの確認は対象外（T-1 で `apps/api` の依存に入っていないことを確かめる）

## 1. 先に確かめること

- [x] T-1: FullCalendar 7.1.1 を入れ、jsdom で確かめられるかと、帯の右の余白を調べる
  - 対応: spec「3. 変更差分」画面の「部品」「先に確かめること」「大きさ」
  - 対象ファイル: `apps/web/package.json`、`pnpm-lock.yaml`。結果はこのタスクの「結果」に書く
  - 内容:
    - 入れる前に `apps/web` をビルドし、出力の大きさ（gzip。最初に読む JS と CSS の合計、全体の合計）を記録する
    - 公式の説明で、v7 の MIT の部品（React・月（dayGrid）・時間割（timeGrid）・操作（interaction））のパッケージ名と import の書き方、`temporal-polyfill` の要否と読み込み方を確かめる。Premium の部品が依存に入らないことを確かめる
    - 版を固定して（`^` を付けずに `7.1.1`）`apps/web` に足す
    - V-1（jsdom）：捨てるテストで、`timeZone: 'Asia/Tokyo'`・`locale: 'ja'` の1日の時間割と月のカレンダーを描き、(a) 帯が DOM に出て、帯の中身（`eventContent`）の文字とデータの属性を読めるか、(b) 日のセルに印を出して読めるか、(c) テストから FullCalendar の API（`select`）を呼んで `select` の受け手が開始・終了つきで呼ばれるか（テストから API に届く方法も決める。例：時間割の部品が ref を受け取る、テスト用に API を渡す口を作る）を確かめる
    - V-2（帯の右の余白）：v7 で帯の右に帯の無い余白を残す設定があるか、無ければ CSS で作れるかを、開発サーバーの画面（幅 360px）で確かめる。指で押せる幅にする値の当たりを付ける（最終の確認は T-13）
  - Red: 対象外（調べと依存の追加）
  - 完了条件: 依存が版を固定して入り、テスト全体と lint が通る。確かめに使ったテストは残さない（同じことは T-6 以降のテストで確かめる）。V-1・V-2 の結果と、入れる前のビルドの大きさが「結果」に書かれている。V-1 がだめなら、ここで止めてオーナーに伝える
  - 結果: 2026-10-11。
    - 入れる前のビルドの大きさ（`vite build` の gzip）：JS 265.61 kB（`index-*.js` の1つだけ。最初に読む JS と同じ）、CSS 34.17 kB、HTML 0.36 kB。最初に読む JS と CSS の合計 299.78 kB、全体 300.14 kB
    - 部品：v7 は `@fullcalendar/react` の1つのパッケージに月・時間割・操作がまとまっている（`@fullcalendar/react/daygrid`・`/timegrid`・`/interaction`。日本語は `@fullcalendar/react/locales/ja`）。CSS は `@fullcalendar/react/skeleton.css` が必ず要り、テーマ（`@fullcalendar/react/themes/classic` のプラグインと、その `theme.css`・`palette.css`）を足す（公式の React の説明 https://fullcalendar.io/docs/react と同梱の README で確かめた）。`temporal-polyfill` は peer の依存で、FullCalendar が `temporal-polyfill/fns/*` を直接 import する（グローバルの polyfill として読み込む手当ては要らない）。`@fullcalendar/react` 7.1.1 と `temporal-polyfill` 1.0.5 を `apps/web` に版を固定して足した。増えたのは `@fullcalendar/core`・`@full-ui/headless-calendar`（どれも MIT）と `temporal-*` だけで、Premium（`@fullcalendar/react-scheduler`）は入っていない。`apps/api`・`packages/*` の依存には入っていない
    - V-1 は合格（捨てるテストで確かめ、残していない）。`timeZone: 'Asia/Tokyo'`・`locale: ja` で、(a) 1日の時間割（`timeGridDay`）の帯が jsdom でも DOM に出て、`eventContent` で描いた文字とデータの属性（予約の ID・色の番号）を読めた。日をまたぐ予約（22:00〜翌 2:00）はその日の分の帯が出た。(b) 月のカレンダー（`dayGridMonth`）の日のセルが42個出て、セルに `data-date="2026-10-10"` が付く。v7 では日のセルの中身の設定は `dayCellTopContent`（v6 の `dayCellContent` は無い）で、そこに印を描いて読めた。`dayCellTopContent` が受け取る `date` は日本時間のその日の 0:00 の時刻（10月10日なら `2026-10-09T15:00Z`）なので、日付は `toJstDate()` で求める。(c) `ref` で受け取った部品から `getApi().select('2026-10-10T09:00:00', '2026-10-10T12:00:00')` を呼ぶと、`select` の受け手が日本時間の開始・終了（`2026-10-10T00:00:00.000Z`〜`03:00:00.000Z`）で呼ばれた。テストから届く方法は、時間割の部品が FullCalendar の `ref` を外へ渡す口を持つ形にする（T-6 で決める）
    - V-2 は合格。v7 では時間割の帯の入れ物の左右の余白を設定 `dayLaneInnerClass` で決めていて、classic テーマの既定は右 2.5%（幅 360px で約 5px）。自前のクラスを `dayLaneInnerClass` に渡すとテーマのクラスに**足される**ので、CSS の詳細度を上げて（`.x.x { margin-inline-end: … }`）右の余白を上書きする。開発サーバーの試しのページ（幅 360px）で 48px にすると、帯の右に約 48px の余白ができ、そこからドラッグして範囲を選べ、15分刻み（`snapDuration: '00:15'`）に揃った。同じ時間の2本の帯は既定だと重なって出るので、`slotEventOverlap: false` で横に並べる（並んだのを確かめた）。当たりは 48px（最終の確認は T-13）
    - テスト全体（`vitest run --maxWorkers=4`）と lint が通った（1回目は開発サーバーを動かしたままで1件が時間切れで落ち、止めて走らせ直すと 601 件すべて通った）

## 2. 共有のルール

- [x] T-2: 期間で引く入力のスキーマ・車の色の番号の形・日本時間の日の境目
  - 対応: spec「3. 変更差分」API（`view=range` の入力の条件、`packages/shared` に足すもの）。T-4・T-5 の土台
  - 対象ファイル: `packages/shared/src/schemas/car.ts`（`reservationListQuerySchema` の `view` に `'range'`、`from`・`to`。`carListItemSchema` に `colorIndex`）、`packages/shared/src/date.ts`（日本時間の日付 `YYYY-MM-DD` から、その日の 0:00 の日時を求める部品・日付に日数を足す部品）、`packages/shared/src/schemas/car.test.ts`・`date.test.ts`（AC なし）、`apps/web/test/car.ts`（`carItem` に `colorIndex` を足す。形の追随）
  - 内容: `from`・`to` は `YYYY-MM-DD` の実在する日付、`from` ≤ `to`、両端を含めて 42 日まで。`view=range` のときだけ必須。`view` の既定値 `upcoming` は変えない。日の境目は `toJstDate()` と同じく Intl を使わず UTC+9 で求める（COMMON-N-009）
  - Red: 対象外（AC を持たない土台。42 日と 43 日、`from` > `to`、2月30日、形の違う日付、日本時間の 0:00 の境目の単体テストは、素朴な形で失敗するのを見てから通す）
  - 完了条件: 単体テストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る
  - 結果: 2026-10-11。`packages/shared/src/date.ts` に、実在する日付か（`isDateString`）・日本時間のその日の 0:00（`jstStartOfDay`）・日数を足す（`addDays`）・2つの日付の間の日数（`diffDays`）を足し、`reservationListQuerySchema` に `view: 'range'` と `from`・`to`（上限は `RANGE_MAX_DAYS` = 42）を足した。単体テストは素朴な形（日付の判定がいつも真、0:00 が null、日数を足しても変わらない・差がいつも0、`from`・`to` を何でも受け付ける）で6件が失敗するのを見てから通した。`carListItemSchema` の `colorIndex` と `apps/web/test/car.ts` の `carItem` は、T-2 で足すと `GET /cars` の応答（`satisfies CarListResponse`）が T-5 まで型の誤りになるため、T-5 で API と一緒に足す

- [x] T-3: 二重登録の知らせを「車の画面で確かめて」にする
  - 対応: CAR-F-004 / AC-17（API）, AC-17（画面）
  - 対象ファイル: `packages/shared/src/schemas/car.ts`（`CAR_MESSAGES.alreadyRegistered`）、`apps/api/src/routes/car-reservations.test.ts`、`apps/web/src/pages/car/reservation-new.test.tsx`
  - 内容: 両方のテストの期待の文言を「この予約はすでに登録されています。車の画面で確かめて、必要なら直してください。」に直してから、文言を変える
  - Red: 2026-10-11 実行。両方のテストの期待（と画面のテストの偽の API の応答）を新しい文言に直して走らせ、API の AC-17 は応答の message が「…予定で確かめて…」のまま（`expected '…予定で確かめて…' to be '…車の画面で確かめて…'`）、画面の AC-17 は「…車の画面で確かめて…」の知らせが見つからない（画面は `CAR_MESSAGES.alreadyRegistered` を出すため）で失敗した
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

## 3. API

- [x] T-4: 期間で引く予約の一覧と、「予定に出る」で確かめていた API テストの書き直し
  - 対応: CAR-F-005 / AC-1（API）, AC-2（API）, AC-3（API）, AC-4（API）, AC-9（API）、CAR-F-004 / AC-1（API）, AC-9（API）、CAR-F-002 / AC-3（API）、CAR-F-006 / AC-1, AC-2, AC-7（API）, AC-8（API）, AC-21（API）、CAR-F-007 / AC-1（API）, AC-8（API）、CAR-F-009 / AC-1
  - 対象ファイル: `apps/api/src/car/list.ts`（`listRange`）、`apps/api/src/routes/car-reservations.ts`、`apps/api/src/routes/car-reservations.test.ts`（`view=range` で引く部品を足す）、`apps/api/src/routes/cars.test.ts`（CAR-F-002/AC-3）
  - 内容:
    - `GET /car-reservations?view=range&from&to`：`starts_at < (to の翌日 0:00)` かつ `ends_at > (from の 0:00)`（日本時間）を、開始の早い順（同じなら車の名前、ID の順）ですべて。`nextCursor` は `null`。入力が外れたら 400 `invalid_input`
    - 上の「対応」の既存テストのうち `view=upcoming` で「予定に出る・出ない」を確かめていたものを、AC の新しい書き方のとおり `view=range`（その日・その月）で確かめる形に直す。CAR-F-005/AC-2 は「10月9日」を引いて空になること（Given に、10月9日 0:00 に終わる予約と 10月10日 0:00 に始まる予約を置く）、AC-9 は前の月（9月）の範囲で終わった予約が返ることを確かめる
    - タグなし：終わった・使用中・まだ始まっていない予約を区別せずに返す、`from` の 0:00 ちょうどに終わる予約と `to` の翌日 0:00 ちょうどに始まる予約は返さない、日本時間と UTC で日付がずれる予約（10月10日 8:00）を正しい日で返す、43 日・`from` > `to`・実在しない日付・`from` 無しは 400
    - `view=upcoming` を使うそのほかのテスト（CAR-F-004/AC-3・AC-5・AC-11、「開始が同じなら車の名前の順」）はそのまま
  - Red: 2026-10-11 実行。`view=range` を受けて空の一覧を返す中身の無い形で16件が「出るはずの予約が出ない」（`expected [] to deeply equal [ 'ノア くうご 10-10 09:00〜10-10 12:00' ]` など）で失敗した：CAR-F-002/AC-3、CAR-F-004/AC-1・AC-9、CAR-F-005/AC-1・AC-3・AC-4・AC-9、CAR-F-006/AC-1・AC-2・AC-7・AC-8・AC-21、CAR-F-009/AC-1、タグなし3件（区別せずに返す・境目の内側・日本時間の日付）。空でも通った CAR-F-005/AC-2 とタグなしの境目は、実装の後に期間の条件を `<=`・`>=` にずらす誤りで AC-2（10月9日 0:00 に終わる予約と10月10日 0:00 に始まる予約が出る）と境目のテストが、条件を外す誤りで AC-2・境目・日本時間の日付のテストが失敗するのを確かめた。CAR-F-007/AC-1・AC-8（取り消した予約が出ない）も空でも通るので、取り消しの削除を飛ばす誤りを入れ、AC-1 は予約が DB に残る、AC-8 は10月10日を引くと予約が出るで失敗するのを確かめた。400 のタグなしは T-2 の入力の検証で中身の無い形でも通る（入力の検証の細部は T-2 の単体テストで Red を見ている）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る
  - 結果: 2026-10-11。`apps/api/src/car/list.ts` に `listRange`（`jstStartOfDay(from)` から `jstStartOfDay(addDays(to, 1))` まで、`starts_at < 終わり` かつ `ends_at > 始まり`、開始・車の名前・ID の順）を足し、ルートの `view=range` から呼ぶ。タグなしの「開始の早い順」のテストには、開始が同じなら車の名前の順になることも入れた。テスト全体は、お金の画面のタグなし1件（「カテゴリーの編集」へ進む）が並列の負荷で 5 秒を超えて落ち、単独で走らせると通った（この変更と関わらない既知の時間切れ）。lint も通った

- [x] T-5: 車の色の番号（`GET /cars` の `colorIndex`）
  - 対応: CAR-F-005 / AC-10（API）。CAR-F-001/AC-6 の API テストの形の追随
  - 対象ファイル: `apps/api/src/routes/cars.ts`、`apps/api/src/routes/cars.test.ts`
  - 内容: 各車に、登録の古い順（同じ時刻なら ID の順）で 0 からの番号を付ける。返す順は名前の順のまま。AC-10 のテストは、登録の順と名前の順が違う並び（「フィット」を先に登録）で確かめる。CAR-F-001/AC-6 の完全一致の期待に `colorIndex: 0` を足す。タグなし：同じ登録時刻なら ID の順
  - Red: 2026-10-11 実行。`colorIndex` をいつも 0 で返す中身の無い形で、AC-10 は「ノア」と「フィット」の番号がどちらも 0（`expected [ [ 'ノア', +0 ], [ 'フィット', +0 ] ] to deeply equal [ [ 'ノア', 1 ], [ 'フィット', +0 ] ]`）、タグなしの同じ時刻の ID の順も同じ理由で失敗した。CAR-F-001/AC-6 は AC が変わらない形の追随なので対象外
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る
  - 結果: 2026-10-11。`GET /cars` で `row_number() over (order by created_at, id) - 1` を `colorIndex` として返す（返す順は名前の順のまま）。T-2 から回した `carListItemSchema` の `colorIndex` と `apps/web/test/car.ts` の `carItem`（`colorIndex: 0`）もここで足した。AC-10 のテストは「BMW」を消し、登録の時刻を決めて「フィット」→「ノア」の順に入れ、名前の順（ノア・フィット）と番号の順が違うことを確かめる。テスト全体（615件）・lint・型の検査が通った

## 4. 画面

- [x] T-6: 車の画面を月のカレンダーと時間割にする（帯・印・日を選ぶ）
  - 対応: CAR-F-005 / AC-1（画面）, AC-2（画面）, AC-3（画面）, AC-6, AC-7, AC-8、CAR-F-004 / AC-1（画面）, AC-9（画面）、CAR-F-006 / AC-7（画面）, AC-8（画面）
  - 対象ファイル: `apps/web/src/pages/car/CarPage.tsx`（作り直し）、`apps/web/src/pages/car/CarCalendar.tsx`（FullCalendar の月と時間割、帯の中身）、`apps/web/src/pages/car/NoCars.tsx`（`CarPage` から移す。予約の入力の画面が遅延読み込みの塊を引き込まないように）、`apps/web/src/pages/car/ReservationNewPage.tsx`（`NoCars` の import）、`apps/web/src/router.tsx`（`CarPage` を `React.lazy`）、`apps/web/src/pages/car/ReservationRow.tsx`・`CarHistoryPage.tsx`（履歴だけで使い、いつも日付を添える）、`apps/web/src/pages/car/car-page.test.tsx`（書き直し）、`apps/web/src/pages/car/reservation-edit.test.tsx`（F-006/AC-7・AC-8）、`apps/web/test/car.ts`（帯・日のセルを探す部品）
  - 内容:
    - 読み込み：`GET /cars` と、月のカレンダーに見えている範囲（最大6週）の `view=range` を1回。選んだ日の時間割も同じ結果から出す
    - `?date=YYYY-MM-DD` の日を選ぶ（無い・形が違うときは `toJstDate()` の今日）。日を押すとその日を選び、`?date=` を置き換える（履歴を積まない）
    - FullCalendar：`timeZone: 'Asia/Tokyo'`、`locale: 'ja'`。月のカレンダーは予約が一部でもかかる日に印（終了がちょうど 0:00 の日には出さない）。時間割は 0:00〜24:00、30 分の目盛り、範囲は 15 分刻み、最初の表示位置は今日なら今の時刻のあたり・それ以外は 8:00。同じ時間の帯は隠さずに並べる。帯の右の余白は T-1 で決めた方法
    - 帯：車の名前・表示名・時間（`timeRange` の形。日をまたぐなら全体を「22:00〜10月11日(日) 2:00」）・行き先。使用中なら「使用中」（`packages/shared` の状態の求め方と端末の時計）
    - 知らせ：AC-6・AC-7・AC-8 は今と同じ文言と車の管理への入口
    - タグなし：「予約する」で予約の入力へ、右上のメニューから履歴・車の管理へ（今のテストから帯を押す部分を除いたもの。帯を押す部分は T-9）、アプリのホームの「車」から車の画面へ（「これからの予約はありません」でなくカレンダーが出るのを待つ）
    - 車の画面へ戻ったことを古い一覧の文言（「これからの予約はありません」「10月10日(土)」の見出し）で確かめていた既存テスト（`reservation-detail.test.tsx` の CAR-F-007/AC-1・AC-8、`reservation-new.test.tsx` の CAR-F-004/AC-1）は、この時点では「車の画面のカレンダーが出た」ことを確かめる形に直す。戻った先の日付と帯は T-9・T-10 で確かめる。`reservation-new.test.tsx` の AC-1 は、予約の送信の中身（車・日時・行き先）を確かめる形にし、帯が出ることは `car-page.test.tsx` の AC-1（母が10月10日を選ぶ）で確かめる
    - 大きさ：ビルドの大きさ（gzip）を T-1 と同じ測り方で測り、「結果」に書く。最初に読む JS に FullCalendar が入っていないことを確かめる
  - Red: 2026-10-14 実行。書き直したテストを今の一覧の画面で走らせ、13件が失敗した：F-005/AC-1 と F-004/AC-9・F-006/AC-7・AC-8 は時間割が無い（`Unable to find role="region" and name "10月7日(水)の時間割"` など）、F-005/AC-2・AC-3 は月のカレンダーの日が無い（`月のカレンダーに 10月9日(金) が無い`）、F-004/AC-1 と F-007/AC-1・AC-8（戻った先の仮の形）は月のカレンダーが無い（`Unable to find role="region" and name "2026年10月のカレンダー"`）。タグなしの4件（見えている範囲を1回引く、`?date` の日を選ぶ、`?date` が実在しない日付なら今日、ホームから車の画面へ進みカレンダーが出る）も同じ理由で失敗した。F-005/AC-6・AC-7・AC-8 は振る舞いが変わらないので対象外とし、作り直しの後も通ることを確かめた
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体と lint が通る。ビルドの大きさが「結果」に書かれている
  - 結果: 2026-10-14。
    - `CarPage` を作り直し、`CarCalendar`（月のカレンダーと時間割。月が変わるたび・日が変わるたびに作り直して、最初の表示位置をその日に合わせる）、`NoCars`、`calendarDates`（月の1日・見えている範囲の42日）を足した。`/car` は `LazyCarPage`（`React.lazy`＋`Suspense`）で開いたときに読み込む（`router.tsx` に部品を置くと lint の react-refresh の規則に当たるため、別のファイルにした）。月を移ったときに読み直せるよう、`useApiLoad` に読み直しの鍵（`key`）を足した（読み終わるまでは前の結果を出したまま）。`ReservationRow` は履歴だけで使い、いつも日付を添える
    - `calendarDates.ts` は見えている範囲を求めるのに T-6 で要るので、T-8 から前倒しして作り、単体テスト（月の初めが日曜・土曜の月、12月から1月）も足した（素朴な形で失敗するのを見る手順は踏んでいない。AC を持たない部品）
    - v7 で分かったこと：月のカレンダーの日のセルの上の部分（`dayCellTopContent` を描く所）を FullCalendar が `aria-hidden="true"` にし、日付の読み上げはセル（`role="gridcell"`、`aria-label="2026年9月27日"`）が持つ。そのため日のボタンは役割（role）では探せず、テストの部品（`test/car.ts` の `selectDay`・`markedDays`）はデータの属性（`data-day-label`・`data-has-reservations`）で探す。テーマはセルの上の部分の数字を右に寄せるので、`dayCellTopClass` に自前のクラスを渡してボタンを幅いっぱいに広げた
    - 開発サーバーの試しのページ（コミットしていない）で、日のボタン・印・選んだ日の色、帯の文字（白で読める）、同じ時間の2本の帯が横に並ぶこと、帯の右の余白を目で確かめた。月のカレンダーのセルが縦に長め（1行 約 90px。6行で 500px 余り）なので、スマホで時間割まで遠くないかを T-13 で確かめる
    - ビルドの大きさ（`vite build` の gzip。T-1 と同じ測り方）：最初に読む JS 266.21 kB（入れる前 265.61 kB。遅延読み込みの補助の分だけ増えた）、CSS 34.17 kB（変わらず）、HTML 0.36 kB。車の画面の塊は JS 72.98 kB・CSS 3.91 kB。最初に読む JS と CSS の合計 300.38 kB（入れる前 299.78 kB）、全体 377.63 kB（入れる前 300.14 kB）。最初に読む JS に FullCalendar が入っていないこと（`fc-classic`・`dayGridMonth`・`Temporal` の文字が無い）を確かめた
    - テスト全体（`vitest run --maxWorkers=4`、623件）・lint・型の検査が通った。リファクタ（日のボタンの幅）の後にもう一度テスト全体が通った

- [x] T-7: 帯を車の色で塗り、「使わない」の車の帯を薄くする
  - 対応: CAR-F-005 / AC-4（画面）, AC-10（画面）
  - 対象ファイル: `apps/web/src/pages/car/carColors.ts`（決まった8色。9台目からは繰り返す）、`apps/web/src/pages/car/CarCalendar.tsx`、`apps/web/src/pages/car/car-page.test.tsx`
  - 内容: 帯の色は `GET /cars` の `colorIndex` 番目の色。帯に色の番号のデータの属性を付ける。「使わない」の車の帯は薄くし、印のデータの属性を付け、車の名前に「使わない」を添える。タグなし：9台目の車は1台目と同じ色（`carColors.ts` の単体テスト）
  - Red: 2026-10-14 実行。T-6 の帯（色を付けない）と、色の並びが空の `carColors.ts` で走らせ、AC-10 は色の番号の属性が無い（`expected [ [ 'ノア', undefined ], …(1) ] to deeply equal [ [ 'ノア', '1' ], [ 'フィット', '0' ] ]`）、AC-4 は帯の文字に「使わない」が無い（`toHaveTextContent` が `/ノア.*使わない.*くうご/` に合わない）で失敗した。タグなしの `carColors.ts` の単体テスト2件も、色が無い（`expected [] to have a length of 8`）で失敗した
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る
  - 結果: 2026-10-14。`carColors.ts` に白の文字が読める濃さの8色を置き、`CarCalendar` は `GET /cars` の `colorIndex` で帯を塗る（FullCalendar の予定の `color`）。帯の中身に `data-color-index`・`data-inactive` を付け、「使わない」の車は車の名前に「（使わない）」を添え、`eventClass` で `car-band-inactive`（不透明度 0.45）を付けて薄くする。AC-4 のテストは、そのクラスが FullCalendar の帯に付いていることも確かめる。AC-10 のテストは、色の番号と名前の順が逆（ノア 1・フィット 0）になる形で確かめる。テスト全体（627件）・lint・型の検査が通った。リファクタで直すところは無かったので、2回目の全体の実行はしていない

- [x] T-8: 前の月・次の月へ移る
  - 対応: CAR-F-005 / AC-9（画面）, AC-11, AC-13
  - 対象ファイル: `apps/web/src/pages/car/CarPage.tsx`、`apps/web/src/pages/car/CarCalendar.tsx`、`apps/web/src/pages/car/calendarDates.ts`（月の1日・見えている範囲の求め方。T-6 で作った）、`apps/web/src/pages/car/car-page.test.tsx`
  - 内容: 前の月・次の月へ移ると、その月の1日（今月へ戻ったときは今日）を選び、`?date=` を置き換え、その月の見えている範囲を `view=range` で引き直す。「今日」で今日へ。読み込めなかったときは読み込みの知らせ（AC-11）。タグなし：「今日」で今日に戻る、`calendarDates.ts` に足す部品の単体テスト（見えている範囲の単体テストは T-6 で足した）
  - Red: 2026-10-14 実行。T-7 の画面で走らせ、AC-9 は前の月へ移る手段が無い（`Unable to find an accessible element with the role "button" and name "前の月"`）、AC-11・AC-13 とタグなしの「今日」は次の月へ移る手段が無い（同じく「次の月」が見つからない）で失敗した（月を移る操作そのものが無いため、想定の「印と帯が無い」の手前で止まる）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る
  - 結果: 2026-10-14。月のカレンダーの見出しの右に「‹」（前の月）・「今日」・「›」（次の月）を置いた。移る先は `calendarDates.ts` の `monthMoveTarget`（その月の1日。今日のある月へ戻ったときは今日）で求め、`?date=` を置き換える。選んだ日の月が変わると、T-6 で足した `useApiLoad` の鍵で見えている範囲を引き直し、読み込めなければ読み込みの知らせを出す（AC-11）。AC-9 のテストは9月の見えている範囲（8月30日〜10月10日）を引き直したことも確かめる。`monthMoveTarget` の単体テスト（その月の1日、今日のある月へ戻ると今日、12月から1月・1月から12月）は実装と一緒に書いた（AC を持たない部品）。実装の途中で、11月1日を選ぶと月のカレンダーが二重に出る不具合が見つかった：月のカレンダーと時間割の key がどちらも `2026-11-01` になってぶつかっていたので、`month-`・`day-` の印を付けて直した（「今日」のタグなしのテストで見つかった）。テスト全体（634件）・lint・型の検査が通った。直しはテスト全体の前に入れたので、2回目の全体の実行はしていない

- [x] T-9: 帯を押して予約の中身へ進み、中身から選んだ日へ戻る
  - 対応: CAR-F-005 / AC-5（画面）, AC-12, AC-15、CAR-F-007 / AC-1（画面）, AC-8（画面）
  - 対象ファイル: `apps/web/src/pages/car/CarCalendar.tsx`（帯を押すと `/car/reservations/:id`）、`apps/web/src/pages/car/ReservationDetailPage.tsx`（「車へ」と取り消した後の戻り先を `/car?date=<予約の開始の日>`）、`apps/web/src/pages/car/car-page.test.tsx`、`apps/web/src/pages/car/reservation-detail.test.tsx`
  - 内容: CAR-F-005/AC-5 の画面のテストは、母が時間割の帯を押して予約の中身へ進み、行き先とメモが出るところまで（中身の画面の既存の AC-5 のテストはそのまま）。CAR-F-007/AC-1・AC-8 は、取り消した後に10月10日が選ばれていて、時間割にその帯が無いことを確かめる形に直す
  - Red: 2026-10-16 実行。T-8 の画面で走らせ、AC-5 は帯を押しても中身へ進まない（`Unable to find an element with the text: 帰りに給油する`）、AC-12 は同じ理由で「車へ」が見つからない（`Unable to find role="link" and name "車へ"`）、AC-15・F-007/AC-1・AC-8 は取り消した後に `?date` なしの車の画面へ戻り今日（10月7日）が選ばれる（`Unable to find role="region" and name "10月10日(土)の時間割"`）で失敗した
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る
  - 結果: 2026-10-16。帯を予約の中身へのリンクにし（FullCalendar の予定の `url`）、押したときは `eventClick` で既定の移動を止めてアプリの中で移る。予約の中身の画面の「車へ」と取り消した後の戻り先を `/car?date=<予約の開始の日>` にした（見つからないときの知らせの「車へ」は `/car` のまま）。F-005/AC-5 と AC-12 は車の画面のテスト、AC-15 と F-007/AC-1・AC-8 は予約の中身の画面のテストで確かめる。テスト全体（637件）は repo-checks の1件（`[COMMON-N-010/AC-1]`、45 秒）が並列の負荷で落ち、単独で走らせると通った（この変更と関わらない既知の時間切れ）。lint・型の検査が通った。リファクタは import の並びを整えただけで、その後に走らせたのが上のテスト全体

- [x] T-10: 予約する・直す画面の保存の後に、予約の開始の日へ戻る
  - 対応: CAR-F-004 / AC-26、CAR-F-005 / AC-14、CAR-F-006 / AC-21（画面）
  - 対象ファイル: `apps/web/src/pages/car/ReservationNewPage.tsx`（`/car?date=<予約の開始の日>`）、`apps/web/src/pages/car/ReservationEditPage.tsx`（`/car?date=<直した後の開始の日>`）、`apps/web/src/pages/car/reservation-new.test.tsx`、`apps/web/src/pages/car/reservation-edit.test.tsx`
  - 内容: AC-26・AC-14 のテストを足し、CAR-F-006/AC-21 の画面のテスト（今は戻った先の pathname だけを見ている）を、10月10日が選ばれ 9:00〜13:00 の帯が出ることまで確かめる形に直す
  - Red: 2026-10-16 実行。T-9 の画面で走らせ、3件とも戻った先が `?date` なしで今日（10月7日）が選ばれ、AC-26・F-006/AC-21 は `Unable to find role="region" and name "10月10日(土)の時間割"`、AC-14 は `…"10月12日(月)の時間割"` で失敗した（1回目は入力の操作と時間割を待つ時間の合計が既定の 5 秒を超えて時間切れになったので、この3件だけ上限を 10 秒にして見直した）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る
  - 結果: 2026-10-16。予約の入力の画面は作った予約（POST の応答）、直す画面は直した後の予約（PATCH の応答）の開始の日で `/car?date=<日>` へ戻る。AC-26 は車の画面の「予約する」から入る形で確かめる。テスト全体（639件）・lint・型の検査が通った。リファクタで直すところは無かったので、2回目の全体の実行はしていない

- [ ] T-11: 時間割で範囲を選んで予約を入れる
  - 対応: CAR-F-004 / AC-21, AC-22, AC-24, AC-27
  - 対象ファイル: `apps/web/src/pages/car/CarCalendar.tsx`（範囲を選べるようにし、選んだら知らせる）、`apps/web/src/pages/car/ReservationDialog.tsx`（幅 768px 以上は `Modal`、未満は `Drawer`。中身は `ReservationForm`）、`apps/web/src/pages/car/useCreateReservation.ts`（予約の入力の画面から送る処理を切り出して共用。`requestId` は入力を開くたびに作る）、`apps/web/src/pages/car/ReservationNewPage.tsx`、`apps/web/src/pages/car/CarPage.tsx`、`apps/web/src/pages/car/car-select.test.tsx`
  - 内容: 範囲を選ぶと、開始・終了の日付と時刻が入った入力が出る（車は「使う」の車が1台だけなら選んでおく）。「使う」の車が無いときは入力を出さず「先に車を登録してください」と車の管理への入口を出し、選んだ範囲を消す。保存できたら入力を閉じ、予約の開始の日を選んで（`?date=` を置き換える）カレンダーを読み直す。タグなし：入力で開始の日付を直して保存すると、その日へ移る
  - Red: 未記録（想定：T-10 の画面で、FullCalendar の `select` を起こしても入力が出ない（AC-21・AC-22・AC-27）、「先に車を登録してください」が出ない（AC-24））
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

- [ ] T-12: 範囲から出た入力を閉じる・残す
  - 対応: CAR-F-004 / AC-23, AC-25, AC-28, AC-29
  - 対象ファイル: `apps/web/src/pages/car/ReservationForm.tsx`（「キャンセル」を出せるようにする。入力の画面では出さない）、`apps/web/src/pages/car/ReservationDialog.tsx`、`apps/web/src/pages/car/CarPage.tsx`、`apps/web/src/pages/car/car-select.test.tsx`
  - 内容: 「キャンセル」・✕・Esc で閉じ、選んだ範囲を消す。外側を押しても閉じない（`closeOnClickOutside={false}`）。入力を開くときに履歴を1つ積み、端末の「戻る」操作で閉じる（車の画面に残る。保存・キャンセルで閉じたときは積んだ履歴を戻す）。保存に失敗したら入力を閉じずに知らせを出し、入れた内容を残す。タグなし：✕・Esc は「キャンセル」と同じ、入力を開き直すと `requestId` が変わる、入力の画面（`/car/reservations/new`）に「キャンセル」が出ない
  - Red: 未記録（想定：T-11 の入力で、AC-23 は「キャンセル」が無い、AC-28 は外側を押すと閉じる（Mantine の既定）、AC-29 は「戻る」で車の画面から離れる。AC-25 は T-11 の共用のフォームで通る見込みなので、実装の後に結果にかかわらず入力を閉じる誤りを入れて失敗を確かめる）
  - 完了条件: 対象のテストとテスト全体が通る。リファクタ後にもう一度テスト全体が通る

## 5. 仕上げ

- [ ] T-13: 開発環境で確かめる（管理者の手作業）
  - 対応: COMMON-N-008（幅 360px・1280px）、COMMON-N-007（CPU 時間）、spec「3. 変更差分」API の「出す順番」と画面の「テスト」（手で確かめる分）
  - 対象ファイル: なし。結果はこのタスクの「結果」に書く
  - 内容:
    1. spec/004-car-calendar を push し、**先に** API を開発環境へ出す：`gh workflow run deploy-api.yml --ref spec/004-car-calendar`（実行の結果はオーナーが Actions の画面で見る）。`view=range` がトークン無しで 401 になる（ルートが載っている）ことを確かめる
    2. Pages のプレビューで、車の画面を幅 360px と 1280px で開き、横スクロールが出ないこと、次を確かめる：月のカレンダーの印・月の移動・過去の日、帯の縦の位置と長さ、同じ時間の2本の帯が横に並ぶこと、車ごとの色と「使わない」の薄い帯、日をまたぐ帯、最初の表示位置（今日は今の時刻のあたり、それ以外は 8:00）
    3. 範囲の選び方：1280px はマウスのドラッグ、スマホの実機（または 360px）は長押しして引く。15分刻みで選べ、帯の右の余白から選び始められる（指で押せる幅か）。1280px はポップアップ、360px は下からのシートで出る。外側を押しても閉じず、スマホの「戻る」で入力だけが閉じる
    4. 端末の時間帯を日本以外にしても（開発者ツールの時間帯の上書き）、日本時間で出る
    5. 2人の家族に分かれて、時間割から予約 → 重なりで止まる → 帯から中身 → 直す → 取り消す、を一通り通す
    6. Cloudflare で stylus-api-dev に 1102（CPU 時間の超過）が出ていないことを確かめる
  - Red: 対象外（手動の確認）
  - 完了条件: すべての確認が済み、結果が書かれている。直すことが見つかったら、spec の範囲ならタスクを足し、範囲の外ならオーナーに伝える

## 6. この spec の外のリリース作業（/spec-close の後）

003 と同じく、本番へのデプロイは spec を閉じて `develop` にマージした後、`develop` → `main` のマージで行う。

- 本番に出す（管理者の手作業）：API とフロントが同時に出るので、新しいフロントが先に出た数分のあいだは車の画面が「うまく読み込めませんでした。…」になりうる（spec の「出す順番」。開き直せば直る）。出た後に本番の車の画面が開けること、1102 が出ていないことを確かめる

## /spec-close へ引き継ぐこと

- spec「3. 変更差分」の「/spec-close で直す先」をそのまま行う（car.md・README・architecture.md・ADR・glossary・handoff/003-car-calendar.md の削除）
- ADR には、T-1 と T-6 で測ったビルドの大きさ（入れる前と後）と、T-1 の V-1・V-2 の結果を書く
- handoff/003-car-calendar.md を消すとき、Claude のメモ（car-calendar-handoff）も消す

## AC カバレッジ

「既存のまま」は、この spec で中身も確かめ方も変わらない AC（spec の「出典: specs/003」）。spec 003 のテストをそのまま使い、各タスクの「テスト全体が通る」で確かめる。

| AC | タスク |
|----|-------|
| CAR-F-002/AC-1 | 既存のまま |
| CAR-F-002/AC-2 | 既存のまま |
| CAR-F-002/AC-3 | T-4（確認の文言の画面のテストは既存のまま） |
| CAR-F-002/AC-4 | 既存のまま |
| CAR-F-002/AC-5 | 既存のまま |
| CAR-F-002/AC-6 | 既存のまま |
| CAR-F-004/AC-1 | T-4, T-6 |
| CAR-F-004/AC-2 | 既存のまま |
| CAR-F-004/AC-3 | 既存のまま |
| CAR-F-004/AC-4 | 既存のまま |
| CAR-F-004/AC-5 | 既存のまま |
| CAR-F-004/AC-6 | 既存のまま |
| CAR-F-004/AC-7 | 既存のまま |
| CAR-F-004/AC-8 | 既存のまま |
| CAR-F-004/AC-9 | T-4, T-6 |
| CAR-F-004/AC-10 | 既存のまま |
| CAR-F-004/AC-11 | 既存のまま |
| CAR-F-004/AC-12 | 既存のまま |
| CAR-F-004/AC-13 | 既存のまま |
| CAR-F-004/AC-14 | 既存のまま |
| CAR-F-004/AC-15 | 既存のまま |
| CAR-F-004/AC-16 | 既存のまま |
| CAR-F-004/AC-17 | T-3 |
| CAR-F-004/AC-18 | 既存のまま |
| CAR-F-004/AC-19 | 既存のまま |
| CAR-F-004/AC-20 | 既存のまま |
| CAR-F-004/AC-21 | T-11 |
| CAR-F-004/AC-22 | T-11 |
| CAR-F-004/AC-23 | T-12 |
| CAR-F-004/AC-24 | T-11 |
| CAR-F-004/AC-25 | T-12 |
| CAR-F-004/AC-26 | T-10 |
| CAR-F-004/AC-27 | T-11 |
| CAR-F-004/AC-28 | T-12 |
| CAR-F-004/AC-29 | T-12 |
| CAR-F-005/AC-1 | T-4, T-6 |
| CAR-F-005/AC-2 | T-4, T-6 |
| CAR-F-005/AC-3 | T-4, T-6 |
| CAR-F-005/AC-4 | T-4, T-7 |
| CAR-F-005/AC-5 | T-9（API の既存テストはそのまま） |
| CAR-F-005/AC-6 | T-6 |
| CAR-F-005/AC-7 | T-6 |
| CAR-F-005/AC-8 | T-6 |
| CAR-F-005/AC-9 | T-4, T-8 |
| CAR-F-005/AC-10 | T-5, T-7 |
| CAR-F-005/AC-11 | T-8 |
| CAR-F-005/AC-12 | T-9 |
| CAR-F-005/AC-13 | T-8 |
| CAR-F-005/AC-14 | T-10 |
| CAR-F-005/AC-15 | T-9 |
| CAR-F-006/AC-1 | T-4 |
| CAR-F-006/AC-2 | T-4 |
| CAR-F-006/AC-3 | 既存のまま |
| CAR-F-006/AC-4 | 既存のまま |
| CAR-F-006/AC-5 | 既存のまま |
| CAR-F-006/AC-6 | 既存のまま |
| CAR-F-006/AC-7 | T-4, T-6 |
| CAR-F-006/AC-8 | T-4, T-6 |
| CAR-F-006/AC-9 | 既存のまま |
| CAR-F-006/AC-10 | 既存のまま |
| CAR-F-006/AC-11 | 既存のまま |
| CAR-F-006/AC-12 | 既存のまま |
| CAR-F-006/AC-13 | 既存のまま |
| CAR-F-006/AC-14 | 既存のまま |
| CAR-F-006/AC-15 | 既存のまま |
| CAR-F-006/AC-16 | 既存のまま |
| CAR-F-006/AC-17 | 既存のまま |
| CAR-F-006/AC-18 | 既存のまま |
| CAR-F-006/AC-19 | 既存のまま |
| CAR-F-006/AC-20 | 既存のまま |
| CAR-F-006/AC-21 | T-4, T-10 |
| CAR-F-006/AC-22 | 既存のまま |
| CAR-F-007/AC-1 | T-4, T-9 |
| CAR-F-007/AC-2 | 既存のまま |
| CAR-F-007/AC-3 | 既存のまま |
| CAR-F-007/AC-4 | 既存のまま |
| CAR-F-007/AC-5 | 既存のまま |
| CAR-F-007/AC-6 | 既存のまま |
| CAR-F-007/AC-7 | 既存のまま |
| CAR-F-007/AC-8 | T-4, T-9 |
| CAR-F-009/AC-1 | T-4 |
| CAR-F-009/AC-2 | 既存のまま |
| CAR-F-009/AC-3 | 既存のまま |
| CAR-F-009/AC-4 | 既存のまま |
| CAR-F-009/AC-5 | 既存のまま |

## 影響を受ける既存テスト

| テスト | 理由（要件の変更・廃止 など） | 対応タスク |
|-------|---------------------------|----------|
| `apps/api/src/routes/car-reservations.test.ts` の CAR-F-004/AC-1・AC-9、CAR-F-005/AC-1〜AC-4、CAR-F-006/AC-1・AC-2・AC-7・AC-8・AC-21、CAR-F-007/AC-1・AC-8、CAR-F-009/AC-1 | AC の確かめ方が「予定に出る」から時間割（`view=range`）に変わった | T-4 |
| `apps/api/src/routes/cars.test.ts` の CAR-F-002/AC-3 | 同上（「予約は残る」を `view=range` で確かめる） | T-4 |
| `apps/api/src/routes/car-reservations.test.ts`・`apps/web/src/pages/car/reservation-new.test.tsx` の CAR-F-004/AC-17 | 知らせの文言が変わった | T-3 |
| `apps/api/src/routes/cars.test.ts` の CAR-F-001/AC-6 | `GET /cars` の形に `colorIndex` が増えた（完全一致で確かめている） | T-5 |
| `apps/web/test/car.ts` の `carItem` | 同上（形の追随） | T-2 |
| `apps/web/src/pages/car/car-page.test.tsx`（CAR-F-005/AC-1〜AC-4・AC-6〜AC-8、CAR-F-004/AC-9、タグなし2件） | 車の画面を一覧からカレンダーに作り直す（CAR-F-005 の変更）。AC-8 のテスト名の「『これからの予約はありません』は出ない」も直す | T-6（AC-4 は T-7、帯を押す部分は T-9） |
| `apps/web/src/pages/car/reservation-edit.test.tsx` の CAR-F-006/AC-7 | AC の確かめ方が時間割の帯（「使用中」なし）に変わった | T-6 |
| `apps/web/src/pages/car/reservation-edit.test.tsx` の CAR-F-006/AC-21 | 同上（戻った先の10月10日の時間割の帯） | T-10 |
| `apps/web/src/pages/car/reservation-new.test.tsx` の CAR-F-004/AC-1 | 戻った先の車の画面を一覧の見出しで確かめていた。送信の中身を確かめる形にし、帯は車の画面のテストで確かめる | T-6 |
| `apps/web/src/pages/car/reservation-detail.test.tsx` の CAR-F-007/AC-1・AC-8 | 戻った先を「これからの予約はありません」で確かめていた。AC の確かめ方が10月10日の時間割に変わった | T-6（仮の形）, T-9 |
| `apps/web/src/pages/car/car-history.test.tsx` | `ReservationRow` を履歴だけで使う形にする（振る舞いは変えない）。テストは変えずに通ることを確かめる | T-6 |
