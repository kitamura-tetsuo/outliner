import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, expect, test } from "vitest";

/** @feature ENV-a1b2c3d4
 *  Title   : Coverage backup and move-to-backup scripts
 *  Description: backup-coverage.js copies coverage to coverage-backups (keeps 10), move-coverage-to-backup.js moves coverage (keeps 10)
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const coverageDir = path.join(repoRoot, "coverage");
const backupsRoot = path.join(repoRoot, "coverage-backups");
const backupScript = path.join(repoRoot, "client", "scripts", "backup-coverage.js");
const moveScript = path.join(repoRoot, "client", "scripts", "move-coverage-to-backup.js");

beforeEach(() => {
    // クリーンアップ
    if (fs.existsSync(coverageDir)) {
        fs.rmSync(coverageDir, { recursive: true, force: true });
    }
    if (fs.existsSync(backupsRoot)) {
        fs.rmSync(backupsRoot, { recursive: true, force: true });
    }
});

afterEach(() => {
    // テスト後のクリーンアップ
    if (fs.existsSync(coverageDir)) {
        fs.rmSync(coverageDir, { recursive: true, force: true });
    }
    if (fs.existsSync(backupsRoot)) {
        fs.rmSync(backupsRoot, { recursive: true, force: true });
    }
});

test("backup script copies coverage directory to coverage-backups", () => {
    // テスト用のcoverageディレクトリを作成
    fs.mkdirSync(path.join(coverageDir, "test-data"), { recursive: true });
    fs.writeFileSync(path.join(coverageDir, "test-data", "test.txt"), "test coverage data");

    // バックアップスクリプトを実行
    execSync(`node ${backupScript}`, { cwd: repoRoot });

    // coverageディレクトリがまだ存在することを確認（コピーなので）
    expect(fs.existsSync(coverageDir)).toBe(true);

    // coverage-backupsディレクトリにバックアップが作成されたことを確認
    expect(fs.existsSync(backupsRoot)).toBe(true);
    const backups = fs.readdirSync(backupsRoot);
    expect(backups.length).toBe(1);

    // バックアップされたデータが正しいことを確認
    const backupDir = path.join(backupsRoot, backups[0]);
    const testFile = path.join(backupDir, "test-data", "test.txt");
    expect(fs.existsSync(testFile)).toBe(true);
    expect(fs.readFileSync(testFile, "utf-8")).toBe("test coverage data");
});

test("backup script keeps only 10 most recent backups", () => {
    // 11個のバックアップを作成
    for (let i = 0; i < 11; i++) {
        // テスト用のcoverageディレクトリを作成
        fs.mkdirSync(path.join(coverageDir, `test-data-${i}`), { recursive: true });
        fs.writeFileSync(path.join(coverageDir, `test-data-${i}`, `test${i}.txt`), `test data ${i}`);

        // バックアップスクリプトを実行
        execSync(`node ${backupScript}`, { cwd: repoRoot });

        // タイムスタンプが異なることを保証するために少し待機
        if (i < 10) {
            execSync("sleep 1");
        }
    }

    // バックアップが10個だけ残っていることを確認
    const backups = fs.readdirSync(backupsRoot);
    expect(backups.length).toBe(10);

    // 最新の10個のバックアップが残っていることを確認
    const backupDirs = backups
        .map((name) => ({
            name,
            path: path.join(backupsRoot, name),
            mtime: fs.statSync(path.join(backupsRoot, name)).mtime,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // 最新のバックアップにtest-data-10が含まれていることを確認
    const latestBackup = backupDirs[0];
    expect(fs.existsSync(path.join(latestBackup.path, "test-data-10", "test10.txt"))).toBe(true);

    // 最も古いバックアップにtest-data-1が含まれていることを確認
    const oldestBackup = backupDirs[9];
    expect(fs.existsSync(path.join(oldestBackup.path, "test-data-1", "test1.txt"))).toBe(true);
}, 30000);

test("move-to-backup script moves coverage directory to coverage-backups", () => {
    // テスト用のcoverageディレクトリを作成
    fs.mkdirSync(path.join(coverageDir, "test-data"), { recursive: true });
    fs.writeFileSync(path.join(coverageDir, "test-data", "test.txt"), "test coverage data");

    // move-to-backupスクリプトを実行
    execSync(`node ${moveScript}`, { cwd: repoRoot });

    // coverageディレクトリが移動されたことを確認
    expect(fs.existsSync(coverageDir)).toBe(false);

    // coverage-backupsディレクトリにバックアップが作成されたことを確認
    expect(fs.existsSync(backupsRoot)).toBe(true);
    const backups = fs.readdirSync(backupsRoot);
    expect(backups.length).toBe(1);

    // バックアップされたデータが正しいことを確認
    const backupDir = path.join(backupsRoot, backups[0]);
    const testFile = path.join(backupDir, "test-data", "test.txt");
    expect(fs.existsSync(testFile)).toBe(true);
    expect(fs.readFileSync(testFile, "utf-8")).toBe("test coverage data");
});

test("move-to-backup script keeps only 10 most recent backups", () => {
    // 11個のバックアップを作成
    for (let i = 0; i < 11; i++) {
        // テスト用のcoverageディレクトリを作成
        fs.mkdirSync(path.join(coverageDir, `test-data-${i}`), { recursive: true });
        fs.writeFileSync(path.join(coverageDir, `test-data-${i}`, `test${i}.txt`), `test data ${i}`);

        // move-to-backupスクリプトを実行
        execSync(`node ${moveScript}`, { cwd: repoRoot });

        // タイムスタンプが異なることを保証するために少し待機
        if (i < 10) {
            execSync("sleep 1");
        }
    }

    // バックアップが10個だけ残っていることを確認
    const backups = fs.readdirSync(backupsRoot);
    expect(backups.length).toBe(10);

    // 最新の10個のバックアップが残っていることを確認
    const backupDirs = backups
        .map((name) => ({
            name,
            path: path.join(backupsRoot, name),
            mtime: fs.statSync(path.join(backupsRoot, name)).mtime,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // 最新のバックアップにtest-data-10が含まれていることを確認
    const latestBackup = backupDirs[0];
    expect(fs.existsSync(path.join(latestBackup.path, "test-data-10", "test10.txt"))).toBe(true);

    // 最も古いバックアップにtest-data-1が含まれていることを確認
    const oldestBackup = backupDirs[9];
    expect(fs.existsSync(path.join(oldestBackup.path, "test-data-1", "test1.txt"))).toBe(true);
}, 30000);

test("backup script skips when coverage directory does not exist", () => {
    // coverageディレクトリが存在しない状態でスクリプトを実行
    const output = execSync(`node ${backupScript}`, { cwd: repoRoot }).toString();

    // スキップメッセージが出力されることを確認
    expect(output).toContain("skip: no coverage directory");

    // coverage-backupsディレクトリが作成されないことを確認
    expect(fs.existsSync(backupsRoot)).toBe(false);
});

test("move-to-backup script skips when coverage directory does not exist", () => {
    // coverageディレクトリが存在しない状態でスクリプトを実行
    const output = execSync(`node ${moveScript}`, { cwd: repoRoot }).toString();

    // スキップメッセージが出力されることを確認
    expect(output).toContain("skip: no coverage directory");

    // coverage-backupsディレクトリが作成されないことを確認
    expect(fs.existsSync(backupsRoot)).toBe(false);
});
