import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(LIB_DIR, "..", "..");
export const DIST_DIR = path.join(ROOT_DIR, "dist");
export const STAGING_DIR = path.join(DIST_DIR, "staging");
export const RELEASE_DIR = path.join(DIST_DIR, "release");

export const MODULE_PAYLOAD_PATHS = [
  "module.json",
  "README.md",
  "LICENSE",
  "assets",
  "lang",
  "scripts",
  "styles",
  "templates"
];

export function isDirectRun(importMetaUrl) {
  return path.resolve(process.argv[1] ?? "") === fileURLToPath(importMetaUrl);
}

export function parseCliArgs(argv = process.argv.slice(2)) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--tag") {
      options.tag = argv[index + 1];
      index += 1;
      continue;
    }

    if (current === "--dry-run") {
      options.dryRun = true;
      continue;
    }
  }

  return options;
}

export async function readJson(relativePath) {
  const absolutePath = path.join(ROOT_DIR, relativePath);
  const raw = await fs.readFile(absolutePath, "utf8");

  try {
    return JSON.parse(raw);
  } catch (error) {
    error.message = `Invalid JSON in ${relativePath}: ${error.message}`;
    throw error;
  }
}

export async function loadManifest() {
  return readJson("module.json");
}

export function getRepoSlugFromManifest(manifest) {
  const match = String(manifest.url ?? "").match(/^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git|\/)?$/i);

  if (!match) {
    throw new Error("module.json:url must be a GitHub repository URL.");
  }

  return match[1];
}

export function getExpectedLatestManifestUrl(repoSlug) {
  return `https://github.com/${repoSlug}/releases/latest/download/module.json`;
}

export function getExpectedVersionedDownloadUrl(repoSlug, version) {
  return `https://github.com/${repoSlug}/releases/download/v${version}/module.zip`;
}

export function getExpectedReleaseManifestUrl(repoSlug, tag) {
  return `https://github.com/${repoSlug}/releases/download/${tag}/module.json`;
}

export function getExpectedReleaseNotesUrl(repoSlug, tag) {
  return `https://github.com/${repoSlug}/releases/tag/${tag}`;
}

export function ensureString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

export function ensureId(value) {
  ensureString(value, "module.json:id");

  if (!/^[a-z0-9-]+$/.test(value)) {
    throw new Error("module.json:id must use lowercase letters, numbers, and hyphens only.");
  }
}

export async function assertPathExists(relativePath, label = relativePath) {
  const absolutePath = path.join(ROOT_DIR, relativePath);

  try {
    await fs.access(absolutePath);
  } catch {
    throw new Error(`${label} points to a missing file or directory: ${relativePath}`);
  }
}

export async function listFilesRecursively(relativeRoot, extensionPattern) {
  const collected = [];
  const basePath = path.join(ROOT_DIR, relativeRoot);

  async function visit(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }

      if (!extensionPattern.test(entry.name)) {
        continue;
      }

      collected.push(absolutePath);
    }
  }

  await visit(basePath);
  return collected.sort();
}

export async function validateManifest({ tag } = {}) {
  const manifest = await loadManifest();
  const repoSlug = getRepoSlugFromManifest(manifest);

  ensureId(manifest.id);
  ensureString(String(manifest.version ?? ""), "module.json:version");

  if (!Array.isArray(manifest.authors) || manifest.authors.length === 0) {
    throw new Error("module.json:authors must contain at least one author.");
  }

  if (!manifest.compatibility || typeof manifest.compatibility !== "object") {
    throw new Error("module.json:compatibility is required.");
  }

  ensureString(String(manifest.compatibility.minimum ?? ""), "module.json:compatibility.minimum");
  ensureString(String(manifest.compatibility.verified ?? ""), "module.json:compatibility.verified");

  if (manifest.compatibility.maximum !== undefined && manifest.compatibility.maximum !== null && String(manifest.compatibility.maximum).trim() === "") {
    throw new Error("module.json:compatibility.maximum must be omitted or set to a non-empty value.");
  }

  const expectedManifestUrl = getExpectedLatestManifestUrl(repoSlug);
  if (manifest.manifest !== expectedManifestUrl) {
    throw new Error(`module.json:manifest must be ${expectedManifestUrl}`);
  }

  const expectedDownloadUrl = getExpectedVersionedDownloadUrl(repoSlug, manifest.version);
  if (manifest.download !== expectedDownloadUrl) {
    throw new Error(`module.json:download must be ${expectedDownloadUrl}`);
  }

  if (tag && tag !== `v${manifest.version}`) {
    throw new Error(`Tag ${tag} does not match module.json version ${manifest.version}. Expected v${manifest.version}.`);
  }

  await assertPathExists("README.md");
  await assertPathExists("LICENSE");

  for (const relativePath of manifest.esmodules ?? []) {
    await assertPathExists(relativePath, "module.json:esmodules");
  }

  for (const relativePath of manifest.styles ?? []) {
    await assertPathExists(relativePath, "module.json:styles");
  }

  for (const language of manifest.languages ?? []) {
    ensureString(language.lang, "module.json:languages[].lang");
    ensureString(language.name, "module.json:languages[].name");
    ensureString(language.path, "module.json:languages[].path");
    await assertPathExists(language.path, `module.json:languages[${language.lang}]`);
    await readJson(language.path);
  }

  return {
    manifest,
    repoSlug,
    expectedManifestUrl,
    expectedDownloadUrl
  };
}

export async function copyPayloadToDirectory(destinationDirectory) {
  await fs.mkdir(destinationDirectory, { recursive: true });

  for (const relativePath of MODULE_PAYLOAD_PATHS) {
    const source = path.join(ROOT_DIR, relativePath);
    const destination = path.join(destinationDirectory, relativePath);
    await fs.cp(source, destination, { recursive: true });
  }
}
