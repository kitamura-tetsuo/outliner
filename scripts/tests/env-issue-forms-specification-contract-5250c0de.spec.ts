import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vitest";

/** @feature ENV-5250c0de
 *  Title   : Issue Forms expose specification contracts
 *  Source  : docs/dev-features/env-issue-forms-specification-contract-5250c0de.yaml
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const forms = ["bug_report.yml", "feature_request.yml"].map(file => ({
    file,
    content: fs.readFileSync(path.join(repoRoot, ".github/ISSUE_TEMPLATE", file), "utf8"),
}));

describe("GitHub Issue Form specification contracts", () => {
    test.each(forms)("$file defines the contract fields and their semantics", ({ content }) => {
        expect(content).toContain("id: requirements");
        expect(content).toContain("id: acceptance-scenarios");
        expect(content).toContain("id: non-goals");
        expect(content).toContain("id: implementation-notes");
        expect(content).toContain("authoritative, normative, merge-blocking contract");
        expect(content).toContain("REQ-001, REQ-002, etc.");
        expect(content).toContain("externally observable behavior");
        expect(content).toContain("state transitions, persistence behavior, side effects, invariants");
        expect(content).toContain("authorization or synchronization constraints");
        expect(content).toContain("important edge cases, and negative requirements");
        expect(content).toContain("AC-001, AC-002, etc.");
        expect(content).toContain("Given/When/Then");
        expect(content).toContain("negative scenarios");
        expect(content).toContain("scenarios do not create new merge-blocking requirements");
        expect(content).toContain("Requirements from a parent issue are not inherited implicitly");
        expect(content).toContain("Origin: #1234/REQ-007");
        expect(content).toContain("Keep these suggestions separate from the normative behavioral contract");
    });

    test("bug report retains diagnostic fields", () => {
        const bug = forms.find(form => form.file === "bug_report.yml")?.content;

        expect(bug).toContain("id: description");
        expect(bug).toContain("id: steps");
        expect(bug).toContain("id: expected");
        expect(bug).toContain("id: actual");
    });

    test("feature request retains problem and solution fields", () => {
        const feature = forms.find(form => form.file === "feature_request.yml")?.content;

        expect(feature).toContain("id: problem");
        expect(feature).toContain("id: solution");
    });
});
