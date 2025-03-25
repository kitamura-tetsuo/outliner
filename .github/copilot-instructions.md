作成するアプリの説明
scrapbox, workflowy のクローンから始める。

利用するライブラリ
Fluid Frameworkと svelteを使ったアプリを作りたい。

最新のAPIドキュメントを確認しながら作業して。

最新のAPIドキュメント
https://learn.microsoft.com/ja-jp/azure/azure-fluid-relay/how-tos/connect-fluid-azure-service
https://www.npmjs.com/package/fluid-framework
https://fluidframework.com/docs/start/tree-start

テスト
テストが通らない時、テストが正しいなら実装を修正して。
テストを通す為だけにテストを修正しないで。
コンパイルエラーの修正時、コード内容と行番号を併せて判断して。コードだけで判断して、行を間違えている事がある。

サーバー
server/ に実装を保存。

クライアント
client/ に実装を保存。


認証フローの説明
認証フローは以下のようになります：

クライアント:
Firebase SDKを使ってGoogle認証を完結させる
認証成功後、FirebaseからIDトークンを取得

バックエンド:
/api/fluid-tokenエンドポイントでIDトークンを検証
検証成功後、Azure Fluid Relay用のJWTを生成してクライアントに返す

クライアント:
受け取ったJWTでAzure Fluid Relayに接続
