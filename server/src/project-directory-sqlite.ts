import Database from "better-sqlite3";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import type { ProjectDirectoryProvider } from "./project-directory-provider.js";
import { normalizeProjectTitle, type ProjectDescriptor, ProjectDirectoryError } from "./project-directory.js";

/**
 * Stable owner for the single-owner local deployment. Authentication supplies
 * this identity elsewhere; this storage component accepts the already
 * established uid and never authenticates passwords or invents sessions.
 */
export const LOCAL_OWNER_UID = "local-user";

/** Local project IDs share the project-room grammar (`room-validator.ts`). */
const LOCAL_PROJECT_ID = /^[A-Za-z0-9_-]{1,128}$/;

const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS projects (
  projectId TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  normalizedTitle TEXT NOT NULL UNIQUE,
  ownerUid TEXT NOT NULL
)`;

const EXPECTED_COLUMNS = ["projectId", "title", "normalizedTitle", "ownerUid"] as const;

interface ProjectRow {
    projectId: string;
    title: string;
    normalizedTitle: string;
    ownerUid: string;
}

/** SQLite-backed producer for the project-directory/access boundary. */
export interface LocalSqliteProjectDirectoryProvider extends ProjectDirectoryProvider {
    readonly kind: "local-sqlite";
    readonly dbPath: string;
    close(): void;
}

function storageUnavailable(dbPath: string, detail: unknown): ProjectDirectoryError {
    const sqliteCode = detail instanceof Error && "code" in detail
        ? String((detail as { code?: unknown; }).code ?? "unknown")
        : "unknown";
    return new ProjectDirectoryError(
        "storage_unavailable",
        "Local project directory storage is unavailable",
        { dbPath, sqliteCode },
    );
}

function validateLocalProjectId(value: unknown): string {
    if (typeof value !== "string" || !LOCAL_PROJECT_ID.test(value)) {
        throw new ProjectDirectoryError("not_found", "Project not found");
    }
    return value;
}

function isUniqueViolation(error: unknown): boolean {
    return error instanceof Error && "code" in error
        && (error as { code?: unknown; }).code === "SQLITE_CONSTRAINT_UNIQUE";
}

/**
 * Create a SQLite-backed project directory rooted at an explicitly supplied
 * local database path. Uses no Firebase SDK initialization, Firestore,
 * emulator, credential or network service. Constructing this provider never
 * touches the default Firestore-backed cloud provider or cloud data.
 */
export function createLocalSqliteProjectDirectoryProvider(
    dbPath: string,
): LocalSqliteProjectDirectoryProvider {
    return new LocalSqliteProjectDirectory(dbPath);
}

class LocalSqliteProjectDirectory implements LocalSqliteProjectDirectoryProvider {
    readonly kind = "local-sqlite" as const;
    readonly dbPath: string;
    private db:
        | InstanceType<typeof Database>
        | undefined;
    private unavailable = false;

    constructor(dbPath: string) {
        this.dbPath = dbPath;
        try {
            this.db = this.openDatabase(dbPath);
        } catch {
            this.db = undefined;
            this.unavailable = true;
        }
    }

    close(): void {
        try {
            this.db?.close();
        } catch {
            // Closing an already-broken handle must not mask the stored state.
        } finally {
            this.db = undefined;
        }
    }

    async getDescriptor(uid: string, projectId: string): Promise<ProjectDescriptor> {
        this.requireOwner(uid);
        const id = validateLocalProjectId(projectId);
        const row = this.readRow(id);
        if (!row) {
            throw new ProjectDirectoryError("not_found", "Project not found");
        }
        if (row.ownerUid !== uid) {
            throw new ProjectDirectoryError("forbidden", "Project is inaccessible");
        }
        // Stored titles are canonical, but an individual read stays strict so
        // a hand-edited row can never serve an unusable title as canonical.
        return { projectId: id, title: normalizeProjectTitle(row.title) };
    }

    async listDescriptors(
        uid: string,
        onQuarantinedDescriptor?: (error: ProjectDirectoryError) => void,
    ): Promise<ProjectDescriptor[]> {
        this.requireOwner(uid);
        const db = this.requireDb();
        let rows: ProjectRow[];
        try {
            rows = db.prepare("SELECT projectId, title, normalizedTitle, ownerUid FROM projects WHERE ownerUid = ?")
                .all(uid) as ProjectRow[];
        } catch (error) {
            throw storageUnavailable(this.dbPath, error);
        }
        return rows
            .flatMap(row => {
                try {
                    return [{ projectId: row.projectId, title: normalizeProjectTitle(row.title) }];
                } catch (error) {
                    if (error instanceof ProjectDirectoryError && error.code === "invalid_title") {
                        onQuarantinedDescriptor?.(error);
                        return [];
                    }
                    throw error;
                }
            })
            .sort((left, right) =>
                left.title.localeCompare(right.title) || left.projectId.localeCompare(right.projectId)
            );
    }

    async resolveTitle(uid: string, requestedTitle: unknown): Promise<ProjectDescriptor> {
        this.requireOwner(uid);
        const title = normalizeProjectTitle(requestedTitle);
        const matches = this.findByNormalizedTitle(title).filter(row => row.ownerUid === uid);
        if (matches.length === 0) {
            throw new ProjectDirectoryError("not_found", "Accessible project not found");
        }
        if (matches.length > 1) {
            throw new ProjectDirectoryError("ambiguous_title", "Project title is ambiguous");
        }
        return { projectId: matches[0]!.projectId, title: normalizeProjectTitle(matches[0]!.title) };
    }

    async ensureDescriptor(
        uid: string,
        projectId: string,
        requestedTitle: unknown,
    ): Promise<ProjectDescriptor> {
        this.requireOwner(uid);
        const id = validateLocalProjectId(projectId);
        const title = normalizeProjectTitle(requestedTitle);
        try {
            return this.runWrite(() => {
                const existing = this.readRowInWrite(id);
                if (!existing) {
                    if (this.findRowInWrite(title)) {
                        throw new ProjectDirectoryError("duplicate_title", "Project title is already in use");
                    }
                    this.requireDb().prepare(
                        "INSERT INTO projects (projectId, title, normalizedTitle, ownerUid) VALUES (?, ?, ?, ?)",
                    ).run(id, title, title, uid);
                    return { projectId: id, title };
                }
                if (existing.ownerUid !== uid) {
                    throw new ProjectDirectoryError("forbidden", "Project is inaccessible");
                }
                if (existing.title !== title) {
                    throw new ProjectDirectoryError(
                        "title_conflict",
                        "Requested project title does not match the canonical project title",
                    );
                }
                if (this.findRowExcludingInWrite(title, id)) {
                    throw new ProjectDirectoryError("duplicate_title", "Project title is already in use");
                }
                return { projectId: id, title: existing.title };
            });
        } catch (error) {
            if (error instanceof ProjectDirectoryError) throw error;
            if (isUniqueViolation(error)) {
                throw new ProjectDirectoryError("duplicate_title", "Project title is already in use");
            }
            throw storageUnavailable(this.dbPath, error);
        }
    }

    async rename(uid: string, projectId: string, requestedTitle: unknown): Promise<ProjectDescriptor> {
        this.requireOwner(uid);
        const id = validateLocalProjectId(projectId);
        const title = normalizeProjectTitle(requestedTitle);
        try {
            return this.runWrite(() => {
                const existing = this.readRowInWrite(id);
                if (!existing) {
                    throw new ProjectDirectoryError("not_found", "Project not found");
                }
                if (existing.ownerUid !== uid) {
                    throw new ProjectDirectoryError("forbidden", "Project is inaccessible");
                }
                if (existing.normalizedTitle === title) {
                    return { projectId: id, title: existing.title };
                }
                if (this.findRowExcludingInWrite(title, id)) {
                    throw new ProjectDirectoryError("duplicate_title", "Project title is already in use");
                }
                this.requireDb().prepare(
                    "UPDATE projects SET title = ?, normalizedTitle = ? WHERE projectId = ?",
                ).run(title, title, id);
                return { projectId: id, title };
            });
        } catch (error) {
            if (error instanceof ProjectDirectoryError) throw error;
            if (isUniqueViolation(error)) {
                throw new ProjectDirectoryError("duplicate_title", "Project title is already in use");
            }
            throw storageUnavailable(this.dbPath, error);
        }
    }

    async checkAccess(uid: string, projectId: string): Promise<boolean> {
        if (uid !== LOCAL_OWNER_UID) return false;
        let id: string;
        try {
            id = validateLocalProjectId(projectId);
        } catch {
            return false;
        }
        const row = this.readRow(id);
        return !!row && row.ownerUid === uid;
    }

    async findAccessibleIds(uid: string): Promise<string[]> {
        if (uid !== LOCAL_OWNER_UID) return [];
        const db = this.requireDb();
        try {
            const rows = db.prepare("SELECT projectId FROM projects WHERE ownerUid = ?")
                .all(uid) as Pick<ProjectRow, "projectId">[];
            return rows.map(row => row.projectId);
        } catch (error) {
            throw storageUnavailable(this.dbPath, error);
        }
    }

    private requireOwner(uid: string): void {
        if (uid !== LOCAL_OWNER_UID) {
            throw new ProjectDirectoryError("forbidden", "Project is inaccessible");
        }
    }

    private requireDb(): InstanceType<typeof Database> {
        if (this.unavailable || !this.db) {
            throw storageUnavailable(this.dbPath, "unavailable");
        }
        return this.db;
    }

    private readRow(projectId: string): ProjectRow | undefined {
        const db = this.requireDb();
        try {
            return db.prepare("SELECT projectId, title, normalizedTitle, ownerUid FROM projects WHERE projectId = ?")
                .get(projectId) as ProjectRow | undefined;
        } catch (error) {
            throw storageUnavailable(this.dbPath, error);
        }
    }

    private findByNormalizedTitle(title: string): ProjectRow[] {
        const db = this.requireDb();
        try {
            return db.prepare(
                "SELECT projectId, title, normalizedTitle, ownerUid FROM projects WHERE normalizedTitle = ?",
            )
                .all(title) as ProjectRow[];
        } catch (error) {
            throw storageUnavailable(this.dbPath, error);
        }
    }

    /** Immediate write lock so overlapping writers contend instead of interleaving. */
    private runWrite<T>(fn: () => T): T {
        const db = this.requireDb();
        try {
            db.exec("BEGIN IMMEDIATE");
        } catch (error) {
            throw storageUnavailable(this.dbPath, error);
        }
        try {
            const result = fn();
            try {
                db.exec("COMMIT");
            } catch (error) {
                throw storageUnavailable(this.dbPath, error);
            }
            return result;
        } catch (error) {
            try {
                db.exec("ROLLBACK");
            } catch {
                // The transaction already ended (busy/readonly failure); the
                // original error below still describes the outcome.
            }
            throw error;
        }
    }

    private readRowInWrite(projectId: string): ProjectRow | undefined {
        return this.requireDb().prepare(
            "SELECT projectId, title, normalizedTitle, ownerUid FROM projects WHERE projectId = ?",
        ).get(projectId) as ProjectRow | undefined;
    }

    private findRowInWrite(title: string): ProjectRow | undefined {
        return this.requireDb().prepare(
            "SELECT projectId, title, normalizedTitle, ownerUid FROM projects WHERE normalizedTitle = ?",
        ).get(title) as ProjectRow | undefined;
    }

    private findRowExcludingInWrite(title: string, projectId: string): ProjectRow | undefined {
        return this.requireDb().prepare(
            "SELECT projectId, title, normalizedTitle, ownerUid FROM projects WHERE normalizedTitle = ? AND projectId != ?",
        ).get(title, projectId) as ProjectRow | undefined;
    }

    /**
     * Open the configured file without touching any other store. Schema is
     * created only for a genuinely new database; an existing unreadable,
     * corrupt or unsupported-schema file marks this provider unavailable and
     * is never deleted, replaced or reset.
     */
    private openDatabase(dbPath: string): InstanceType<typeof Database> {
        if (typeof dbPath !== "string" || dbPath.trim() === "") {
            throw new Error("Local project directory database path must be a non-empty string");
        }
        mkdirSync(dirname(dbPath), { recursive: true });
        const fresh = !existsSync(dbPath) || statSync(dbPath).size === 0;
        const db = new Database(dbPath);
        // Contended writers must refuse immediately with storage_unavailable
        // rather than stall behind another connection's write transaction.
        db.pragma("busy_timeout = 0");
        try {
            if (fresh) {
                db.exec(SCHEMA_SQL);
                return db;
            }
            if (!this.hasSupportedSchema(db)) {
                throw new Error("Unsupported local project directory schema");
            }
            return db;
        } catch (error) {
            try {
                db.close();
            } catch {
                // Ignore close failures while reporting the original problem.
            }
            throw error;
        }
    }

    private hasSupportedSchema(db: InstanceType<typeof Database>): boolean {
        try {
            const table = db.prepare(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'",
            ).get() as { name?: string; } | undefined;
            if (!table) return false;
            const columns = db.prepare("PRAGMA table_info(projects)").all() as { name?: unknown; }[];
            const names = new Set(columns.map(column => column.name));
            return EXPECTED_COLUMNS.every(column => names.has(column));
        } catch {
            return false;
        }
    }
}
