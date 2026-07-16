// 러닝봄 Vercel 정적 미러에 운영 Git SHA를 주입해 배포 산출물을 만든다.
import { cp, readFile, rm, writeFile } from "node:fs/promises";

const source = new URL("../outputs/pushrun-site/", import.meta.url);
const output = new URL("../.vercel-static/", import.meta.url);
const appFile = new URL("app.js", output);
const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "";

if (!/^[0-9a-f]{40}$/i.test(commit)) {
  throw new Error("VERCEL_GIT_COMMIT_SHA 또는 GITHUB_SHA 40자리 값이 필요합니다.");
}

await rm(output, { recursive: true, force: true });
await cp(source, output, { recursive: true });
const app = await readFile(appFile, "utf8");
if (!app.includes("__BUILD_SHA__")) throw new Error("app.js 빌드 SHA 자리표시자가 없습니다.");
await writeFile(appFile, app.replaceAll("__BUILD_SHA__", commit.slice(0, 7)));
console.log(`Vercel 정적 미러 생성 · ${commit.slice(0, 7)}`);
