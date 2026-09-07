# wtf-bro (What The Fix) 🛟

**Tombol "Undo" global buat vibecoder yang panik** saat AI agent (Claude Code, OpenCode, dll) merusak codebase. CLI rollback berbasis Git yang **safety-first** — bukan sekadar `git reset --hard` manual.

Package name: **`wtf-bro`** · Bin command: **`wtf`**

## Kenapa beda dari `git reset --hard` biasa?

Sebelum aksi destructive, `wtf` otomatis backup state lu:
- **`git tag wtf-bro-backup-<ts>`** → snapshot commit posisi sekarang, biar reset ke commit lama tetap recoverable.
- **`git stash push -u`** → amankan untracked files yang bakal kehapus `git clean -fd`.

Jadi kalau salah pencet atau AI-nya ngaco, lu ga kehilangan data permanen.

## Install

Package `wtf-bro` terbit di **npm registry** — jadi bisa dipasang/dijalankan dari **semua package manager** (mereka semua pakai registry yang sama):

```bash
# ── Jalur "tanpa install" (cocok buat skenario panik — ga perlu install dulu) ──
npx wtf-bro            # npm
pnpm dlx wtf-bro       # pnpm
bunx wtf-bro           # bun
yarn dlx wtf-bro       # yarn

# ── Install global biar command instan ──
npm i -g wtf-bro       # npm
pnpm i -g wtf-bro      # pnpm
bun i -g wtf-bro       # bun
yarn global add wtf-bro
```

Catatan: `pnpm`/`bun` global kadang butuh `pnpm setup` / `bun setup` biar bin `wtf` masuk PATH. Jalur `dlx`/`bunx`/`npx` ga perlu itu. Runtime `wtf-bro` cuma butuh **Node ≥18 + git** — bebas dari package manager mana pun.

## Cara pakai

```bash
wtf                 # TUI interaktif: pilih level rollback (1 / 3 / nuklir)
wtf init            # pasang aturan AI ke AGENTS.md di folder ini (biar AI nurut pakai wtf)
wtf save [label]    # tandain posisi aman SEKARANG (panic button)
wtf steps           # list semua save point / checkpoint
wtf steps --json    # sama, output JSON (buat AI agent)
wtf undo            # balik ke save point terakhir, atau ke HEAD kalau ga ada
wtf undo <label>    # balik ke save point tertentu (mis. wtf undo before-ai)
wtf undo <commit>   # balik ke commit tertentu (hash / branch / tag)
wtf --reset 1       # rollback 1 commit (non-interaktif, tetap auto-backup)
wtf --reset 3       # rollback 3 commit
wtf --reset nuclear # reset + clean semua untracked
wtf clean-backups   # hapus tag+stash backup lama (save point aman)
wtf doctor          # cek kondisi repo: branch, save point & backup count
wtf doctor --json   # sama, output JSON (buat AI agent)
wtf log             # riwayat rollback + cara restore
```

> `wtf undo <x>` yang ga ketemu di save point MAUPUN git ref ngasih pesan jelas (bukan raw git error): `Ga nemu save point label "x" atau git ref "x". Cek save point: wtf steps / Cek commit: git log --oneline`.

Di TUI lu pilih:
- **Rollback 1 commit** — undo kerusakan terakhir
- **Rollback 3 commits** — lebih dalam
- **Nuklir (reset + clean)** — reset ke HEAD + hapus semua untracked. **Butuh konfirmasi ketik ulang nama branch** (bukan cuma Y/n), karena ireversibel via Git biasa.

### Save point = posisi aman buat dongo

`wtf save` bikin tag `wtf-bro-save-<label>-<ts>` di commit lu sekarang. Kalau working tree lagi kotor, WIP lu di-stash dulu biar ga ilang. Pas AI ngaco, tinggal `wtf undo` → balik persis ke posisi itu (termasuk hapus file sampah yang AI bikin).

