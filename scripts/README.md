# Localhost Server Startup Scripts

VSCodeのlaunch.jsonで定義されているLocalhost設定をbashで実行するためのスクリプト集です。

## 個別サーバー起動スクリプト

### 1. SvelteKit Server
```bash
./scripts/start-localhost-sveltekit-server.sh
```
- **ポート**: 7090
- **説明**: SvelteKitクライアント開発サーバーを起動
- **ログ**: `/workspace/server/logs/test-svelte-kit.log`
- **URL**: http://localhost:7090

### 2. Debug Server
```bash
./scripts/start-localhost-debug-server.sh
```
- **ポート**: 7091
- **説明**: バックエンドAPIサーバーを起動
- **ログ**: `/workspace/server/logs/test-log-service-tee.log`
- **URL**: http://localhost:7091

### 3. Tinylicious
```bash
./scripts/start-localhost-tinylicious.sh
```
- **ポート**: 7092
- **説明**: Fluid Frameworkのローカルサーバーを起動
- **URL**: http://localhost:7092

### 4. Firebase Functions
```bash
./scripts/start-localhost-firebase-functions.sh
```
- **説明**: Firebaseエミュレーターをデバッグモードで起動
- **デバッグポート**: 9229
- **プロジェクト**: outliner-d57b0

## 全サーバー一括起動

```bash
./scripts/start-all-localhost-servers.sh
```

すべてのサーバーをバックグラウンドで同時に起動します。
Ctrl+Cで全サーバーを停止できます。

## 対応するVSCode設定

これらのスクリプトは以下のVSCode launch.json設定に対応しています：

- `For Localhost SvelteKit Server`
- `For Localhost Debug Server`
- `For Localhost Launch Tinylicious`
- `For Localhost Debug Firebase Functions`

## 前提条件

- Node.js がインストールされていること
- npm パッケージがインストールされていること
- Firebase CLI がインストールされていること（Firebase Functions使用時）
- 初回実行前に環境設定ファイルを生成する

```bash
./scripts/setup-local-env.sh
```

## ログファイル

サーバーのログは以下の場所に出力されます：
- `/workspace/server/logs/test-svelte-kit.log`
- `/workspace/server/logs/test-log-service-tee.log`
