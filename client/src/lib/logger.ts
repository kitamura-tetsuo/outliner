import pino from 'pino';

// 環境変数からAPIサーバーURLを取得（デフォルトはlocalhostの認証サーバー）
const API_URL = import.meta.env.VITE_API_SERVER_URL || 'http://localhost:7071';

// ブラウザのコンソールAPIを使用するかどうか
const useConsoleAPI = typeof window !== 'undefined' && typeof window.console !== 'undefined';

// pino のインスタンス（ブラウザ用の設定）
const baseLogger = pino({
    level: import.meta.env.DEV ? 'debug' : 'info', // 開発環境では詳細なログを出力
    browser: {
        asObject: true, // ログをオブジェクトとして扱う
        transmit: {
            level: 'info', // このレベル以上のログをサーバーに送信
            send: (level: string, logEvent: any) => {
                // ログをサーバーに送信する処理
                fetch(`${API_URL}/api/log`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        level,
                        log: logEvent,
                        timestamp: new Date().toISOString(),
                        userAgent: navigator.userAgent
                    })
                }).catch(err => {
                    // 送信エラー時の処理（必要に応じて）
                    console.error('ログ送信エラー:', err);
                });
            }
        },
        // コンソールには出力しない設定
        write: () => { }
    }
});

// 拡張された CallSite インターフェース
interface CallSite {
    getFileName(): string | null;
    getLineNumber(): number | null;
    getColumnNumber(): number | null;
    getFunctionName(): string | null;
}

/**
 * 呼び出し元の情報（ファイル名、行番号）を取得するヘルパー関数
 * ロガーラッパーを経由した場合でも正確な呼び出し元を特定する
 */
function getCallerInfo(): { file: string; line: number } {
    const originalPrepareStackTrace = Error.prepareStackTrace;
    try {
        const err = new Error();
        // prepareStackTrace を上書きして、stack を CallSite の配列として取得
        Error.prepareStackTrace = (_, stack: CallSite[]) => stack;
        const stack = err.stack as unknown as CallSite[];

        // スタックトレースからロガー関連以外の最初の呼び出し元を見つける
        // 少なくともこれらの深さはスキップする必要がある:
        // 0: getCallerInfo 自身
        // 1: ラッパー関数 (enhancedLogger のログメソッド)
        // 2: getLogger が返した Proxy または child logger

        // ロガーに関連するファイルパス
        const loggerPaths = ['logger.ts', '/lib/logger'];

        // ロガー以外の最初の呼び出し元を探す
        let callerIndex = 0;
        for (let i = 0; i < stack.length; i++) {
            const fileName = stack[i].getFileName() || '';

            // ロガーに関連しないファイルを見つけたらそれが実際の呼び出し元
            const isLoggerFile = loggerPaths.some(path => fileName.includes(path));
            if (!isLoggerFile) {
                callerIndex = i;
                break;
            }
        }

        // 呼び出し元情報を取得
        if (callerIndex < stack.length) {
            const caller = stack[callerIndex];
            const fileName = caller.getFileName() || 'unknown';
            // ファイルパスからファイル名だけを抽出
            const parts = fileName.split('/');
            const file = parts[parts.length - 1];
            const line = caller.getLineNumber() || 0;
            return { file, line };
        }

        return { file: 'unknown', line: 0 };
    } catch (error) {
        return { file: 'unknown', line: 0 };
    } finally {
        // 元の prepareStackTrace を復元
        Error.prepareStackTrace = originalPrepareStackTrace;
    }
}

/**
 * 各ログレベルのメソッドをラップして行番号情報を追加する
 */
function createEnhancedLogger(logger: pino.Logger): pino.Logger {
    // 拡張するログレベル
    const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
    // 基本的な機能を持つロガーを作成
    const enhancedLogger = Object.create(logger);

    // 各ログレベルメソッドをラップ
    levels.forEach(level => {
        const originalMethod = logger[level].bind(logger);
        enhancedLogger[level] = (...args: any[]) => {
            // ログ呼び出し時に位置情報を取得
            const { file, line } = getCallerInfo();

            // 引数の処理: 最初の引数がオブジェクトなら位置情報を追加
            if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
                args[0] = { file, line, ...args[0] };
            } else {
                // オブジェクトでない場合は先頭に位置情報を追加
                args.unshift({ file, line });
            }

            // 元のログメソッドを呼び出し
            return originalMethod(...args);
        };
    });

    // child メソッドを特別に上書き
    const originalChild = logger.child.bind(logger);
    enhancedLogger.child = function (bindings: pino.Bindings): pino.Logger {
        // 元の child メソッドを呼び出し
        const childLogger = originalChild(bindings);
        // 子ロガーも強化
        return createEnhancedLogger(childLogger);
    };

    return enhancedLogger;
}

