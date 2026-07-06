git restore client/src/routes/+layout.svelte
sed -i '/\/\/ Test-only: normalize drop events so Playwright/,/^\s*}\s*catch\s*{}\s*$/d' client/src/routes/+layout.svelte
