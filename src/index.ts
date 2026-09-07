// index.ts — entrypoint CLI
import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  createBackup,
  getRepoInfo,
  performRollback,
  getCurrentBranch,
  listModifiedFiles,
  createSavePoint,
  undoToSavePoint,
  revertUncommitted,
  resetToCommit,
  cleanBackups,
  listSavePoints,
  doctor,
  runGit,
  refExists,
} from "./git.js";
import {
  showHeader,
  chooseRollback,
  confirmNuclear,
  warnCommitLimit,
  showBackupInfo,
  showError,
  showOutro,
} from "./tui.js";
import {
  appendHistory,
  readHistory,
  getHistoryFile,
  type HistoryEntry,
} from "./history.js";

const CWD = process.cwd();

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function cmdLog(): void {
  const history = readHistory();
  if (history.length === 0) {
    console.log(pc.dim("Belum ada riwayat rollback."));
    return;
  }
  console.log(pc.bold("Riwayat rollback wtf-bro:"));
  for (const e of history) {
    const status = e.ok ? pc.green("OK") : pc.red("FAIL");
    console.log(
      `  ${pc.dim(e.timestamp)} ${status} [${e.type}] ${pc.dim(e.cwd)} tag=${e.tagName ?? "-"} ${e.error ? pc.red(e.error) : ""}`,
    );
  }
  console.log(pc.dim(`\nFile: ${getHistoryFile()}`));
}

// wtf steps — list semua save point (checkpoint)
async function cmdSteps(): Promise<void> {
  const info = await getRepoInfo(CWD);
  if (!info.isRepo) {
    showError("Ga ketemu repo git di folder ini.");
    return;
  }
  const points = await listSavePoints(CWD);
  if (process.argv.includes("--json")) {
    // Output JSON array for agent-friendly consumption
    console.log(JSON.stringify(points, null, 2));
    return;
  }
  if (points.length === 0) {
    p.log.info(pc.dim("Belum ada save point. Pakai: wtf save [label]"));
    return;
  }
  console.log(pc.bold("Save points (checkpoint):"));
  points.forEach((pt, i) => {
    // ts ISO '2026-08-25T19-23-38-948Z' -> tanggal + jam baca
    const readable = pt.ts.replace(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2}).*/, "$1 $2:$3");
    console.log(
      `  ${pc.dim(`[${i + 1}]`)} ${pc.green(pt.label)}  ${pc.dim(readable)}  ${pc.dim(pt.tagName)}`,
    );
  });
  console.log(pc.dim(`\nBalik ke salah satu: wtf undo <label>`));
}

// wtf save [label] — tandain posisi aman
async function cmdSave(label: string): Promise<void> {
  const info = await getRepoInfo(CWD);
  if (!info.isRepo) {
    showError("Ga ketemu repo git di folder ini.");
    return;
  }
  const ts = timestamp();
  const save = await createSavePoint(CWD, label || "default", ts);
  if (!save.ok) {
    showError(`Gagal save: ${save.error}`);
    return;
  }
  p.log.success(
    `Save point dibuat: ${pc.bold(save.tagName ?? "")}` +
      (save.stashName ? ` (WIP lu di-stash: ${save.stashName})` : ""),
  );
  p.log.info(pc.dim("Kalau AI ngaco, tinggal jalanin: wtf undo"));
}

