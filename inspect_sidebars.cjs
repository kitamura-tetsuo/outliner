const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo/Welcome');
  await page.waitForTimeout(3000);

  console.log("=== Left Sidebar Text ===");
  const leftSidebarText = await page.evaluate(() => {
    const sidebar = document.querySelector('aside.sidebar');
    return sidebar ? sidebar.innerText : 'No aside.sidebar found';
  });
  console.log(leftSidebarText);

  console.log("\n=== Checking for Right/Databases Sidebar ===");
  // Let's click the databases button
  const dbBtn = await page.$('.databases-btn');
  if (dbBtn) {
    await dbBtn.click();
    await page.waitForTimeout(1000);
    const dbSidebarText = await page.evaluate(() => {
      const dbSidebar = document.querySelector('.databases-sidebar, .right-sidebar') || document.body;
      return dbSidebar.innerText.includes('TABLES') ? 'Tables sidebar found' : 'Not found easily, dumping right side items';
    });
    console.log(dbSidebarText);
  } else {
    console.log("No databases button found");
  }

  await browser.close();
})();
