import { defineConfig } from "drizzle-kit";
import path from "path";
import { config } from "dotenv";

// Load .env from workspace root
config({ path: path.resolve(__dirname, "../../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.resolve(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
