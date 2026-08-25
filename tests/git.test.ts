// tests/git.test.ts — test git engine pake node:test (tanpa framework)
// Cara testing: bikin repo fixture di temp, jalanin fungsi, cek hasil.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  getRepoInfo,
  createBackup,
  performRollback,
  getCurrentBranch,
  listModifiedFiles,
  revertUncommitted,
  createSavePoint,
  undoToSavePoint,
  cleanBackups,
  listSavePoints,
  type RepoInfo,
} from "../src/git.js";

// track semua fixture biar dibersihin di akhir
const dirsToClean: string[] = [];

function run(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

// Bikin repo fixture: n commit + optional dirty/untracked. Return path.
function makeRepo(commits: number, opts: { dirty?: boolean; untracked?: boolean } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "wtf-test-"));
  dirsToClean.push(dir);
  run(dir, ["init", "-q"]);
  run(dir, ["config", "user.email", "test@test.com"]);
  run(dir, ["config", "user.name", "test"]);
  for (let i = 1; i <= commits; i++) {
    writeFileSync(join(dir, "a.txt"), `v${i}`);
    run(dir, ["add", "a.txt"]);
    run(dir, ["commit", "-q", "-m", `c${i}`]);
  }
  if (opts.dirty) writeFileSync(join(dir, "a.txt"), "DIRTY");
  if (opts.untracked) writeFileSync(join(dir, "untracked.txt"), "new");
  return dir;
}

test.after(() => {
  for (const dir of dirsToClean) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // abaikan, kalau gagal bersihin ga fatal
    }
  }
});

test("getRepoInfo: repo kosong (ga ada commit) terdeteksi", async () => {
  const dir = makeRepo(0);
  const info = await getRepoInfo(dir);
  assert.equal(info.isRepo, true);
  assert.equal(info.commitCount, 0);
  assert.equal(info.isDirty, false);
});

test("getRepoInfo: deteksi commit count, dirty, untracked", async () => {
  const dir = makeRepo(3, { dirty: true, untracked: true });
  const info: RepoInfo = await getRepoInfo(dir);
  assert.equal(info.commitCount, 3);
  assert.equal(info.isDirty, true);
  assert.ok(info.branch);
});

test("getRepoInfo: folder bukan repo", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wtf-test-"));
  dirsToClean.push(dir);
  const info = await getRepoInfo(dir);
  assert.equal(info.isRepo, false);
});

test("createBackup: bikin tag + stash untracked file", async () => {
  const dir = makeRepo(3, { dirty: true, untracked: true });
  const backup = await createBackup(dir, "123");
  assert.equal(backup.ok, true);
  assert.equal(backup.tagName, "wtf-bro-backup-123");
  assert.ok(run(dir, ["tag"]).includes("wtf-bro-backup-123"));
  // untracked file udah masuk stash (ga ada lagi di working tree)
  assert.equal(existsSync(join(dir, "untracked.txt")), false);
  assert.ok(run(dir, ["stash", "list"]).includes("wtf-bro-backup-123"));
});

test("createBackup: repo bersih ga bikin stash", async () => {
  const dir = makeRepo(2);
  const backup = await createBackup(dir, "999");
  assert.equal(backup.ok, true);
  assert.equal(backup.stashName, null);
  assert.equal(backup.tagName, "wtf-bro-backup-999");
});

test("performRollback: reset --hard HEAD~N", async () => {
  const dir = makeRepo(3);
  await createBackup(dir, "456");
  const res = await performRollback(dir, 1);
  assert.equal(res.ok, true);
  assert.equal(readFileSync(join(dir, "a.txt"), "utf8"), "v2");
});

test("performRollback: nuklir (reset + clean) hapus untracked", async () => {
  const dir = makeRepo(3, { dirty: true, untracked: true });
  await createBackup(dir, "789");
  const res = await performRollback(dir, 0);
  assert.equal(res.ok, true);
  assert.equal(existsSync(join(dir, "untracked.txt")), false);
});

test("getCurrentBranch: balikin nama branch", async () => {
  const dir = makeRepo(1);
  const branch = await getCurrentBranch(dir);
  assert.ok(typeof branch === "string" && branch.length > 0);
});

// --- Slice: listModifiedFiles (deteksi file yang AI ubah via git status) ---

test("listModifiedFiles: repo clean -> kosong", async () => {
  const dir = makeRepo(2);
  const files = await listModifiedFiles(dir);
  assert.deepEqual(files, []);
});

test("listModifiedFiles: deteksi modified, untracked, deleted", async () => {
  const dir = makeRepo(2);
  // ubah file yang udah di-commit (M)
  writeFileSync(join(dir, "a.txt"), "DIRTY");
  // bikin file baru (??)
  writeFileSync(join(dir, "new.txt"), "new");
  // hapus file yang udah di-commit (D)
  writeFileSync(join(dir, "todelete.txt"), "x");
  run(dir, ["add", "todelete.txt"]);
  run(dir, ["commit", "-q", "-m", "add todelete"]);
  rmSync(join(dir, "todelete.txt"));

  const files = await listModifiedFiles(dir);
  assert.ok(files.includes("a.txt"), "harus deteksi modified");
  assert.ok(files.includes("new.txt"), "harus deteksi untracked");
  assert.ok(files.includes("todelete.txt"), "harus deteksi deleted");
});

// --- Slice: revertUncommitted (bikin working tree bersih lagi) ---

