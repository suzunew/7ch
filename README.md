# 7ちゃんねる Render版（コピペ構成）

Google Cloudのサービスアカウントは使いません。
Renderは外側のページとして動き、同じGASアプリをiframeで表示します。DBは今までのGASと同じGoogleスプレッドシートです。

## 1. GAS

`7ch_kuproxnpp_gas_render_compatible_copy_paste.gs` をGASプロジェクトへ丸ごと貼り付けて保存し、ウェブアプリとして再デプロイします。

「自分」→「ウェブアプリ」で「次のユーザーとして実行」は自分、「アクセスできるユーザー」は必要な範囲に設定します。

Render用URLは通常のGASの `/exec` URLです。

## 2. Render

このフォルダをGitHubへ置いてRenderでWeb Serviceとしてデプロイするだけです。

環境変数は不要です。

ただし `server.js` の以下だけは、自分のGASウェブアプリURLに置き換えてください。

`const GAS_WEB_APP_URL = 'ここに現在のGASのウェブアプリURLを貼り付けてください';`

例:

`const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/xxxxxxxxxxxxxxxx/exec';`

## 3. Render版の表示

RenderからGASを `?render=1` 付きで開くため、投稿の識別子は `ID:不明·R` になります。

通常のGAS URLは今まで通り `ID:不明·G` のままです。

`?log=1&thread=1785958530741&render=1` のようなRender表示でも、過去スレリストを最初に表示せず対象スレを直接表示します。

## 4. 重要

この方式はRenderがGoogleスプレッドシートへ直接接続する方式ではありません。GASがDBアクセスと既存機能を担当し、RenderはGAS版をRenderドメイン内に表示します。

そのため、サービスアカウントJSON、JWT_SECRET、Google Cloud IAM設定は不要です。
