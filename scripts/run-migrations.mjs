import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("ERROR: DATABASE_URL wajib diset sebelum menjalankan migrasi.");
  process.exit(1);
}

const migrationsDir = path.resolve(process.cwd(), "supabase", "migrations");
const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

console.log(`Menjalankan ${files.length} file migrasi dari ${migrationsDir}...`);

for (const file of files) {
  const fullPath = path.join(migrationsDir, file);
  console.log(`-> Menerapkan ${file}`);
  const result = spawnSync(
    "psql",
    [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", fullPath],
    { stdio: "inherit" },
  );
  if (result.status !== 0) {
    console.error(`Migrasi gagal pada ${file}`);
    process.exit(result.status ?? 1);
  }
}

console.log("Semua migrasi berhasil diterapkan.");
