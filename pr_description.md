[Issues]
* The `.internal-link` elements within the application had a default line height of 17px. This falls below the WCAG 2.5.8 minimum target size requirement of 24x24 pixels, making them harder to tap for users on touch devices.

[Changes]
* Added `padding: 3.5px 0;` to the `.internal-link` CSS class in `client/src/app.css` to vertically expand their hit area. Because they are inline elements, vertical padding increases the clickable area without altering the line height or disrupting the visual layout.
* (Total vertical height becomes 17px + 3.5px top + 3.5px bottom = 24px).

[Verification Results]
* Wrote and executed a Playwright DOM-evaluation script that confirmed the height of the `.internal-link` elements successfully measures at 24px in the browser.
* Ran `npm run test:unit src/components` locally and all tests passed.
* Ran `npx playwright test e2e/core/mob-tap-targets-wcag-258.spec.ts` locally and it successfully confirmed that interactive UI targets still meet the minimum sizes.
* Generated visual verification artifacts demonstrating the unchanged visual state of the demo Welcome page.
