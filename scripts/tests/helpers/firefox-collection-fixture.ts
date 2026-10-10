import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

export function createCollectionFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "firefox-collection-fixture-"));
    const client = path.join(root, "client");
    fs.mkdirSync(client);
    fs.symlinkSync(path.join(ROOT, "client/node_modules"), path.join(client, "node_modules"), "dir");
    fs.mkdirSync(path.join(client, "e2e"));
    // Playwright resolves configured reporters before applying the CLI override.
    fs.symlinkSync(path.join(ROOT, "client/e2e/reporters"), path.join(client, "e2e/reporters"), "dir");
    fs.writeFileSync(path.join(client, "package.json"), '{"type":"module"}');
    // Copy the real configuration, including its shared project definitions.
    for (const file of fs.readdirSync(path.join(ROOT, "client"))) {
        if (/^playwright.*\.(?:ts|json)$/.test(file)) {
            fs.copyFileSync(path.join(ROOT, "client", file), path.join(client, file));
        }
    }
    const workflow = path.join(root, "firefox-selection-diagnostic.yml");
    fs.copyFileSync(path.join(ROOT, ".github/workflows/firefox-selection-diagnostic.yml"), workflow);
    const ordinaryWorkflow = path.join(root, "ci-test-e2e.yml");
    fs.copyFileSync(path.join(ROOT, ".github/workflows/ci-test-e2e.yml"), ordinaryWorkflow);
    const addSpec = (relative: string, titles = ["first probe"]) => {
        const file = path.join(client, "e2e", relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(
            file,
            'import { test } from "@playwright/test";\n'
                + titles.map(title => `test(${JSON.stringify(title)}, async () => {});`).join("\n"),
        );
    };
    addSpec("core/slr-alpha-78ad2b91.spec.ts", ["first probe", "second probe"]);
    addSpec("core/slr-zeta-78ad2b91.spec.ts");
    addSpec("new/slr-new-78ad2b91.spec.ts");
    addSpec("basic/reproduce_issue_1512.spec.ts");
    addSpec("basic/ordinary-78ad2b91.spec.ts");
    return {
        root,
        client,
        workflow,
        ordinaryWorkflow,
        addSpec,
        mutateProjects(expression: string) {
            fs.renameSync(
                path.join(client, "playwright.config.ts"),
                path.join(client, "playwright-production.config.ts"),
            );
            fs.writeFileSync(
                path.join(client, "playwright.config.ts"),
                'import original from "./playwright-production.config";\n'
                    + `export default { ...original, projects: original.projects.flatMap(project => (${expression})) };\n`,
            );
        },
        removeDiagnosticProject(project: string) {
            const document = parse(fs.readFileSync(workflow, "utf8"));
            document.jobs["firefox-selection"].strategy.matrix.project = document.jobs["firefox-selection"].strategy
                .matrix.project
                .filter(
                    (value: string) => value !== project,
                );
            fs.writeFileSync(workflow, stringify(document));
        },
        dispose() {
            fs.rmSync(root, { recursive: true, force: true });
        },
    };
}
