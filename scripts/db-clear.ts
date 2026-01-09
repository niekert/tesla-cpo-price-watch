#!/usr/bin/env bun

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_SECRET = process.env.ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error("Error: ADMIN_SECRET environment variable is required");
  console.error("Usage: ADMIN_SECRET=your-secret bun run db:clear");
  process.exit(1);
}

async function clearStorage() {
  console.log(`Clearing storage at ${BASE_URL}/api/clear-storage...`);

  const response = await fetch(`${BASE_URL}/api/clear-storage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ADMIN_SECRET}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    console.error("Error:", result.error);
    process.exit(1);
  }

  console.log("Success:", result.message);
}

clearStorage().catch((error) => {
  console.error("Failed:", error);
  process.exit(1);
});
