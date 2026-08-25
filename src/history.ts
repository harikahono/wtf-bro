// history.ts — audit log lokal di ~/.wtf/history.json
// Simpan tiap rollback biar user bisa liat & restore dari tag backup.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface HistoryEntry {
  timestamp: string;
  type: "rollback1" | "rollback3" | "nuclear";
  branch: string | null;
  tagName: string | null;
  stashName: string | null;
  cwd: string;
  ok: boolean;
  error?: string;
}

// Path bisa di-override lewat env WTF_HOME (buat testing, biar ga polusi ~/.wtf).
const DIR = join(process.env.WTF_HOME ?? homedir(), ".wtf");
const FILE = join(DIR, "history.json");

export function getHistoryFile(): string {
  return FILE;
}

export function readHistory(): HistoryEntry[] {
  if (!existsSync(FILE)) return [];
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    // history korup -> jangan crash, mulai fresh
    return [];
  }
}

export function appendHistory(entry: HistoryEntry): void {
  mkdirSync(DIR, { recursive: true });
  const history = readHistory();
  history.push(entry);
  writeFileSync(FILE, JSON.stringify(history, null, 2));
}
