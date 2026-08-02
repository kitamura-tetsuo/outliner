const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    // We will just do a quick unit test check or see if there's any file that checks this
    await browser.close();
})();
