const axios = require("axios");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// Local host configuration
const LOCAL_HOST = process.env.LOCAL_HOST || "localhost";

// .envファイルのパス
const envPath = path.join(__dirname, "..", ".env");

/**
 * ngrokのAPI経由で現在のパブリックURLを取得
 * @returns {Promise<string|null>} ngrokのパブリックURL
 */
async function getNgrokPublicUrl() {
    try {
        // ngrokのAPIからトンネル情報を取得
        const response = await axios.get(`http://${LOCAL_HOST}:4040/api/tunnels`);
        const tunnels = response.data.tunnels;

        // HTTPS URLを探す
        const httpsTunnel = tunnels.find(tunnel => tunnel.proto === "https");
        if (httpsTunnel) {
            console.log("ngrok HTTPS URL:", httpsTunnel.public_url);
            return httpsTunnel.public_url;
        }

        // HTTP URLを探す（HTTPSが見つからなかった場合）
        const httpTunnel = tunnels.find(tunnel => tunnel.proto === "http");
        if (httpTunnel) {
            console.log("ngrok HTTP URL:", httpTunnel.public_url);
            return httpTunnel.public_url;
        }

        console.warn("アクティブなngrokトンネルが見つかりません");
        return null;
    }
    catch (error) {
        console.error("ngrok APIにアクセスできません:", error.message);
        console.error("ngrokが起動しているか確認してください");
        return null;
    }
}

/**
 * .envファイルのGOOGLE_CALLBACK_URLを更新
 * @param {string} ngrokUrl ngrokのパブリックURL
 * @returns {boolean} 更新が成功したかどうか
 */
function updateEnvCallbackUrl(ngrokUrl) {
    try {
        // .envファイルが存在するか確認
        if (!fs.existsSync(envPath)) {
            console.error(".envファイルが見つかりません:", envPath);
            return false;
        }

        // .envファイルの内容を読み込む
        let envContent = fs.readFileSync(envPath, "utf8");

        // コールバックURLを更新
        const callbackUrl = `${ngrokUrl}/auth/google/callback`;
        const regex = /(GOOGLE_CALLBACK_URL\s*=\s*).*/;

        if (regex.test(envContent)) {
            // 既存の設定を更新
            envContent = envContent.replace(regex, `$1${callbackUrl}`);
        }
        else {
            // 設定が存在しない場合は追加
            envContent += `\nGOOGLE_CALLBACK_URL=${callbackUrl}\n`;
        }

        // 更新内容を書き込む
        fs.writeFileSync(envPath, envContent);

        console.log("Google コールバックURLを更新しました:", callbackUrl);

        // 環境変数を再読み込み
        dotenv.config();

        return true;
    }
    catch (error) {
        console.error(".envファイルの更新中にエラーが発生しました:", error);
        return false;
    }
}

/**
 * ngrokのパブリックURLを取得して.envファイルを更新
 * @returns {Promise<string|null>} 更新されたngrokのURL
 */
async function setupNgrokUrl() {
    const ngrokUrl = await getNgrokPublicUrl();

    if (ngrokUrl) {
        const updated = updateEnvCallbackUrl(ngrokUrl);
        if (updated) {
            return ngrokUrl;
        }
    }

    return null;
}

module.exports = {
    getNgrokPublicUrl,
    updateEnvCallbackUrl,
    setupNgrokUrl,
};
