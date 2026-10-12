# Spidi Race 🏁

![Version](https://img.shields.io/badge/version-0.9.1-ffcc00)
![Lizenz Code](https://img.shields.io/badge/code-MIT-blue)
![Lizenz Assets](https://img.shields.io/badge/assets-CC0-green)
![Docker](https://img.shields.io/badge/docker-ready-2496ED)

Ein Arcade-Rennspiel im Browser im Geist von *Need for Speed II: Special Edition*: Alpenpässe, Küstenstrassen, Stadtkurs, Superspeedway, Offroad-Pisten mit Sprüngen und ein Frühstückstisch im Micro-Machines-Stil, Splitscreen am selben Rechner und Rennen im Heimnetz. Dazu kommt eine offene Übungsstadt, in der Kinder ohne Rennstress das Fahren mit Tastatur oder Gamepad lernen. Gerendert wird mit Three.js, Modelle und Texturen stammen aus CC0-Paketen von Kenney und ambientCG.

![Hauptmenü](docs/menu.jpg)

| Küstenstrasse | Downtown |
|---|---|
| ![Küstenstrasse](docs/kuestenstrasse.jpg) | ![Downtown](docs/downtown.jpg) |
| **Speedway** | **Splitscreen** |
| ![Speedway](docs/speedway-steilkurve.jpg) | ![Splitscreen](docs/splitscreen.jpg) |
| **Canyon Run (Offroad)** | **Waldtrail (Offroad)** |
| ![Canyon Run](docs/canyon.jpg) | ![Waldtrail](docs/waldtrail.jpg) |
| **Frühstückstisch (Micro)** | **Übungsfahrt in der Stadt** |
| ![Frühstückstisch](docs/fruehstueck.jpg) | ![Übungsstadt](docs/uebungsstadt.jpg) |

## Inhalt

- [Features](#features)
- [Schnellstart mit Docker](#schnellstart-mit-docker)
- [Steuerung](#steuerung)
- [Übungsfahrt in der Stadt](#übungsfahrt-in-der-stadt)
- [Netzwerkspiel](#netzwerkspiel)
- [Rangliste](#rangliste)
- [Entwicklung](#entwicklung)
- [Grafik-Assets](#grafik-assets)
- [Architektur](#architektur)
- [Versionierung](#versionierung)
- [Lizenz und Credits](#lizenz-und-credits)

## Features

- **7 Strecken** in drei Klassen

  | Strecke | Klasse | Länge | Charakter |
  |---|---|---|---|
  | Alpenpass | Strasse | 2,5 km | Serpentinen, Lawinengalerie, Schneeberge |
  | Küstenstrasse | Strasse | 2,9 km | Fischerdorf, Klippen, Palmen, Leuchtturm |
  | Downtown | Strasse | 2,0 km | Stadtkurs: 90°-Ecken, Schikane, Unterführung, Hochhäuser |
  | Speedway | Strasse | 5,5 km | Superspeedway-Oval mit Steilkurven: fast permanent Vollgas, über 280 km/h Schnitt |
  | Canyon Run | Offroad | 2,6 km | Schotter und Sand in einer roten Schlucht, 3 Sprünge, einer über ein Flussbett |
  | Waldtrail | Offroad | 2,8 km | Waldweg, Kuppen, Schlammlöcher, Furt, Sprung über den Bach |
  | Frühstückstisch | Micro | 0,9 km | Spielzeugautos auf dem Küchentisch: Müslischale, Kaffeetasse, Croissant, Strohhalme als Banden |

- **15 Autos** mit eigenen Fahrwerten, je nach Streckenklasse:

  | Auto | Klasse | Modell | Stärke |
  |---|---|---|---|
  | Falcone Strada | Strasse | Sportcoupé | ausgewogen |
  | Sturmvogel RS | Strasse | Prototyp | Höchstgeschwindigkeit |
  | Kaito ZX | Strasse | Formelwagen | Kurven |
  | Brutale V10 | Strasse | Hot Hatch | Beschleunigung |
  | Bergziege 4x4 | Offroad | Geländewagen | wendig, viel Grip |
  | Baron V8 | Offroad | Luxus-SUV | schnell, schwer |
  | Sahara Raider | Offroad | Pickup | Beschleunigung |
  | Mini-Blitz | Micro | Spielzeug-Rennwagen | Höchstgeschwindigkeit |
  | Taschen-Flitzer | Micro | Spielzeug-Hatchback | wendig, Beschleunigung |
  | Zwergrakete | Micro | Spielzeug-Prototyp | ausgewogen |
  | Familienauto | Stadt | Limousine | gemütlich, für die Übungsfahrt |
  | Taxi | Stadt | Taxi | gemütlich, Originallackierung |
  | Polizeiauto | Stadt | Streifenwagen | gemütlich, Originallackierung |
  | Feuerwehr | Stadt | Feuerwehrauto | gross, etwas langsamer |
  | Kaito ZX | Stadt | Formelwagen | schneller, für Fortgeschrittene |

- **Übungsfahrt**: eine offene Stadt von 1 × 1 km ohne Rennen, mit 4 Alltagsautos und einem Formelwagen, Aufgaben (Sterne sammeln, Einparken) und langsamem Verkehr, siehe [unten](#übungsfahrt-in-der-stadt)
- **Offroad**: echte Sprünge mit Flugphase, Untergründe Schotter, Sand, Schlamm und Wasser mit eigenem Grip, Federung, Staub- und Schlammpartikel
- **Micro**: Spielzeugautos im Massstab 1:100 auf einem Frühstückstisch, gefahren aus der Vogelperspektive wie bei *Micro Machines*
- **KI-Gegner**: 0 bis 7, in den Stärken Leicht, Mittel und Schwer
- **Splitscreen** für 2 Spieler an einer Tastatur, Gamepads werden ebenfalls unterstützt
- **LAN-Multiplayer** mit bis zu 8 Autos, auch zusammen mit Splitscreen
- **Permanente Rangliste** pro Strecke (beste Runde oder Rennzeit), aufrufbar im Hauptmenü
- **HUD** mit Platzierung, Runden- und Bestzeiten, Tacho, Drehzahl und Minimap
- **Arcade-Fahrphysik** mit Drift, Handbremse, Automatikgetriebe, Steigungen und Abprall an Leitplanken
- **Sound**: Motor, Reifenquietschen und Crash werden live mit WebAudio erzeugt
- **4 Kameras**: Verfolger, Verfolger weit, Stossstange und Vogelperspektive (auf Micro-Strecken voreingestellt)

## Schnellstart mit Docker

```bash
git clone https://github.com/defendeggu/spidi-race.git
cd spidi-race
docker compose up -d --build
```

Danach im Browser **http://localhost:8090** öffnen.

| Einstellung | Wert |
|---|---|
| Port im Container | 8090 |
| Anderer Host-Port | `SPIDI_PORT=9000 docker compose up -d` |
| Healthcheck | `GET /health` |
| Rangliste | `./data/leaderboard.json` (als Volume eingebunden) |

Das Image ist zweistufig aufgebaut. Beim Build laufen die Tests und der Produktionsbuild. Zur Laufzeit braucht das Image nur Node, ohne `node_modules`. Die Assets liegen im Repo, der Build braucht also kein Internet ausser für npm.

## Steuerung

| Aktion | Spieler 1 | Spieler 2 |
|---|---|---|
| Gas / Bremse / Rückwärts | `W` / `S` | `↑` / `↓` |
| Lenken | `A` / `D` | `←` / `→` |
| Handbremse | `Leertaste` | `Strg rechts` / `Shift rechts` / `Num 0` |
| Kamera wechseln | `C` | `Enter` / `.` |
| Pause | `Esc` | |
| Steuerungshilfe ein/aus (Übungsfahrt) | `H` | |
| Ton an/aus | `M` | |

- Im Einzelspieler funktionieren WASD und die Pfeiltasten gleichzeitig.
- Gamepads: Spieler 1 bekommt das erste angeschlossene Gamepad, Spieler 2 das zweite.

  | Aktion | Xbox / Standard-Gamepad | PlayStation (PS3, PS4, PS5) |
  |---|---|---|
  | Gas | RT oder A | R2 oder □ |
  | Bremse / Rückwärts | LT oder B | L2 oder ○ |
  | Lenken | linker oder rechter Stick, Steuerkreuz | linker oder rechter Stick, Steuerkreuz |
  | Handbremse | X oder RB | ✕ oder R1 |
  | Kamera / Pause | Y / Start | △ / Start |

  Erkannt werden sowohl Gamepads mit Standard-Belegung als auch die rohe Linux-Belegung, die Firefox für manche Controller meldet (Xbox-Controller mit Triggern als Achsen, DualShock 3).
- **PS3-Controller:** Unter Linux per USB oder Bluetooth direkt nutzbar (Treiber `hid-sony` ist im Kernel), in Chrome und Firefox. Unter Windows 11 gibt es keinen eingebauten Treiber: [DsHidMini](https://github.com/nefarius/DsHidMini) installieren und den Controller im *XInput*-Modus betreiben, dann erscheint er als Xbox-Controller und nutzt die Xbox-Belegung (Handbremse dann auf □, der Position von X). Den Browser erkennt das Gamepad erst nach dem ersten Tastendruck.
- Viele Tastaturen erkennen nur eine begrenzte Zahl gleichzeitig gedrückter Tasten. Gehen im Splitscreen Eingaben verloren, hilft ein Gamepad für einen der beiden Spieler.

## Übungsfahrt in der Stadt

Hauptmenü → **Übungsfahrt in der Stadt**. Gedacht für Kinder und alle, die erst einmal die Steuerung kennenlernen wollen: kein Rennen, keine Zeit, kein Gegner.

| Was | Details |
|---|---|
| Stadt | 1 × 1 km, Strassen alle 100 m mit zwei Spuren (Rechtsverkehr), Häuser, Geschäfte, Hochhäuser, Parks, 5 Parkplätze und ein Übungsplatz mit Pylonen. Gärten und Innenhöfe sind befahrbar, nur aussen steht eine Mauer |
| Start | auf dem Übungsplatz (gelbe Startfelder) neben Slalom und Pylonenkreis |
| Autos | Familienauto, Taxi, Polizeiauto, Feuerwehr: gutmütig, viel Grip, Spitze ca. 65 km/h (Feuerwehr etwas langsamer). Kaito ZX: Formelwagen mit ca. 90 km/h für Fortgeschrittene |
| Spieler | 1 Spieler oder 2 im Splitscreen |
| Aufgaben | **Frei fahren** · **Sterne sammeln**: ein Stern auf einer Lichtsäule, oben zeigt ein Pfeil die Richtung · **Einparken**: ein Parkfeld leuchtet, meist auf einem anderen der 5 Parkplätze; gerade hineinfahren (vorwärts oder rückwärts) und kurz stehen bleiben |
| Verkehr | aus, wenig (10 Autos) oder mehr (22 Autos), höchstens 30 km/h; die Autos warten an Kreuzungen und halten hinter den Spielern an |
| Hilfe | Unten links leuchten die gedrückten Tasten (bzw. Gamepad-Knöpfe) auf, `H` blendet die Hilfe aus. Rechts oben zeigt die Stadtkarte Ziel, Spieler und Verkehr |
| Pause | `Esc` / Start: Weiter, **Auto zum Start**, Neustart, Hauptmenü |

## Netzwerkspiel

1. Den Server starten (Docker oder `npm start`).
2. Alle Mitspieler öffnen `http://<IP-des-Servers>:8090` und wählen **Netzwerkspiel**.
3. Pro Gerät kann man 1 oder 2 Spieler anmelden. Bei 2 Spielern fahren beide im Splitscreen.
4. Wer zuerst in der Lobby ist, ist Host: Er wählt Strecke, Runden und KI-Gegner und startet das Rennen. Gefahren wird immer mit Autos der Streckenklasse (Strasse, Offroad oder Micro); sein Auto dieser Klasse wählt jeder direkt in der Lobby.
5. Der Host kann ein laufendes Rennen jederzeit für alle abbrechen: im Pause-Menü (`Esc`) oder in der Lobby mit **Rennen für alle abbrechen**, dann ein zweiter Klick zur Bestätigung.

![Lobby](docs/lobby.jpg)

So funktioniert es technisch:
- Jeder Client simuliert seine eigenen Autos und sendet deren Zustand 30-mal pro Sekunde.
- Der Server simuliert die KI-Gegner, entscheidet über Runden, Platzierungen und Zieleinlauf und verteilt den Spielstand an alle.
- Fremde Autos werden mit etwa 110 ms Verzögerung interpoliert, damit sie flüssig fahren.

## Rangliste

Jedes beendete Rennen eines menschlichen Fahrers landet in der permanenten Rangliste (Hauptmenü → **Rangliste**):

| Spalte | Inhalt |
|---|---|
| Fahrer, Auto | Name und gewähltes Auto |
| Beste Runde | schnellste Runde – Standardwertung, über alle Rundenzahlen vergleichbar |
| Rennzeit | Gesamtzeit mit Rundenzahl – Wertung je Rundenzahl wählbar |
| Modus, Datum | Einzel, Splitscreen oder Netzwerk; Tag des Rennens |

- Die Wertung gilt pro Strecke. Angezeigt werden die Top 50, gespeichert bis zu 2000 Rennen pro Strecke.
- Der Server speichert alles in `data/leaderboard.json`. Diese Datei ist **git-ignoriert**. Im Repo liegt nur die leere Vorlage `data/leaderboard.template.json`, mit der ein neuer Server startet.
- Mit Docker wird `./data` in den Container eingebunden. Die Rangliste übersteht Neustarts und Image-Updates und lässt sich einfach sichern.
- Zurücksetzen: `data/leaderboard.json` löschen und den Server neu starten.
- Die API ist `GET /api/leaderboard[?track=<id>]` und `POST /api/leaderboard` mit `{ entries: [...] }`. Unplausible Zeiten werden abgewiesen.

## Entwicklung

Voraussetzung: **Node.js ≥ 20.19**

```bash
npm install
npm run dev          # Vite-Client auf :5173 (Hot-Reload) + Spielserver auf :8090
npm test             # Strecken-, Physik- und komplette KI-Rennsimulation (Vitest)
npm run typecheck    # TypeScript für shared, client und server
npm run build        # Produktionsbuild: client/dist + server/dist/index.cjs
npm start            # Produktionsserver auf :8090 (liefert auch den Client aus)
npm run assets       # CC0-Assets neu herunterladen (siehe unten)
```

**Neue Strecke anlegen:**
1. In `shared/src/tracks.ts` eine Liste von Kontrollpunkten `[x, z, höhe, breite?]` hinzufügen. Dazu ein Theme wählen (`alpine`, `coast`, `city`, `speedway`, `desert`, `forest`, `table`). Optional kommen dazu: Galerien/Unterführungen, eine Kurvenüberhöhung (`banking`) für Micro `class: 'micro'` (mit `camera: 'topdown'`) und für Offroad `class: 'offroad'`, Untergründe (`surface`, `surfaces`) sowie Sprünge (`jumps`).
2. `npm test` ausführen. Der Test prüft, dass sich die Strecke nicht selbst schneidet und dass KI-Fahrer sie komplett befahren können.
3. Mit `http://localhost:5173/?view=<strecken-id>@<meter>` fährt die Kamera langsam ab der gewünschten Stelle über die Strecke, das ist praktisch zum Begutachten der Szenerie.

## Grafik-Assets

Alle Modelle und Texturen stehen unter **CC0 (Public Domain)** und liegen in [`client/public/cc0/`](client/public/cc0/CREDITS.md).

| Quelle | Paket | Verwendung |
|---|---|---|
| [Kenney](https://kenney.nl/assets/car-kit) | Car Kit | 14 Autos (`sedan-sports`, `race-future`, `race`, `hatchback-sports`, `suv`, `suv-luxury`, `truck`, `sedan`, `taxi`, `police`, `firetruck`), dazu `van` und `delivery` für den Stadtverkehr |
| [Kenney](https://kenney.nl/assets/nature-kit) | Nature Kit | Bäume, Felsen, Büsche, Kakteen, Klippen, Baumstämme, Pilze, Zelt, Lagerfeuer |
| [Kenney](https://kenney.nl/assets/city-kit-suburban) | City Kit (Suburban) | Häuser im Dorf, Chalets |
| [Kenney](https://kenney.nl/assets/city-kit-commercial) | City Kit (Commercial) | Geschäftshäuser und Hochhäuser in Downtown |
| [Kenney](https://kenney.nl/assets/food-kit) | Food Kit | Frühstückstisch: Müslischale, Tassen, Teller, Croissant, Besteck, Obst |
| [ambientCG](https://ambientcg.com) | Asphalt031, Grass004, Rock064, Snow010A, Ground080, Gravel043, Concrete034 | Strasse, Gelände, Bankett, Mauern |
| [ambientCG](https://ambientcg.com) | Ground106, Ground037, Ground071, Ground093C, Rock029, Ground097 | Offroad: Waldweg, Waldboden, Schlamm, Dünen, roter Fels, Wüstenpiste |
| [ambientCG](https://ambientcg.com) | Wood049 | Micro: Holztisch |

`npm run assets` ([scripts/fetch-assets.mjs](scripts/fetch-assets.mjs)) lädt die Original-Pakete herunter und kopiert nur die benötigten Dateien nach `client/public/cc0/`. Dabei entsteht auch die Datei `CREDITS.md` neu.

Fehlen die Assets oder lassen sie sich nicht laden, startet das Spiel automatisch mit der prozeduralen Grafik aus Version 0.1.0.

## Architektur

```
shared/   Fahrphysik, Strecken (Catmull-Rom-Spline), Autos, Rennlogik, KI, Netzwerkprotokoll,
          Übungsstadt (town.ts), Stadtverkehr (traffic.ts), Aufgaben (townTasks.ts)
client/   Vite + Three.js
  src/render/   Asset-Loader, Gelände (Splat-Shader), Strasse, Szenerie, Frühstückstisch/Küche, Automodelle, Kameras
  src/ui/       Menüs, Lobby, Ergebnisse, Menü-Hintergrund
  src/game.ts   Spielschleife (feste 60 Hz), Splitscreen, Interpolation, Netz-Sync
  src/townGame.ts, townHud.ts, render/townWorld.ts   Übungsfahrt in der Stadt
server/   Node + ws: liefert den Client aus, Lobby, autoritativer Rennstatus, KI-Autos
scripts/  Asset-Download
```

- **Physik**: ein eigenes, deterministisches Arcade-Modell (Einspurmodell mit Grip-Limit). Derselbe Code läuft im Browser und auf dem Server. Der Fahrkern `driveCar` ist für Strecken und Stadt gleich, nur der Rand unterscheidet sich: Leitplanken entlang des Splines bzw. Gebäude, Bäume und Pylonen in der Stadt.
- **Strecken**: Die Strasse ist ein Spline mit einem Kontrollpunkt etwa alle 2 m. Strassenbelag, Bankette, Leitplanken und Gelände werden daraus erzeugt, die Szenerie wird mit festem Zufalls-Seed verteilt.
- **Rendering**: Bäume, Felsen und Häuser sind InstancedMeshes, so bleibt die Zahl der Draw Calls auch mit tausenden Objekten klein. Der Splitscreen nutzt einen einzigen Renderer mit zwei Scissor-Viewports.

## Versionierung

Das Projekt folgt [Semantic Versioning](https://semver.org/lang/de/). Die aktuelle Version ist **0.9.1**. Änderungen stehen im [CHANGELOG](CHANGELOG.md), Releases sind als Git-Tags `vX.Y.Z` markiert. Die Version steht auch unten rechts im Hauptmenü.

## Lizenz und Credits

- **Code**: [MIT](LICENSE) – created by Adrian S. and Anthropic Claude
- **Modelle und Texturen**: CC0 von [Kenney](https://kenney.nl) und [ambientCG](https://ambientcg.com). Herzlichen Dank! Details stehen in [CREDITS.md](client/public/cc0/CREDITS.md).
- *Need for Speed* ist eine Marke von Electronic Arts. Spidi Race ist ein unabhängiges Fan-Projekt ohne Verbindung zu EA.
