cat << 'TESTEOF' > server/scripts/init-firebase-emulator.js
import { initializeFirebase } from "../dist/firebase-init.js";

initializeFirebase().then(() => {
    console.log("Firebase emulator initialization completed");
}).catch(err => {
    console.error("Firebase emulator initialization failed", err);
    process.exit(1);
});
TESTEOF
