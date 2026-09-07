// agents-template.ts — isi AGENTS.md yang ditulis `wtf init`.
// ponytail: single source di kode; AGENTS.template.md di root harus sama isinya (sync manual).
export const AGENTS_MARKER = "wtf-bro terpasang di repo ini";

export const AGENTS_TEMPLATE = `## Safety: wtf-bro terpasang di repo ini

Tool \`wtf\` (package \`wtf-bro\`) adalah tombol Undo. Patuhi ini:

1. SEBELUM ubah kode: \`wtf save step-<singkat>\` (mis. \`wtf save step-login\`).
2. Tiap langkah yang BAGUS + working: \`wtf save\` lagi dengan label baru. Jangan timpa label lama — biar bisa mundur ke tengah, bukan cuma ke awal.
3. Buat baca checkpoint/repo sebagai data (jangan parse output manusia): \`wtf steps --json\`, \`wtf doctor --json\`.
4. JANGAN \`git reset --hard\` / \`git clean -fd\` sendiri. JANGAN \`wtf undo\` / \`wtf --reset\` sendiri tanpa disuruh user — undo itu keputusan user, tugas lu cuma nyiapin save point yang rapi.
`;