// wtf undo [commit] — balik ke save point, atau ke commit tertentu
async function cmdUndo(ref?: string): Promise<void> {
  const info = await getRepoInfo(CWD);
  if (!info.isRepo) {
    showError("Ga ketemu repo git di folder ini.");
    return;
  }
  const ts = timestamp();

  // Safety net: backup dulu (stash + tag) biar mess AI ga ilang permanen
  const backup = await createBackup(CWD, ts);
  if (!backup.ok) {
    showError(`Gagal backup: ${backup.error}. Aksi dibatalkan.`);
    return;
  }

  let result;
  let type: HistoryEntry["type"] = "rollback1";
  if (ref) {
    // coba save point by label dulu; kalau ga ada, anggap ref git biasa (hash/branch/tag)
    const save = await undoToSavePoint(CWD, ref);
    if (save.ok) {
      result = save;
    } else if (!(await refExists(CWD, ref))) {
      // label ga ada + ref git ga valid -> pesan jelas, jangan lempar raw git stderr
      result = {
        ok: false,
        rolledBackTo: null,
        error: `Ga nemu save point label "${ref}" atau git ref "${ref}".\nCek save point: wtf steps\nCek commit: git log --oneline`,
      };
      type = "rollback3"; // marker umum buat undo ke commit tertentu
    } else {
      result = await resetToCommit(CWD, ref);
      type = "rollback3"; // marker umum buat undo ke commit tertentu
    }
  } else {
    // smart: coba save point dulu, kalau ga ada -> revert uncommitted
    const save = await undoToSavePoint(CWD);
    if (save.ok) {
      result = save;
    } else {
      // ga ada save point: balikin working tree ke HEAD (bersihkan mess AI)
      const modified = await listModifiedFiles(CWD);
      if (modified.length === 0) {
        p.log.info(pc.dim("Udah bersih, ga ada yang perlu di-undo."));
        return;
      }
      result = await revertUncommitted(CWD);
    }
  }

  appendHistory({
    timestamp: ts,
    type,
    branch: info.branch,
    tagName: backup.tagName,
    stashName: backup.stashName,
    cwd: CWD,
    ok: result.ok,
    error: result.error,
  });

  if (!result.ok) {
    showError(`Undo gagal: ${result.error}`);
    p.cancel(pc.red(`Restore dari backup: git checkout ${backup.tagName}`));
    return;
  }
  p.log.success(
    ref
      ? `Balik ke commit ${pc.bold(ref)}`
      : `Balik ke posisi aman (${pc.bold(result.rolledBackTo ?? "HEAD")})`,
  );
  p.log.info(pc.dim(`Backup: ${backup.tagName}`));
}

// wtf --reset N | wtf --reset nuclear
async function cmdReset(arg: string): Promise<void> {
  const info = await getRepoInfo(CWD);
  if (!info.isRepo) {
    showError("Ga ketemu repo git di folder ini.");
    return;
  }
  if (info.detachedHead) {
    showError("Lu di detached HEAD. Checkout ke branch dulu.");
    return;
  }
  const ts = timestamp();

  const nuclear = arg === "nuclear";
  const count = nuclear ? 0 : parseInt(arg, 10);
  if (!nuclear && (isNaN(count) || count < 1)) {
    showError("Pakai: wtf --reset 1 | wtf --reset 3 | wtf --reset nuclear");
    return;
  }
  const entryType: HistoryEntry["type"] = nuclear ? "nuclear" : (`rollback${count}` as HistoryEntry["type"]);

  if (!nuclear && count > info.commitCount) {
    warnCommitLimit(info.commitCount);
    return;
  }

  const backup = await createBackup(CWD, ts);
  if (!backup.ok) {
    showError(`Gagal backup: ${backup.error}.`);
    return;
  }
  showBackupInfo(backup.tagName, backup.stashName);

  const rollback = await performRollback(CWD, count);
  appendHistory({
    timestamp: ts,
    type: entryType,
    branch: info.branch,
    tagName: backup.tagName,
    stashName: backup.stashName,
    cwd: CWD,
    ok: rollback.ok,
    error: rollback.error,
  });
  if (!rollback.ok) {
    showError(`Reset gagal: ${rollback.error}`);
    return;
  }
  showOutro();
}

// wtf clean-backups — bersihin tag/stash backup lama, save point aman
async function cmdCleanBackups(): Promise<void> {
  const info = await getRepoInfo(CWD);
  if (!info.isRepo) {
    showError("Ga ketemu repo git di folder ini.");
    return;
  }
  const res = await cleanBackups(CWD);
  if (!res.ok) {
    showError(`Gagal bersihin backup: ${res.error}`);
    return;
  }
  p.log.success(
    `Beres. Hapus ${pc.bold(String(res.removedTags))} tag + ${pc.bold(String(res.removedStashes))} stash backup.`,
  );
  p.log.info(pc.dim("Save point (wtf-bro-save-*) ga disentuh."));
}

