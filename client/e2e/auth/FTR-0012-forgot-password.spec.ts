/** @feature FTR-0012 */
import { test, expect } from '@playwright/test';

test.describe('FTR-0012 - Forgot Password UI Flow', () => {
    const forgotPasswordRoute = '/auth/forgot';
    const resetPasswordRoute = '/auth/reset-password';

    test('Forgot Password Page - UI and Submission', async ({ page }) => {
        // Set up console logging for debugging
        const consoleLogs: string[] = [];
        page.on('console', msg => {
            const text = msg.text();
            console.log(`BROWSER CONSOLE: ${text}`);
            consoleLogs.push(text);
        });
        page.on('pageerror', (err) => {
            console.error(`BROWSER PAGE ERROR: ${err.message}`);
        });

        await page.goto(forgotPasswordRoute);
        console.log('Navigated to /auth/forgot');

        // Verify page title/heading
        await expect(page.locator('h1')).toHaveText('Forgot Password');

        // Verify email input field is visible
        const emailInput = page.locator('input[type="email"]#email-input');
        await expect(emailInput).toBeVisible();

        // Verify submit button is visible
        const submitButton = page.locator('button[type="submit"]');
        await expect(submitButton).toBeVisible();

        console.log('Initial page elements are visible.');

        // Enter a test email
        await emailInput.fill('test@example.com');
        console.log('Filled email with test@example.com');

        // Click the submit button
        await submitButton.click();
        console.log('Clicked submit button.');

        // Wait for either a success message or an error message to appear
        const successMessageLocator = page.locator('#success-message');
        const errorMessageLocator = page.locator('#error-message');

        console.log('Waiting for success or error message...');
        await expect(
            successMessageLocator.or(errorMessageLocator)
        ).toBeVisible({ timeout: 10000 });

        const successVisible = await successMessageLocator.isVisible();
        const errorVisible = await errorMessageLocator.isVisible();

        if (successVisible) {
            const successText = await successMessageLocator.textContent();
            console.log('Success message visible:', successText);
            await expect(successMessageLocator).toHaveText(/If an account with this email exists|password reset link has been sent/i);
        } else if (errorVisible) {
            const errorText = await errorMessageLocator.textContent();
            console.warn('Error message visible:', errorText);
            expect(errorText, `Firebase call failed with: ${errorText}`).toBeNull();
        } else {
            console.error('Neither success nor error message was visible after submission.');
            throw new Error('Neither success nor error message was visible after submission.');
        }
        console.log('Test completed.');
    });

    test('Reset Password Page - UI and Submission', async ({ page }) => {
        // Simulate user landing on the reset password page with a token
        await page.goto(`${resetPasswordRoute}?oobCode=testtoken123`);

        // Add basic UI verification for reset password page
        // This test can be expanded based on the actual reset password implementation
        await expect(page.locator('h1')).toBeVisible();
    });
});
