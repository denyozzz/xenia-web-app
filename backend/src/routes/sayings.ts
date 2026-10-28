import type { FastifyInstance } from "fastify";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

/** Moegliche Orte der optionalen Datei sprueche.txt (neben der Datenbank im Datenordner). */
function candidates(): string[] {
  const list: string[] = [];
  if (process.env.SAYINGS_FILE) list.push(process.env.SAYINGS_FILE);
  for (const v of Object.values(process.env)) {
    if (v && isAbsolute(v) && /\.(db|sqlite3?)$/i.test(v)) list.push(join(dirname(v), "sprueche.txt"));
  }
  list.push(join(process.cwd(), "data", "sprueche.txt"), "/data/sprueche.txt", "/app/data/sprueche.txt", join(process.cwd(), "sprueche.txt"));
  return list;
}

export function registerSayingsRoutes(app: FastifyInstance): void {
  app.get("/api/sayings", async () => {
    for (const f of candidates()) {
      try {
        if (!existsSync(f)) continue;
        const lines = readFileSync(f, "utf-8")
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l !== "" && !l.startsWith("#") && l.length <= 200)
          .slice(0, 5000); // Patch 129: vorher 1000
        return { lines, source: f };
      } catch { /* naechster Kandidat */ }
    }
    return { lines: [] as string[], source: null as string | null };
  });
}
