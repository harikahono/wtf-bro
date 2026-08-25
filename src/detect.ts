// detect.ts — deteksi package manager dari lockfile yang ada.
// Ga hardcode npm ci; ikutin lockfile yang ketemu di project.

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "unknown";

const LOCKFILES: Record<string, PackageManager> = {
  "package-lock.json": "npm",
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "bun.lockb": "bun",
};

// Cari lockfile di cwd. Kembalikan package manager yang terdeteksi.
export function detectPackageManager(
  files: string[],
): { manager: PackageManager; lockfile: string | null } {
  for (const file of files) {
    const manager = LOCKFILES[file];
    if (manager) return { manager, lockfile: file };
  }
  return { manager: "unknown", lockfile: null };
}
