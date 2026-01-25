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
    // Cleanup
    if (fs.existsSync(coverageDir)) {
        fs.rmSync(coverageDir, { recursive: true, force: true });
    }
    if (fs.existsSync(backupsRoot)) {
        fs.rmSync(backupsRoot, { recursive: true, force: true });
    }
});

afterEach(() => {
    // Post-test cleanup
    if (fs.existsSync(coverageDir)) {
        fs.rmSync(coverageDir, { recursive: true, force: true });
    }
    if (fs.existsSync(backupsRoot)) {
        fs.rmSync(backupsRoot, { recursive: true, force: true });
    }
});

test("backup script copies coverage directory to coverage-backups", () => {
    // Create test coverage directory
    fs.mkdirSync(path.join(coverageDir, "test-data"), { recursive: true });
    fs.writeFileSync(path.join(coverageDir, "test-data", "test.txt"), "test coverage data");

    // Execute backup script
    execSync(`node ${backupScript}`, { cwd: repoRoot });

    // Confirm coverage directory still exists (since it's a copy)
    expect(fs.existsSync(coverageDir)).toBe(true);

    // Confirm backup created in coverage-backups directory
    expect(fs.existsSync(backupsRoot)).toBe(true);
    const backups = fs.readdirSync(backupsRoot);
    expect(backups.length).toBe(1);

    // Confirm backed up data is correct
    const backupDir = path.join(backupsRoot, backups[0]);
    const testFile = path.join(backupDir, "test-data", "test.txt");
    expect(fs.existsSync(testFile)).toBe(true);
    expect(fs.readFileSync(testFile, "utf-8")).toBe("test coverage data");
});

test("backup script keeps only 10 most recent backups", () => {
    // Create 11 backups
    for (let i = 0; i < 11; i++) {
        // Create test coverage directory
        fs.mkdirSync(path.join(coverageDir, `test-data-${i}`), { recursive: true });
        fs.writeFileSync(path.join(coverageDir, `test-data-${i}`, `test${i}.txt`), `test data ${i}`);

        // Execute backup script
        execSync(`node ${backupScript}`, { cwd: repoRoot });

        // Wait slightly to ensure different timestamps
        if (i < 10) {
            execSync("sleep 1");
        }
    }

    // Confirm only 10 backups remain
    const backups = fs.readdirSync(backupsRoot);
    expect(backups.length).toBe(10);

    // Confirm 10 most recent backups remain
    const backupDirs = backups
        .map((name) => ({
            name,
            path: path.join(backupsRoot, name),
            mtime: fs.statSync(path.join(backupsRoot, name)).mtime,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // Confirm latest backup contains test-data-10
    const latestBackup = backupDirs[0];
    expect(fs.existsSync(path.join(latestBackup.path, "test-data-10", "test10.txt"))).toBe(true);

    // Confirm oldest backup contains test-data-1
    const oldestBackup = backupDirs[9];
    expect(fs.existsSync(path.join(oldestBackup.path, "test-data-1", "test1.txt"))).toBe(true);
}, 30000);

test("move-to-backup script moves coverage directory to coverage-backups", () => {
    // Create test coverage directory
    fs.mkdirSync(path.join(coverageDir, "test-data"), { recursive: true });
    fs.writeFileSync(path.join(coverageDir, "test-data", "test.txt"), "test coverage data");

    // Execute move-to-backup script
    execSync(`node ${moveScript}`, { cwd: repoRoot });

    // Confirm coverage directory was moved
    expect(fs.existsSync(coverageDir)).toBe(false);

    // Confirm backup created in coverage-backups directory
    expect(fs.existsSync(backupsRoot)).toBe(true);
    const backups = fs.readdirSync(backupsRoot);
    expect(backups.length).toBe(1);

    // Confirm backed up data is correct
    const backupDir = path.join(backupsRoot, backups[0]);
    const testFile = path.join(backupDir, "test-data", "test.txt");
    expect(fs.existsSync(testFile)).toBe(true);
    expect(fs.readFileSync(testFile, "utf-8")).toBe("test coverage data");
});

test("move-to-backup script keeps only 10 most recent backups", () => {
    // Create 11 backups
    for (let i = 0; i < 11; i++) {
        // Create test coverage directory
        fs.mkdirSync(path.join(coverageDir, `test-data-${i}`), { recursive: true });
        fs.writeFileSync(path.join(coverageDir, `test-data-${i}`, `test${i}.txt`), `test data ${i}`);

        // Execute move-to-backup script
        execSync(`node ${moveScript}`, { cwd: repoRoot });

        // Wait slightly to ensure different timestamps
        if (i < 10) {
            execSync("sleep 1");
        }
    }

    // Confirm only 10 backups remain
    const backups = fs.readdirSync(backupsRoot);
    expect(backups.length).toBe(10);

    // Confirm 10 most recent backups remain
    const backupDirs = backups
        .map((name) => ({
            name,
            path: path.join(backupsRoot, name),
            mtime: fs.statSync(path.join(backupsRoot, name)).mtime,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // Confirm latest backup contains test-data-10
    const latestBackup = backupDirs[0];
    expect(fs.existsSync(path.join(latestBackup.path, "test-data-10", "test10.txt"))).toBe(true);

    // Confirm oldest backup contains test-data-1
    const oldestBackup = backupDirs[9];
    expect(fs.existsSync(path.join(oldestBackup.path, "test-data-1", "test1.txt"))).toBe(true);
}, 30000);

test("backup script skips when coverage directory does not exist", () => {
    // Execute script with no coverage directory
    const output = execSync(`node ${backupScript}`, { cwd: repoRoot }).toString();

    // Confirm skip message output
    expect(output).toContain("skip: no coverage directory");

    // Confirm coverage-backups directory not created
    expect(fs.existsSync(backupsRoot)).toBe(false);
});

test("move-to-backup script skips when coverage directory does not exist", () => {
    // Execute script with no coverage directory
    const output = execSync(`node ${moveScript}`, { cwd: repoRoot }).toString();

    // Confirm skip message output
    expect(output).toContain("skip: no coverage directory");

    // Confirm coverage-backups directory not created
    expect(fs.existsSync(backupsRoot)).toBe(false);
});
