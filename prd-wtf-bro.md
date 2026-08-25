# Product Requirements Document (PRD): wtf-bro by harikahono

> Revisi dari draft awal — perbaikan utama: safety net sebelum destructive action, audit log wajib ada di MVP (bukan phase 2), dan package manager detection dinamis.

## 1. Executive Summary
**Product Name:** wtf-bro (What The Fix) by harikahono
**Target Audience:** *Vibecoder* awam yang panik saat AI agent (Claude Code, OpenCode, dll) merusak *codebase*.
**Objective:** Menyediakan tombol "Undo" global berbasis CLI buat rollback kerusakan yang ditinggalin AI agent di *working tree* Git — tanpa jadi sumber kehilangan data baru. *(Scope MVP murni Git — dangling process AI yang lupa dimatiin, env var yang keubah, dll di luar cakupan v1; dicatat eksplisit biar ga overselling ke komunitas.)*

**Catatan naming:** package name `wtf` & `wtf-cli` sudah taken di npm registry, jadi package name resmi = `wtf-bro`. Tapi bin command (yang diketik user di terminal) tetap **`wtf`**. Hasil verifikasi langsung ke registry npm:

* `wtf-bro` → **404/kosong**, AMAN buat dipakai. ✅
* `wtf` → taken (dimulai oleh `jden` di 2013, lalu `vdanchenkov` sejak v1.0.0 2016). PRD lama nyebut "ga pernah daftarin bin command" — **keliru**: sejak v1.0.0 package ini punya `bin/` folder di `files`-nya, meski ga ada bin command yang beneran terdaftar di `package.json` `bin` field. Jadi ga ada konflik bin di level npm dari package `wtf`.
* `wtf-cli` → taken, dan **mengekspos bin command `wtf`** (`bin: { "wtf": "index.js" }`). Ini konflik nyata di level bin command: kalau user install `wtf-cli` + `wtf-bro` global, keduanya berebut command `wtf`. Package `wtf-cli` sendiri udah mati (last update 2019), tapi tetap ke-register.

**Residual risk di level bin command `wtf`:**
1. `wtf-cli` (npm, mati sejak 2019) yang ekspos bin `wtf`
2. Utility jadul `wtf` di beberapa distro (via `apt`/`brew`, dari paket BSD games)

Keduanya dicatat di README sebagai known conflict, bukan blocker — `npm i -g wtf-bro` yang diinstall paling akhir bakal menang di level `node_modules/.bin`.

## 2. Core Architecture
* **Environment:** Node.js CLI (Cross-platform: MacOS, Linux, Windows).
* **Tech Stack:** TypeScript, `tsup` (Bundler), `@clack/prompts` (TUI), `cross-spawn` (Safe shell execution), `picocolors` (Styling).
* **Execution Command:** `wtf` (bin command, terdaftar di `package.json` meski package name-nya `wtf-bro` — lihat catatan naming di atas).

## 3. Key Features & Mechanism (MVP)

### 3.1 Interactive TUI (Panic Mode)
* Header visual "wtf-bro by harikahono" saat command dipanggil.
* Opsi tingkat *rollback*: 1 commit, 3 commit, atau reset nuklir.
* **Reset nuklir wajib pakai konfirmasi eksplisit** (user ketik ulang nama branch, bukan sekadar Y/n) — karena aksinya ireversibel via Git biasa.
* Kalau reflog/history commit-nya kurang dari opsi yang diminta (misal repo baru, cuma ada 1 commit), TUI kasih tau limitasinya, bukan diam-diam gagal.

### 3.2 Git Wrapper Engine — Safety-First
* Melakukan `git reset --hard` dan `git clean -fd` secara aman antar OS menggunakan `cross-spawn`.
* **Sebelum eksekusi destructive apa pun, auto-backup:**
  * `git stash push -u -m "wtf-bro-backup-<timestamp>"` — amankan untracked files yang bakal kehapus `git clean -fd`.
  * `git tag wtf-bro-backup-<timestamp>` — snapshot commit posisi saat ini, biar reset ke commit lama tetap recoverable.
* Backup ini yang bikin tool ini beda dari sekadar `git reset --hard` manual — kegagalan/salah pencet user ga berujung ke data loss permanen.

