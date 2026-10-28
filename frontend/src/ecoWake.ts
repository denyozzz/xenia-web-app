/**
 * Eco-Modus beenden: die Maschine kommt in den Zustand VOR dem Eco zurueck (mit oder ohne Dampfboiler).
 * Der Dampfzustand wird laufend im Browser gemerkt (App.tsx), solange die Maschine heizt oder bereit ist.
 */
import type { MachineControlHook } from "./hooks/useMachineControl.js";

const KEY = "xenia_steam_before_eco";

export function rememberSteam(on: boolean): void {
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* ohne Speicher: Standard = mit Dampf */ }
}

export function steamBeforeEco(): boolean {
  try { return localStorage.getItem(KEY) !== "0"; } catch { return true; }
}

/** Beendet Eco; stellt den Dampfboiler danach so, wie er vor dem Eco war. Gibt eine Fehlermeldung zurueck oder null. */
export async function wakeFromEco(
  control: Pick<MachineControlHook, "setEco" | "setSteam">,
  steamNow: () => boolean,
): Promise<string | null> {
  const want = steamBeforeEco();
  const err = await control.setEco(false);
  if (err) return err;
  await new Promise((r) => setTimeout(r, 2000));
  if (steamNow() !== want) return control.setSteam(want);
  return null;
}
