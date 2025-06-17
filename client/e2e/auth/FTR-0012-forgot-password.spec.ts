import { test, expect } from '@playwright/test';

test.describe('FTR-0012: Forgot Password Flow', () => {
  test('should display success or error message after submitting email', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      console.log(`BROWSER CONSOLE: ${text}`); // Log all browser console messages
      consoleLogs.push(text);
    });
    page.on('pageerror', (err) => {
      console.error(`BROWSER PAGE ERROR: ${err.message}`);
    });

    await page.goto('/auth/forgot');
    console.log('Navigated to /auth/forgot');

    // Verify initial elements are present
    await expect(page.locator('h1')).toHaveText('Forgot Password');
    const emailInput = page.locator('input[type="email"]#email-input'); // More specific selector
    await expect(emailInput).toBeVisible();
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();

    console.log('Initial page elements are visible.');

    await emailInput.fill('test@example.com');
    console.log('Filled email with test@example.com');
    await submitButton.click();
    console.log('Clicked submit button.');

    // Wait for either a success message or an error message to appear
    const successMessageLocator = page.locator('#success-message');
    const errorMessageLocator = page.locator('#error-message');

    console.log('Waiting for success or error message...');
    await expect(
      successMessageLocator.or(errorMessageLocator)
    ).toBeVisible({ timeout: 10000 }); // Wait up to 10 seconds

    const successVisible = await successMessageLocator.isVisible();
    const errorVisible = await errorMessageLocator.isVisible();

    if (successVisible) {
      const successText = await successMessageLocator.textContent();
      console.log('Success message visible:', successText);
      await expect(successMessageLocator).toHaveText(/If an account with this email exists|password reset link has been sent/i);
    } else if (errorVisible) {
      const errorText = await errorMessageLocator.textContent();
      console.warn('Error message visible:', errorText);
      // This is still a test failure, but we log the error for diagnosis.
      // The test will fail here if only an error is shown, which is what we want to see.
      expect(errorText, `Firebase call failed with: ${errorText}`).toBeNull(); // Force failure to see error
    } else {
      // Neither message appeared, take a screenshot and fail
      // await page.screenshot({ path: 'test-results/forgot-password-no-message-debug.png', fullPage: true });
      console.error('Neither success nor error message was visible after submission.');
      throw new Error('Neither success nor error message was visible after submission.');
    }
    console.log('Test completed.');
  });
});
