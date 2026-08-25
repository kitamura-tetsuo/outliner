process.env.FIRESTORE_EMULATOR_HOST ||= "localhost:58080";
process.env.FIREBASE_PROJECT_ID ||= "outliner-d57b0";

import { expect } from "chai";
import { type App, deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import {
    ensureProjectDescriptorForWrite,
    getAuthorizedProjectDescriptorForWrite,
    listAccessibleProjectDescriptors,
    normalizeProjectTitle,
    ProjectDirectoryError,
    renameProject,
    resolveAccessibleProjectTitle,
} from "../src/project-directory.js";

describe("canonical project directory", () => {
    const appName = "project-directory-tests";
    let app: App;
    let db: Firestore;
    const projectIds = [
        "directory-create",
        "directory-existing",
        "directory-forbidden",
        "directory-conflict",
        "directory-invalid",
        "directory-second",
        "duplicate-owner",
        "duplicate-candidate",
    ];

    before(() => {
        // Create this only when the suite starts. firebase-init tests run earlier
        // and replace the default app while exercising reinitialization.
        app = getApps().find(candidate => candidate.name === appName)
            ?? initializeApp({ projectId: "outliner-d57b0" }, appName);
        db = getFirestore(app);
    });

    beforeEach(async () => {
        await Promise.all([
            ...projectIds.map(projectId => db.collection("projectUsers").doc(projectId).delete()),
            db.collection("userProjects").doc("owner").delete(),
        ]);
    });

    after(async () => {
        await Promise.all([
            ...projectIds.map(projectId => db.collection("projectUsers").doc(projectId).delete()),
            db.collection("userProjects").doc("owner").delete(),
        ]);
        await deleteApp(app);
    });

    it("normalizes an explicit title and rejects empty or UUID fallback titles", () => {
        expect(normalizeProjectTitle("  Project Alpha  ")).to.equal("Project Alpha");
        expect(() => normalizeProjectTitle("   ")).to.throw(ProjectDirectoryError);
        expect(() => normalizeProjectTitle("4a934322-05de-4c97-932c-bc87fb43e18c"))
            .to.throw("must not be a project ID");
    });

    it("creates one canonical resource-side descriptor for an explicit title", async () => {
        const descriptor = await ensureProjectDescriptorForWrite("owner", "directory-create", "Project Alpha", db);
        expect(descriptor).to.deep.equal({ projectId: "directory-create", title: "Project Alpha" });

        const snapshot = await db.collection("projectUsers").doc("directory-create").get();
        expect(snapshot.data()).to.include({ projectId: "directory-create", title: "Project Alpha" });
        expect(snapshot.data()?.accessibleUserIds).to.deep.equal(["owner"]);
        expect((await db.collection("userProjects").doc("owner").get()).exists).to.equal(false);
    });

    it("rejects duplicate titles when creating a descriptor", async () => {
        await db.collection("projectUsers").doc("duplicate-owner").set({
            projectId: "duplicate-owner",
            title: "Already used",
            accessibleUserIds: ["owner"],
        });

        await expectDirectoryError(
            ensureProjectDescriptorForWrite("owner", "duplicate-candidate", "Already used", db),
            "duplicate_title",
        );
        expect((await db.collection("projectUsers").doc("duplicate-candidate").get()).exists).to.equal(false);
    });

    it("preserves a matching descriptor for an authorized writer", async () => {
        await db.collection("projectUsers").doc("directory-existing").set({
            projectId: "directory-existing",
            title: "Existing Project",
            accessibleUserIds: ["owner"],
        });

        expect(await ensureProjectDescriptorForWrite("owner", "directory-existing", "Existing Project", db))
            .to.deep.equal({ projectId: "directory-existing", title: "Existing Project" });
        expect(await getAuthorizedProjectDescriptorForWrite("owner", "directory-existing", db))
            .to.deep.equal({ projectId: "directory-existing", title: "Existing Project" });
    });

    it("fails closed for an inaccessible existing project", async () => {
        await db.collection("projectUsers").doc("directory-forbidden").set({
            projectId: "directory-forbidden",
            title: "Private Project",
            accessibleUserIds: ["other-user"],
        });

        await expectDirectoryError(
            ensureProjectDescriptorForWrite("owner", "directory-forbidden", "Private Project", db),
            "forbidden",
        );
    });

    it("does not rename an existing project as a seeding side effect", async () => {
        await db.collection("projectUsers").doc("directory-conflict").set({
            projectId: "directory-conflict",
            title: "Canonical Title",
            accessibleUserIds: ["owner"],
        });

        await expectDirectoryError(
            ensureProjectDescriptorForWrite("owner", "directory-conflict", "Different Title", db),
            "title_conflict",
        );
        expect((await db.collection("projectUsers").doc("directory-conflict").get()).data()?.title)
            .to.equal("Canonical Title");
    });

    it("does not persist a partial descriptor when title validation fails", async () => {
        await expectDirectoryError(
            ensureProjectDescriptorForWrite(
                "owner",
                "directory-invalid",
                "4a934322-05de-4c97-932c-bc87fb43e18c",
                db,
            ),
            "invalid_title",
        );
        expect((await db.collection("projectUsers").doc("directory-invalid").get()).exists).to.equal(false);
    });

    it("lists and resolves titles only from resource-side memberships", async () => {
        await Promise.all([
            db.collection("projectUsers").doc("directory-existing").set({
                title: "Alpha",
                accessibleUserIds: ["owner"],
            }),
            db.collection("projectUsers").doc("directory-second").set({
                title: "Beta",
                accessibleUserIds: ["owner", "other-user"],
            }),
            db.collection("userProjects").doc("owner").set({
                accessibleProjectIds: ["forged-project"],
                projectTitles: { "forged-project": "Forged" },
            }),
        ]);

        expect(await listAccessibleProjectDescriptors("owner", db)).to.deep.equal([
            { projectId: "directory-existing", title: "Alpha" },
            { projectId: "directory-second", title: "Beta" },
        ]);
        expect(await resolveAccessibleProjectTitle("owner", "Beta", db)).to.deep.equal({
            projectId: "directory-second",
            title: "Beta",
        });
        await expectDirectoryError(resolveAccessibleProjectTitle("owner", "Forged", db), "not_found");
    });

    it("renames exactly one canonical resource title and rejects duplicates", async () => {
        await Promise.all([
            db.collection("projectUsers").doc("directory-existing").set({
                title: "Before",
                accessibleUserIds: ["owner"],
            }),
            db.collection("projectUsers").doc("directory-second").set({
                title: "Reserved",
                accessibleUserIds: ["other-user"],
            }),
        ]);

        expect(await renameProject("owner", "directory-existing", "After", db)).to.deep.equal({
            projectId: "directory-existing",
            title: "After",
        });
        expect((await db.collection("projectUsers").doc("directory-existing").get()).data()?.title)
            .to.equal("After");
        await expectDirectoryError(renameProject("owner", "directory-existing", "Reserved", db), "duplicate_title");
        expect((await db.collection("projectUsers").doc("directory-existing").get()).data()?.title)
            .to.equal("After");
    });
});

async function expectDirectoryError(promise: Promise<unknown>, code: ProjectDirectoryError["code"]): Promise<void> {
    try {
        await promise;
        expect.fail("expected project directory validation to fail");
    } catch (error) {
        expect(error).to.be.instanceOf(ProjectDirectoryError);
        expect((error as ProjectDirectoryError).code).to.equal(code);
    }
}
