# times

Slack 風の社内 times アプリ。単一ワークスペースで、全員がすべてのチャンネルを閲覧・投稿できます。

## 機能

- メールアドレス・パスワードによる登録／ログイン。メール認証なし。
- アカウントメニューから表示名・アイコンを編集。アイコンは既存の非公開 R2 に保存（PNG・JPEG・GIF・WebP・AVIF、2 MiBまで）。変更は過去の投稿・通知・メンション候補にも反映。削除すると名前の頭文字の表示に戻ります。
- 登録後の初回アクセスで `general` と自分の `times-メールアドレスのローカル部` を作成。同名がある場合のみ識別子を追加（全体で64文字以内）。
- チャンネル作成、自分の times の名前・説明の編集、スター付きチャンネル、全チャンネルのタイムライン。
- 投稿・本人による編集／削除、1階層のスレッド、6種類のリアクション。
- 他のメンバーの新規投稿と「チャンネルにも投稿」した返信が未読のとき、チャンネル名を太字で表示します。チャンネルを開いて最新の投稿まで表示すると既読になり、同じアカウントの端末間で同期します。
- Markdown 表示：見出し、太字・斜体・打ち消し線、リスト、チェックリスト、引用、リンク、インラインコード・コードブロック、表。送信前・編集中のプレビューにも対応。通常の改行はそのまま改行として表示。
- `@` 入力でユーザー候補を表示。表示名・メールアドレスで絞り込み、クリック／Enter／Tab で選択。投稿の編集・スレッド・ファイル添付でも使用可能。
- 通知タブにメンション・自分の投稿への返信・リアクションを表示。未読件数、未読絞り込み、個別／一括既読、未読に戻す操作に対応。通知を開くと対象の投稿をスレッド内で強調表示。
- スレッドの返信・メンション先の名前を含む部分一致検索、個人用の「後で読む」。
- 画面ごとの URL、ログイン必須のチャンネル／投稿共有リンク、投稿先を選べるアプリ内引用。
- 50件単位のページング。投稿・返信・リアクション・通知・チャンネル変更を WebSocket で即時反映。接続中は1分ごとにも照合し、切断時は再接続しながら10秒更新に戻ります。未表示タブでは定期取得を停止。
- チャンネル／スレッド／ユーザー単位の下書きをブラウザーに保存。Enter 改行、Shift + Enter 送信、日本語 IME 対応。
- ライト／ダーク／システム連動と6色のテーマ。右上のパレットから変更し、同じブラウザーに保存。明暗・システム連動・初期表示のちらつき防止は shadcn の公式構成に従って next-themes を使用。
- 投稿・スレッドへの画像／ファイル添付。実体は非公開の Cloudflare R2、メタデータは D1。画像プレビュー、拡大表示、ダウンロード。
- モバイルではチャンネル一覧をドロワー、スレッドを全面表示。

DM、メール送信、WebSocket、複数ワークスペースは初期版の対象外です。

通知はアプリ内で表示します。自分へのメンション・自分の操作は通知せず、返信で投稿者をメンションした場合はメンション通知にまとめます。メンションの削除、リアクションの解除、投稿の削除に伴って対応する通知も削除します。過去の投稿への通知は遡って作成しません。

自分の times のヘッダーにある編集ボタンから名前と説明を変更できます。チャンネル ID を維持するため、投稿・返信・スター・下書きは引き継がれます。

## 構成