test("revertUncommitted: modified balik ke HEAD", async () => {
  const dir = makeRepo(2);
  writeFileSync(join(dir, "a.txt"), "DIRTY");
  const res = await revertUncommitted(dir);
  assert.equal(res.ok, true);
  // isi balik ke versi commit terakhir (v2)
  assert.equal(readFileSync(join(dir, "a.txt"), "utf8"), "v2");
  // ga ada lagi modified
  const files = await listModifiedFiles(dir);
  assert.deepEqual(files, []);
});

test("revertUncommitted: untracked file dihapus (tp masih recoverable via stash)", async () => {
  const dir = makeRepo(2, { untracked: true });
  // backup dulu biar untracked ga ilang permanen
  await createBackup(dir, "rev1");
  const res = await revertUncommitted(dir);
  assert.equal(res.ok, true);
  assert.equal(existsSync(join(dir, "untracked.txt")), false);
  // masih bisa diambil dari stash
  const stashes = run(dir, ["stash", "list"]);
  assert.ok(stashes.includes("wtf-bro-backup-rev1"));
});

// --- Slice: createSavePoint + undoToSavePoint (panic button dongo) ---

test("createSavePoint + undoToSavePoint: roundtrip balik ke posisi aman", async () => {
  const dir = makeRepo(3);
  const save = await createSavePoint(dir, "before-refactor");
  assert.equal(save.ok, true);
  assert.ok(save.tagName?.startsWith("wtf-bro-save-"));

  // AI ngaco: ubah file + bikin file baru
  writeFileSync(join(dir, "a.txt"), "RUINED");
  writeFileSync(join(dir, "mess.txt"), "ai mess");

  const undo = await undoToSavePoint(dir);
  assert.equal(undo.ok, true);
  // balik persis ke posisi save (a.txt = v3)
  assert.equal(readFileSync(join(dir, "a.txt"), "utf8"), "v3");
  assert.equal(existsSync(join(dir, "mess.txt")), false);
  // working tree bersih
  const files = await listModifiedFiles(dir);
  assert.deepEqual(files, []);
});

test("createSavePoint: repo dirty -> stash WIP biar ga ilang", async () => {
  const dir = makeRepo(2, { dirty: true });
  const save = await createSavePoint(dir, "wip");
  assert.equal(save.ok, true);
  assert.ok(save.tagName?.startsWith("wtf-bro-save-"));
  // WIP masuk stash (recoverable)
  assert.ok(save.stashName?.startsWith("wtf-bro-save-stash-"));
});

// --- Slice: cleanBackups (bersihin tag/stash backup lama) ---

test("cleanBackups: hapus tag+stash backup, save point AMAN", async () => {
  const dir = makeRepo(2);
  const ts = "2026-01-01T00-00-00-000Z";

  // 1 backup bikin stash (untracked), 1 backup tanpa stash
  writeFileSync(join(dir, "untracked.txt"), "x");
  await createBackup(dir, `${ts}-a`);
  await createBackup(dir, `${ts}-b`);

  // save point harus tetap hidup setelah clean
  await createSavePoint(dir, "keep", `${ts}-save`);

  const res = await cleanBackups(dir);
  assert.equal(res.ok, true);
  assert.ok(res.removedTags >= 2);

  // tag backup ilang
  const tags = run(dir, ["tag", "-l"]);
  assert.ok(!tags.includes("wtf-bro-backup"));
  // stash backup ilang
  const stashes = run(dir, ["stash", "list"]);
  assert.ok(!stashes.includes("wtf-bro-backup"));
  // save point TETAP ada
  assert.ok(tags.includes("wtf-bro-save-keep"));
});

// --- Slice: wtf steps (listSavePoints) + wtf undo <label> ---

test("listSavePoints: list semua save point dgn label + ts", async () => {
  const dir = makeRepo(3);
  await createSavePoint(dir, "before-refactor", "2026-01-01T01-00-00-000Z");
  await createSavePoint(dir, "wip", "2026-01-01T02-00-00-000Z");

  const pts = await listSavePoints(dir);
  assert.equal(pts.length, 2);
  // label & ts di-parse bener
  assert.deepEqual(
    pts.map((p) => p.label).sort(),
    ["before-refactor", "wip"],
  );
  assert.ok(pts.every((p) => p.tagName.startsWith("wtf-bro-save-") && p.ts.length > 0));
});

test("undoToSavePoint(label): balik ke save point tertentu by label", async () => {
  const dir = makeRepo(3); // a.txt = v3
  await createSavePoint(dir, "alpha", "2026-01-01T01-00-00-000Z"); // di v3

  // save point kedua setelah ada perubahan (di v3 juga, sama)
  writeFileSync(join(dir, "a.txt"), "v3-changed");
  run(dir, ["add", "a.txt"]);
  run(dir, ["commit", "-q", "-m", "c4"]);
  await createSavePoint(dir, "bravo", "2026-01-01T02-00-00-000Z"); // di v4 (a.txt=v3-changed)

  // AI ngaco setelah save bravo
  writeFileSync(join(dir, "a.txt"), "RUINED");
  writeFileSync(join(dir, "mess.txt"), "ai");

  // undo ke save 'alpha' (yang di v3) -> a.txt harus v3, bukan v3-changed
  const undo = await undoToSavePoint(dir, "alpha");
  assert.equal(undo.ok, true);
  assert.equal(readFileSync(join(dir, "a.txt"), "utf8"), "v3");
  assert.equal(existsSync(join(dir, "mess.txt")), false);
});

test("undoToSavePoint(label): label ga ada -> ok:false", async () => {
  const dir = makeRepo(2);
  const undo = await undoToSavePoint(dir, "ga-ada-label");
  assert.equal(undo.ok, false);
});
