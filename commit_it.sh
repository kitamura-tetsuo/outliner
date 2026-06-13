#!/bin/bash
git config --global user.email "jules@example.com"
git config --global user.name "Jules"
git add .
git commit -m "fix(client): resolve typescript compilation errors"
git checkout -b fix/client-type-errors
