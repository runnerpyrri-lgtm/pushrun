// 중앙 패밀리 생성물의 해시를 확인하고 정적 배포 폴더에 같은 파일을 복제한다.
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(root, "generated", "robom-family");
const targetDir = join(root, "outputs", "pushrun-site", "family");
const lock = JSON.parse(await readFile(join(root, "family.lock.json"), "utf8"));
const checkOnly = process.argv.includes("--check");

await mkdir(targetDir, { recursive: true });

for (const [name, expectedHash] of Object.entries(lock.files || {})) {
  const sourcePath = join(sourceDir, name);
  const source = await readFile(sourcePath);
  const actualHash = `sha256:${createHash("sha256").update(source).digest("hex")}`;
  if (actualHash !== expectedHash) {
    throw new Error(`패밀리 생성물 hash 불일치: ${name}`);
  }

  const targetPath = join(targetDir, name);
  if (checkOnly) {
    const target = await readFile(targetPath);
    if (!source.equals(target)) throw new Error(`정적 패밀리 생성물 불일치: ${name}`);
  } else {
    await copyFile(sourcePath, targetPath);
  }
}

console.log(`패밀리 정적 생성물 ${Object.keys(lock.files || {}).length}개 ${checkOnly ? "검증" : "동기화"} 완료`);
