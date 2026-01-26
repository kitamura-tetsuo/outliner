#!/bin/bash
set -e
echo "Starting deployment to Firebase Hosting + Functions..."

echo "1. Cleaning up old build files if they exist..."
if [ -d "build" ]; then
  rm -rf build
fi

echo "2. Building client application..."
cd client
cp .env.firebase .env
npm run build
cd ..

echo "3. Deploying Firebase Functions and Hosting..."
firebase deploy

echo "Deployment completed!"
echo "Hosting URL: https://outliner-d57b0.web.app"