Liat semua save point: `wtf steps` (kayak daftar checkpoint). Balik ke salah satu: `wtf undo <label>`.

`wtf undo` (tanpa arg) cerdas:
1. Kalau ada save point → balik ke situ.
2. Kalau ga ada → balikin working tree ke HEAD (bersihin mess AI).

## 🎮 Tutorial — skenario hidup sehari-hari

### Skenario 1: Sebelum biarin AI ngubah-ngubah (paling aman)
Bikin titik aman DULU, baru suruh AI kerja:
```bash
wtf save before-ai      # tandain posisi aman sekarang
# ... suruh AI ngoding ...
# ... AI ngaco? ...
wtf undo                # balik persis ke posisi aman
```

### Skenario 2: AI udah merusak, ga sempet save dulu
Kalau AI udah bikin kacau dan cuma ada perubahan yang **belum di-commit**:
```bash
wtf undo                # ga ada save point -> balikin ke HEAD, bersihin mess AI
```
Ini batalin semua perubahan file + hapus file baru yang AI bikin, terus balik ke commit terakhir yang bener.

### Skenario 3: Mau loncat ke kondisi lama
```bash
wtf undo <commit-hash>  # balik ke commit tertentu (bisa pake hash/branch/tag)
# atau
wtf --reset 1           # mundur 1 commit
wtf --reset 3           # mundur 3 commit
wtf --reset nuclear     # reset ke HEAD + hapus semua file untracked (hati-hati)
```

### Skenario 4: Salah pencet / rollback kebanyakan — RESTORE dari backup
Tenang. Semua aksi destructive di-backup otomatis (tag + stash). Gimana balikin:
```bash
# 1. Liat tag & stash backup yang terakhir dibikin
git tag | grep wtf-bro-backup
git stash list | grep wtf-bro-backup

# 2. Balik ke kondisi sebelum rollback (posisi commit-nya)
git reset --hard wtf-bro-backup-<ts>

# 3. Kalau ada file untracked yang ikut kehapus, pulihin dari stash
git stash apply wtf-bro-backup-<ts>     # atau: git stash pop
```
`wtf log` juga nampilin tag backup tiap aksi, biar gampang dicari.

### Kapan pakai apa (cheat sheet)
| Situasi | Command |
|---|---|
| Mau pasang aturan AI di project ini | `wtf init` |
| Mau amanin posisi sebelum AI kerja | `wtf save [label]` |
| Mau liat semua save point / checkpoint | `wtf steps` |
| AI ngaco, mau balik ke posisi aman | `wtf undo` |
| Mau balik ke save point tertentu | `wtf undo <label>` |
| Mau batalin semua perubahan yang belum di-commit | `wtf undo` |
| Mau mundur beberapa commit | `wtf --reset N` |
| Mau reset total + hapus file sampah | `wtf --reset nuclear` |
| Mau balik ke commit tertentu | `wtf undo <hash>` |
| Mau cek kondisi repo (branch, save point, backup) | `wtf doctor` |
| AI agent mau baca checkpoint/repo sebagai data | `wtf steps --json` / `wtf doctor --json` |
| Lupa abis ngapain, mau liat riwayat | `wtf log` |
| Salah pencet, mau balikin kondisi | `git reset --hard wtf-bro-backup-<ts>` |
| Backup tag/stash numpuk, mau bersihin | `wtf clean-backups` |

## 🤖 Buat AI Agent (pasang ini biar AI nurut pakai wtf)

Kalau project lu udah pasang `wtf-bro`, jalanin `wtf init` di folder project lu — aturan AI langsung ditulis ke `AGENTS.md` (kalau file-nya udah ada, aturannya ditambahkan, bukan ditimpa). Alternatif manual: copy `AGENTS.template.md` dari repo ini. AI kayak Claude Code / OpenCode baca file itu otomatis.

