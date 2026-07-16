sed -i 's/page.once("dialog", dialog => dialog.accept());/await page.getByRole("alertdialog").locator("button:has-text(\"Replace All\")").click();/g' client/e2e/new/SRE-001.spec.ts
sed -i 's/page.once("dialog", dialog => dialog.accept());/await page.getByRole("alertdialog").locator("button:has-text(\"Replace All\")").click();/g' client/e2e/new/SRP-0001.spec.ts
sed -i 's/page.once("dialog", (dialog) => dialog.accept());/await page.getByRole("alertdialog").locator("button:has-text(\"Delete\")").click();/g' client/e2e/core/mob-item-row-full-width-text-8d3af5cc.spec.ts
