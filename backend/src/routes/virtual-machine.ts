/**
 * Virtuelle Maschine: der Mock-Server (backend/mock/server.ts, Port 3099) als Ersatz fuer die echte Xenia.
 *
 * GET /api/machine/virtual            -> { ok, active }
 * PUT /api/machine/virtual { on }     -> Mock starten/beenden und den gemeinsamen Client umschalten
 *
 * Die echte Adresse bleibt als machine_ip_real gespeichert. Der Mock haelt seinen Zustand nur im
 * Speicher. Waehrend eines Bezugs wird nicht umgeschaltet.
 */

import type { FastifyInstance } from "fastify";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { getDb } from "../db/index.js";

export interface VirtualMachineDeps {
  client: { readonly host: string; setHost(host: string): void };
  settings: { get(key: string): string | null | undefined; set(key: string, value: string): void };
  isBrewing: () => boolean;
  log: (msg: string) => void;
}

const MOCK_ADDR = "127.0.0.1:3099";
let mock: ChildProcess | null = null;

function startMock(): ChildProcess {
  const tsx = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  const child = spawn(tsx, ["mock/server.ts"], { cwd: process.cwd(), stdio: "ignore" });
  child.on("exit", () => { if (mock === child) mock = null; });
  child.on("error", () => { if (mock === child) mock = null; });
  return child;
}

function stopMock(): void {
  if (mock) { mock.kill(); mock = null; }
}

async function waitForMock(): Promise<boolean> {
  for (let n = 0; n < 40; n++) {
    try {
      const r = await fetch(`http://${MOCK_ADDR}/api/v2/machine`);
      if (r.ok) return true;
    } catch { /* noch nicht oben */ }
    await new Promise((res) => setTimeout(res, 500));
  }
  return false;
}

export function registerVirtualMachineRoute(app: FastifyInstance, deps: VirtualMachineDeps): void {
  const active = () => deps.settings.get("virtual_machine") === "true";
  process.on("exit", () => { if (mock) mock.kill(); });

  // Nach einem Neustart im virtuellen Modus den Mock wieder starten (die Adresse steht schon in machine_ip).
  if (active()) {
    mock = startMock();
    deps.log("Virtuelle Maschine: Mock nach Neustart wieder gestartet");
  }

  app.get("/api/machine/virtual", async () => ({ ok: true, active: active() }));

  app.put("/api/machine/virtual", async (req, reply) => {
    const body = req.body as { on?: unknown } | undefined;
    if (typeof body?.on !== "boolean") { reply.status(400); return { ok: false, error: "on (true/false) fehlt" }; }
    if (deps.isBrewing()) { reply.status(409); return { ok: false, error: "Während eines Bezugs lässt sich nicht umschalten" }; }

    if (body.on) {
      if (active() && mock) return { ok: true, active: true };
      if (!active()) {
        // Grenze merken: alles, was danach entsteht, wird beim Zurueckschalten geloescht.
        const m = getDb().prepare("SELECT COALESCE(MAX(id), 0) AS m FROM shot").get() as { m: number };
        deps.settings.set("virtual_shot_baseline", String(m.m));
      }
      if (deps.client.host !== MOCK_ADDR) deps.settings.set("machine_ip_real", deps.client.host);
      if (!mock) mock = startMock();
      if (!(await waitForMock())) {
        stopMock();
        reply.status(502);
        return { ok: false, error: "Der Mock-Server ist nicht angesprungen" };
      }
      const from = deps.client.host;
      deps.settings.set("machine_ip", MOCK_ADDR);
      deps.settings.set("virtual_machine", "true");
      deps.client.setHost(MOCK_ADDR);
      deps.log(`Virtuelle Maschine an: ${from} → ${MOCK_ADDR}`);
      return { ok: true, active: true };
    }

    const real = deps.settings.get("machine_ip_real") ?? process.env.MACHINE_IP ?? null;
    if (!real) { reply.status(400); return { ok: false, error: "Keine echte Adresse gespeichert" }; }
    deps.settings.set("machine_ip", real);
    deps.settings.set("virtual_machine", "false");
    deps.client.setHost(real);
    stopMock();
    // Bezuege aus dem virtuellen Modus entfernen (Messkurven und Bewertungen folgen per CASCADE).
    let removed = 0;
    const raw = deps.settings.get("virtual_shot_baseline");
    const base = raw ? Number(raw) : NaN;
    if (Number.isFinite(base)) {
      getDb().exec("PRAGMA foreign_keys = ON");
      removed = Number(getDb().prepare("DELETE FROM shot WHERE id > ?").run(base).changes);
      deps.settings.set("virtual_shot_baseline", "");
    }
    deps.log(`Virtuelle Maschine aus: zurück auf ${real}, ${removed} Bezüge entfernt`);
    return { ok: true, active: false, removed };
  });
}
