# 7ちゃんねる Render版

現在のGAS版と同じGoogleスプレッドシートをDBとして使用するRender用Node.js版です。
投稿表示の末尾はGAS版の「·G」ではなくRender版の「·R」になります。

## Render環境変数

`GOOGLE_SERVICE_ACCOUNT_JSON`
Google Cloudで作成したサービスアカウントのJSON全文。JSON内のprivate_keyもそのまま含めます。

`JWT_SECRET`
管理者セッション署名用のランダムな長い文字列。

`SPREADSHEET_ID`
省略時は現在の7ちゃんねるDB IDを使用します。

`KUPROXNPP_LOGIN_SPREADSHEET_ID`
省略時は現在のKuproxnppログインDB IDを使用します。

## Google Sheets権限

サービスアカウントのメールアドレスを、掲示板DBスプレッドシートとKuproxnppログインDBスプレッドシートの両方で編集者として共有してください。

## URL

`/?log=1` 過去ログ倉庫

`/?log=1&thread=1785958530741` 指定過去スレを直接表示

指定スレ直リンクでは過去スレ一覧を表示せず、「← 戻る（過去スレリスト）」を表示します。

## 注意

Render版はGoogle Apps Scriptの実行環境を使わないため、GASのCacheService/PropertiesService等には依存しません。オンライン人数と管理者セッションはRender側で管理し、投稿・スレッド・過去ログの本体データは同じGoogleスプレッドシートを使用します。
