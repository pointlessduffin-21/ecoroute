#!/bin/sh
set -e

echo "=== EcoRoute Backend Startup ==="

# Push schema to database (idempotent — safe to run every time)
echo "Pushing database schema..."
bun x drizzle-kit push --force 2>&1 || {
  echo "WARNING: db:push failed. Database may not be ready yet."
  echo "Retrying in 5 seconds..."
  sleep 5
  bun x drizzle-kit push --force 2>&1 || echo "WARNING: db:push failed again. Continuing anyway."
}

# Seed if database is empty (check if user table has rows)
echo "Checking if seed data is needed..."
bun run -e "
  import { getDb, closeDb } from './src/config/database.ts';
  import { users } from './src/db/schema.ts';
  const db = getDb();
  const rows = await db.select({ id: users.id }).from(users).limit(1);
  if (rows.length === 0) {
    console.log('No users found — running seed...');
    await closeDb();
    process.exit(1);
  } else {
    console.log('Database already seeded. Skipping.');
    await closeDb();
    process.exit(0);
  }
" || {
  echo "Running database seed..."
  bun run src/db/seed.ts 2>&1 || echo "WARNING: seed failed."
}

echo "Starting server..."
exec bun run src/index.ts

