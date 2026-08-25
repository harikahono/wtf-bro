// tests/detect.test.ts — test deteksi package manager
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPackageManager } from "../src/detect.js";

test("detectPackageManager: npm dari package-lock.json", () => {
  const r = detectPackageManager(["src/index.ts", "package-lock.json"]);
  assert.equal(r.manager, "npm");
  assert.equal(r.lockfile, "package-lock.json");
});

test("detectPackageManager: pnpm", () => {
  const r = detectPackageManager(["pnpm-lock.yaml"]);
  assert.equal(r.manager, "pnpm");
});

test("detectPackageManager: yarn", () => {
  const r = detectPackageManager(["yarn.lock", "README.md"]);
  assert.equal(r.manager, "yarn");
});

test("detectPackageManager: bun", () => {
  const r = detectPackageManager(["bun.lockb"]);
  assert.equal(r.manager, "bun");
});

test("detectPackageManager: ga ada lockfile -> unknown", () => {
  const r = detectPackageManager(["index.js", "README.md"]);
  assert.equal(r.manager, "unknown");
  assert.equal(r.lockfile, null);
});
