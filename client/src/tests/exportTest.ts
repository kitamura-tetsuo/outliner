import { Project } from "../schema/app-schema";
import { exportProjectToMarkdown, exportProjectToOpml } from "../services/importExportService";

// Create a test project with items
const project = Project.createInstance("Test Project");

// Add a page with items
const page = project.addPage("Test Page", "tester");
const items = page.items;
const item = items.addNode("tester");
item.updateText("Child item");

// Test export functions
const markdown = exportProjectToMarkdown(project);
const opml = exportProjectToOpml(project);

console.log("Markdown export:");
console.log(markdown);
console.log("\nOPML export:");
console.log(opml);
