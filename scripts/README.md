# Test Environment Scripts

ローカルのテスト用サーバーは `scripts/setup.sh` が一括で起動・準備します。個別のローカル起動スクリプトは廃止しました。

## 使い方

1. テスト環境のセットアップとサーバー起動

```bash
scripts/setup.sh
```

- Firebase エミュレーター (Auth/Firestore/Functions/Hosting)
- Yjs WebSocket サーバー
- SvelteKit サーバー

初回実行時のみ依存関係のインストールとOS依存パッケージの導入を実施します。2回目以降は高速に完了します。

2. Playwright の逐次実行（クラウド環境向け）

```bash
scripts/run-e2e-progress.sh 1
```

クラウド環境ではタイムアウト回避のため、E2E を 1 ファイルずつ実行します。

3. 環境維持テスト（ENV-*)

```bash
scripts/run-env-tests.sh
```

## ログファイル

- `server/logs/` 配下に各サービスのログを出力します
