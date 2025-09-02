// Test script for development authentication
require("dotenv").config();
const fetch = require("node-fetch");

// APIサーバーのURL
const LOCAL_HOST = process.env.LOCAL_HOST || "localhost";
const API_BASE_URL = process.env.API_BASE_URL || `http://${LOCAL_HOST}:7071`;

// テスト用認証情報
const testCredentials = {
    email: "test@example.com",
    password: "password123",
};

// カラー出力用ヘルパー
const colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
};

async function testEmailPasswordLogin() {
    console.log(`${colors.cyan}===================================================${colors.reset}`);
    console.log(`${colors.cyan}開発環境用のメール/パスワード認証テスト${colors.reset}`);
    console.log(`${colors.cyan}===================================================${colors.reset}`);
    console.log(`APIサーバー: ${API_BASE_URL}`);

    try {
        console.log(`\n${colors.yellow}1. /api/loginエンドポイントでログインを試行...${colors.reset}`);
        const loginResponse = await fetch(`${API_BASE_URL}/api/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(testCredentials),
        });

        if (!loginResponse.ok) {
            const errorText = await loginResponse.text();
            console.error(
                `${colors.red}ログイン失敗: ${loginResponse.status} ${loginResponse.statusText}${colors.reset}`,
            );
            console.error(`${colors.red}エラー詳細: ${errorText}${colors.reset}`);
            return;
        }

        const loginData = await loginResponse.json();
        console.log(`${colors.green}ログイン成功!${colors.reset}`);
        console.log(`ユーザー: ${JSON.stringify(loginData.user, null, 2)}`);

        if (!loginData.customToken) {
            console.error(`${colors.red}カスタムトークンが返されませんでした${colors.reset}`);
            return;
        }

        console.log(`${colors.green}カスタムトークン取得成功${colors.reset}`);

        // カスタムトークンの代わりに開発環境用のIDトークンを生成
        console.log(`\n${colors.yellow}2. 開発環境用IDトークンを生成...${colors.reset}`);
        const devToken = {
            uid: loginData.user.uid,
            email: loginData.user.email,
            displayName: loginData.user.displayName,
            devUser: true, // 開発環境用フラグ
            role: "user",
        };

        // トークンを文字列化して署名を追加（開発環境用の簡易版）
        const fakeIdToken = Buffer.from(JSON.stringify(devToken)).toString("base64");
        console.log(`${colors.green}開発環境用IDトークン生成完了${colors.reset}`);

        console.log(`${colors.cyan}===================================================${colors.reset}`);
        console.log(`${colors.cyan}テスト結果: 成功${colors.reset}`);
        console.log(`${colors.cyan}===================================================${colors.reset}`);
    } catch (error) {
        console.error(`${colors.red}テスト中にエラーが発生しました:${colors.reset}`, error);
    }
}

// テスト実行
testEmailPasswordLogin();
