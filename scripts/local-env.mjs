import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
if (existsSync(".env"))
  throw new Error(".env already exists; refusing to overwrite.");
const password = randomBytes(24).toString("hex");
writeFileSync(
  ".env",
  `POSTGRES_PASSWORD=${password}\nDATABASE_URL=postgresql://wintron:${password}@localhost:55432/wintron\nAPP_URL=http://localhost:3000\nBETTER_AUTH_SECRET=${randomBytes(48).toString("hex")}\nREQUIRE_MFA=false\nDOCUMENT_STORAGE_PATH=./.data/documents\n`,
  { mode: 0o600 },
);
console.log("Created local .env with independent random secrets.");
