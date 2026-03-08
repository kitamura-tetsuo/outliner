import { defineConfig } from "vitepress";

export default defineConfig({
    base: "/outliner/",
    title: "Outliner Docs",
    ignoreDeadLinks: true,
    themeConfig: {
        sidebar: [
            {
                text: "User Manual",
                items: [
                    { text: "Outliner マニュアル", link: "/user-manual/index" },
                ],
            },
            {
                text: "Architecture",
                items: [
                    { text: "State Management", link: "/state_management" },
                    { text: "Fluid to Yjs", link: "/fluid_to_yjs" },
                    { text: "Yjs Snapshot Comparison", link: "/yjs-snapshot-comparison" },
                    { text: "Non Goals", link: "/NON_GOALS" },
                ],
            },
            {
                text: "Guides",
                items: [
                    { text: "Production Setup", link: "/PRODUCTION_SETUP" },
                    { text: "GitHub Actions Setup", link: "/github-actions-setup" },
                    { text: "Production Data Deletion", link: "/PRODUCTION_DATA_DELETION" },
                    { text: "MCP Playwright", link: "/mcp-playwright" },
                    { text: "Polling Analysis Report", link: "/polling-analysis-report" },
                ],
            },
        ],
    },
});
