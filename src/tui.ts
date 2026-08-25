// tui.ts — interactive flow pake @clack/prompts
import * as p from "@clack/prompts";
import pc from "picocolors";

export type RollbackChoice = 1 | 3 | "nuclear";

// Header visual biar terasa "panic mode tool".
export function showHeader(): void {
  p.intro(
    `${pc.bold(pc.bgRed(" wtf-bro "))} ${pc.dim("by harikahono — What The Fix")}`,
  );
}

// Minta user pilih level rollback.
export async function chooseRollback(
  maxCommit: number,
): Promise<RollbackChoice | "cancel"> {
  const options: { value: string; label: string; hint?: string }[] = [];
  if (maxCommit >= 1) {
    options.push({ value: "1", label: "Rollback 1 commit", hint: "undo kerusakan terakhir" });
  }
  if (maxCommit >= 3) {
    options.push({ value: "3", label: "Rollback 3 commits", hint: "lebih dalam" });
  }
  options.push({
    value: "nuclear",
    label: "Nuklir (reset + clean)",
    hint: pc.red("IREVERSIBEL — butuh konfirmasi ekstra"),
  });

  const res = await p.select({
    message: "Pilih level rollback:",
    options,
  });

  if (p.isCancel(res)) return "cancel";
  return res as RollbackChoice;
}

// Konfirmasi nuklir: user harus ketik ulang nama branch (bukan cuma Y/n).
// Ini wajib karena aksi ireversibel via git biasa.
export async function confirmNuclear(branch: string): Promise<boolean> {
  const res = await p.text({
    message: `⚠️  Reset nuklir menghapus semua perubahan yang belum di-commit. Ketik "${branch}" untuk konfirmasi:`,
    validate: (v) =>
      v.trim() !== branch
        ? pc.red("Nama ga cocok. Ketik persis nama branch.")
        : undefined,
  });
  if (p.isCancel(res)) return false;
  return res.trim() === branch;
}

// Info bahwa commit ga cukup untuk opsi tertentu.
export function warnCommitLimit(available: number): void {
  p.log.warn(
    pc.yellow(
      `Repo ini cuma punya ${available} commit — ga bisa rollback lebih dari itu.`,
    ),
  );
}

// Output sukses: kasih tau tag backup biar user tau cara recover.
export function showBackupInfo(tag: string | null, stash: string | null): void {
  if (tag) p.log.success(`Backup tag dibuat: ${pc.bold(tag)}`);
  if (stash) p.log.success(`Backup stash dibuat: ${pc.bold(stash)}`);
  p.log.info(
    pc.dim("Kalau salah, restore pake: git checkout " + (tag ?? "<tag>")),
  );
}

// Output error.
export function showError(msg: string): void {
  p.log.error(pc.red(msg));
}

// Penutup.
export function showOutro(): void {
  p.outro(pc.green("Beres. Codebase lu udah di-undo."));
}
