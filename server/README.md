# Outliner 認証サーバー

## 概要

このサーバーは以下の機能を提供します：

1. Firebase認証トークンの検証
2. **Hocuspocus (Yjs)** を使用したリアルタイム同期とデータの永続化 (LevelDB)

## セットアップ

1. 依存関係をインストール:

```bash
npm install
```

2. `.env` ファイルを作成:

```bash
cp .env.example .env
```

3. 環境変数を設定:
   - サーバー設定（`PORT`、`ORIGIN_ALLOWLIST`など）
   - 永続化設定（`LEVELDB_PATH`）
   - `LOCAL_HOST` をローカルネットワークのIPアドレスに設定（デフォルトは`localhost`）

4. Firebase Admin SDK JSONファイルをダウンロードして配置:
   - `firebase-adminsdk.json` をこのディレクトリに配置

## 構成 (Environment Variables)

サーバーの動作は以下の環境変数で制御できます (`server/src/config.ts` 参照):

### 基本設定

- `PORT`: サーバーのポート番号 (デフォルト: `3000` または `7093` など)
- `LOG_LEVEL`: ログレベル (`fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`. デフォルト: `info`)
- `ORIGIN_ALLOWLIST`: 許可するオリジンのカンマ区切りリスト (空の場合は制限なし)

### Hocuspocus / Yjs 設定

- `LEVELDB_PATH`: Yjsデータの永続化パス (デフォルト: `./ydb`)
- `LEVELDB_ROOM_SIZE_WARN_MB`: ルームサイズ警告のしきい値(MB) (デフォルト: `50`)
- `LEVELDB_LOG_INTERVAL_MS`: LevelDB統計ログの出力間隔(ms) (デフォルト: `3600000` = 1時間)
- `MAX_MESSAGE_SIZE_BYTES`: WebSocketメッセージの最大サイズ (デフォルト: `1000000`)
- `IDLE_TIMEOUT_MS`: 切断までのアイドル時間 (デフォルト: `60000`)
- `ROOM_PREFIX_ENFORCE`: ルーム名のプレフィックス強制 (デフォルト: `false`)

### 制限・レートリミット

- `MAX_SOCKETS_TOTAL`: サーバー全体での最大接続数 (デフォルト: `1000`)
- `MAX_SOCKETS_PER_IP`: IPアドレスごとの最大接続数 (デフォルト: `1000000` - 実質無効化)
- `MAX_SOCKETS_PER_ROOM`: ルームごとの最大接続数 (デフォルト: `100`)
- `RATE_LIMIT_WINDOW_MS`: レートリミットのウィンドウ時間(ms) (デフォルト: `60000`)
- `RATE_LIMIT_MAX_REQUESTS`: ウィンドウ内の最大リクエスト数 (デフォルト: `1000000` - 実質無効化)

## Firebase認証の設定

1. [Firebase Console](https://console.firebase.google.com/)でプロジェクトを作成または選択
2. 「Authentication」セクションに移動
3. 「Sign-in method」タブでGoogleログインを有効化
4. 「Project settings」から「Service accounts」タブを選択
5. 「Generate new private key」をクリックしてサービスアカウントキーをダウンロード
6. ダウンロードしたJSONファイルを `firebase-adminsdk.json` としてサーバーディレクトリに配置

## クライアント側Firebase設定

1. Firebase Consoleの「Project settings」に移動
2. 「Your apps」セクションで「Add app」をクリック（Webアプリ）
3. アプリを登録し、Firebaseの設定情報を取得
4. クライアントプロジェクトの `.env` ファイルに以下の情報を設定:

## systemd でのデプロイ

1. 専用ユーザーとディレクトリを作成:

```bash
sudo groupadd --system outliner
sudo useradd --system --gid outliner --home /srv/outliner --shell /usr/sbin/nologin outliner
sudo mkdir -p /srv/outliner
sudo chown outliner:outliner /srv/outliner
```

2. サービスと環境ファイルを配置:

```bash
sudo cp server/systemd/outliner.service /etc/systemd/system/
sudo mkdir -p /etc/outliner
sudo cp server/systemd/outliner.env.example /etc/outliner/outliner.env
```

3. サービスを有効化して起動:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now outliner.service
```

このユニットは `Restart=on-failure` で自動再起動し、`NoNewPrivileges` や `ProtectSystem=strict` などのハードニングを有効化しています。

## Docker Quickstart

```bash
cp ../.env.example .env
docker compose up --build
```

Expected output includes the Hocuspocus server listening log and a Cloudflare Tunnel URL for the configured hostname.

## Cloudflare Tunnel Setup

1. Install and log in to Cloudflare Tunnel:
   ```bash
   cloudflared tunnel login
   ```
2. Create a tunnel named `outliner`:
   ```bash
   cloudflared tunnel create outliner
   ```
3. Place the generated credentials file in `cloudflared/` and edit `cloudflared/config.yml`:
   ```yaml
   tunnel: YOUR_TUNNEL_ID
   credentials-file: /etc/cloudflared/credentials.json
   ingress:
       - hostname: example.com
         service: http://server:3000
       - service: http_status:404
   ```
4. Bind the hostname with DNS:
   ```bash
   cloudflared tunnel route dns outliner example.com
   ```
5. Start the tunnel locally or via Docker Compose:
   ```bash
   cloudflared tunnel --config cloudflared/config.yml run outliner
   # or
   docker compose up cloudflared
   ```
6. Verify from outside your network:
   ```bash
   curl -I https://example.com/
   ```

# Cloudflare's edge provides both IPv4 and IPv6 access even from an IPv6-only uplink.
