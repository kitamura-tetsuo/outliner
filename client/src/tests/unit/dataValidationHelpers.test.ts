import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * dataValidationHelpers.tsファイル内のsync関連コードの存在をチェックするテスト
 *
 * このテストは、dataValidationHelpers.tsファイル内に「sync」という単語や
 * syncを含むメソッドが存在する場合にエラーを発生させます。
 *
 * 目的：
 * - Fluid-Yjsの併存フェーズでは、データの同期（sync）は禁止されている
 * - FluidのデータをYjsに同期するのではなく、独立して動作させる必要がある
 * - このテストにより、誤ってsync処理が追加されることを防ぐ
 */
describe("DataValidationHelpers Sync Detection", () => {
    const filePath = join(process.cwd(), "e2e/utils/dataValidationHelpers.ts");
    let fileContent: string;

    try {
        fileContent = readFileSync(filePath, "utf-8");
    } catch (error) {
        throw new Error(`Failed to read dataValidationHelpers.ts: ${error}`);
    }

    it("should not contain 'sync' word in method names", () => {
        // メソッド名に「sync」を含むパターンを検索（asyncは除外）
        const syncMethodPattern = /(?:static\s+)?(?:private\s+)?(?:public\s+)?\w*sync\w*\s*\(/gi;
        const allMatches = fileContent.match(syncMethodPattern);

        // asyncキーワードを含むものを除外
        const syncMethods = allMatches
            ? allMatches.filter(match => {
                const trimmed = match.trim().toLowerCase();
                return !trimmed.startsWith("async ") && !trimmed.includes("async(");
            })
            : [];

        if (syncMethods && syncMethods.length > 0) {
            const methodNames = syncMethods.map(match => match.trim());
            expect.fail(
                `Found ${syncMethods.length} method(s) containing 'sync' in their names:\n`
                    + `${methodNames.join("\n")}\n\n`
                    + `These methods violate the Fluid-Yjs coexistence policy. `
                    + `During the coexistence phase, Fluid and Yjs should operate independently `
                    + `without synchronization. Please remove or rename these methods.`,
            );
        }

        // テストが通った場合のメッセージ
        expect(true).toBe(true);
    });

    it("should not contain 'sync' word in variable names", () => {
        // 変数名に「sync」を含むパターンを検索（const, let, var宣言）
        const syncVariablePattern = /(?:const|let|var)\s+\w*sync\w*\s*=/gi;
        const syncVariables = fileContent.match(syncVariablePattern);

        if (syncVariables && syncVariables.length > 0) {
            const variableNames = syncVariables.map(match => match.trim());
            expect.fail(
                `Found ${syncVariables.length} variable(s) containing 'sync' in their names:\n`
                    + `${variableNames.join("\n")}\n\n`
                    + `These variables violate the Fluid-Yjs coexistence policy. `
                    + `During the coexistence phase, Fluid and Yjs should operate independently `
                    + `without synchronization. Please remove or rename these variables.`,
            );
        }

        // テストが通った場合のメッセージ
        expect(true).toBe(true);
    });

    it("should not contain 'sync' word in comments (excluding this test file)", () => {
        // コメント内の「sync」を検索（ただし、このテストファイル自体のコメントは除外）
        const lines = fileContent.split("\n");
        const syncInComments: string[] = [];

        lines.forEach((line, index) => {
            const lineNumber = index + 1;
            const trimmedLine = line.trim();

            // 単行コメント (//) 内の sync を検索
            if (trimmedLine.includes("//")) {
                const commentPart = trimmedLine.substring(trimmedLine.indexOf("//"));
                if (/\bsync\b/i.test(commentPart)) {
                    syncInComments.push(`Line ${lineNumber}: ${line.trim()}`);
                }
            }

            // 複数行コメント (/* */) 内の sync を検索
            if (trimmedLine.includes("/*") || trimmedLine.includes("*/")) {
                if (/\bsync\b/i.test(trimmedLine)) {
                    syncInComments.push(`Line ${lineNumber}: ${line.trim()}`);
                }
            }
        });

        if (syncInComments.length > 0) {
            expect.fail(
                `Found ${syncInComments.length} comment(s) containing 'sync':\n`
                    + `${syncInComments.join("\n")}\n\n`
                    + `These comments suggest synchronization logic, which violates the `
                    + `Fluid-Yjs coexistence policy. During the coexistence phase, `
                    + `Fluid and Yjs should operate independently. Please review and `
                    + `update these comments to reflect independent operation.`,
            );
        }

        // テストが通った場合のメッセージ
        expect(true).toBe(true);
    });

    it("should not contain 'sync' word in string literals", () => {
        // 文字列リテラル内の「sync」を検索
        const stringLiteralPattern = /["'`][^"'`]*\bsync\b[^"'`]*["'`]/gi;
        const syncInStrings = fileContent.match(stringLiteralPattern);

        if (syncInStrings && syncInStrings.length > 0) {
            const uniqueStrings = [...new Set(syncInStrings)];
            expect.fail(
                `Found ${uniqueStrings.length} string literal(s) containing 'sync':\n`
                    + `${uniqueStrings.join("\n")}\n\n`
                    + `These string literals suggest synchronization logic, which violates the `
                    + `Fluid-Yjs coexistence policy. During the coexistence phase, `
                    + `Fluid and Yjs should operate independently without synchronization. `
                    + `Please review and update these strings.`,
            );
        }

        // テストが通った場合のメッセージ
        expect(true).toBe(true);
    });

    it("should not contain method calls with 'sync' in the name", () => {
        // メソッド呼び出しで「sync」を含むパターンを検索
        const syncMethodCallPattern = /\w*sync\w*\s*\(/gi;
        const allMethodCalls = fileContent.match(syncMethodCallPattern);

        if (allMethodCalls && allMethodCalls.length > 0) {
            // 重複を除去し、asyncキーワードを含むものを除外
            const uniqueCalls = [...new Set(allMethodCalls)]
                .filter(call => {
                    const trimmed = call.trim().toLowerCase();
                    return !trimmed.startsWith("async ")
                        && !trimmed.includes("async(")
                        && !trimmed.includes("static ")
                        && !trimmed.includes("private ")
                        && !trimmed.includes("public ");
                });

            if (uniqueCalls.length > 0) {
                expect.fail(
                    `Found ${uniqueCalls.length} method call(s) containing 'sync':\n`
                        + `${uniqueCalls.join("\n")}\n\n`
                        + `These method calls suggest synchronization logic, which violates the `
                        + `Fluid-Yjs coexistence policy. During the coexistence phase, `
                        + `Fluid and Yjs should operate independently without synchronization. `
                        + `Please remove or replace these method calls.`,
                );
            }
        }

        // テストが通った場合のメッセージ
        expect(true).toBe(true);
    });

    it("should provide guidance on proper Fluid-Yjs coexistence", () => {
        // このテストは常に成功し、適切なFluid-Yjs併存のガイダンスを提供する
        console.log(`
🔍 Fluid-Yjs Coexistence Policy Reminder:

1. ❌ 禁止事項:
   - FluidのデータをYjsに同期すること
   - YjsのデータをFluidに同期すること
   - 両システム間でのデータ同期処理

2. ✅ 推奨事項:
   - FluidとYjsは完全に独立して動作させる
   - 同じ操作を両システムに並列して実行する
   - 各システムが独自のデータストアを持つ
   - E2Eテストの最終段階で両システムのデータが意味的に一致することを確認する

3. 🎯 目標:
   - 段階的にFluidからYjsに移行する
   - 最終的にFluid依存コードを完全に削除する
   - Yjsベースの完全なリアルタイム協調編集システムを構築する
        `);

        expect(true).toBe(true);
    });
});
