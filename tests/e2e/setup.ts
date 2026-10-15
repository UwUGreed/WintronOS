import { execFileSync } from "node:child_process";
export default function setup() {
  execFileSync("npx", ["tsx", "scripts/prepare-e2e.ts"], { stdio: "inherit" });
}
