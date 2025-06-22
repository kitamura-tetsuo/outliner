/**
 * ロギング機能モジュール
 *
 * サーバーとクライアントのログを管理するためのユーティリティ
 */
const fs = require("fs");
const path = require("path");
const fsExtra = require("fs-extra");
const pino = require("pino");
const pretty = require("pino-pretty");

// ログディレクトリのパス
const serverLogDir = path.join(__dirname, "..", "logs");
const clientLogDir = path.join(__dirname, "..", "..", "client", "logs");

// ログファイルのパス
const serverLogPath = path.join(serverLogDir, "log-service.log");
// テスト環境かどうかをチェック
const isTestEnv = process.env.NODE_ENV === "test";
const clientLogFileName = isTestEnv ? "test-browser.log" : "browser.log";
const clientLogPath = path.join(clientLogDir, clientLogFileName);
// telemetryログ用のファイルパス
const telemetryLogFileName = isTestEnv ? "test-telemetry.log" : "telemetry.log";
const telemetryLogPath = path.join(clientLogDir, telemetryLogFileName);

// ログディレクトリを確認・作成
function ensureLogDirectories() {
    try {
        // サーバーログディレクトリ
        if (!fs.existsSync(serverLogDir)) {
            fs.mkdirSync(serverLogDir, { recursive: true });
            console.log(`サーバーログディレクトリを作成しました: ${serverLogDir}`);
        }

        // クライアントログディレクトリ
        if (!fs.existsSync(clientLogDir)) {
            fs.mkdirSync(clientLogDir, { recursive: true });
            console.log(`クライアントログディレクトリを作成しました: ${clientLogDir}`);
        }
    } catch (error) {
        console.warn(`ログディレクトリの作成に失敗しました: ${error.message}`);
        console.warn(`サーバーログディレクトリ: ${serverLogDir}`);
        console.warn(`クライアントログディレクトリ: ${clientLogDir}`);
        // エラーが発生してもアプリケーションを停止させない
    }
}

// ディレクトリを確保
ensureLogDirectories();

// ファイル転送用と整形表示用のログストリームを設定
let serverLogStream, clientLogStream, telemetryLogStream;

try {
    serverLogStream = fs.createWriteStream(serverLogPath, { flags: "a" });
} catch (error) {
    console.warn(`サーバーログストリームの作成に失敗しました: ${error.message}`);
    serverLogStream = null;
}

try {
    clientLogStream = fs.createWriteStream(clientLogPath, { flags: "a" });
} catch (error) {
    console.warn(`クライアントログストリームの作成に失敗しました: ${error.message}`);
    clientLogStream = null;
}

try {
    telemetryLogStream = fs.createWriteStream(telemetryLogPath, { flags: "a" });
} catch (error) {
    console.warn(`telemetryログストリームの作成に失敗しました: ${error.message}`);
    telemetryLogStream = null;
}
let prettyStream = pretty({
    colorize: true,
    translateTime: "SYS:standard",
    levelFirst: true,
});
prettyStream.pipe(process.stdout);

// クライアントログ用のロガー設定
const clientStreams = [];
if (clientLogStream) {
    clientStreams.push({ stream: clientLogStream }); // 生ログをクライアントログディレクトリに保存
}
// ストリームが利用できない場合はコンソールのみ
if (clientStreams.length === 0) {
    clientStreams.push({ stream: process.stdout });
}

