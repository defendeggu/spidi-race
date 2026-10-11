# Changelog

Alle nennenswerten Änderungen an diesem Projekt. Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionierung nach [Semantic Versioning](https://semver.org/lang/de/).

## [0.6.0] – 2026-10-11

### Hinzugefügt
- **Offroad-Klasse** mit eigenen Strecken und Autos (getrennt von den Strassenwagen, auch für die KI)
  - **Canyon Run** (Wüste, ~2,6 km): Schotter- und Sandpiste durch eine rote Schlucht, 3 Sprünge (einer über ein trockenes Flussbett), Felsbogen
  - **Waldtrail** (Wald, ~2,8 km): Waldweg über Kuppen, 2 Schlammlöcher, Furt, Sprung über den Bach, Holzzäune, Camp
  - Autos: **Bergziege 4x4**, **Baron V8**, **Sahara Raider** (Kenney Car Kit: SUV, Luxus-SUV, Pickup)
- **Sprünge**: echte Flugphase mit Schwerkraft, Landung (harte Landungen kosten Tempo), Fahrzeug neigt sich entlang der Flugbahn, Meldung „SPRUNG! x,x s“
- **Untergründe** Asphalt, Schotter, Sand, Schlamm und Wasser mit eigenem Grip und Rollwiderstand; Offroad-Autos leiden nur halb so stark
- Optische Federung (Nachschwingen nach Landungen, Rütteln auf losem Untergrund), Staub-, Schlamm- und Wasserpartikel, Schottergeräusch
- Autoauswahl je nach Streckenklasse (Strassen- und Offroad-Auto werden pro Spieler gemerkt); im Netzwerk wählt man das Auto in der Lobby, der Server korrigiert unpassende Klassen
- Neue CC0-Assets: Kenney (SUVs, Pickup, Kakteen, Klippen, Baumstämme, Pilze, Zelt, Lagerfeuer, Zaun) und ambientCG (Ground106, Ground037, Ground071, Ground093C, Rock029, Ground097)
- Tests: Sprünge (abheben, landen, langsam bleibt am Boden), Schlamm bremst, Klassen; Strassenstrecken bleiben ohne Flugphasen

## [0.5.0] – 2026-10-11

### Hinzugefügt
- Netzwerkspiel: Der Host kann ein laufendes Rennen für alle abbrechen – im Pause-Menü (Esc) und in der Lobby, mit Bestätigung per zweitem Klick. Alle Spieler kehren in die Lobby zurück und sehen, wer abgebrochen hat; abgebrochene Rennen zählen nicht für die Rangliste.

### Geändert
- Im Netzwerk-Pausemenü heisst „Rennen verlassen“ jetzt „Netzwerkspiel verlassen“ (verlässt Rennen und Lobby)

## [0.4.0] – 2026-10-10

### Hinzugefügt
- **Permanente Rangliste** im Hauptmenü: Fahrer, Auto, Strecke, beste Runde, Rennzeit (mit Rundenzahl), Modus und Datum
  - Wertung pro Strecke nach bester Runde oder nach Rennzeit (je Rundenzahl), Top 50, Medaillen für die ersten drei
  - Einzel- und Splitscreen-Rennen werden vom Client gemeldet, Netzwerkrennen speichert der Server direkt
  - Ergebnisbildschirm zeigt den erreichten Platz in den Rundenrekorden und einen Button zur Rangliste
  - Plausibilitätsprüfung (bekannte Strecke/Auto, physikalisch mögliche Zeiten, Namen ohne Markup)
- Server-API `GET/POST /api/leaderboard`, Speicherung atomar in `data/leaderboard.json`
- Docker: `./data` wird als Volume eingebunden, die Rangliste übersteht Neustarts und Updates

### Geändert
- `data/leaderboard.json` ist git-ignoriert; im Repo liegt nur die leere Vorlage `data/leaderboard.template.json`

## [0.3.0] – 2026-10-10

### Hinzugefügt
- Neue Strecke **Downtown** (Stadtkurs, ~2 km): 90°-Ecken, Schikane, Unterführung, Häuserschluchten aus dem Kenney City Kit (Commercial), Gehsteige, Strassenlaternen
- Neue Strecke **Speedway** (Superspeedway-Oval, ~5,5 km, 18 m breit): Steilkurven mit Übergangsbögen, fast permanent Vollgas, Tribünen mit Publikum, Fangzaun und Flutlichtmasten
- Konfigurierbare Kurvenüberhöhung pro Strecke; Überhöhung erhöht den Grip (Physik und KI)
- Tests: Speedway ist mit jedem Auto bei Endgeschwindigkeit fahrbar, Vollgas-Runde ohne Wandkontakt
- Entwickler-Ansicht `?view=<strecke>@<meter>` zum Begutachten der Strecke
- Credits: Link zum GitHub-Repo, „Created by Adrian S. and Anthropic Claude“, Versionsnummer nach SemVer

### Behoben
- Nach den Lawinengalerien (Alpenpass, Küstenstrasse) versperrte eine schräge, durchfahrbare Wand die halbe Fahrbahn

## [0.2.0] – 2026-10-10

### Hinzugefügt
- CC0-3D-Modelle: Autos aus dem Kenney **Car Kit**, Bäume, Felsen und Büsche aus dem Kenney **Nature Kit**, Häuser aus dem Kenney **City Kit (Suburban)**
- CC0-Texturen von **ambientCG** für Asphalt, Bankett (Kies), Mauern und Galerie (Beton) sowie das Gelände
- Gelände-Shader, der Gras, Fels, Schnee bzw. Sand und Kies nach Höhe und Steigung mischt
- Umlackierung der Kenney-Autos in die Fahrzeugfarbe (Varianten für doppelte Modelle)
- Ladebildschirm mit Fortschrittsbalken, Credits-Bildschirm, Versionsanzeige im Menü
- `npm run assets` lädt alle Asset-Pakete und extrahiert nur die benötigten Dateien nach `client/public/cc0/`
- Server liefert `.glb`- und `.jpg`-Dateien mit korrektem MIME-Typ aus

### Geändert
- Fahrzeugbeschreibungen passend zu den neuen Modellen (Sportcoupé, Prototyp, Formelwagen, Hot Hatch)
- Fehlen die Assets, fällt das Spiel automatisch auf die prozedurale Grafik aus Version 0.1.0 zurück

## [0.1.0] – 2026-10-10

### Hinzugefügt
- Erste spielbare Version: Low-Poly-Arcade-Racer im Browser (Three.js), inspiriert von *Need for Speed II SE*
- Strecken *Alpenpass* und *Küstenstrasse*, 4 Autos, KI-Gegner in drei Stärken
- Splitscreen für 2 Spieler an einer Tastatur, Gamepad-Unterstützung
- LAN-Multiplayer über WebSocket (bis 8 Autos), mit Splitscreen kombinierbar
- HUD mit Minimap, synthetischer Sound, 3 Kameras
- Docker-Image und docker-compose (Port 8090)

[0.6.0]: https://github.com/defendeggu/spidi-race/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/defendeggu/spidi-race/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/defendeggu/spidi-race/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/defendeggu/spidi-race/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/defendeggu/spidi-race/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/defendeggu/spidi-race/releases/tag/v0.1.0
