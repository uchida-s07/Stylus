# docs の歩き方

このプロジェクトは仕様駆動ワークフローで開発している。流れとレビューのタイミングは CLAUDE.md の「開発ワークフロー」節を見る。

## 構成

| 場所 | 役割 | 更新する Skill |
|------|------|--------------|
| `product/vision.md` | 要求（Why）。誰の・どんな課題を・なぜ解決するか。常設 | `/product-vision` |
| `product/requirements/` | 要件（What）。システムが「今」満たしている振る舞い。常設 | `/spec-close`、`/product-requirements` |
| `product/glossary.md` | 用語集。文書とコードで同じ名前を使うための表 | 手で、または `/spec-close` |
| `architecture.md` | 全体構成・レイヤーの責務・データの流れ | 手で、または `/spec-close` |
| `adr/` | 技術判断の記録 | 手で（`/spec-close` が候補を提案する） |
| `specs/NNN-<name>/` | 変更ごとの spec・設計・実装計画 | `/spec-new`、`/spec-plan`、`/spec-close` |
| `review-notes.md` | 誤検知・承知で進めると判断した指摘、飛ばしたレビュー、最後の全体レビュー日 | 各 Skill、またはレビュー後の会話 |

DB・API の設計書は持たない。**コードが正。**

## AI が読む順番

1. `CLAUDE.md`（開発ワークフロー節）
2. `product/vision.md`
3. `product/requirements/README.md`
4. 作業に関係する領域の `product/requirements/<領域>.md`（と `common.md`）
5. `architecture.md`（と関係する `adr/`）
6. 作業中の `specs/NNN-<name>/spec.md`
