const { execSync } = require('child_process');

try {
  execSync('npx playwright test --grep "Calendar"', { cwd: 'client', stdio: 'inherit' });
} catch (e) {
  console.log(e.message);
}
