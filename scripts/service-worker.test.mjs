// 서비스워커 활성화가 러닝봄 캐시만 정리하고 같은 origin의 다른 캐시는 보존하는지 검증한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

test("activate는 이전 pushrun 캐시만 삭제한다", async () => {
  const handlers = {};
  const deleted = [];
  let claimed = 0;
  const context = {
    caches: {
      keys: async () => ["pushrun-v0.16.0", "pushrun-v0.17.0", "homebom-v0.13.0", "third-party-cache"],
      delete: async (key) => {
        deleted.push(key);
        return true;
      }
    },
    self: {
      addEventListener: (name, handler) => {
        handlers[name] = handler;
      },
      clients: {
        claim: async () => {
          claimed += 1;
        }
      },
      location: { origin: "https://robom-labs.github.io" },
      registration: { scope: "https://robom-labs.github.io/runningbom/" },
      skipWaiting: () => undefined
    },
    URL
  };
  const source = readFileSync(new URL("../outputs/pushrun-site/sw.js", import.meta.url), "utf8");
  vm.runInNewContext(source, context, { filename: "sw.js" });

  let activation;
  handlers.activate({ waitUntil: (promise) => { activation = promise; } });
  await activation;

  assert.deepEqual(deleted, ["pushrun-v0.16.0"]);
  assert.equal(claimed, 1);
});
