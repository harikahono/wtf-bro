// git.ts — engine git murni (pure functions, gampang di-test)
// Semua command pake cross-spawn biar aman cross-OS (Windows, Mac, Linux).
import { spawn } from "cross-spawn";

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

export interface RepoInfo {
  isRepo: boolean;
  branch: string | null;
  commitCount: number;
  detachedHead: boolean;
  hasSubmodules: boolean;
  // true kalau ada working tree yang kotor (staged/unstaged/untracked)
  isDirty: boolean;
}

// Jalanin git command di cwd tertentu. Return {ok, stdout, stderr, code}.
export function runGit(args: string[], cwd?: string): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => (stdout += d));
    child.stderr?.on("data", (d) => (stderr += d));
    child.on("close", (code) =>
      resolve({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim(), code }),
    );
    child.on("error", (err) =>
      resolve({ ok: false, stdout, stderr: err.message, code: null }),
    );
  });
}

// Cek apakah cwd ada di dalam repo git, plus info penting buat rollback.
export async function getRepoInfo(cwd: string): Promise<RepoInfo> {
  const inRepo = await runGit(["rev-parse", "--is-inside-work-tree"], cwd);
  if (!inRepo.ok || inRepo.stdout !== "true") {
    return {
      isRepo: false,
      branch: null,
      commitCount: 0,
      detachedHead: false,
      hasSubmodules: false,
      isDirty: false,
    };
  }

  const [count, head, submodules, status] = await Promise.all([
    runGit(["rev-list", "--count", "HEAD"], cwd),
    runGit(["symbolic-ref", "--short", "-q", "HEAD"], cwd),
    runGit(["submodule", "status"], cwd),
    runGit(["status", "--porcelain"], cwd),
  ]);

  const detachedHead = !head.ok || head.stdout.length === 0;
  const commitCount = count.ok ? parseInt(count.stdout, 10) || 0 : 0;

  return {
    isRepo: true,
    branch: detachedHead ? null : head.stdout,
    commitCount,
    detachedHead,
    hasSubmodules: submodules.ok && submodules.stdout.length > 0,
    isDirty: status.ok && status.stdout.length > 0,
  };
}

export interface BackupResult {
  ok: boolean;
  tagName: string | null;
  stashName: string | null;
  error?: string;
}

// Safety net: backup state sebelum aksi destructive.
// - git tag <tagName> : snapshot commit posisi sekarang (recover dari reset)
// - git stash push -u : amankan untracked files sebelum git clean -fd
export async function createBackup(cwd: string, ts: string): Promise<BackupResult> {
  const tagName = `wtf-bro-backup-${ts}`;
  const stashName = `wtf-bro-backup-${ts}`;

  // 1. Tag posisi sekarang (selalu jalan, meski ga ada dirty file)
  const tag = await runGit(["tag", tagName], cwd);
  if (!tag.ok) {
    return { ok: false, tagName: null, stashName: null, error: tag.stderr };
  }

  // 2. Stash untracked files. Kalau repo bersih, git stash noop -> skip.
  const hasUntracked = await runGit(
    ["ls-files", "--others", "--exclude-standard"],
    cwd,
  );
  let stashNameUsed: string | null = null;
  if (hasUntracked.ok && hasUntracked.stdout.length > 0) {
    const stash = await runGit(
      ["stash", "push", "-u", "-m", stashName],
      cwd,
    );
    if (!stash.ok) {
      return { ok: false, tagName, stashName: null, error: stash.stderr };
    }
    stashNameUsed = stashName;
  }

  return { ok: true, tagName, stashName: stashNameUsed };
}

export interface RollbackResult {
  ok: boolean;
  rolledBackTo: string | null;
  error?: string;
}

