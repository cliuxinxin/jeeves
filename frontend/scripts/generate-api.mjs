import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(here, "..");
const backendRoot = resolve(frontendRoot, "..", "backend");
const backendPython = resolve(backendRoot, ".venv", "bin", "python");
const openapiJson = resolve(backendRoot, "openapi.json");
const outputFile = resolve(frontendRoot, "lib", "api", "generated.ts");

const exportResult = spawnSync(backendPython, ["scripts/export_openapi.py"], {
  cwd: backendRoot,
  stdio: "inherit",
});

if (exportResult.status !== 0) {
  process.exit(exportResult.status ?? 1);
}

const generateResult = spawnSync(
  resolve(frontendRoot, "node_modules", ".bin", "openapi-typescript"),
  [openapiJson, "-o", outputFile],
  {
    cwd: frontendRoot,
    stdio: "inherit",
  },
);

if (generateResult.status !== 0) {
  process.exit(generateResult.status ?? 1);
}