let clientLogger = pino(
    {
        level: "trace", // すべてのレベルのログを収集
        timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.multistream(clientStreams),
);

// telemetryログ用のロガー設定
const telemetryStreams = [];
if (telemetryLogStream) {
    telemetryStreams.push({ stream: telemetryLogStream }); // telemetryログを専用ファイルに保存
}
// ストリームが利用できない場合はコンソールのみ
if (telemetryStreams.length === 0) {
    telemetryStreams.push({ stream: process.stdout });
}

let telemetryLogger = pino(
    {
        level: "trace", // すべてのレベルのログを収集
        timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.multistream(telemetryStreams),
);

// サーバー自身のロガー設定
let logger = pino(
    {
        level: "debug",
        // level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.multistream([
        //        { stream: serverLogStream }, // サーバーログをサーバーログディレクトリに保存
        { stream: prettyStream }, // 整形ログをコンソールに表示
    ]),
);

/**
 * ログファイルをローテーションする関数
 * @param {string} logFilePath - ローテーション対象のログファイルパス
 * @param {number} maxBackups - 保持する過去ログファイル数
 * @returns {Promise<boolean>} - 成功すればtrue
 */
async function rotateLogFile(logFilePath, maxBackups = 2) {
    try {
        // ログファイルが存在するか確認
        if (!await fsExtra.pathExists(logFilePath)) {
            console.log(`ログファイルが存在しません: ${logFilePath}`);
            return false;
        }

        const directory = path.dirname(logFilePath);
        const basename = path.basename(logFilePath);
        const timestamp = new Date().toISOString().replace(/:/g, "-");

        // 古いバックアップファイルのリストを取得（.1, .2, ...のサフィックス）
        const files = await fsExtra.readdir(directory);
        const backupFiles = files
            .filter(file => file.startsWith(basename + "."))
            .map(file => ({
                name: file,
                path: path.join(directory, file),
                // ファイル名からサフィックス番号を抽出して数値に変換
                suffix: parseInt(file.replace(basename + ".", ""), 10) || 0,
            }))
            // 番号の降順にソート
            .sort((a, b) => b.suffix - a.suffix);

        // 最大保持数を超えるバックアップファイルを削除
        for (let i = maxBackups; i < backupFiles.length; i++) {
            await fsExtra.remove(backupFiles[i].path);
            console.log(`古いログファイルを削除しました: ${backupFiles[i].path}`);
        }

        // 既存のバックアップファイルのサフィックス番号を増やす
        for (let i = 0; i < Math.min(backupFiles.length, maxBackups); i++) {
            const file = backupFiles[i];
            const newSuffix = file.suffix + 1;
            if (newSuffix <= maxBackups) {
                const newPath = path.join(directory, `${basename}.${newSuffix}`);
                await fsExtra.move(file.path, newPath, { overwrite: true });
                console.log(`ログファイルをローテーションしました: ${file.path} -> ${newPath}`);
            }
        }

        // 現在のログファイルを .1 サフィックス付きにリネーム
        const backupPath = path.join(directory, `${basename}.1`);
        await fsExtra.move(logFilePath, backupPath, { overwrite: true });
        console.log(`現在のログファイルをバックアップしました: ${logFilePath} -> ${backupPath}`);

        // 新しい空のログファイルを作成
        await fsExtra.ensureFile(logFilePath);
        console.log(`新しいログファイルを作成しました: ${logFilePath}`);

        return true;
    }
    catch (error) {
        console.error("ログローテーション中にエラーが発生しました:", error);
        return false;
    }
}

/**
 * クライアントログファイルをローテーションする
 * @param {number} maxBackups - 保持するバックアップ数
 * @returns {Promise<boolean>} - 成功すればtrue
 */
async function rotateClientLogs(maxBackups = 2) {
    if (process.env.CI) {
        maxBackups = Number.MAX_SAFE_INTEGER;
    }
    return rotateLogFile(clientLogPath, maxBackups);
}

/**
 * telemetryログファイルをローテーションする
 * @param {number} maxBackups - 保持するバックアップ数
 * @returns {Promise<boolean>} - 成功すればtrue
 */
async function rotateTelemetryLogs(maxBackups = 2) {
    if (process.env.CI) {
        maxBackups = Number.MAX_SAFE_INTEGER;
    }
    return rotateLogFile(telemetryLogPath, maxBackups);
}

/**
 * サーバーログファイルをローテーションする
 * @param {number} maxBackups - 保持するバックアップ数
 * @returns {Promise<boolean>} - 成功すればtrue
 */
async function rotateServerLogs(maxBackups = 2) {
    if (process.env.CI) {
        maxBackups = Number.MAX_SAFE_INTEGER;
    }
    return rotateLogFile(serverLogPath, maxBackups);
}

/**
 * クライアントログストリームを更新する
 * ローテーション後に新しいストリームを作成するために使用
 */
function refreshClientLogStream() {
    try {
        // 古いストリームを安全に閉じる
        clientLogStream.end();

        // 新しいストリームを作成
        const newClientLogStream = fs.createWriteStream(clientLogPath, { flags: "a" });

        // モジュール内のグローバル変数を更新
        clientLogStream = newClientLogStream;

        // pino-prettyストリームも再作成
        const newPrettyStream = pretty({
            colorize: true,
            translateTime: "SYS:standard",
            levelFirst: true,
        });
        newPrettyStream.pipe(process.stdout);

        // 新しいmultistreamを作成
        const newMultiStream = pino.multistream([
            { stream: newClientLogStream },
            { stream: newPrettyStream },
        ]);

        // 新しいロガーインスタンスを作成
        const newLogger = pino(
            {
                level: "trace",
                timestamp: pino.stdTimeFunctions.isoTime,
            },
            newMultiStream,
        );

        // 既存のロガーオブジェクトのプロパティを新しいロガーのものに置き換え
        Object.assign(clientLogger, newLogger);

        console.log("クライアントログストリームを更新しました");
        return newClientLogStream;
    }
    catch (error) {
        console.error("クライアントログストリーム更新エラー:", error);
        // エラーが発生した場合でも、新しいストリームを作成して返す
        return fs.createWriteStream(clientLogPath, { flags: "a" });
    }
}

/**
 * telemetryログストリームを更新する
 * ローテーション後に新しいストリームを作成するために使用
 */
function refreshTelemetryLogStream() {
    try {
        // 古いストリームを安全に閉じる
        telemetryLogStream.end();

        // 新しいストリームを作成
        const newTelemetryLogStream = fs.createWriteStream(telemetryLogPath, { flags: "a" });

        // モジュール内のグローバル変数を更新
        telemetryLogStream = newTelemetryLogStream;

        // 新しいmultistreamを作成
        const newMultiStream = pino.multistream([
            { stream: newTelemetryLogStream },
        ]);

        // 新しいロガーインスタンスを作成
        const newLogger = pino(
            {
                level: "trace",
                timestamp: pino.stdTimeFunctions.isoTime,
            },
            newMultiStream,
        );

        // 既存のロガーオブジェクトのプロパティを新しいロガーのものに置き換え
        Object.assign(telemetryLogger, newLogger);

        console.log("telemetryログストリームを更新しました");
        return newTelemetryLogStream;
    }
    catch (error) {
        console.error("telemetryログストリーム更新エラー:", error);
        // エラーが発生した場合でも、新しいストリームを作成して返す
        return fs.createWriteStream(telemetryLogPath, { flags: "a" });
    }
}

/**
 * サーバーログストリームを更新する
 * ローテーション後に新しいストリームを作成するために使用
 */
function refreshServerLogStream() {
    try {
        // 古いストリームを安全に閉じる
        serverLogStream.end();

        // 新しいストリームを作成
        const newServerLogStream = fs.createWriteStream(serverLogPath, { flags: "a" });

        // モジュール内のグローバル変数を更新
        serverLogStream = newServerLogStream;

        // pino-prettyストリームも再作成
        const newPrettyStream = pretty({
            colorize: true,
            translateTime: "SYS:standard",
            levelFirst: true,
        });
        newPrettyStream.pipe(process.stdout);

        // 新しいmultistreamを作成
        const newMultiStream = pino.multistream([
            { stream: newServerLogStream },
            { stream: newPrettyStream },
        ]);

        // 新しいロガーインスタンスを作成
        const newLogger = pino(
            {
                level: process.env.NODE_ENV === "production" ? "info" : "debug",
                timestamp: pino.stdTimeFunctions.isoTime,
            },
            newMultiStream,
        );

        // 既存のロガーオブジェクトのプロパティを新しいロガーのものに置き換え
        Object.assign(logger, newLogger);

        console.log("サーバーログストリームを更新しました");
        return newServerLogStream;
    }
    catch (error) {
        console.error("サーバーログストリーム更新エラー:", error);
        // エラーが発生した場合でも、新しいストリームを作成して返す
        return fs.createWriteStream(serverLogPath, { flags: "a" });
    }
}

// 公開するAPI
module.exports = {
    serverLogger: logger,
    clientLogger,
    telemetryLogger,
    rotateLogFile,
    rotateClientLogs,
    rotateTelemetryLogs,
    rotateServerLogs,
    refreshClientLogStream,
    refreshTelemetryLogStream,
    refreshServerLogStream,
    serverLogPath,
    clientLogPath,
    telemetryLogPath,
};
