/** @feature FFI-0001
 *  Title   : Fluid Framework integration
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from '@playwright/test';
import { TestHelpers } from '../utils/testHelpers';

test.describe('FFI-0001: real-time sync between clients', () => {
  test('editing on one client syncs to another', async ({ page, browser }, testInfo) => {
    const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(page, testInfo);
    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();
    await TestHelpers.prepareTestEnvironment(secondPage, testInfo);
    await secondPage.goto(`/${projectName}/${pageName}`);

    await page.fill('.global-textarea', 'hello');
    await page.keyboard.press('Enter');

    await secondPage.waitForSelector('text=hello', { timeout: 10000 });
    const count = await secondPage.locator('text=hello').count();
    expect(count).toBeGreaterThan(0);

    await secondContext.close();
  });
});
