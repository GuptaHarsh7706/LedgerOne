import { createApp } from "./app.js";
import { config, validateConfig } from "./config.js";
import { initDatabase } from "./db.js";

async function main() {
  validateConfig();
  console.log(`[LedgerOne] Initializing Postgres schema on Neon branch '${config.neon.branch}'...`);
  await initDatabase();
  console.log("[LedgerOne] Database schema initialized successfully.");

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[LedgerOne] Server listening on port ${config.port}`);
  });

  const shutdown = () => {
    console.log("[LedgerOne] Shutting down gracefully...");
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[LedgerOne] Startup error:", err);
  process.exit(1);
});
