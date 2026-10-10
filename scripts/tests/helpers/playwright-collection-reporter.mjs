import fs from "node:fs";
import path from "node:path";

// This reporter describes collection only. It never claims a browser was launched.
export default class PlaywrightCollectionReporter {
    onError(error) {
        console.error(error.stack ?? error.message ?? String(error));
    }

    onBegin(config, suite) {
        const e2eDir = process.env.PLAYWRIGHT_COLLECTION_E2E_DIR ?? config.rootDir;
        const reportPath = process.env.PLAYWRIGHT_COLLECTION_OUTPUT;
        if (!e2eDir || !reportPath) throw new Error("Collection reporter output and E2E directory are required");
        const projects = config.projects.map(project => ({
            name: project.name,
            browser: project.use.browserName ?? project.use.defaultBrowserType ?? "chromium",
        }));
        const cases = suite.allTests().map(test => {
            const project = test.parent.project();
            return {
                file: path.relative(e2eDir, test.location.file).split(path.sep).join("/"),
                titles: test.titlePath().slice(3),
                line: test.location.line,
                project: project.name,
                browser: project.use.browserName ?? project.use.defaultBrowserType ?? "chromium",
            };
        });
        fs.writeFileSync(reportPath, JSON.stringify({ projects, cases }));
    }
}
