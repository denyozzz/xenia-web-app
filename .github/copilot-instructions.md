# Hinweise für Copilot (Fork denyozzz/xenia-web-app)

- Antworten und Texte in der Oberfläche auf Deutsch, knapp.
- Stack: TypeScript; Frontend React + Vite (frontend/), Backend Node 24 + Fastify + node:sqlite (backend/), gemeinsamer Code in shared/.
- Nach jeder Änderung prüfen:
  - Typen: im Ordner frontend/ bzw. backend/ `npx tsc --noEmit -p .` ausführen (nie im Hauptordner, dort ist TypeScript nicht installiert)
  - Tests: in backend/ `npm test`
- Kleine, gezielte Änderungen; bestehende Funktionen nicht umbauen, wenn nicht verlangt.
- Keine .bak-Dateien, nichts unter data/ anlegen oder ändern.
- Neue Funktionen im Code mit einem kurzen deutschen Kommentar erklären.
- Vor größeren Änderungen zuerst kurz den Plan und die betroffenen Dateien nennen.
- Nicht committen oder pushen – das macht der Nutzer selbst.

## Wo was liegt
- Startseite/Dashboard (einfach + Experte): frontend/src/views/Dashboard.tsx, Kopf mit Uhr: components/TopClock.tsx
- Schwebende Knöpfe unten rechts (Hell/Dunkel, Einfach/Experte): frontend/src/components/ThemeFab.tsx
- Seitenleiste/Menü: frontend/src/components/Sidebar.tsx; Seitenwechsel in frontend/src/App.tsx
- Seiten: views/Profiles.tsx, views/Beans.tsx (Bohnen), views/History.tsx (Verlauf), views/Settings.tsx, views/Switches.tsx (Schalterbelegung + Rezepte)
- Start-Dialog vor dem Bezug: components/PreShotDialog.tsx; Bewertung danach: components/RatingScreen.tsx
- Bohnen-Editor: components/CoffeeEditor.tsx; Bohnenseite „Mit diesen Profilen“: components/Network.tsx
- Profil-Editor: components/ProfileEditorView.tsx
- Server-Routen (API): backend/src/routes/*.ts, Start in backend/src/index.ts
- Pflege-Erinnerungen: backend/src/routes/care-reminders.ts, components/CareReminderSettings.tsx
- Nach jeder fertigen Änderung oben in docs/AENDERUNGEN.md einen Eintrag ergänzen: Datum, ein Satz was sich für den Nutzer ändert, betroffene Dateien. Keine privaten Adressen oder Namen.
- Hintergründe, Entscheidungen und verworfene Ideen stehen in docs/AENDERUNGEN-ausfuehrlich.txt – vor größeren Änderungen dort nachlesen.