// tests/history.test.ts — test audit log (append + read)
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendHistory, readHistory, type HistoryEntry } from "../src/history.js";

// Pakai WTF_HOME temp biar ga polusi ~/.wtf asli user.
const TMP = mkdtempSync(join(tmpdir(), "wtf-hist-"));
process.env.WTF_HOME = TMP;

function makeEntry(ts: string): HistoryEntry {
  return {
    timestamp: ts,
    type: "rollback1",
    branch: "main",
    tagName: `wtf-bro-backup-${ts}`,
    stashName: null,
    cwd: "/fake/path",
    ok: true,
  };
}

test.after(() => {
  rmSync(TMP, { recursive: true, force: true });
});

test("readHistory: kosong kalau file belum ada", () => {
  const h = readHistory();
  assert.ok(Array.isArray(h));
});

test("appendHistory lalu readHistory balikin entry yang sama", () => {
  const entry = makeEntry("test-1");
  appendHistory(entry);
  const h = readHistory();
  const found = h.find((e) => e.tagName === entry.tagName);
  assert.ok(found);
  assert.equal(found.type, "rollback1");
  assert.equal(found.branch, "main");
  assert.equal(found.ok, true);
});
