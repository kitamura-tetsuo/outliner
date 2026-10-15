import { ESLint } from "eslint";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const productionNavigationFiles = [
    "src/components/SearchBox.svelte",
    "src/components/yjstable/YjsTableBlock.svelte",
    "src/routes/[project]/+layout.svelte",
    "src/routes/[project]/[page]/+page.svelte",
    "src/routes/[demoProject=demoProject]/[page]/+page.svelte",
    "src/routes/share/[token]/+page.svelte",
];

async function sourceFiles(directory: string): Promise<string[]> {
    const files: string[] = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...await sourceFiles(path));
        else if ([".js", ".svelte", ".ts"].includes(extname(entry.name))) files.push(path);
    }
    return files;
}

function navigationMessages(messages: { ruleId: string | null; severity: number; }[]) {
    return messages.filter(message => message.ruleId === "svelte/no-navigation-without-resolve");
}

const blanketNavigationSuppression = /eslint-disable(?!-next-line)\b[^\n]*\bsvelte\/no-navigation-without-resolve\b/;

function blanketSuppressionFiles(sources: ReadonlyMap<string, string>): string[] {
    return [...sources]
        .filter(([, source]) => blanketNavigationSuppression.test(source))
        .map(([file]) => file)
        .sort();
}

describe("typed-navigation ESLint enforcement", () => {
    it("enables the official navigation rule globally in the production configuration", async () => {
        const eslint = new ESLint({ cwd: process.cwd() });

        for (const file of productionNavigationFiles) {
            const config = await eslint.calculateConfigForFile(file);
            expect(config?.rules?.["svelte/no-navigation-without-resolve"], file).toEqual([2]);
        }
    });

    it("rejects every unresolved internal navigation category and accepts resolved equivalents", async () => {
        const eslint = new ESLint({ cwd: process.cwd() });
        const unresolved = `<script>import { goto, pushState, replaceState } from "$app/navigation";</script>
<a href="/unresolved">bad</a>
<button onclick={() => goto("/unresolved")}>goto</button>
<button onclick={() => pushState("/unresolved", {})}>push</button>
<button onclick={() => replaceState("/unresolved", {})}>replace</button>`;
        const resolved =
            `<script>import { goto, pushState, replaceState } from "$app/navigation"; import { resolve } from "$app/paths"; const target = resolve("/");</script>
<a href={target}>good</a>
<a href="https://cdn.example.test/file">resource</a>
<button onclick={() => goto(target)}>goto</button>
<button onclick={() => pushState(target, {})}>push</button>
<button onclick={() => replaceState(target, {})}>replace</button>`;

        const [unresolvedResult] = await eslint.lintText(unresolved, { filePath: "src/routes/settings/+page.svelte" });
        expect(navigationMessages(unresolvedResult.messages).map(message => message.severity)).toEqual([2, 2, 2, 2]);

        const [resolvedResult] = await eslint.lintText(resolved, { filePath: "src/routes/settings/+page.svelte" });
        expect(navigationMessages(resolvedResult.messages)).toEqual([]);
    }, 60_000);

    it("accepts resolved shared props and rejects the same props widened to string", async () => {
        const eslint = new ESLint({ cwd: process.cwd() });

        for (const file of ["src/components/Breadcrumb.svelte", "src/components/PageListItem.svelte"]) {
            const source = await readFile(file, "utf8");
            const [resolvedResult] = await eslint.lintText(source, { filePath: file });
            expect(navigationMessages(resolvedResult.messages), file).toEqual([]);

            const unresolvedSource = source.replaceAll("ResolvedPathname", "string");
            const [unresolvedResult] = await eslint.lintText(unresolvedSource, { filePath: file });
            expect(navigationMessages(unresolvedResult.messages).some(message => message.severity === 2), file).toBe(
                true,
            );
        }
    });

    it("prevents wrapper reintroduction and blanket navigation-rule suppression", async () => {
        const root = process.cwd();
        const files = await sourceFiles(join(root, "src"));
        const offenders: string[] = [];
        for (const file of files) {
            if (file.endsWith("navigationLintConfig.test.ts")) continue;
            const source = await readFile(file, "utf8");
            if (/\bresolvePath\b/.test(source)) offenders.push(relative(root, file));
        }
        expect(offenders).toEqual([]);

        const config = await readFile(join(root, "eslint.config.js"), "utf8");
        expect(config).not.toMatch(/"svelte\/no-navigation-without-resolve"\s*:\s*"off"/);
        expect(config).not.toMatch(/no-navigation-without-resolve[^\n]*ignore(?:Goto|Links|PushState|ReplaceState)/);
        const exceptions: string[] = [];
        const productionSources = new Map<string, string>();
        for (const file of files) {
            if (file.endsWith("navigationLintConfig.test.ts")) continue;
            const source = await readFile(file, "utf8");
            const relativeFile = relative(root, file);
            productionSources.set(relativeFile, source);
            if (source.includes("eslint-disable-next-line svelte/no-navigation-without-resolve")) {
                exceptions.push(relativeFile);
            }
        }
        expect(blanketSuppressionFiles(productionSources)).toEqual([]);

        const sidebarFile = "src/components/Sidebar.svelte";
        const sidebarWithBlanketDisable = `${productionSources.get(sidebarFile)}
<script>/* eslint-disable svelte/no-navigation-without-resolve */</script>
<a href="/unresolved">unresolved</a>`;
        const counterexampleSources = new Map(productionSources).set(sidebarFile, sidebarWithBlanketDisable);
        expect(blanketSuppressionFiles(counterexampleSources)).toEqual([sidebarFile]);
        expect(exceptions.sort()).toEqual([
            "src/components/OutlinerItemAttachments.svelte",
            "src/lib/debug.ts",
            "src/routes/paraglide/+page.svelte",
        ]);
    });
});
