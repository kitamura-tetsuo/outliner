# Outliner Authentication Server

## Overview

This server provides the following functions:

1. Verification of Firebase authentication tokens
2. Real-time synchronization and data persistence using **Hocuspocus (Yjs)**

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` file:

```bash
cp .env.example .env
```

3. Configure environment variables:
   - Server configuration (`PORT`, `ORIGIN_ALLOWLIST`, etc.)
   - Set `LOCAL_HOST` to the IP address of the local network (default is `localhost`)

4. Download and place the Firebase Admin SDK JSON file:
   - Place `firebase-adminsdk.json` in this directory

## Configuration (Environment Variables)

Server behavior can be controlled with the following environment variables (see `server/src/config.ts`):

### Basic Settings

- `PORT`: Server port number (default: `3000` or `7093`, etc.)
- `LOG_LEVEL`: Log level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`. default: `info`)
- `ORIGIN_ALLOWLIST`: Comma-separated list of allowed origins (no restriction if empty)

### Hocuspocus / Yjs Settings

- `MAX_MESSAGE_SIZE_BYTES`: Maximum size of WebSocket messages (default: `1000000`)
- `IDLE_TIMEOUT_MS`: Idle time before disconnection (default: `60000`)
- `ROOM_PREFIX_ENFORCE`: Force room name prefix (default: `false`)

### Limits / Rate Limiting

- `MAX_SOCKETS_TOTAL`: Maximum number of connections for the entire server (default: `1000`)
- `MAX_SOCKETS_PER_IP`: Maximum number of connections per IP address (default: `1000000` - effectively disabled)
- `MAX_SOCKETS_PER_ROOM`: Maximum number of connections per room (default: `100`)
- `RATE_LIMIT_WINDOW_MS`: Rate limit window time (ms) (default: `60000`)
- `RATE_LIMIT_MAX_REQUESTS`: Maximum number of requests within the window (default: `1000000` - effectively disabled)

## Firebase Authentication Setup

1. Create or select a project in [Firebase Console](https://console.firebase.google.com/)
2. Go to the "Authentication" section
3. Enable Google Sign-in in the "Sign-in method" tab
4. Select the "Service accounts" tab from "Project settings"
5. Click "Generate new private key" to download the service account key
6. Place the downloaded JSON file as `firebase-adminsdk.json` in the server directory

## Client-side Firebase Setup

1. Go to "Project settings" in Firebase Console
2. Click "Add app" in the "Your apps" section (Web app)
3. Register the app and get the Firebase configuration information
4. Set the following information in the `.env` file of the client project:

## Deployment with systemd

1. Create a dedicated user and directory:

```bash
sudo groupadd --system outliner
sudo useradd --system --gid outliner --home /srv/outliner --shell /usr/sbin/nologin outliner
sudo mkdir -p /srv/outliner
sudo chown outliner:outliner /srv/outliner
```

2. Place service and environment files:

```bash
sudo cp server/systemd/outliner.service /etc/systemd/system/
sudo mkdir -p /etc/outliner
sudo cp server/systemd/outliner.env.example /etc/outliner/outliner.env
```

3. Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now outliner.service
```

This unit automatically restarts with `Restart=on-failure` and enables hardening such as `NoNewPrivileges` and `ProtectSystem=strict`.

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
