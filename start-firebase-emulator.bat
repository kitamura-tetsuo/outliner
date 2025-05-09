@echo off
echo Starting Firebase Emulators...

echo 1. Starting Firebase Emulators...
echo Note: Only Functions emulator will be started. If you need Auth and Firestore, you need to install Java.
firebase emulators:start --only functions

echo Firebase Emulators stopped.
