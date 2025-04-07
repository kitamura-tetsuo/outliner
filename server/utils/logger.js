/**
 * ロギング機能モジュール
 * 
 * サーバーとクライアントのログを管理するためのユーティリティ
 */
const fs = require('fs');
const path = require('path');
const fsExtra = require('fs-extra');
const pino = require('pino');
const pretty = require('pino-pretty');

// ログディレクトリのパス
const serverLogDir = path.join(__dirname, '..', 'logs');
const clientLogDir = path.join('/workspace/client/logs');

// ログファイルのパス
const serverLogPath = path.join(serverLogDir, 'auth-service.log');
const clientLogPath = path.join(clientLogDir, 'browser.log');

// ログディレクトリを確認・作成
function ensureLogDirectories() {
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
}

// ディレクトリを確保
ensureLogDirectories();

// ファイル転送用と整形表示用のログストリームを設定
let serverLogStream = fs.createWriteStream(serverLogPath, { flags: 'a' });
let clientLogStream = fs.createWriteStream(clientLogPath, { flags: 'a' });
let prettyStream = pretty({
    colorize: true,
    translateTime: 'SYS:standard',
    levelFirst: true
});
prettyStream.pipe(process.stdout);

// クライアントログ用のロガー設定
let clientLogger = pino(
    {
        level: 'trace', // すべてのレベルのログを収集
        timestamp: pino.stdTimeFunctions.isoTime
    },
    pino.multistream([
        { stream: clientLogStream }, // 生ログをクライアントログディレクトリに保存
        { stream: prettyStream }    // 整形ログをコンソールに表示（必要な場合）
    ])
);

// サーバー自身のロガー設定
let logger = pino(
    {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        timestamp: pino.stdTimeFunctions.isoTime
    },
    pino.multistream([
        { stream: serverLogStream }, // サーバーログをサーバーログディレクトリに保存
        { stream: prettyStream }    // 整形ログをコンソールに表示
    ])
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
        const timestamp = new Date().toISOString().replace(/:/g, '-');

        // 古いバックアップファイルのリストを取得（.1, .2, ...のサフィックス）
        const files = await fsExtra.readdir(directory);
        const backupFiles = files
            .filter(file => file.startsWith(basename + '.'))
            .map(file => ({
                name: file,
                path: path.join(directory, file),
                // ファイル名からサフィックス番号を抽出して数値に変換
                suffix: parseInt(file.replace(basename + '.', ''), 10) || 0
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
    } catch (error) {
        console.error('ログローテーション中にエラーが発生しました:', error);
        return false;
    }
}

/**
 * クライアントログファイルをローテーションする
 * @param {number} maxBackups - 保持するバックアップ数
 * @returns {Promise<boolean>} - 成功すればtrue
 */
async function rotateClientLogs(maxBackups = 2) {
    return rotateLogFile(clientLogPath, maxBackups);
}

/**
 * サーバーログファイルをローテーションする
 * @param {number} maxBackups - 保持するバックアップ数
 * @returns {Promise<boolean>} - 成功すればtrue
 */
async function rotateServerLogs(maxBackups = 2) {
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
        const newClientLogStream = fs.createWriteStream(clientLogPath, { flags: 'a' });

        // モジュール内のグローバル変数を更新
        clientLogStream = newClientLogStream;

        // pino-prettyストリームも再作成
        const newPrettyStream = pretty({
            colorize: true,
            translateTime: 'SYS:standard',
            levelFirst: true
        });
        newPrettyStream.pipe(process.stdout);

        // 新しいmultistreamを作成
        const newMultiStream = pino.multistream([
            { stream: newClientLogStream },
            { stream: newPrettyStream }
        ]);

        // 新しいロガーインスタンスを作成
        const newLogger = pino(
            {
                level: 'trace',
                timestamp: pino.stdTimeFunctions.isoTime
            },
            newMultiStream
        );

        // 既存のロガーオブジェクトのプロパティを新しいロガーのものに置き換え
        Object.assign(clientLogger, newLogger);

        console.log('クライアントログストリームを更新しました');
        return newClientLogStream;
    } catch (error) {
        console.error('クライアントログストリーム更新エラー:', error);
        // エラーが発生した場合でも、新しいストリームを作成して返す
        return fs.createWriteStream(clientLogPath, { flags: 'a' });
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
        const newServerLogStream = fs.createWriteStream(serverLogPath, { flags: 'a' });

        // モジュール内のグローバル変数を更新
        serverLogStream = newServerLogStream;

        // pino-prettyストリームも再作成
        const newPrettyStream = pretty({
            colorize: true,
            translateTime: 'SYS:standard',
            levelFirst: true
        });
        newPrettyStream.pipe(process.stdout);

        // 新しいmultistreamを作成
        const newMultiStream = pino.multistream([
            { stream: newServerLogStream },
            { stream: newPrettyStream }
        ]);

        // 新しいロガーインスタンスを作成
        const newLogger = pino(
            {
                level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
                timestamp: pino.stdTimeFunctions.isoTime
            },
            newMultiStream
        );

        // 既存のロガーオブジェクトのプロパティを新しいロガーのものに置き換え
        Object.assign(logger, newLogger);

        console.log('サーバーログストリームを更新しました');
        return newServerLogStream;
    } catch (error) {
        console.error('サーバーログストリーム更新エラー:', error);
        // エラーが発生した場合でも、新しいストリームを作成して返す
        return fs.createWriteStream(serverLogPath, { flags: 'a' });
    }
}

// 公開するAPI
module.exports = {
    serverLogger: logger,
    clientLogger,
    rotateLogFile,
    rotateClientLogs,
    rotateServerLogs,
    refreshClientLogStream,
    refreshServerLogStream,
    serverLogPath,
    clientLogPath
};