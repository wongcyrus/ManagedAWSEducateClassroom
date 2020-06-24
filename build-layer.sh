#!/bin/bash
set -eo pipefail
cd layer/nodejs
rm -rf node_modules
npm install --production