// Eksekusi rollback. count=0 artinya reset nuklir (ke HEAD, plus clean).
// - count > 0 : git reset --hard HEAD~count
// - count = 0 : git reset --hard HEAD && git clean -fd (nuklir)
export async function performRollback(
  cwd: string,
  count: number,
): Promise<RollbackResult> {
  if (count > 0) {
    const reset = await runGit(["reset", "--hard", `HEAD~${count}`], cwd);
    return reset.ok
      ? { ok: true, rolledBackTo: null }
      : { ok: false, rolledBackTo: null, error: reset.stderr };
  }

  // Nuklir: reset ke HEAD + bersihkan untracked
  const reset = await runGit(["reset", "--hard", "HEAD"], cwd);
  if (!reset.ok) {
    return { ok: false, rolledBackTo: null, error: reset.stderr };
  }
  const clean = await runGit(["clean", "-fd"], cwd);
  if (!clean.ok) {
    return { ok: false, rolledBackTo: null, error: clean.stderr };
  }
  return { ok: true, rolledBackTo: null };
}

// Nama branch sekarang (buat konfirmasi reset nuklir).
export async function getCurrentBranch(cwd: string): Promise<string | null> {
  const head = await runGit(["symbolic-ref", "--short", "-q", "HEAD"], cwd);
  return head.ok ? head.stdout || null : null;
}

// Deteksi file yang lagi berubah (modified/added/deleted/untracked).
// Persis yang VSCode tampilin sebagai indikator merah/hijau = `git status --porcelain`.
// Format v1: 2 char status + spasi + path (misal " M a.txt", "?? new.txt", " D x.txt").
// Char ke-2 = working tree status; "??" = untracked.
export async function listModifiedFiles(cwd: string): Promise<string[]> {
  const res = await runGit(
    ["status", "--porcelain", "-uall"],
    cwd,
  );
  if (!res.ok || res.stdout.length === 0) return [];
  return res.stdout
    .split("\n")
    .map((line) => line.replace(/\r$/, "").slice(2).trim()) // buang 2 char status, sisa di-trim (handle " M "/ "M  ")
    .filter((name) => name.length > 0);
}

// Balikin working tree ke kondisi terakhir di-commit (buang semua perubahan AI).
// - git restore --staged --worktree . : batalkan perubahan file tracked (M/A/D)
// - git clean -fd : hapus file untracked (??)
// PENTING: panggil createBackup() SEBELUM ini biar untracked/modified ga ilang permanen.
export async function revertUncommitted(cwd: string): Promise<RollbackResult> {
  const restore = await runGit(["restore", "--staged", "--worktree", "."], cwd);
  if (!restore.ok) {
    return { ok: false, rolledBackTo: null, error: restore.stderr };
  }
  const clean = await runGit(["clean", "-fd"], cwd);
  if (!clean.ok) {
    return { ok: false, rolledBackTo: null, error: clean.stderr };
  }
  return { ok: true, rolledBackTo: null };
}

export interface SaveResult {
  ok: boolean;
  tagName: string | null;
  stashName: string | null;
  error?: string;
}

// Tandain posisi aman (panic button buat dongo).
// - selalu bikin tag di HEAD (commit "known good")
// - kalau working tree kotor: stash WIP dulu biar ga ilang, tag tetap di HEAD
export async function createSavePoint(
  cwd: string,
  label: string,
  ts: string,
): Promise<SaveResult> {
  const tagName = `wtf-bro-save-${label}-${ts}`;
  let stashName: string | null = null;

  // kalau kotor, stash WIP biar recoverable (ga ilang pas undo nanti)
  const dirty = await runGit(["status", "--porcelain"], cwd);
  if (dirty.ok && dirty.stdout.trim().length > 0) {
    stashName = `wtf-bro-save-stash-${ts}`;
    const stash = await runGit(["stash", "push", "-u", "-m", stashName], cwd);
    if (!stash.ok) {
      return { ok: false, tagName: null, stashName: null, error: stash.stderr };
    }
  }

  const tag = await runGit(["tag", tagName], cwd);
  if (!tag.ok) {
    return { ok: false, tagName: null, stashName, error: tag.stderr };
  }
  return { ok: true, tagName, stashName };
}

export interface SavePoint {
  tagName: string;
  label: string;
  ts: string;
}

// Parse tag 'wtf-bro-save-<label>-<ts>'. Lazy capture label biar label boleh ada '-'.
const SAVE_TAG_RE = /^wtf-bro-save-(.*?)-(\d{4}-\d{2}-\d{2}T.*Z)$/;

