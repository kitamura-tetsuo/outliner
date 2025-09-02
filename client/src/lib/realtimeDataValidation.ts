// リアルタイムデータ一致チェック機能
import type { FluidClient } from "../fluid/fluidClient";
import { DataValidator, type ProjectValidationResult } from "./dataValidation";
import { getLogger } from "./logger";
import type { YjsProjectManager } from "./yjsProjectManager.svelte";

const logger = getLogger();

/**
 * テスト環境判定
 */
function isTestEnvironment(): boolean {
    // Playwrightテスト環境の判定
    if (typeof window !== "undefined") {
        // @ts-ignore
        return window.playwright !== undefined
            // @ts-ignore
            || window.__PLAYWRIGHT__ !== undefined
            // @ts-ignore
            || window.location?.hostname === "localhost" && window.location?.port === "7090";
    }
    return false;
}

/**
 * リアルタイムデータ一致チェック設定
 */
export interface RealtimeValidationConfig {
    enabled: boolean;
    throwOnMismatch: boolean;
    logDetails: boolean;
    debounceMs: number;
}

/**
 * リアルタイムデータ一致チェッククラス
 */
export class RealtimeDataValidator {
    private static instance: RealtimeDataValidator | null = null;
    private config: RealtimeValidationConfig;
    private validationTimeout: NodeJS.Timeout | null = null;
    private isValidating = false;

    private constructor() {
        this.config = {
            enabled: isTestEnvironment(),
            throwOnMismatch: true,
            logDetails: true, // 詳細ログを有効化
            debounceMs: 0, // 即座に実行（デバウンスなし）
        };

        logger.info(
            `RealtimeDataValidator initialized: enabled=${this.config.enabled}, testEnv=${isTestEnvironment()}`,
        );
    }

    /**
     * シングルトンインスタンスを取得
     */
    static getInstance(): RealtimeDataValidator {
        if (!this.instance) {
            this.instance = new RealtimeDataValidator();
        }
        return this.instance;
    }

    /**
     * 設定を更新
     */
    updateConfig(config: Partial<RealtimeValidationConfig>): void {
        this.config = { ...this.config, ...config };
        logger.info(`RealtimeDataValidator config updated`, this.config);
    }

    /**
     * 設定の取得（読み取り専用）
     */
    getConfig(): Readonly<RealtimeValidationConfig> {
        return this.config;
    }

    /**
     * リアルタイムチェックが有効かどうか
     */
    isEnabled(): boolean {
        return this.config.enabled;
    }

    /**
     * データ操作後のリアルタイムチェックを実行（無効化 - モード分離のため）
     */
    async validateAfterOperation(
        operationType: string,
        fluidClient: FluidClient | null,
        yjsProjectManager: YjsProjectManager | null,
        context?: any,
    ): Promise<void> {
        // リアルタイムバリデーションは削除（モード分離のため）
        console.log(`🔍 [RealtimeValidator] Realtime validation disabled for mode separation`);
        return;
    }

    /**
     * 実際の検証処理を実行
     */
    private async performValidation(
        operationType: string,
        fluidClient: FluidClient,
        yjsProjectManager: YjsProjectManager,
        context?: any,
    ): Promise<void> {
        if (this.isValidating) {
            logger.debug("RealtimeDataValidator: Validation already in progress, skipping");
            return;
        }

        this.isValidating = true;

        try {
            console.log(`🔍 [RealtimeValidator] Starting validation after ${operationType}`, context);

            const result = await DataValidator.validateProject(fluidClient, yjsProjectManager, {
                checkProjectTitle: true,
                checkPageCount: true,
                checkPageTitles: true,
                checkItemCounts: true,
            });

            await this.handleValidationResult(operationType, result, context);
        } catch (error) {
            console.error(`❌ [RealtimeValidator] Validation error after ${operationType}:`, error);
            logger.error(`RealtimeDataValidator: Validation error after ${operationType}: ${error}`);

            if (this.config.throwOnMismatch) {
                throw new Error(`❌ REALTIME VALIDATION FAILED after ${operationType}: ${error}`);
            }
        } finally {
            this.isValidating = false;
        }
    }

    /**
     * 検証結果を処理
     */
    private async handleValidationResult(
        operationType: string,
        result: ProjectValidationResult,
        context?: any,
    ): Promise<void> {
        if (result.isValid) {
            console.log(`✅ [RealtimeValidator] Data consistency verified after ${operationType}`);
            logger.debug(`✅ RealtimeDataValidator: Data consistency verified after ${operationType}`);
            return;
        }

        // データ不一致を検出 - 詳細情報をコンソールに出力
        const errorMessage = this.formatValidationError(operationType, result, context);
        console.error(`❌ [RealtimeValidator] ${errorMessage}`);
        logger.error(errorMessage);

        // 詳細な不一致情報を出力
        this.logDetailedMismatchInfo(operationType, result, context);

        if (this.config.throwOnMismatch) {
            // テストを即座に失敗させる
            throw new Error(errorMessage);
        }
    }

