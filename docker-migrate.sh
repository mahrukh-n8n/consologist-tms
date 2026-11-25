#!/bin/sh
set -e

# DEVELOPMENT STAGE: the project has no migration history yet, so the schema is
# pushed directly. Before the first production deployment, create a baseline
# migration chain and switch this script to `prisma migrate deploy`.

PRISMA_CLI="node node_modules/prisma/build/index.js"

echo "==> Pushing Prisma schema (development mode)..."
$PRISMA_CLI db push --skip-generate
echo "==> Schema ready."

# First workspace/user is created through the UI at /register.
