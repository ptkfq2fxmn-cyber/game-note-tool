# game-note-tool

iPhone から GitHub Actions を手動実行し、ゲーム名を入力するだけで以下を自動生成するためのツールです。

- note 用 Markdown 記事
- X 投稿文（3パターン）
- 参照情報（sources.json）

> `index.html` には API キーを入れません。API キーは必ず GitHub Secrets で管理します。

## 追加された第2段階の自動生成機能

- ワークフロー: `.github/workflows/generate-game-article.yml`
- 実行スクリプト: `scripts/generate-game-article.mjs`
- 出力フォルダ: `outputs/`（`outputs/.gitkeep` を含む）

## 事前準備（最初に1回だけ）

GitHub リポジトリの **Settings > Secrets and variables > Actions** から、以下の Secrets を登録してください。

- `OPENAI_API_KEY`
- `RAKUTEN_APP_ID`
- `RAKUTEN_AFFILIATE_ID`

## iPhone での実行方法（初心者向け）

1. iPhone のブラウザまたは GitHub アプリで、このリポジトリを開く
2. **Actions** タブを開く
3. 一覧から **Generate Game Article** を開く
4. 右上の **Run workflow** をタップ
5. 入力欄を埋める
   - `game_name`（必須）: ゲーム名
   - `article_type`（必須）: `auto` / `pre_release` / `post_release`
   - `note_url`（任意）: note の記事URL
6. **Run workflow** を押して実行
7. 実行完了後、ワークフロー画面の **Artifacts** から生成物をダウンロード

## 入力項目の意味

- `game_name`:
  - 楽天ブックスゲーム検索 API の検索キーワード
- `article_type`:
  - `auto`: 発売日から自動判定
  - `pre_release`: 予約前チェック記事
  - `post_release`: 評判まとめ記事
- `note_url`:
  - X 投稿文に含める URL
  - 空欄なら「（note公開後にURLを入れる）」を出力

## 生成されるファイル

`outputs/` に以下 3 ファイルを生成します。

- `YYYY-MM-DD-ゲーム名-note.md`
- `YYYY-MM-DD-ゲーム名-x.txt`
- `YYYY-MM-DD-ゲーム名-sources.json`

## 仕様メモ

- Node.js 20 で動作
- 楽天ブックスゲーム検索APIから以下を取得
  - 商品名
  - 発売日
  - 価格
  - 商品URL
  - アフィリエイトURL
- 取得できない情報は `未確認` として扱う
- OpenAI API で note 記事と X 投稿文を生成

### 記事生成ルール

- 「未プレイ」と書かない
- プレイしたような書き方をしない
- 「公式情報・ストア情報・公開レビュー傾向をもとに整理」を入れる
- 予約前なら「予約前チェック記事」
- 発売後なら「評判まとめ記事」
- 楽天アフィリエイトリンクは note 本文だけに入れる
- X 投稿文には楽天リンクを入れない
- 似ている有名ゲーム / 買うべき人 / 少し様子見でもいい人 を含める
- 推測で事実を埋めない
- 確認できない情報は `未確認`

## エラー時の確認ポイント

- ワークフロー実行画面で失敗ステップを開く
- `Generate note and X drafts` ステップのログを確認
- Secrets 名のスペルミス、未登録、期限切れを確認
