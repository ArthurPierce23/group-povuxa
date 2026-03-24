import process from "node:process";
import { isDirectRun, parseCliArgs, validateManifest } from "./lib/project.mjs";

export async function runManifestValidation(options = {}) {
  const result = await validateManifest(options);

  console.log(`Manifest OK: ${result.manifest.id} v${result.manifest.version}`);
  console.log(`Manifest URL: ${result.expectedManifestUrl}`);
  console.log(`Download URL: ${result.expectedDownloadUrl}`);

  return result;
}

if (isDirectRun(import.meta.url)) {
  runManifestValidation(parseCliArgs()).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