[参考記事](https://www.runfunrun.dev/posts/next-stack) と隣接する `next-stack` を参考に、現在の依存バージョンに合わせています。

- Next.js 16 App Router / React 19 / TypeScript / Bun
- OpenNext → Cloudflare Workers、Cloudflare D1 / R2 / Durable Objects（SQLite 型、WebSocket Hibernation）
- Hono RPC / Drizzle ORM / Better Auth / Zod
- TanStack Query / next-themes / Tailwind CSS 4 / shadcn/ui（公式 registry、Radix ベース）

```text
worker.ts              # OpenNext への転送、WebSocket の認証と接続、DO の export
src/app/api/
  [[...hono]]/route.ts  # @hono/vercel で Next.js と接続
  _lib/
    app.ts             # サブルーターの組み立てと共通エラー処理
    middleware.ts      # セッション確認、送信元の確認
    types.ts           # Hono の共通コンテキスト
    realtime.ts        # 保存成功後の変更通知
    realtime-room.ts   # 接続管理と WebSocket 配信
  _routes/
    auth.ts            # Better Auth
    workspace.ts       # 初期チャンネルとワークスペース情報
    channels.ts        # チャンネルとスター
    messages.ts        # 投稿、検索、リアクション、保存
    threads.ts         # スレッド取得
    uploads.ts         # R2への添付投稿と認証付きファイル配信
    members.ts         # メンション候補
    profile.ts         # 自分のプロフィール編集と認証付きアイコン配信
    notifications.ts   # 通知一覧と既読管理
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

`bun dev` は Next.js の開発サーバーなので、WebSocket 接続を使用せず10秒更新で動作します。WebSocket の動作確認には `bun run preview` を使用してください。

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

本番のカスタムドメインでローカルの送信元が置き換わらないよう、preview スクリプトは `--infer-origin-from-routes=false` を指定しています。Next.js をビルドして、workerd 上で [http://localhost:8787](http://localhost:8787) を起動します。別のターミナルから統合テストを実行できます。

```sh
bun run test:integration
```

認証、別ユーザーの編集・削除の拒否、times の名前・説明変更と権限・重複チェック、変更後の投稿保持、送信元確認、チャンネル名重複、投稿の検証、返信、検索記号のエスケープ、リアクションの冪等性、保存のユーザー分離、スター、ページング、削除の連鎖、ログアウト／再ログインを確認します。テーマ設定の読み込みも検証します。WebSocket は接続認証・送信元の確認・公開変更の配信・個人変更の分離・クライアントからの不正配信の拒否・ログアウトしたセッションの全接続切断を確認します。通知については受信者の分離、メンション候補と本文編集時の識別子保持、自己通知の抑制、重複防止、既読の保持、ページング、添付・削除との連動を確認します。R2 についてはファイルだけの投稿、複数ファイル、サイズ制限、未認証の拒否、画像の内容判定、ダウンロード、返信添付、投稿削除後の実オブジェクト削除まで確認します。

テストは localhost / 127.0.0.1 のみを許可し、実行ごとのテスト用データをローカル D1 に作成して、終了時にそのデータだけを削除します。Wrangler の既定のローカル保存先を使用してください。WebSocket の接続テストを含むため、統合テストは Cloudflare preview を対象に実行してください。

## Cloudflare へのデプロイ

本番 Worker は `times-channel`、公開先は [https://times.runfunrun.xyz](https://times.runfunrun.xyz) です。専用の D1 `times-channel` と非公開 R2 `times-channel-uploads` を作成し、`wrangler.jsonc` に本番の binding とカスタムドメインを設定しています。`BETTER_AUTH_SECRET` は本番専用の値を Cloudflare Secret に保存し、リポジトリには含めません。

再デプロイは次の順序で実行します。

```sh
bun run check:fix
bun run typecheck
bun run db:migrate:remote
bun run deploy
```

`db:migrate:remote` は本番 D1 にスキーマを適用します。ローカルの投稿やアカウントは本番にコピーしません。`wrangler.jsonc` の `database_id` は本番 DB を指しており、ローカルの操作は引き続き `--local` を使用します。`preview_database_id` には既存の開発用 ID を指定し、ローカルの投稿・アカウントを引き継ぎます。

認証 URL は `BETTER_AUTH_URL=https://times.runfunrun.xyz` に設定済みです。ローカル開発では `.dev.vars` の `BETTER_AUTH_URL=` で上書きします。ブラウザーの API クライアントは同じ origin を使うため、`NEXT_PUBLIC_*` の URL 設定は不要です。

公開する入口は独自ドメインだけにし、`workers_dev: false` と `preview_urls: false` で代替 URL を無効にしています。Cloudflare Access は現時点では設定せず、管理者が後から独自ドメインに追加する方針です。アプリ自身のメールアドレス・パスワード認証は有効です。メールの所有確認やパスワード再発行メールはありません。

別アカウントへ移す場合は、D1／R2 を新規作成して binding を更新し、`bunx wrangler secret put BETTER_AUTH_SECRET` で新しい本番 Secret を設定してください。Durable Object は初回デプロイ時に Wrangler が作成します。

## 添付ファイル

- ファイル本体は R2 の `UPLOADS` binding、添付情報は D1 の `attachment` テーブルに保存します。S3 アクセスキーの発行や追加ライブラリは不要です。
- バケットの公開アクセスは有効にしません。`GET /api/uploads/:id` で既存のセッション認証を通して配信し、共有ワークスペース内の全員が閲覧できます。
- 1ファイル10 MiB、1投稿5個、合計20 MiB。制限はクライアントとサーバーの双方で検証します。
- PNG、JPEG、GIF、WebP、AVIF は先頭バイトで形式を判定して画像として表示します。それ以外はダウンロード扱いです。画像の取得も認証が必要なため、Next.js Image は `unoptimized` で直接取得します。
- 選択したファイルは送信時だけアップロードします。送信失敗時は選択状態を保って再試行できます。ファイルの選択状態はブラウザー再読み込み・チャンネル切り替えでは保持しません（本文の下書きは保持します）。
- 本文が空でもファイルだけで送信できます。編集は本文に対応し、添付の差し替えは新しい投稿で行います。
- 投稿削除時には返信の添付も削除します。D1 のバッチ内で削除対象キーを `file_cleanup` に残すため、R2 側の一時的なエラー時も次回のワークスペース取得時に削除を再試行します。

R2 は添付の保存に使用します。OpenNext の R2 キャッシュ、画像最適化用 binding、Cache Components は使用していません。

## リアルタイム更新と無料プラン

[OpenNext の Custom Worker](https://opennext.js.org/cloudflare/howtos/custom-worker) と [Cloudflare の WebSocket Hibernation API](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) を使用します。単一ワークスペースに1つの Durable Object を割り当て、投稿本文やファイルは引き続き D1／R2 に保存します。WebSocket は変更の種類だけを通知し、認証済み API からデータを再取得します。個人の既読・ブックマーク・スター変更は本人の接続にだけ配信します。

接続時にはログインセッションと Origin を検証します。ログアウト時は同じセッションの接続をすべて閉じ、期限切れの接続への変更配信も止めます。再接続時にはデータを取得し直します。待機中は Hibernation に入り、heartbeat はサーバー側の自動応答で処理します。

[公式料金表](https://developers.cloudflare.com/durable-objects/platform/pricing/)では SQLite 型 Durable Objects は Workers Free に対応し、リクエスト10万回／日、実行時間13,000 GB秒／日の無料枠があります。`wrangler.jsonc` の `new_sqlite_classes` を使用しており、有料プランや追加の外部サービスは前提にしていません。Free プランの上限到達時は操作がエラーになり、自動的に有料プランへ移行しません。Workers・D1・R2 にもそれぞれ別の利用枠があるため、利用量にかかわらず無料になる保証はありません。

Durable Object の設定は Wrangler のマイグレーションで、D1 の `drizzle/` とは別です。初回デプロイ時に Wrangler が作成するため、手動の Object 作成は不要です。`bun run cf-typegen` を実行すると追加 binding の型が生成されます。`next dev`／ビルド時に出る同一 Worker 内の DO binding 警告は、Node.js の開発用 proxy が DO 本体を実行しないことを示します。Cloudflare preview と本番ではカスタム Worker の DO を使用します。

## Markdown

投稿・スレッド・検索・後で読むに同じ Markdown 表示を使用します。既存の投稿も再保存せずに表示へ反映されます。入力欄の「プレビュー」で送信前の内容を確認できます。本文は Markdown の原文を保存するため、編集時も記法を維持します。Enter 改行、Shift + Enter 送信は引き続き使用できます。

解析には `marked`、文字参照の復元には `entities` を使用し、トークンを React 要素として描画します。追加の UI ライブラリは使用していません。HTML は文字列として表示し、JavaScript／data URL はリンクや画像として実行しません。Markdown 内の画像は認証付き R2 添付 URL（`/api/uploads/添付ID`）のみ埋め込み表示し、外部画像はリンクとして表示します。

通常の本文や装飾・リスト・表の中でもメンションできます。コードブロック・インラインコード・リンク先 URL・画像の説明文にある記法はメンション通知の対象外です。

## 画面の URL と共有・引用

| 画面                 | URL                      |
| -------------------- | ------------------------ |
| みんなのタイムライン | `/`                      |
| チャンネル           | `/channels/チャンネルID` |
| 通知                 | `/notifications`         |
| 後で読む             | `/saved`                 |
| 検索                 | `/search?q=検索語`       |
| 投稿・返信の共有先   | `/messages/投稿ID`       |

スレッドをサイドパネルで開くと、表示中の画面の URL に `?thread=投稿ID`（検索画面では `&thread=投稿ID`）を付けます。再読み込み、戻る・進むでも画面とスレッドを復元します。共有ボタンでチャンネルまたは投稿の URL をコピーできます。共有先が未ログインなら同じ URL にログインフォームを表示し、ログイン後に元の投稿を開きます。投稿・引用元・添付ファイルの API はすべてセッション認証が必要です。共有用の匿名公開 API や公開トークンは作成しません。

投稿の「投稿を引用」から投稿先を選ぶと、コメントやファイルと一緒に引用できます。初期の投稿先は自分の times です。送信後は投稿先のチャンネルへ移動します。引用元の表示名や本文の編集はカードへ反映され、元投稿を開けます。引用元の削除後は内容を残さず「引用元の投稿は削除されました。」と表示します。引用の引用をしてもカードを再帰的に展開しません。メンション通知は今回入力した本文だけが対象です。

引用の保存には `0005_sticky_thunderbolts.sql` の `message_quote` テーブルを使用します。本番へ反映するときは、先に `bun run db:migrate:remote` を実行してからデプロイしてください。