// List semua save point (tag wtf-bro-save-*), urut dari yang paling lama.
export async function listSavePoints(cwd: string): Promise<SavePoint[]> {
  const list = await runGit(["tag", "-l", "wtf-bro-save-*"], cwd);
  if (!list.ok || list.stdout.trim().length === 0) return [];
  const points: SavePoint[] = [];
  for (const tag of list.stdout.split("\n").map((t) => t.trim()).filter(Boolean)) {
    const m = tag.match(SAVE_TAG_RE);
    if (m) points.push({ tagName: tag, label: m[1], ts: m[2] });
  }
  points.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  return points;
}

// Balik ke save point (tag wtf-bro-save-*).
// - label null  -> save point terbaru (default, buat `wtf undo`)
// - label ada   -> save point dengan label itu (buat `wtf undo <label>`)
export async function undoToSavePoint(
  cwd: string,
  label?: string,
): Promise<RollbackResult> {
  const pattern = label ? `wtf-bro-save-${label}-*` : "wtf-bro-save-*";
  const list = await runGit(["tag", "-l", pattern], cwd);
  if (!list.ok || list.stdout.trim().length === 0) {
    return {
      ok: false,
      rolledBackTo: null,
      error: label
        ? `ga ada save point '${label}'. Cek: wtf steps`
        : "ga ada save point. Pakai 'wtf save' dulu.",
    };
  }
  const tags = list.stdout.split("\n").map((t) => t.trim()).filter(Boolean);
  tags.sort(); // ISO timestamp di nama -> yang terakhir = terbaru
  const latest = tags[tags.length - 1];

  const reset = await runGit(["reset", "--hard", latest], cwd);
  if (!reset.ok) {
    return { ok: false, rolledBackTo: null, error: reset.stderr };
  }
  // save point = commit bersih, jadi untracked (mess AI) juga dibersihin.
  // (backup udah diambil di orchestration sebelum fungsi ini dipanggil)
  const clean = await runGit(["clean", "-fd"], cwd);
  if (!clean.ok) {
    return { ok: false, rolledBackTo: null, error: clean.stderr };
  }
  return { ok: true, rolledBackTo: latest };
}

// Rollback ke commit tertentu (ref: hash, branch, tag). Buat `wtf undo <commit>`.
export async function resetToCommit(
  cwd: string,
  ref: string,
): Promise<RollbackResult> {
  const reset = await runGit(["reset", "--hard", ref], cwd);
  if (!reset.ok) {
    return { ok: false, rolledBackTo: null, error: reset.stderr };
  }
  // ikut bersihkan untracked biar state persis ke commit tujuan
  await runGit(["clean", "-fd"], cwd);
  return { ok: true, rolledBackTo: ref };
}

export interface CleanResult {
  ok: boolean;
  removedTags: number;
  removedStashes: number;
  error?: string;
}

// Hapus semua tag + stash backup (wtf-bro-backup-*). Save point (wtf-bro-save-*)
// TIDAK disentuh — itu posisi aman user yang mungkin masih butuh.
export async function cleanBackups(cwd: string): Promise<CleanResult> {
  // 1. hapus semua tag backup
  const list = await runGit(["tag", "-l", "wtf-bro-backup-*"], cwd);
  const tags = list.ok
    ? list.stdout.split("\n").map((t) => t.trim()).filter(Boolean)
    : [];
  for (const t of tags) {
    await runGit(["tag", "-d", t], cwd);
  }

  // 2. hapus stash backup, satu per satu (BUKAN stash clear — itu hapus stash user lain)
  const stashes = await runGit(["stash", "list"], cwd);
  let removed = 0;
  if (stashes.ok) {
    // format: stash@{0}: On main: wtf-bro-backup-<ts>
    for (const line of stashes.stdout.split("\n")) {
      if (line.includes("wtf-bro-backup")) {
        const ref = line.split(":")[0].trim();
        await runGit(["stash", "drop", ref], cwd);
        removed++;
      }
    }
  }

  return { ok: true, removedTags: tags.length, removedStashes: removed };
}
