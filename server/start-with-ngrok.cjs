require("dotenv").config();
const { spawn } = require("child_process");
const path = require("path");
const { setupNgrokUrl } = require("./utils/ngrok-helper.cjs");

// Local host configuration
const LOCAL_HOST = process.env.LOCAL_HOST || "localhost";

// サーバーとngrokのプロセスを格納するオブジェクト
const processes = {
    ngrok: null,
    server: null,
};

// 終了時のクリーンアップ
function cleanup() {
    console.log("\n終了処理を実行します...");

    if (processes.ngrok) {
        console.log("ngrokを停止します...");
        processes.ngrok.kill();
    }

    if (processes.server) {
        console.log("サーバーを停止します...");
        processes.server.kill();
    }

    console.log("すべてのプロセスを停止しました。");
    process.exit(0);
}

// Ctrl+Cなどのシグナルを捕捉
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

/**
 * ngrokを起動する
 * @param {number} port トンネリングするポート番号
 * @returns {Promise<boolean>} 起動が成功したかどうか
 */
function startNgrok(port) {
    return new Promise(resolve => {
        console.log(`ngrokを起動しています（ポート: ${port})...`);

        const ngrok = spawn("ngrok", ["http", port.toString()], {
            stdio: ["ignore", "pipe", "pipe"],
        });

        processes.ngrok = ngrok;

        let ngrokOutput = "";
        let timeout = null;

        // 3秒経過してもURL取得できなかったらAPIから取得を試みる
        timeout = setTimeout(async () => {
            console.log("ngrokの起動を待機しています...");
            resolve(true); // 次のステップに進む
        }, 7071);

        ngrok.stdout.on("data", data => {
            ngrokOutput += data.toString();
            console.log(`[ngrok] ${data.toString().trim()}`);
        });

        ngrok.stderr.on("data", data => {
            console.error(`[ngrok error] ${data.toString().trim()}`);
        });

        ngrok.on("close", code => {
            processes.ngrok = null;
            console.log(`ngrokが終了しました（コード: ${code}）`);

            if (code !== 0 && processes.server) {
                console.log("ngrokが異常終了したため、サーバーも停止します");
                processes.server.kill();
            }
        });

        ngrok.on("error", err => {
            clearTimeout(timeout);
            console.error("ngrokの起動中にエラーが発生しました:", err);
            resolve(false);
        });
    });
}

/**
 * バックエンドサーバーを起動する
 * @returns {Promise<boolean>} 起動が成功したかどうか
 */
function startServer() {
    return new Promise(resolve => {
        console.log("バックエンドサーバーを起動しています...");

        const server = spawn("node", ["log-service.cjs"], {
            stdio: ["ignore", "pipe", "pipe"],
        });

        processes.server = server;

        server.stdout.on("data", data => {
            console.log(`[server] ${data.toString().trim()}`);
        });

        server.stderr.on("data", data => {
            console.error(`[server error] ${data.toString().trim()}`);
        });

        server.on("close", code => {
            processes.server = null;
            console.log(`サーバーが終了しました（コード: ${code}）`);

            if (code !== 0 && processes.ngrok) {
                console.log("サーバーが異常終了したため、ngrokも停止します");
                processes.ngrok.kill();
            }
        });

        server.on("error", err => {
            console.error("サーバーの起動中にエラーが発生しました:", err);
            resolve(false);
        });

        // サーバーが起動したとみなす
        setTimeout(() => resolve(true), 1000);
    });
}

/**
 * アプリケーションを起動する
 */
async function start() {
    try {
        const port = process.env.PORT || 7071;

        // ngrokを起動
        const ngrokStarted = await startNgrok(port);
        if (!ngrokStarted) {
            console.error("ngrokの起動に失敗しました。");
            cleanup();
            return;
        }

        // ngrokのURLを取得して.envを更新
        console.log("ngrokのURLを取得中...");
        const ngrokUrl = await setupNgrokUrl();

        if (!ngrokUrl) {
            console.warn("ngrokのURLを取得できませんでした。");
            console.warn("Google認証のコールバックが正しく機能しない可能性があります。");
            console.warn(".envファイルのGOOGLE_CALLBACK_URLを手動で設定してください。");
        } else {
            console.log("ngrokのURLを取得しました:", ngrokUrl);
            console.log("コールバックURLを更新しました:", `${ngrokUrl}/auth/google/callback`);
        }

        // サーバーを起動
        const serverStarted = await startServer();
        if (!serverStarted) {
            console.error("サーバーの起動に失敗しました。");
            cleanup();
            return;
        }

        console.log("\n=====================================================");
        console.log("アプリケーションが正常に起動しました！");
        console.log(`バックエンドサーバー: http://${LOCAL_HOST}:${port}`);
        if (ngrokUrl) {
            console.log(`パブリックURL: ${ngrokUrl}`);
        }
        console.log("終了するには Ctrl+C を押してください。");
        console.log("=====================================================\n");
    } catch (error) {
        console.error("起動中にエラーが発生しました:", error);
        cleanup();
    }
}

// アプリケーションを起動
start();
