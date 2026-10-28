import type { FastifyInstance } from "fastify";

const KEYS = [
  "SWITCH_SET_LEFT_LEFT_0", "SWITCH_SET_LEFT_LEFT_1",
  "SWITCH_SET_RIGHT_LEFT_0", "SWITCH_SET_RIGHT_LEFT_1",
  "SWITCH_SET_RIGHT_RIGHT_0", "SWITCH_SET_RIGHT_RIGHT_1",
] as const;

const FIXED: { id: number; label: string }[] = [
  { id: 0, label: "keine" },
  { id: 1, label: "Espresso" },
  { id: 2, label: "Espresso endlos" },
  { id: 7, label: "einfacher Bezug" },
  { id: 8, label: "doppelter Bezug" },
];

interface SwitchClient {
  getSwitches(): Promise<Record<string, number>>;
  getMachineSettings(): Promise<Record<string, number>>;
  setSwitches(body: Record<string, string>): Promise<unknown>;
  scriptsList(): Promise<{ index_list: number[]; title_list: string[] }>;
}

async function options(client: SwitchClient) {
  const opts = [...FIXED];
  try {
    const s = await client.scriptsList();
    s.index_list.forEach((id, i) => opts.push({ id, label: s.title_list[i] ?? `Skript ${id}` }));
  } catch { /* nur feste Funktionen */ }
  return opts;
}

export function registerSwitchRoutes(app: FastifyInstance, client: SwitchClient): void {
  app.get("/api/switches", async (_req, reply) => {
    try {
      const raw = await client.getSwitches();
      const values: Record<string, number> = {};
      for (const k of KEYS) values[k] = Number(raw[k] ?? 0);
      const opts = await options(client);
      for (const k of KEYS) {
        if (!opts.some((o) => o.id === values[k])) opts.push({ id: values[k], label: `Funktion ${values[k]}` });
      }
      let ecoMin = 0;
      let powerdownMin = 0;
      try {
        const m = await client.getMachineSettings();
        ecoMin = Number(m.MA_SET_TIMER_ECO_MA) || 0;
        powerdownMin = Number(m.MA_SET_TIMER_POWERDOWN) || 0;
      } catch { /* ohne Zeiten */ }
      return { values, options: opts, ecoMin, powerdownMin };
    } catch (e) {
      return reply.code(502).send({ error: String(e) });
    }
  });

  app.put("/api/switches", async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const k of KEYS) {
      const n = Number(body[k]);
      if (!Number.isInteger(n) || n < 0 || n > 255) {
        return reply.code(400).send({ error: `Ungültiger Wert für ${k}` });
      }
      out[k] = String(n);
    }
    try {
      await client.setSwitches(out);
      return { ok: true };
    } catch (e) {
      return reply.code(502).send({ error: String(e) });
    }
  });
}
