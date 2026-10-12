const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'load', timeout: 30000 });

        // Wait a bit
        await page.waitForTimeout(5000);

        const html = await page.content();
        fs.writeFileSync('demo_html_load.txt', html);

        // Check for sidebar elements directly
        const sidebar = await page.$('aside, .sidebar, .main-sidebar, [role="navigation"]');
        if (sidebar) {
             const sidebarHtml = await sidebar.innerHTML();
             const sidebarText = await sidebar.innerText();
             fs.writeFileSync('sidebar_html.txt', sidebarHtml);
             fs.writeFileSync('sidebar_text.txt', sidebarText);
             console.log("Successfully extracted sidebar content.");
        } else {
             console.log("Sidebar not found.");
        }
    } catch (e) {
        console.error("Error:", e);
    } finally {
        await browser.close();
    }
})();