### 3.3 Package Manager Detection
* Deteksi lockfile (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`) sebelum kasih saran reinstall — jangan hardcode `npm ci`.
* Support dasar monorepo (deteksi workspace root vs subpackage).

### 3.4 Audit Log (masuk MVP, bukan phase 2)
* Simpan histori lokal di `~/.wtf/history.json`: timestamp, jenis rollback, tag backup yang dibuat, state sebelum/sesudah.
* Command tambahan `wtf log` buat lihat histori dan cara restore dari tag backup.

### 3.5 Save Point & Smart Undo (Panic Button)
Differentiator utama dari `git reset --hard` manual dan dari kompetitor yang cuma "rollback daemon":
* `wtf save [label]` — tandain posisi aman SEKARANG. Bikin tag `wtf-bro-save-<label>-<ts>` di HEAD. Kalau working tree kotor, WIP di-stash dulu (`wtf-bro-save-stash-<ts>`) biar ga ilang.
* `wtf undo` — cerdas:
  1. Kalau ada save point → `reset --hard` ke tag itu (lalu `clean -fd` biar untracked sampah AI ikut hilang).
  2. Kalau ga ada → balikin working tree ke HEAD via `git restore --staged --worktree .` + `git clean -fd`.
  3. Kalau udah bersih → bilang "ga ada yang perlu di-undo".
* `wtf undo <commit>` — rollback ke commit tertentu (hash/branch/tag) pakai `git reset --hard <ref>` + `clean -fd`.
* Semua aksi destructive di-precede sama auto-backup (tag + stash) — data ga ilang permanen.

### 3.6 Testing Requirement
* E2E test suite wajib sebelum v1.0, cover minimal:
  * Dirty working tree (staged + unstaged campuran)
  * Repo tanpa commit / commit tunggal
  * Detached HEAD
  * Repo dengan submodule
  * Nested git repo

### 3.7 Competitive Landscape (riset 2026)
Tool serupa yang dihindari / diferensiasi:
* **`agent-undo` (Meshelator)** — daemon yang patrol file AI ubah, auto-revert + pause agent. Kita TIDAK pakai daemon/surveillance; `wtf-bro` adalah tombol manual yang user tekan pas panik. Lebih simpel, ga butuh background process.
* **`agent-rollback` / `agent-rollback-mcp`** — MCP server buat AI rollback diri sendiri. Kita fokus ke *user* (vibecoder), bukan ke AI.
* **`Regent`** — framework agentic software engineering. Out of scope (terlalu berat).

Posisi `wtf-bro`: **panic button lokal, zero-daemon, npx-tanpa-install**, beda dari pendekatan "surveillance/daemon" kompetitor.

### 3.8 Batas Kemampuan (Jujur, jangan oversell)
* **Butuh commit atau `wtf save` buat full undo.** File baru yang BELUM PERNAH di-commit ga punya referensi Git → ga bisa dibalik. Solusi: `wtf save` (atau commit) SEBELUM biarin AI ngubah. Ini dikomunikasikan eksplisit ke user (bukan hidden limitation).
* `wtf undo` tanpa arg cuma membatalkan perubahan *uncommitted*. Buat loncat ke commit lampau → `wtf undo <commit>` / `wtf --reset N`.
* Semua aksi destructive di-backup otomatis; pesan restore selalu ditampilkan.

## 4. Phase 2 (Post-MVP) — Smart Context Hooks
* Deteksi perubahan `package.json` → saran reinstall sesuai package manager terdeteksi (bukan hardcode `npm ci`).
* Deteksi ORM *schema drift* (`prisma/schema.prisma`) → peringatan risiko *database* lokal.
* **Baru:** kalau project punya `AGENTS.md` / `ARCHITECTURE.md` / `DECISIONS.md` / `.agent-context/`, hooks baca file itu buat kasih warning kontekstual — misal "AI barusan ubah file yang direferensikan di ARCHITECTURE.md, cek ulang sebelum lanjut." Ini differentiator dibanding generic git reset wrapper.

## 5. Out of Scope (Batasan MVP)
* Sistem lokalisasi bahasa (i18n). UI dikunci dalam bahasa Inggris/Slang secara *hardcoded* demi kecepatan rilis.
* Desktop Widget (Tauri) atau VSCode Extension. MVP murni beroperasi via Terminal/CLI.

## 6. Distribution & Non-Functional Requirements
* **Install method:** `npx wtf-bro` sebagai jalur utama — cocok buat skenario panik (ga perlu install dulu sebelum "kebakaran"), delay download `npx` pertama kali diterima sebagai trade-off. `npm i -g wtf-bro` tetap didukung buat yang mau command instan tanpa delay.
* **Cold start target:** TUI harus kebuka <500ms dari command diketik. Tool panic-mode yang lemot bukanya kontradiktif sama value proposition-nya — kalau ga kecapai, evaluasi ulang dependency TUI-nya.

## 7. Open Decisions
* ~~Alias command yang lebih pendek/netral~~ — **Resolved:** bin command = `wtf` (package name tetap `wtf-bro`, dicek aman ga collision di npm registry, cuma perlu disclaimer README soal `apt`/`brew` legacy utility).
* ~~Apakah backup tag/stash di-auto-cleanup setelah N hari, atau dibiarkan menumpuk~~ — **Resolved:** command manual `wtf clean-backups` (hapus SEMUA tag/stash `wtf-bro-backup-*`, save point `wtf-bro-save-*` TIDAK disentuh). Auto-cleanup waktu-berbasis (misal hapus yang lebih tua dari 30 hari) bisa jadi Phase 2 — YAGNI buat v1, manual lebih gampang diprediksi user.
