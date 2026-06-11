const { initializeFirebase } = require("../firebase-init");

initializeFirebase().then(() => {
    console.log("Firebase emulator initialization completed");
}).catch(err => {
    console.error("Firebase emulator initialization failed", err);
    process.exit(1);
});
