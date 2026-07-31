#!/bin/bash
# Revert package-lock.json and any other files we might have accidentally touched during tests
git restore server/package-lock.json
git restore server/node_modules || true
