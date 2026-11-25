#!/bin/sh
set -e

# Runtime image only starts the Next.js standalone server.
# Migrations run in the separate one-shot `migrate` service (docker-migrate.sh).
echo "==> Starting Consologist TMS..."
exec node server.js
