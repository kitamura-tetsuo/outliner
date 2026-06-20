const fs = require('fs');

const test_files = ["functions/test/security-fix.test.js", "functions/test/admin-auth-consistency.test.js"];

for (const file of test_files) {
    let content = fs.readFileSync(file, 'utf8');

    // Restore the spy to mock verifyIdToken correctly
    content = content.replace('authSpy = jest.spyOn(require("firebase-admin/auth"), "getAuth");', 'authSpy = jest.spyOn(require("firebase-admin/auth"), "getAuth").mockReturnValue(require("firebase-admin/auth").getAuth());');
    content = content.replace('const authSpy = jest.spyOn(require("firebase-admin/auth"), "getAuth");', 'const authSpy = jest.spyOn(require("firebase-admin/auth"), "getAuth").mockReturnValue(require("firebase-admin/auth").getAuth());');

    // Oh wait, we had that.
    // The issue is that `myFunctions` is required at the top: `const myFunctions = require("../index");`
    // And inside `index.js`, we DO NOT destructure getAuth anymore. We do `const adminAuth = require("firebase-admin/auth");`
    // And when we call `adminAuth.getAuth()`, jest SHOULD intercept it if we spy on `require("firebase-admin/auth"), "getAuth"`.
    // Wait, why did it fail? "Authentication failed" means `verifyIdToken` threw an error.
    // It's probably because we didn't mock `verifyIdToken` correctly on the return value.
    // The test code does: `authSpy.mockReturnValue({ verifyIdToken: ... })`.

    // In `fix_test_tests.py`, I replaced `authSpy = jest.spyOn(require("firebase-admin/auth"), "getAuth").mockReturnValue(require("firebase-admin/auth").getAuth());` with just `...getAuth");`.
    // Let's check `functions/test/security-fix.test.js` to see what authSpy does.
}
