/**
 * Force re-analysis on every completed document.
 *
 * Usage:
 *   API_BASE=http://localhost:8085 SESSION_COOKIE="connect.sid=..." \
 *     pnpm --filter @workspace/scripts tsx ./src/reanalyse-all.ts
 *
 * SESSION_COOKIE: copy from browser DevTools → Application → Cookies.
 * Paste the full "Name=Value" string, e.g. "connect.sid=s%3Axxx..."
 */

const API_BASE = process.env.API_BASE ?? "http://localhost:3000";
const SESSION_COOKIE = process.env.SESSION_COOKIE ?? "";

if (!SESSION_COOKIE) {
  console.error("SESSION_COOKIE is required. Copy it from your browser DevTools.");
  process.exit(1);
}

const headers: Record<string, string> = {
  "Content-Type": "application/json",
  Cookie: SESSION_COOKIE,
};

async function listDocuments(): Promise<{ id: number; title: string; status: string }[]> {
  const res = await fetch(`${API_BASE}/api/documents?limit=200`, { headers });
  if (!res.ok) throw new Error(`List failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { documents?: { id: number; title: string; status: string }[] };
  return data.documents ?? (data as any);
}

async function reanalyse(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/documents/${id}/analyse`, {
    method: "POST",
    headers,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}

async function main() {
  console.log(`Fetching documents from ${API_BASE}...`);
  const docs = await listDocuments();
  console.log(`Found ${docs.length} document(s).`);

  for (const doc of docs) {
    process.stdout.write(`  [${doc.id}] ${doc.title.slice(0, 60)} ... `);
    try {
      await reanalyse(doc.id);
      console.log("queued");
      // Space requests 2s apart so the server isn't slammed
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      console.log(`FAILED — ${(err as Error).message}`);
    }
  }

  console.log("\nDone. Analysis runs in the background — check the dashboard.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
