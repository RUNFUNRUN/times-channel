# times

Slack 風の社内 times アプリ。単一ワークスペースで、全員がすべてのチャンネルを閲覧・投稿できます。

## 機能

- メールアドレス・パスワードによる登録／ログイン。メール認証なし。
- 登録後の初回アクセスで `general` と自分の `times-メールアドレスのローカル部` を作成。同名がある場合のみ識別子を追加。
- チャンネル作成、スター付きチャンネル、全チャンネルのタイムライン。
- 投稿・本人による編集／削除、1階層のスレッド、6種類のリアクション。
- スレッドの返信を含む全文の部分一致検索、個人用の「後で読む」。
- 50件単位のページング。投稿と返信は約10秒ごとに取得。未表示タブではポーリングを停止。
- チャンネル／スレッド／ユーザー単位の下書きをブラウザーに保存。Enter 送信、Shift + Enter 改行、日本語 IME 対応。
- ライト／ダーク／システム連動と6色のテーマ。右上のパレットから変更し、同じブラウザーに保存。明暗・システム連動・初期表示のちらつき防止は shadcn の公式構成に従って next-themes を使用。
- 投稿・スレッドへの画像／ファイル添付。実体は非公開の Cloudflare R2、メタデータは D1。画像プレビュー、拡大表示、ダウンロード。
- モバイルではチャンネル一覧をドロワー、スレッドを全面表示。

DM、メール送信、WebSocket、複数ワークスペースは初期版の対象外です。

## 構成

