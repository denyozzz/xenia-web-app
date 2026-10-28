import { useCallback, useEffect, useState } from "react";

export interface CareReminder {
  id: string;
  title: string;
  hint: string;
  /** true = Wartungsprofile waehlbar, deren Lauf als erledigt zaehlt. */
  auto: boolean;
  enabled: boolean;
  intervalDays: number;
  profileIds: number[];
  lastAt: number;
  daysAgo: number;
  due: boolean;
  dueInDays: number;
}

export interface CareReminderPatch { enabled?: boolean; intervalDays?: number; profileIds?: number[] }

/** Pflege-Erinnerungen (GET /api/care-reminders); laedt neu beim Start und wenn die Seite wieder aktiv wird. */
export function useCareReminders(): {
  items: CareReminder[];
  refetch: () => Promise<void>;
  done: (id: string) => Promise<void>;
  snooze: (id: string) => Promise<void>;
  update: (id: string, patch: CareReminderPatch) => Promise<boolean>;
} {
  const [items, setItems] = useState<CareReminder[]>([]);

  const refetch = useCallback(async () => {
    try {
      const r = await fetch("/api/care-reminders");
      if (r.ok) setItems(((await r.json()) as { items: CareReminder[] }).items);
    } catch {
      // nicht schlimm - dann fehlt nur der Banner
    }
  }, []);

  useEffect(() => {
    void refetch();
    const onActive = () => { void refetch(); };
    window.addEventListener("focus", onActive);
    document.addEventListener("visibilitychange", onActive);
    return () => {
      window.removeEventListener("focus", onActive);
      document.removeEventListener("visibilitychange", onActive);
    };
  }, [refetch]);

  const post = useCallback(async (id: string, what: "done" | "snooze") => {
    await fetch(`/api/care-reminders/${encodeURIComponent(id)}/${what}`, { method: "POST" });
    await refetch();
  }, [refetch]);

  const update = useCallback(async (id: string, patch: CareReminderPatch) => {
    try {
      const r = await fetch(`/api/care-reminders/${encodeURIComponent(id)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      await refetch();
      return r.ok;
    } catch { return false; }
  }, [refetch]);

  return { items, refetch, done: (id) => post(id, "done"), snooze: (id) => post(id, "snooze"), update };
}
