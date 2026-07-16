// 패밀리 생성물의 SHA-256과 중앙 정본 잠금 정보를 독립적으로 검증한다.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const generatedDir = resolve(process.cwd(), process.argv[2] || "generated/robom-family");
const lockPath = resolve(process.cwd(), process.argv[3] || "family.lock.json");
const lock = JSON.parse(await readFile(lockPath, "utf8"));
const pkg = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8"));
const requiredFiles = [
  "tokens.css",
  "app-meta.json",
  "wordmark.svg",
  "icons.svg",
  "settings-contract.json",
  "feature-flags.json",
  "auth-config.json",
  "analytics-events.js",
];

if (!/^\d+\.\d+\.\d+$/.test(lock.familySpecVersion || "")) throw new Error("familySpecVersion이 없습니다.");
if (!/^[0-9a-f]{40}$/.test(lock.sourceCommit || "")) throw new Error("sourceCommit은 immutable Git SHA여야 합니다.");
for (const name of requiredFiles) {
  if (!lock.files?.[name]) throw new Error(`${name}: family.lock.json 필수 생성물이 없습니다.`);
}

for (const [name, expected] of Object.entries(lock.files || {})) {
  const content = await readFile(resolve(generatedDir, name));
  const actual = `sha256:${createHash("sha256").update(content).digest("hex")}`;
  if (actual !== expected) throw new Error(`${name}: 생성물 hash가 family.lock.json과 다릅니다.`);
}

const appMeta = JSON.parse(await readFile(resolve(generatedDir, "app-meta.json"), "utf8"));
if (appMeta.version !== pkg.version) {
  throw new Error(`app-meta 버전 drift: package=${pkg.version}, app-meta=${appMeta.version}`);
}

console.log(`family ${lock.familySpecVersion} verified · ${Object.keys(lock.files).length} files · ${lock.sourceCommit.slice(0, 7)}`);
