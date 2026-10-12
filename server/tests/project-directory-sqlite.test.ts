import Database from "better-sqlite3";
import { expect } from "chai";
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    getDefaultProjectDirectoryProvider,
    resolveProjectDirectoryProvider,
} from "../src/project-directory-provider.js";
import {
    createLocalSqliteProjectDirectoryProvider,
    LOCAL_OWNER_UID,
    type LocalSqliteProjectDirectoryProvider,
} from "../src/project-directory-sqlite.js";
import { ProjectDirectoryError } from "../src/project-directory.js";

// Regression coverage for the durable local SQLite project directory (issue
// #5583). Every test below runs through the actual provider operations
// against a real file-backed SQLite database: no Firestore emulator, no
// Firebase configuration, no mocked storage and no pre-seeded descriptors on
// recovery paths.
describe("local SQLite project directory (real file-backed database)", () => {
    const OWNER = LOCAL_OWNER_UID;
    const OTHER = "someone-else";
    const providers: LocalSqliteProjectDirectoryProvider[] = [];
    const scratchDirs: string[] = [];

    function scratchDbPath(fileName = "directory.sqlite"): string {
        const dir = mkdtempSync(join(tmpdir(), "local-project-directory-"));
        scratchDirs.push(dir);
        return join(dir, fileName);
    }

    function openProvider(dbPath: string): LocalSqliteProjectDirectoryProvider {
        const provider = createLocalSqliteProjectDirectoryProvider(dbPath);
        providers.push(provider);
        return provider;
    }

    async function expectDirectoryError(promise: Promise<unknown>, code: string): Promise<void> {
        try {
            await promise;
        } catch (error) {
            expect(error).to.be.instanceOf(ProjectDirectoryError);
            expect((error as ProjectDirectoryError).code).to.equal(code);
            return;
        }
        expect.fail(`expected ProjectDirectoryError with code ${code}`);
    }

    function rowCount(dbPath: string): number {
        const raw = new Database(dbPath, { readonly: true });
        try {
            const rows = raw.prepare("SELECT COUNT(*) AS count FROM projects").get() as { count: number; };
            return rows.count;
        } finally {
            raw.close();
        }
    }

    afterEach(() => {
        for (const provider of providers.splice(0)) {
            provider.close();
        }
        for (const dir of scratchDirs.splice(0)) {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("starts empty without Firebase, persists across close/reopen and refuses other principals", async () => {
        const dbPath = scratchDbPath();
        const provider = openProvider(dbPath);
        expect(provider.kind).to.equal("local-sqlite");
        expect(await provider.listDescriptors(OWNER)).to.deep.equal([]);

        const created = await provider.ensureDescriptor(OWNER, "project-one", "  Notes  ");
        expect(created).to.deep.equal({ projectId: "project-one", title: "Notes" });
        provider.close();

        // Reopen the same file with a fresh instance: no pre-seeded
        // descriptors, no substituted storage results.
        const reopened = openProvider(dbPath);
        expect(await reopened.listDescriptors(OWNER)).to.deep.equal([
            { projectId: "project-one", title: "Notes" },
        ]);
        expect(await reopened.getDescriptor(OWNER, "project-one")).to.deep.equal({
            projectId: "project-one",
            title: "Notes",
        });
        expect(await reopened.resolveTitle(OWNER, "Notes")).to.deep.equal({
            projectId: "project-one",
            title: "Notes",
        });
        expect(await reopened.checkAccess(OWNER, "project-one")).to.equal(true);
        expect(await reopened.findAccessibleIds(OWNER)).to.deep.equal(["project-one"]);

        // Repeating the same ID and normalized title replays without mutation.
        const replayed = await reopened.ensureDescriptor(OWNER, "project-one", "Notes");
        expect(replayed).to.deep.equal({ projectId: "project-one", title: "Notes" });
        expect(rowCount(dbPath)).to.equal(1);

        // A different principal is refused on every operation.
        await expectDirectoryError(reopened.getDescriptor(OTHER, "project-one"), "forbidden");
        await expectDirectoryError(reopened.listDescriptors(OTHER), "forbidden");
        await expectDirectoryError(reopened.resolveTitle(OTHER, "Notes"), "forbidden");
        await expectDirectoryError(reopened.ensureDescriptor(OTHER, "project-one", "Notes"), "forbidden");
        await expectDirectoryError(reopened.rename(OTHER, "project-one", "Other"), "forbidden");
        expect(await reopened.checkAccess(OTHER, "project-one")).to.equal(false);
        expect(await reopened.findAccessibleIds(OTHER)).to.deep.equal([]);

        // Merely importing and constructing the local provider leaves the
        // default Firestore-backed cloud provider selected.
        expect(resolveProjectDirectoryProvider().kind).to.equal("firestore");
        expect(getDefaultProjectDirectoryProvider().kind).to.equal("firestore");
    });

    it("normalizes titles, enforces collisions and never derives IDs from titles", async () => {
        const dbPath = scratchDbPath();
        const provider = openProvider(dbPath);
        await provider.ensureDescriptor(OWNER, "project-one", "Notes");

        // Same ID with a different title reports title_conflict and changes nothing.
        await expectDirectoryError(provider.ensureDescriptor(OWNER, "project-one", "Other"), "title_conflict");
        expect(await provider.getDescriptor(OWNER, "project-one")).to.deep.equal({
            projectId: "project-one",
            title: "Notes",
        });

        // A different ID with an existing normalized title reports
        // duplicate_title without creating any descriptor.
        await expectDirectoryError(provider.ensureDescriptor(OWNER, "project-two", "  Notes "), "duplicate_title");
        await expectDirectoryError(provider.getDescriptor(OWNER, "project-two"), "not_found");
        expect(rowCount(dbPath)).to.equal(1);

        // Padded decomposed Unicode normalizes to the same canonical title.
        await provider.ensureDescriptor(OWNER, "project-cafe", "  Café ");
        await expectDirectoryError(provider.ensureDescriptor(OWNER, "project-third", "Café"), "duplicate_title");
        await expectDirectoryError(provider.ensureDescriptor(OWNER, "project-fourth", "Café"), "duplicate_title");

        // Title equality is case-sensitive after normalization.
        await provider.ensureDescriptor(OWNER, "project-lower", "notes");
        expect(await provider.getDescriptor(OWNER, "project-lower")).to.deep.equal({
            projectId: "project-lower",
            title: "notes",
        });

        // UUID-shaped, empty, overlong and non-string titles are invalid.
        await expectDirectoryError(
            provider.ensureDescriptor(OWNER, "project-uuid", "4a934322-05de-4c97-932c-bc87fb43e18c"),
            "invalid_title",
        );
        await expectDirectoryError(
            provider.ensureDescriptor(OWNER, "project-uuid-upper", "4A934322-05DE-4C97-932C-BC87FB43E18C"),
            "invalid_title",
        );
        await expectDirectoryError(provider.ensureDescriptor(OWNER, "project-empty", "   "), "invalid_title");
        await expectDirectoryError(provider.ensureDescriptor(OWNER, "project-long", "a".repeat(256)), "invalid_title");
        await expectDirectoryError(provider.ensureDescriptor(OWNER, "project-blank", 42), "invalid_title");
        expect(await provider.ensureDescriptor(OWNER, "project-max", "a".repeat(255))).to.deep.equal({
            projectId: "project-max",
            title: "a".repeat(255),
        });

        // IDs outside the project-room grammar report not_found, never a new record.
        await expectDirectoryError(provider.ensureDescriptor(OWNER, "has space", "Spaced"), "not_found");
        await expectDirectoryError(provider.ensureDescriptor(OWNER, `p${"x".repeat(128)}`, "TooLong"), "not_found");
        await expectDirectoryError(provider.ensureDescriptor(OWNER, "", "Empty"), "not_found");
        await expectDirectoryError(provider.getDescriptor(OWNER, "has space"), "not_found");
        expect(await provider.checkAccess(OWNER, "has space")).to.equal(false);
    });

    it("renames titles without changing IDs and leaves state untouched on conflict", async () => {
        const dir = mkdtempSync(join(tmpdir(), "local-project-directory-"));
        scratchDirs.push(dir);
        const dbPath = join(dir, "directory.sqlite");
        // Stand-in for the Yjs/Hocuspocus persistence file: rename operations
        // must never rewrite it.
        const yjsStandIn = join(dir, "yjs.sqlite");
        writeFileSync(yjsStandIn, Buffer.from([0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x59, 0x6a, 0x73]));
        const yjsBefore = readFileSync(yjsStandIn);

        const provider = openProvider(dbPath);
        await provider.ensureDescriptor(OWNER, "project-one", "Notes");
        await provider.ensureDescriptor(OWNER, "project-two", "Other");

        const renamed = await provider.rename(OWNER, "project-one", "Renamed");
        expect(renamed).to.deep.equal({ projectId: "project-one", title: "Renamed" });
        expect(await provider.resolveTitle(OWNER, "Renamed")).to.deep.equal({
            projectId: "project-one",
            title: "Renamed",
        });

        // Renaming onto another descriptor's title fails and alters nothing.
        await expectDirectoryError(provider.rename(OWNER, "project-one", "Other"), "duplicate_title");
        // Registering a third ID under the renamed title fails as well.
        await expectDirectoryError(
            provider.ensureDescriptor(OWNER, "project-three", "Renamed"),
            "duplicate_title",
        );
        // Replaying the older registration must not revert the rename.
        await expectDirectoryError(provider.ensureDescriptor(OWNER, "project-one", "Notes"), "title_conflict");
        expect(await provider.getDescriptor(OWNER, "project-one")).to.deep.equal({
            projectId: "project-one",
            title: "Renamed",
        });

        // Renaming a missing descriptor, using an invalid title, or renaming
        // as another principal leaves every descriptor unchanged.
        await expectDirectoryError(provider.rename(OWNER, "project-missing", "New"), "not_found");
        await expectDirectoryError(provider.rename(OWNER, "project-one", "   "), "invalid_title");
        await expectDirectoryError(provider.rename(OTHER, "project-one", "Hacked"), "forbidden");
        expect(await provider.listDescriptors(OWNER)).to.deep.equal([
            { projectId: "project-two", title: "Other" },
            { projectId: "project-one", title: "Renamed" },
        ]);

        // A same-title rename is a no-op success.
        expect(await provider.rename(OWNER, "project-one", "  Renamed ")).to.deep.equal({
            projectId: "project-one",
            title: "Renamed",
        });

        expect(readFileSync(yjsStandIn)).to.deep.equal(yjsBefore);
        expect(readdirSync(dir).sort()).to.deep.equal(["directory.sqlite", "yjs.sqlite"]);
    });

    it("fails contended writes with storage_unavailable and reevaluates state on retry", async () => {
        const dbPath = scratchDbPath();
        const provider = openProvider(dbPath);
        await provider.ensureDescriptor(OWNER, "project-one", "Alpha");

        // Hold an observable real write transaction against the production file.
        const holder = new Database(dbPath);
        try {
            holder.exec("BEGIN IMMEDIATE");
            holder.prepare(
                "INSERT INTO projects (projectId, title, normalizedTitle, ownerUid) VALUES (?, ?, ?, ?)",
            ).run("project-held", "Held", "Held", OWNER);

            // Prove the write lock is really held before competing: an
            // independent handle cannot write either.
            const probe = new Database(dbPath, { timeout: 0 });
            try {
                expect(() =>
                    probe.exec(
                        "INSERT INTO projects (projectId, title, normalizedTitle, ownerUid) VALUES ('x','X','X','local-user')",
                    )
                )
                    .to.throw();
            } finally {
                probe.close();
            }

            // The competing production-provider operation reaches the
            // contested write: it may refuse with storage_unavailable but must
            // not claim success or change partial metadata.
            await expectDirectoryError(
                provider.ensureDescriptor(OWNER, "project-other", "Held"),
                "storage_unavailable",
            );
            await expectDirectoryError(provider.rename(OWNER, "project-one", "Held"), "storage_unavailable");
            expect(await provider.listDescriptors(OWNER)).to.deep.equal([
                { projectId: "project-one", title: "Alpha" },
            ]);

            holder.exec("COMMIT");
        } finally {
            try {
                holder.exec("ROLLBACK");
            } catch {
                // Already committed above; there is nothing left to roll back.
            }
            holder.close();
        }

        // Retrying after contention resolves reevaluates the committed state:
        // the held title is now a real conflict, while a fresh title succeeds.
        await expectDirectoryError(
            provider.ensureDescriptor(OWNER, "project-other", "Held"),
            "duplicate_title",
        );
        expect(await provider.ensureDescriptor(OWNER, "project-other", "Beta")).to.deep.equal({
            projectId: "project-other",
            title: "Beta",
        });
        expect(await provider.listDescriptors(OWNER)).to.deep.equal([
            { projectId: "project-one", title: "Alpha" },
            { projectId: "project-other", title: "Beta" },
            { projectId: "project-held", title: "Held" },
        ]);
    });

    it("reports storage failures without replacing the file and recovers the original directory", async () => {
        const dbPath = scratchDbPath();
        const provider = openProvider(dbPath);
        await provider.ensureDescriptor(OWNER, "project-one", "Notes");
        provider.close();
        const originalBytes = readFileSync(dbPath);

        // A copy with an invalid schema is unsupported: every operation
        // reports storage_unavailable and the file itself is preserved.
        const corruptPath = join(scratchDirs[0]!, "corrupt.sqlite");
        copyFileSync(dbPath, corruptPath);
        writeFileSync(corruptPath, Buffer.from(`not-a-sqlite-database-${"x".repeat(512)}`));
        const corruptBytes = readFileSync(corruptPath);
        const corrupt = openProvider(corruptPath);
        await expectDirectoryError(corrupt.listDescriptors(OWNER), "storage_unavailable");
        await expectDirectoryError(corrupt.getDescriptor(OWNER, "project-one"), "storage_unavailable");
        await expectDirectoryError(corrupt.resolveTitle(OWNER, "Notes"), "storage_unavailable");
        await expectDirectoryError(
            corrupt.ensureDescriptor(OWNER, "project-one", "Notes"),
            "storage_unavailable",
        );
        await expectDirectoryError(corrupt.rename(OWNER, "project-one", "Other"), "storage_unavailable");
        await expectDirectoryError(corrupt.checkAccess(OWNER, "project-one"), "storage_unavailable");
        await expectDirectoryError(corrupt.findAccessibleIds(OWNER), "storage_unavailable");
        expect(readFileSync(corruptPath)).to.deep.equal(corruptBytes);

        // A valid SQLite database with an unrelated (Yjs-like) schema is also
        // unsupported: it must not be seeded with an empty directory.
        const foreignPath = join(scratchDirs[0]!, "foreign.sqlite");
        const foreign = new Database(foreignPath);
        foreign.exec("CREATE TABLE documents (name TEXT PRIMARY KEY, data BLOB)");
        foreign.prepare("INSERT INTO documents (name, data) VALUES (?, ?)").run("projects/x", Buffer.from([1, 2, 3]));
        foreign.close();
        const foreignBytes = readFileSync(foreignPath);
        const foreignProvider = openProvider(foreignPath);
        await expectDirectoryError(foreignProvider.listDescriptors(OWNER), "storage_unavailable");
        await expectDirectoryError(
            foreignProvider.ensureDescriptor(OWNER, "project-one", "Notes"),
            "storage_unavailable",
        );
        expect(readFileSync(foreignPath)).to.deep.equal(foreignBytes);

        // Operations on a closed provider report storage_unavailable, and
        // restoring the original readable file recovers the original project
        // without any login-dependent reinitialization.
        const reopened = openProvider(dbPath);
        reopened.close();
        await expectDirectoryError(reopened.listDescriptors(OWNER), "storage_unavailable");
        expect(readFileSync(dbPath)).to.deep.equal(originalBytes);

        const recovered = openProvider(dbPath);
        expect(await recovered.listDescriptors(OWNER)).to.deep.equal([
            { projectId: "project-one", title: "Notes" },
        ]);
        expect(await recovered.checkAccess(OWNER, "project-one")).to.equal(true);
    });

    it("treats missing projects as not_found and never grants access implicitly", async () => {
        const dbPath = scratchDbPath();
        const provider = openProvider(dbPath);
        expect(await provider.findAccessibleIds(OWNER)).to.deep.equal([]);

        await expectDirectoryError(provider.getDescriptor(OWNER, "project-missing"), "not_found");
        await expectDirectoryError(provider.resolveTitle(OWNER, "Missing"), "not_found");
        await expectDirectoryError(provider.rename(OWNER, "project-missing", "Missing"), "not_found");
        expect(await provider.checkAccess(OWNER, "project-missing")).to.equal(false);
    });
});
