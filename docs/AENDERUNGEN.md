# Änderungen im Fork (neueste oben)

Fork von [fhold/xenia-web-app](https://github.com/fhold/xenia-web-app), Stand des Originals: v0.2.0.

## 2026-10-31
- **Profile entdecken:** Auf der Profilseite öffentliche Bezüge auf visualizer.coffee mit Profil-, Röster-, Bohnen-, Mühlen- und Bewertungsfilter suchen und Decent-Profile über den vorhandenen Import übernehmen. Aktive eigene Bohnen, nach Röstgrad gruppierte Schnellknöpfe, lokale Ratiofilter und Sortierung erleichtern die Auswahl; ausgewählte Profile und Bohnen werden markiert, Filter lassen sich gemeinsam zurücksetzen, Autorenlinks führen zum Originalbezug und nicht importierbare Bezüge werden dauerhaft gemerkt und ausgeblendet. Gaggiuino-Profile werden verständlich abgelehnt. Suche angelehnt an [Xenios](https://github.com/TimS1998/Xenios) (Apache-2.0; LICENSE nennt keinen Copyright-Inhaber).
  Dateien: .vscode/settings.json, README.md, backend/src/index.ts, backend/src/routes/community.ts, backend/test/community.test.ts, frontend/src/components/ProfileDiscoveryDialog.tsx, frontend/src/views/Profiles.tsx
- **Mond-Knopf öffnet Info-Fenster:** Hell/Dunkel umschalten, Schalterbelegung der Maschine (nur Anzeige) und Rezept-Links; Titel verlinkt auf die Weboberfläche der Maschine.
  Dateien: frontend/src/components/ThemeFab.tsx, frontend/src/switchConfig.ts, frontend/src/views/Switches.tsx

## 2026-10-30
- **Dank an Beanconqueror** im QR-Fenster. (Patch 146)
- **QR-Code live scannen** mit der Kamera (nur über HTTPS). (Patch 143)
- **QR-Erkennung im Foto verbessert**, Knopf „Bild wählen“ für Screenshots. (Patch 142)
- **Neue Bohne per Beanconqueror-QR-Code** von der Tüte: Name, Rösterei, Röstgrad, Herkunft, Aromen, Röstdatum, Foto des Rösters. Mit freundlicher Genehmigung des Beanconqueror-Entwicklers. (Patch 141)
- **Eco-/Aus-Zeiten** werden bei jedem Zustandswechsel neu von der Maschine gelesen. (Patch 140)
- **README** mit deutschem Abschnitt zum Fork und Docker-Installation. (Patch 139)
- **Eco-/Aus-Anzeige zählt auf dem Server** statt im Browser – stimmt nach Neustart und auf allen Geräten. (Patch 138)
- **Spruch im Experten-Dashboard** immer einzeilig, verschiebt die Ansicht nicht mehr. (Patch 137)
- **Original v0.2.0 übernommen** (Druckregler mit Vorhalt, Soll-Kurve live, Decent-Import). Best-Brew-Stern entfällt wie im Original.

## Bis 2026-10-29 (Patches 1–136, nach Themen)
- **Dashboard:** einfache und Experten-Ansicht; Bohnen statt Profile im Mittelpunkt, gruppiert nach hell/dunkel, Startknöpfe je Variante; Uhr mit Eco-/Aus-Restzeit; Sprüche (optional eigene Datei `data/sprueche.txt`).
- **Bohnen:** bevorzugtes Profil, Dosis und Ratio je Bohne, Röstgrad hell/mittel/dunkel, Arabica/Robusta-Anteil, Röstereien zur Auswahl, Filter nach Röstgrad; Bohnenseite mit aufklappbaren Bezügen je Profil und Sieb (Zeit Ist/Soll, Mahlgrad, Dosis samt Bewertung).
- **Siebe und Varianten:** Single/Double/Triple mit Zielmenge, Nenndosis und Variantennamen; neues Sieb legt Varianten in Profilen mit an; Varianten je Bohne ein-/ausblendbar.
- **Start-Dialog:** vorausgefüllt; Mahlgrad-Empfehlung aus den letzten Bezügen (mit Zeitbasis bei Gewichtsstopp); Dosis-Empfehlung; Dosis, Yield und Temperatur antippbar; Profil für einen Bezug wechselbar; Rückfrage „Dosis für diese Bohne übernehmen?“.
- **Bewertung:** Mahlgrad und Dosis (weniger/passt/mehr) fließen in die nächste Empfehlung; Notiz des letzten gleichen Bezugs im Start-Dialog.
- **Pflege-Erinnerungen:** Rückspülen mit/ohne Fettlöser im Takt, Duschsieb; Wartungslauf wird erkannt.
- **Maschine:** Einschalten mit/ohne Dampfboiler, Aufwecken aus Eco in den vorherigen Zustand, Schalter-Seite für die Tastenbelegung, Signal-Timer je Profil, Farbanzeige Dampfdruck.
- **Virtuelle Maschine** zum gefahrlosen Ausprobieren (Testbezüge werden beim Abschalten entfernt).
- **Verlauf:** Schnellfilter nach aktiven Bohnen und Sieb.
- **Tablet/PWA:** Vollbild auf Android, Batterieanzeige, Hell/Dunkel mit Farbschemata.
- **Build:** `.dockerignore`, Docker-Compose-Betrieb.
