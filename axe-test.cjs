const { chromium } = require('playwright');
const axe = require('axe-core');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const axeSource = require('fs').readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  await page.evaluate(axeSource);

  const results = await page.evaluate(async () => {
    return await axe.run();
  });

  console.log(`Found ${results.violations.length} accessibility violations.`);
  for (const violation of results.violations) {
    console.log(`- [${violation.impact}] ${violation.id}: ${violation.description}`);
    console.log(`  Nodes: ${violation.nodes.length}`);
  }

  await browser.close();
})();
