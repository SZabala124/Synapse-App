import test from "node:test";
import assert from "node:assert/strict";
import { convexCacheKey, getConvexCacheSnapshot, subscribeConvexCache, writeConvexCache, clearConvexCache } from "../src/utils/convexCache.js";

const storage = {};
globalThis.localStorage = new Proxy({
  getItem: (key) => storage[key] ?? null,
  setItem: (key, value) => { storage[key] = value; },
  removeItem: (key) => { delete storage[key]; },
}, { ownKeys: () => Object.keys(storage), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
const events = new Map();
globalThis.window = { addEventListener: (name, handler) => events.set(name, handler) };

test("cache snapshots are stable and notify mutations and deletions in the same tab", () => {
  let notified = 0;
  const args = { email: "one@example.com" };
  const unsubscribe = subscribeConvexCache("quarter.test", args, () => notified++);
  assert.equal(getConvexCacheSnapshot("quarter.test", args), null);
  writeConvexCache("quarter.test", args, [1], { version: "1" });
  const entry = getConvexCacheSnapshot("quarter.test", args);
  assert.equal(entry, getConvexCacheSnapshot("quarter.test", args));
  assert.deepEqual(entry.value, [1]);
  assert.equal(notified, 1);
  clearConvexCache("quarter.test", args);
  assert.equal(notified, 2);
  assert.equal(getConvexCacheSnapshot("quarter.test", args), null);
  unsubscribe();
});

test("another tab invalidates only its own cache key and reloads persistent data", () => {
  const args = { email: "two@example.com" };
  const key = convexCacheKey("quarter.test", args);
  const unsubscribe = subscribeConvexCache("quarter.test", args, () => {});
  writeConvexCache("quarter.test", args, [1], { version: "1" });
  localStorage.setItem(key, JSON.stringify({ value: [2], version: "2", savedAt: Date.now() }));
  events.get("storage")({ key });
  assert.deepEqual(getConvexCacheSnapshot("quarter.test", args).value, [2]);
  assert.equal(getConvexCacheSnapshot("quarter.test", { email: "other@example.com" }), null);
  unsubscribe();
});

test("clearing a query name clears every argument variant", () => {
  writeConvexCache("catalog.test", { id: 1 }, [], { version: "1" });
  writeConvexCache("catalog.test", { id: 2 }, [], { version: "1" });
  clearConvexCache("catalog.test");
  assert.equal(getConvexCacheSnapshot("catalog.test", { id: 1 }), null);
  assert.equal(getConvexCacheSnapshot("catalog.test", { id: 2 }), null);
});