[参考記事](https://www.runfunrun.dev/posts/next-stack) と隣接する `next-stack` を参考に、現在の依存バージョンに合わせています。

- Next.js 16 App Router / React 19 / TypeScript / Bun
- OpenNext → Cloudflare Workers、Cloudflare D1 / R2
- Hono RPC / Drizzle ORM / Better Auth / Zod
- TanStack Query / next-themes / Tailwind CSS 4 / shadcn/ui（公式 registry、Radix ベース）

```text
src/app/api/
  [[...hono]]/route.ts  # @hono/vercel で Next.js と接続
  _lib/
    app.ts             # サブルーターの組み立てと共通エラー処理
    middleware.ts      # セッション確認、送信元の確認
    types.ts           # Hono の共通コンテキスト
  _routes/
    auth.ts            # Better Auth
    workspace.ts       # 初期チャンネルとワークスペース情報
    channels.ts        # チャンネルとスター
    messages.ts        # 投稿、検索、リアクション、保存
    threads.ts         # スレッド取得
    uploads.ts         # R2への添付投稿と認証付きファイル配信
src/components/        # アプリのUI、テーマ設定
src/components/ui/     # shadcn生成コード
src/lib/               # スキーマ、DB、認証、型付きAPIクライアント
src/hooks/             # 投稿の更新とキャッシュ再取得
```

`_lib` / `_routes` は Next.js の private folder です。実装ファイルはルートとして公開されません。Hono のルーターをメソッドチェーンで定義し、フロントエンドの RPC 型推論を維持しています。[Hono の Next.js ガイド](https://hono.dev/docs/getting-started/nextjs) に従い、非推奨の `hono/vercel` から `@hono/vercel` に移行しています。

関数はアロー関数、変数は原則 `const`。shadcn の生成部品は元の関数形式を維持しています。

## ローカル開発

```sh
bun install
cp .dev.vars.example .dev.vars
```

既に `.dev.vars` がある場合は上書きせず、必要な値を追記してください。`BETTER_AUTH_SECRET` を32文字以上のランダムな値に置き換えます（例: `openssl rand -hex 32`）。実際の `.dev.vars` は Git 管理しません。

本番の `BETTER_AUTH_URL=https://times.runfunrun.xyz` は `wrangler.jsonc` の `vars` に設定済みです。ローカルでは `.dev.vars` に `BETTER_AUTH_URL=` と空で設定し、本番 URL を上書きしてください。空の場合は `localhost` / `127.0.0.1` のリクエスト URL を使用するため、dev の3000番と preview の8787番で同じ設定を使用できます。

```sh
bun run cf-typegen
bun run db:migrate
bun dev
```

開発画面: [http://localhost:3000](http://localhost:3000)。D1 の状態は `.wrangler/state` に保存され、dev と preview で共有します。R2 も同じ保存先でローカルエミュレーションされます。クラウドの D1／R2 作成はローカル開発には不要です。

```sh
bun run check:fix
bun run typecheck
```

スキーマ変更時は `bun run db:generate` で SQL を生成し、`bun run db:migrate` でローカルに適用してください。

## Cloudflare preview と検証

```sh
bun run preview
```

Next.js をビルドして、workerd 上で [http://localhost:8787](http://localhost:8787) を起動します。別のターミナルから統合テストを実行できます。

```sh
bun run test:integration
```

認証、別ユーザーの編集・削除の拒否、送信元確認、チャンネル名重複、投稿の検証、返信、検索記号のエスケープ、リアクションの冪等性、保存のユーザー分離、スター、ページング、削除の連鎖、ログアウト／再ログインを確認します。テーマ設定の読み込みも検証します。R2 についてはファイルだけの投稿、複数ファイル、サイズ制限、未認証の拒否、画像の内容判定、ダウンロード、返信添付、投稿削除後の実オブジェクト削除まで確認します。

テストは localhost / 127.0.0.1 のみを許可し、実行ごとのテスト用データをローカル D1 に作成して、終了時にそのデータだけを削除します。Wrangler の既定のローカル保存先を使用してください。dev を対象にする場合は `TEST_BASE_URL=http://localhost:3000 bun run test:integration` です。

## Cloudflare へのデプロイ

1. `bunx wrangler d1 create times-channel` で本番 D1 を作成。
2. `wrangler.jsonc` の `database_id`（現在はローカル用のプレースホルダー）を発行された ID に変更。
3. `wrangler.jsonc` の `vars.BETTER_AUTH_URL` は `https://times.runfunrun.xyz` に設定済み。ドメインを変更する場合はこの値も更新。
4. `bunx wrangler secret put BETTER_AUTH_SECRET` で本番のランダムなシークレットを設定。
5. `bun run db:migrate:remote` で本番 D1 にマイグレーションを適用。
6. `bunx wrangler r2 bucket create times-channel-uploads` で本番の R2 バケットを作成。名前を変更する場合は `wrangler.jsonc` の `UPLOADS.bucket_name` も合わせて変更。
7. `bun run deploy` でデプロイ。

認証の URL 設定とは別に、Cloudflare の Workers 管理画面で `times.runfunrun.xyz` をこの Worker のカスタムドメインとして割り当ててください。ブラウザーの API クライアントは同じ origin を使うため、`NEXT_PUBLIC_*` への URL 設定は不要です。

本番は Cloudflare Access で利用者を制限する想定です。カスタムドメインと workers.dev の両方が公開される場合は、両方の入口に同じアクセス制限を適用してください。Access を通過した利用者は任意のメールアドレスで登録できます。メールの所有確認や、パスワード再発行メールの機能はありません。

## 添付ファイル

- ファイル本体は R2 の `UPLOADS` binding、添付情報は D1 の `attachment` テーブルに保存します。S3 アクセスキーの発行や追加ライブラリは不要です。
- バケットの公開アクセスは有効にしません。`GET /api/uploads/:id` で既存のセッション認証を通して配信し、共有ワークスペース内の全員が閲覧できます。
- 1ファイル10 MiB、1投稿5個、合計20 MiB。制限はクライアントとサーバーの双方で検証します。
- PNG、JPEG、GIF、WebP、AVIF は先頭バイトで形式を判定して画像として表示します。それ以外はダウンロード扱いです。画像の取得も認証が必要なため、Next.js Image は `unoptimized` で直接取得します。
- 選択したファイルは送信時だけアップロードします。送信失敗時は選択状態を保って再試行できます。ファイルの選択状態はブラウザー再読み込み・チャンネル切り替えでは保持しません（本文の下書きは保持します）。
- 本文が空でもファイルだけで送信できます。編集は本文に対応し、添付の差し替えは新しい投稿で行います。
- 投稿削除時には返信の添付も削除します。D1 のバッチ内で削除対象キーを `file_cleanup` に残すため、R2 側の一時的なエラー時も次回のワークスペース取得時に削除を再試行します。

R2 は添付の保存に使用します。OpenNext の R2 キャッシュ、画像最適化用 binding、Cache Components は使用していません。
