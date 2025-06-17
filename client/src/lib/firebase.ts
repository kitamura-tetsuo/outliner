import { initializeApp, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { firebaseConfig } from './firebaseConfig'; // Assuming this file exists and is correct

console.log('FIREBASE.TS: Module loaded. Attempting to initialize Firebase...');

let app: FirebaseApp;
let auth: Auth;

// Firebase recommends using getApp() to avoid reinitialization errors in some environments (like HMR)
try {
  app = getApp();
  console.log('FIREBASE.TS: Existing Firebase app retrieved.');
  auth = getAuth(app);
} catch (e) {
  console.log('FIREBASE.TS: No existing Firebase app, initializing new one...');
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  console.log('FIREBASE.TS: New Firebase app initialized.');
}

// Connect to emulators if VITE_USE_FIREBASE_EMULATOR is true
// Ensure VITE_FIREBASE_EMULATOR_HOST and VITE_AUTH_EMULATOR_PORT are correctly set in .env for this to work
const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true';
// VITE_FIREBASE_AUTH_EMULATOR_HOST is used by convention in some projects, but Firebase SDK uses host:port string.
// The previous debug used VITE_FIREBASE_AUTH_EMULATOR_HOST and VITE_AUTH_EMULATOR_PORT separately.
const authEmulatorHost = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST || 'localhost';
const authEmulatorPortEnv = import.meta.env.VITE_AUTH_EMULATOR_PORT || '9099'; // Default Firebase Auth Emulator port is 9099
                                                                            // Previous logs showed 59099 was being used. This should align.
const authEmulatorPort = parseInt(authEmulatorPortEnv, 10);

if (useEmulator) {
  const authUrl = `http://${authEmulatorHost}:${authEmulatorPort}`;
  console.log(`FIREBASE.TS: VITE_USE_FIREBASE_EMULATOR is true. Attempting to use AUTH emulator at ${authUrl}`);
  try {
    connectAuthEmulator(auth, authUrl, { disableWarnings: true });
    console.log(`FIREBASE.TS: Successfully connected to AUTH emulator at ${authUrl}`);
  } catch (error) {
    console.error(`FIREBASE.TS: Error connecting to Auth Emulator at ${authUrl}: `, error);
    // Optionally, prevent app from continuing if emulator connection is critical
  }
} else {
  console.log('FIREBASE.TS: VITE_USE_FIREBASE_EMULATOR is not true. Connecting to live Firebase (or default SDK behavior).');
}

export { app, auth };