// 拡張ロガーの作成
const logger = createEnhancedLogger(baseLogger);

/**
 * コンソール出力時のスタイルを定義
 */
const consoleStyles = {
    // ファイル名と行番号用のスタイル
    fileInfo: 'color: #6699cc; font-weight: bold',
    // モジュール名用のスタイル
    moduleName: 'color: #5cb85c; font-weight: bold',
    // ログレベル別のスタイル
    levels: {
        trace: 'color: #aaaaaa',
        debug: 'color: #6c757d',
        info: 'color: #0275d8; font-weight: bold',
        warn: 'color: #f0ad4e; font-weight: bold',
        error: 'color: #d9534f; font-weight: bold',
        fatal: 'color: #ffffff; background-color: #d9534f; font-weight: bold; padding: 2px 5px; border-radius: 3px'
    }
};

/**
 * 呼び出し元のファイル名と行番号を child logger のコンテキストに付加して返す
 * コンソールにも同時に出力したい場合は enableConsole を true に設定
 */
export function getLogger(componentName?: string, enableConsole: boolean = false): pino.Logger {
    const { file, line } = getCallerInfo();
    const module = componentName || file;

    // 基本のロガー
    const childLogger = logger.child({ module, line });

    // コンソール出力が有効な場合、コンソールにも出力する拡張ロガーを作成
    if (enableConsole && useConsoleAPI) {
        return new Proxy(childLogger, {
            get(target, prop) {
                if (typeof prop === 'string' && ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(prop)) {
                    return function (...args: any[]) {
                        // オリジナルのロガーメソッドを呼び出し
                        (target as any)[prop](...args);

                        // コンソールにも出力（同じレベルで）
                        const consoleMethod = prop === 'trace' || prop === 'debug' ? 'log' :
                            prop === 'fatal' ? 'error' : prop;

                        try {
                            // ファイル情報とモジュール名を整形
                            const sourceInfo = `${file}:${line}`;
                            const levelUpperCase = prop.toUpperCase();

                            // 最初の引数がオブジェクトの場合とそうでない場合で処理を分ける
                            if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
                                // オブジェクトデータ
                                const objData = { ...args[0] };
                                delete objData.file;  // すでに別途表示するので削除
                                delete objData.line;  // すでに別途表示するので削除
                                delete objData.module; // すでに別途表示するので削除

                                // メッセージ部分
                                const messages = args.slice(1);

                                // スタイル付きのログを出力
                                console[consoleMethod as keyof Console](
                                    `%c[${sourceInfo}]%c [${module}]%c [${levelUpperCase}]:`,
                                    consoleStyles.fileInfo,
                                    consoleStyles.moduleName,
                                    consoleStyles.levels[prop as keyof typeof consoleStyles.levels],
                                    ...(messages.length > 0 ? messages : []),
                                    objData
                                );
                            } else {
                                // 通常のメッセージ（オブジェクトなし）
                                console[consoleMethod as keyof Console](
                                    `%c[${sourceInfo}]%c [${module}]%c [${levelUpperCase}]:`,
                                    consoleStyles.fileInfo,
                                    consoleStyles.moduleName,
                                    consoleStyles.levels[prop as keyof typeof consoleStyles.levels],
                                    ...args
                                );
                            }
                        } catch (e) {
                            // スタイル適用に失敗した場合は通常のフォーマットで表示
                            console[consoleMethod as keyof Console](`[${file}:${line}] [${module}] [${prop.toUpperCase()}]:`, ...args);
                        }
                    };
                }
                return (target as any)[prop];
            }
        }) as pino.Logger;
    }

    return childLogger;
}

/**
 * コンソールにも出力し、サーバーにも送信する便利なラッパー関数
 * module名とlog/consoleへの出力を一回の呼び出しで行う
 */
export function log(componentName: string, level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal', ...args: any[]): void {
    // 1. 通常のコンソール出力（ソースマップ情報が付加されるが、直接的でシンプル）
    const consoleMethod = level === 'trace' || level === 'debug' ? 'log' :
        level === 'fatal' ? 'error' : level;

    // レベルごとに色分け
    const levelColors = {
        trace: '#aaaaaa',
        debug: '#6c757d',
        info: '#0275d8',
        warn: '#f0ad4e',
        error: '#d9534f',
        fatal: '#d9534f'
    };

    // コンソールへ直接出力
    console[consoleMethod as keyof Console](
        `%c[${componentName}]%c [${level.toUpperCase()}]:`,
        `color: #5cb85c; font-weight: bold`,
        `color: ${levelColors[level]}; font-weight: bold`,
        ...args
    );

    // 2. Pinoロガーを使ってサーバーに送信（ログファイルに記録）
    const logger = getLogger(componentName, false); // コンソール出力せずサーバーに送信
    logger[level](...args);
}

export { logger };