```md
## Safety: wtf-bro terpasang di repo ini

Tool `wtf` (package `wtf-bro`) adalah tombol Undo. Patuhi ini:

1. SEBELUM ubah kode: `wtf save step-<singkat>` (mis. `wtf save step-login`).
2. Tiap langkah yang BAGUS + working: `wtf save` lagi dengan label baru. Jangan timpa label lama — biar bisa mundur ke tengah, bukan cuma ke awal.
3. Buat baca checkpoint/repo sebagai data (jangan parse output manusia): `wtf steps --json`, `wtf doctor --json`.
4. JANGAN `git reset --hard` / `git clean -fd` sendiri. JANGAN `wtf undo` / `wtf --reset` sendiri tanpa disuruh user — undo itu keputusan user, tugas lu cuma nyiapin save point yang rapi.
```

Kenapa AI-nya yang harus save? Kalau cuma save 1x di awal, 5x jalan AI yang numpuk cuma bisa di-undo ke awal doang. Save per langkah bagus = bisa balik ke tengah (`wtf undo step-3`).

## ⚠️ Batas kemampuan (jujur)

- **Butuh commit atau `wtf save` buat full undo.** File baru yang belum PERNAH di-commit ga bisa dibalik — Git ga punya referensi ke dia. Solusinya: `wtf save` (atau commit) SEBELUM biarin AI ngubah-ubah, biar ada titik aman.
- `wtf undo` ke HEAD cuma membatalkan perubahan yang belum di-commit. Buat loncat ke commit lampau, pakai `wtf undo <commit>` atau `wtf --reset N`.
- Semua aksi destructive di-backup otomatis (tag + stash). Pesan restore selalu ditampilin — data lu ga ilang permanen.

## Fitur

- ✅ Auto-backup (tag + stash) sebelum tiap rollback
- ✅ Save point (`wtf save`) + smart undo (`wtf undo`) — tombol aman buat dongo
- ✅ `wtf init` — pasang aturan AI ke `AGENTS.md` (idempotent, ga nimpa isi lama)
- ✅ `wtf steps` — daftar checkpoint + undo by label (`wtf undo <label>`)
- ✅ `wtf doctor` — cek kondisi repo (branch, save point & backup count)
- ✅ `--json` di `wtf steps` & `wtf doctor` — output JSON buat AI agent
- ✅ Pesan jelas kalau `wtf undo <x>` ga ketemu di save point maupun git ref
- ✅ `wtf clean-backups` — bersihin tag/stash backup lama (save point aman)
- ✅ Audit log lokal di `~/.wtf/history.json`
- ✅ Konfirmasi ekstra buat reset nuklir (ketik ulang nama branch)
- ✅ Deteksi commit limit (repo baru ga bisa rollback 3)
- ✅ Deteksi detached HEAD (dicegah biar ga ngerusak)
- ✅ Deteksi package manager dari lockfile (npm/pnpm/yarn/bun)
- ✅ Cross-platform (MacOS, Linux, Windows)

## ⚠️ Known conflict bin command `wtf`

Bin command `wtf` bisa bentrok dengan:
1. **`wtf-cli`** (package npm lain, mati sejak 2019) yang juga ekspos bin `wtf`.
2. **Utility jadul `wtf`** di beberapa distro Linux/Mac (dari paket BSD games, via `apt`/`brew`).

Ini bukan blocker — `npm i -g wtf-bro` yang diinstall paling akhir bakal menang di `node_modules/.bin`. Tapi kalau nemu command `wtf` ngelakuin hal aneh, cek dulu apakah ada yang nge-override.

## Development

```bash
npm install
npm run build     # bundle ke dist/
npm test          # jalanin unit/E2E test (node:test + tsx)
npm run typecheck
```

## Tech Stack

Node.js + TypeScript + `tsup` (bundle) + `@clack/prompts` (TUI) + `cross-spawn` (safe shell exec) + `picocolors` (styling).

## License

MIT © harikahono