    /**
     * 検証エラーメッセージをフォーマット
     */
    private formatValidationError(
        operationType: string,
        result: ProjectValidationResult,
        context?: any,
    ): string {
        const errors = result.errors.join(", ");
        const warnings = result.warnings.join(", ");

        let message = `❌ REALTIME DATA VALIDATION FAILED after ${operationType}`;

        if (context) {
            message += ` (context: ${JSON.stringify(context)})`;
        }

        message += `\nErrors: ${errors}`;

        if (warnings) {
            message += `\nWarnings: ${warnings}`;
        }

        // プロジェクトタイトルの不一致
        if (!result.projectTitle.matches) {
            message +=
                `\nProject title mismatch: Fluid="${result.projectTitle.fluid}" vs Yjs="${result.projectTitle.yjs}"`;
        }

        // ページ数の不一致
        if (!result.pageCount.matches) {
            message += `\nPage count mismatch: Fluid=${result.pageCount.fluid} vs Yjs=${result.pageCount.yjs}`;
        }

        // ページレベルの不一致
        const failedPages = result.pages.filter(p => !p.isValid);
        if (failedPages.length > 0) {
            message += `\nFailed pages: ${failedPages.map(p => `"${p.title.fluid}"`).join(", ")}`;
        }

        return message;
    }

    /**
     * 詳細な不一致情報をログ出力
     */
    private logDetailedMismatchInfo(
        operationType: string,
        result: ProjectValidationResult,
        context?: any,
    ): void {
        console.group(`🔍 [RealtimeValidator] Detailed mismatch info for ${operationType}`);

        if (context) {
            console.log(`📋 Context:`, context);
        }

        // プロジェクトタイトルの不一致
        if (!result.projectTitle.matches) {
            console.error(`📝 Project title mismatch:`);
            console.error(`  Fluid: "${result.projectTitle.fluid}"`);
            console.error(`  Yjs:   "${result.projectTitle.yjs}"`);
        }

        // ページ数の不一致
        if (!result.pageCount.matches) {
            console.error(`📄 Page count mismatch:`);
            console.error(`  Fluid: ${result.pageCount.fluid} pages`);
            console.error(`  Yjs:   ${result.pageCount.yjs} pages`);
        }

        // ページレベルの詳細情報
        result.pages.forEach((page, pageIndex) => {
            if (!page.isValid) {
                console.group(`📄 Page ${pageIndex}: "${page.title.fluid}"`);

                if (!page.title.matches) {
                    console.error(`  Title mismatch:`);
                    console.error(`    Fluid: "${page.title.fluid}"`);
                    console.error(`    Yjs:   "${page.title.yjs}"`);
                }

                if (!page.itemCount.matches) {
                    console.error(`  Item count mismatch:`);
                    console.error(`    Fluid: ${page.itemCount.fluid} items`);
                    console.error(`    Yjs:   ${page.itemCount.yjs} items`);
                }

                // アイテムレベルの詳細情報
                const mismatchedItems = page.items.filter(item => !item.matches);
                if (mismatchedItems.length > 0) {
                    console.error(`  🔍 ${mismatchedItems.length} mismatched items:`);
                    mismatchedItems.forEach(item => {
                        console.group(`    Item ${item.index}:`);
                        console.error(`      Differences: ${item.differences.join(", ")}`);
                        if (item.fluid) {
                            console.error(`      Fluid: id="${item.fluid.id}", text="${item.fluid.text}"`);
                        } else {
                            console.error(`      Fluid: MISSING`);
                        }
                        if (item.yjs) {
                            console.error(`      Yjs:   id="${item.yjs.id}", text="${item.yjs.text}"`);
                        } else {
                            console.error(`      Yjs:   MISSING`);
                        }
                        console.groupEnd();
                    });
                }

                console.groupEnd();
            }
        });

        console.groupEnd();
    }

    /**
     * 手動で即座に検証を実行（無効化 - モード分離のため）
     */
    async validateImmediately(
        operationType: string,
        fluidClient: FluidClient | null,
        yjsProjectManager: YjsProjectManager | null,
        context?: any,
    ): Promise<void> {
        // リアルタイムバリデーションは削除（モード分離のため）
        console.log(`🔍 [RealtimeValidator] Immediate validation disabled for mode separation`);
        return;
    }

    /**
     * テスト用のリセット機能
     */
    reset(): void {
        if (this.validationTimeout) {
            clearTimeout(this.validationTimeout);
            this.validationTimeout = null;
        }
        this.isValidating = false;
    }
}

/**
 * グローバルインスタンスをエクスポート
 */
export const realtimeValidator = RealtimeDataValidator.getInstance();