// wtf doctor — cek kondisi repo + hitung save point & backup
async function cmdDoctor(): Promise<void> {
  const info = await doctor(CWD);
  // JSON dulu — agar tidak kena TTY initialization di test
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(info, null, 2));
    return;
  }
  if (!info.isRepo) {
    showError("Ga ketemu repo git di folder ini.");
    return;
  }
  console.log(pc.bold("wtf-bro doctor:"));
  console.log(`  ${pc.dim("Repo")}     ${pc.green("√")} ${CWD}`);
  console.log(`  ${pc.dim("Branch")}   ${info.branch ?? pc.red("detached HEAD")}`);
  console.log(`  ${pc.dim("Detached")}  ${info.detachedHead ? pc.yellow("yes") : pc.green("no")}`);
  console.log(`  ${pc.dim("Commits")}   ${info.commitCount}`);
  console.log(`  ${pc.dim("Save points")} ${info.savePointCount}`);
  console.log(`  ${pc.dim("Backups")}    ${info.backupCount}`);
  if (info.savePointCount === 0) {
    p.log.info(pc.dim("Belum ada save point. Pakai: wtf save [label]"));
  }
  if (info.backupCount > 10) {
    p.log.warn(pc.yellow(`Backup banyak (${info.backupCount}). Bersihin: wtf clean-backups`));
  }
}

async function main(): Promise<void> {
  const sub = process.argv[2];
  const arg = process.argv[3];

  if (sub === "log") {
    cmdLog();
    return;
  }
  if (sub === "save") {
    await cmdSave(arg ?? "default");
    return;
  }
  if (sub === "steps") {
    await cmdSteps();
    return;
  }
  if (sub === "undo") {
    await cmdUndo(arg); // arg = commit ref opsional
    return;
  }
  if (sub === "clean-backups") {
    await cmdCleanBackups();
    return;
  }
  if (sub === "doctor") {
    await cmdDoctor();
    return;
  }
  if (sub === "--reset" && arg) {
    await cmdReset(arg);
    return;
  }

  // Interactive TUI (default)
  showHeader();
  const info = await getRepoInfo(CWD);
  if (!info.isRepo) {
    showError("Ga ketemu repo git di folder ini. Jalanin dari dalam repo.");
    return;
  }
  if (info.detachedHead) {
    showError(
      "Lu lagi di detached HEAD. Rollback di sini berisiko — checkout ke branch dulu (git checkout <branch>).",
    );
    return;
  }

  const choice = await chooseRollback(info.commitCount);
  if (choice === "cancel") {
    p.cancel("Batal.");
    return;
  }

  const count = choice === "nuclear" ? 0 : choice;
  const entryType: HistoryEntry["type"] =
    choice === "nuclear" ? "nuclear" : (`rollback${choice}` as HistoryEntry["type"]);

  if (choice === "nuclear") {
    const branch = (await getCurrentBranch(CWD)) ?? "unknown";
    const ok = await confirmNuclear(branch);
    if (!ok) {
      p.cancel("Nuklir dibatalkan. Aman.");
      return;
    }
  } else if (count > info.commitCount) {
    warnCommitLimit(info.commitCount);
    return;
  }

  const ts = timestamp();
  const backup = await createBackup(CWD, ts);
  if (!backup.ok) {
    showError(`Gagal bikin backup: ${backup.error}. Aksi dibatalkan.`);
    return;
  }
  showBackupInfo(backup.tagName, backup.stashName);

  const rollback = await performRollback(CWD, count);
  appendHistory({
    timestamp: ts,
    type: entryType,
    branch: info.branch,
    tagName: backup.tagName,
    stashName: backup.stashName,
    cwd: CWD,
    ok: rollback.ok,
    error: rollback.error,
  });
  if (!rollback.ok) {
    showError(`Rollback gagal: ${rollback.error}`);
    return;
  }
  showOutro();
}

main().catch((err) => {
  showError(err?.message ?? String(err));
  process.exitCode = 1;
});
