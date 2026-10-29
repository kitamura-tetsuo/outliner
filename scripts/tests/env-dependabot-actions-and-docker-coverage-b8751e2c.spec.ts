import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";
import { parse } from "yaml";

/** @feature ENV-b8751e2c
 *  Title   : Dependabot covers GitHub Actions and maintained Dockerfiles
 *  Source  : docs/dev-features/env-dependabot-actions-and-docker-coverage-b8751e2c.yaml
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const configPath = path.join(repoRoot, ".github", "dependabot.yml");

type Update = {
    "package-ecosystem"?: string;
    directory?: string;
    directories?: string[];
    "exclude-paths"?: string[];
};

type DependabotConfig = {
    version?: number;
    updates?: Update[];
};

const dockerfiles = [
    "Dockerfile.onprem",
    ".devcontainer/Dockerfile",
    ".devcontainer/Dockerfile.override",
    ".github/container/Dockerfile",
    "firebase/Dockerfile",
    "server/Dockerfile",
    "server/Dockerfile.debug",
    "scripts/poc/windows-linux-backend/Dockerfile.runtime",
] as const;

function configuredDirectories(update: Update): string[] {
    return update.directories ?? (update.directory === undefined ? [] : [update.directory]);
}

function dependabotDirectory(file: string): string {
    const directory = path.posix.dirname(`/${file}`);
    return directory === "." ? "/" : directory;
}

function excludesDockerfile(update: Update, file: string): boolean {
    const repositoryPath = file.replace(/^\//, "");
    const directoryPath = dependabotDirectory(repositoryPath);
    const relativePath = path.posix.relative(directoryPath, `/${repositoryPath}`);

    return (update["exclude-paths"] ?? []).some(pattern => {
        const repositoryPattern = pattern.replace(/^\//, "");
        return path.matchesGlob(repositoryPath, repositoryPattern) || path.matchesGlob(relativePath, repositoryPattern);
    });
}

function uncoveredDockerfiles(config: DependabotConfig): string[] {
    const dockerUpdates = (config.updates ?? []).filter(update => update["package-ecosystem"] === "docker");

    // Dependabot's Docker fetcher scans only configured directories and accepts
    // every case-insensitive filename containing "dockerfile". A root entry is
    // intentionally not treated as recursive coverage for nested files.
    return dockerfiles.filter(file => {
        const name = path.posix.basename(file);
        const directory = dependabotDirectory(file);
        const hasUnexcludedDirectory = dockerUpdates.some(update =>
            configuredDirectories(update).includes(directory) && !excludesDockerfile(update, file)
        );
        return !name.toLowerCase().includes("dockerfile") || !hasUnexcludedDirectory;
    });
}

const config = parse(fs.readFileSync(configPath, "utf8")) as DependabotConfig;

test("the v2 config covers Actions and every maintained Dockerfile", () => {
    expect(config.version).toBe(2);

    const actions = (config.updates ?? []).filter(update => update["package-ecosystem"] === "github-actions");
    expect(actions.some(update => configuredDirectories(update).includes("/"))).toBe(true);

    for (const file of dockerfiles) {
        expect(fs.existsSync(path.join(repoRoot, file)), `${file} must remain in the maintained inventory`).toBe(true);
    }
    expect(uncoveredDockerfiles(config)).toEqual([]);
});

test.each(dockerfiles)("missing coverage for %s fails validation", file => {
    const directory = dependabotDirectory(file);
    const fixture = structuredClone(config);

    for (const update of fixture.updates ?? []) {
        if (update["package-ecosystem"] !== "docker") continue;
        if (update.directories) update.directories = update.directories.filter(candidate => candidate !== directory);
        if (update.directory === directory) delete update.directory;
    }

    expect(uncoveredDockerfiles(fixture)).toContain(file);
});

test("root-only Docker configuration does not cover nested Dockerfiles", () => {
    const fixture: DependabotConfig = {
        version: 2,
        updates: [{ "package-ecosystem": "docker", directory: "/" }],
    };

    expect(uncoveredDockerfiles(fixture)).toEqual(dockerfiles.filter(file => dependabotDirectory(file) !== "/"));
});

test.each([
    "server/Dockerfile.debug",
    "server/*.debug",
    "Dockerfile.debug",
])("an exclude-paths pattern %s removes the required debug Dockerfile from coverage", pattern => {
    const fixture = structuredClone(config);
    const docker = (fixture.updates ?? []).find(update => update["package-ecosystem"] === "docker");
    expect(docker).toBeDefined();

    docker!["exclude-paths"] = [pattern];

    expect(uncoveredDockerfiles(fixture)).toContain("server/Dockerfile.debug");
});
