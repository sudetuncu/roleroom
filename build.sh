#!/usr/bin/env bash
set -e

echo "==> Installing root dependencies"
npm install --no-audit --no-fund --loglevel=error

echo "==> Installing client dependencies"
cd client
rm -rf node_modules
npm install --no-audit --no-fund --loglevel=error

echo "==> Building client"
node ./node_modules/vite/bin/vite.js build

echo "==> Build complete"
