# Outliner 認証サーバー

## 概要

このサーバーは以下の機能を提供します：

1. Firebase認証トークンの検証
2. Azure Fluid Relay用のJWTトークン生成

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
   - Azure Fluid Relay設定（テナントID、エンドポイント、プライマリキー）
   - サーバー設定（ポート、CORS設定など）
   - `LOCAL_HOST` をローカルネットワークのIPアドレスに設定（デフォルトは`localhost`）

4. Firebase Admin SDK JSONファイルをダウンロードして配置:
   - `firebase-adminsdk.json` をこのディレクトリに配置

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

>>>>>>> origin/550-1-server-bootstrap-y-websocket-server-typescript-with-env-config

## Docker Quickstart

```bash
cp ../.env.example .env
docker compose up --build
```

Expected output includes the y-websocket server listening log and a Cloudflare Tunnel URL for the configured hostname.

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

Cloudflare's edge provides both IPv4 and IPv6 access even from an IPv6-only uplink.
