// tests/cli.test.ts — CLI-level tests (e2e)
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, "../dist/index.js");

// Helper: run git in a directory
function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

// Build a repo with one commit
function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "wtf-cli-test-"));
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "test@test.com"]);
  git(dir, ["config", "user.name", "test"]);
  writeFileSync(join(dir, "a.txt"), "v1");
  git(dir, ["add", "a.txt"]);
  git(dir, ["commit", "-q", "-m", "c1"]);
  return dir;
}

// Clean up after each test
const dirsToClean: string[] = [];

test.after(() => {
  for (const d of dirsToClean) {
    try { rmSync(d, { recursive: true, force: true }); } catch {}
  }
});

test("steps --json outputs JSON array of save points", () => {
  const dir = makeRepo();
  dirsToClean.push(dir);

  // Create a save point
  execFileSync("node", [CLI, "save", "alpha"], {
    cwd: dir,
    encoding: "utf8",
    stdio: "ignore",
  });

  // Run steps --json
  const output = execFileSync("node", [CLI, "steps", "--json"], {
    cwd: dir,
    encoding: "utf8",
  });

  const data = JSON.parse(output);
  assert(Array.isArray(data), "Output should be an array");
  assert.equal(data.length, 1, "Should have one save point");
  assert.equal(data[0].label, "alpha");
  assert.ok(data[0].tagName.startsWith("wtf-bro-save-alpha-"));
  assert.ok(data[0].ts.length > 0);
});

test("steps --json with no save points outputs empty array", () => {
  const dir = makeRepo();
  dirsToClean.push(dir);

  const output = execFileSync("node", [CLI, "steps", "--json"], {
    cwd: dir,
    encoding: "utf8",
  });

  const data = JSON.parse(output);
  assert(Array.isArray(data));
  assert.equal(data.length, 0);
});

test("doctor --json outputs JSON info", () => {
  const dir = makeRepo();
  dirsToClean.push(dir);

  const output = execFileSync("node", [CLI, "doctor", "--json"], {
    cwd: dir,
    encoding: "utf8",
  });

  const info = JSON.parse(output);
  assert.equal(info.isRepo, true);
  assert.ok(info.branch);
  assert.equal(info.detachedHead, false);
  assert.equal(info.commitCount, 1);
  assert.equal(info.savePointCount, 0);
  assert.equal(info.backupCount, 0);
});

test("doctor --json in non-repo outputs isRepo false", () => {
  const dir = mkdtempSync(join(tmpdir(), "wtf-cli-test-"));
  dirsToClean.push(dir);

  const output = execFileSync("node", [CLI, "doctor", "--json"], {
    cwd: dir,
    encoding: "utf8",
  });

  const info = JSON.parse(output);
  assert.equal(info.isRepo, false);
});