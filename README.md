# Spidi Race 🏁

![Version](https://img.shields.io/badge/version-0.3.0-ffcc00)
![Lizenz Code](https://img.shields.io/badge/code-MIT-blue)
![Lizenz Assets](https://img.shields.io/badge/assets-CC0-green)
![Docker](https://img.shields.io/badge/docker-ready-2496ED)

Ein Arcade-Rennspiel im Browser im Geist von *Need for Speed II: Special Edition*: Alpenpässe, Küstenstrassen, Stadtkurs und Superspeedway, Splitscreen am selben Rechner und Rennen im Heimnetz. Gerendert wird mit Three.js, Modelle und Texturen stammen aus CC0-Paketen von Kenney und ambientCG.

![Hauptmenü](docs/menu.jpg)

| Küstenstrasse | Downtown |
|---|---|
| ![Küstenstrasse](docs/kuestenstrasse.jpg) | ![Downtown](docs/downtown.jpg) |
| **Speedway** | **Splitscreen** |
| ![Speedway](docs/speedway-steilkurve.jpg) | ![Splitscreen](docs/splitscreen.jpg) |

## Inhalt

- [Features](#features)
- [Schnellstart mit Docker](#schnellstart-mit-docker)
- [Steuerung](#steuerung)
- [Netzwerkspiel](#netzwerkspiel)
- [Entwicklung](#entwicklung)
- [Grafik-Assets](#grafik-assets)
- [Architektur](#architektur)
- [Versionierung](#versionierung)
- [Lizenz und Credits](#lizenz-und-credits)

## Features

- **4 Strecken**

  | Strecke | Länge | Charakter |
  |---|---|---|
  | Alpenpass | 2,5 km | Serpentinen, Lawinengalerie, Schneeberge |
  | Küstenstrasse | 2,9 km | Fischerdorf, Klippen, Palmen, Leuchtturm |
  | Downtown | 2,0 km | Stadtkurs: 90°-Ecken, Schikane, Unterführung, Hochhäuser |
  | Speedway | 5,5 km | Superspeedway-Oval mit Steilkurven: fast permanent Vollgas, über 280 km/h Schnitt |

- **4 Autos** mit eigenen Fahrwerten:

  | Auto | Modell | Stärke |
  |---|---|---|
  | Falcone Strada | Sportcoupé | ausgewogen |
  | Sturmvogel RS | Prototyp | Höchstgeschwindigkeit |
  | Kaito ZX | Formelwagen | Kurven |
  | Brutale V10 | Hot Hatch | Beschleunigung |

- **KI-Gegner**: 0 bis 7, in den Stärken Leicht, Mittel und Schwer
- **Splitscreen** für 2 Spieler an einer Tastatur, Gamepads werden ebenfalls unterstützt
- **LAN-Multiplayer** mit bis zu 8 Autos, auch zusammen mit Splitscreen
- **HUD** mit Platzierung, Runden- und Bestzeiten, Tacho, Drehzahl und Minimap
- **Arcade-Fahrphysik** mit Drift, Handbremse, Automatikgetriebe, Steigungen und Abprall an Leitplanken
- **Sound**: Motor, Reifenquietschen und Crash werden live mit WebAudio erzeugt
- **3 Kameras**: Verfolger, Verfolger weit und Stossstange

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

Das Image ist zweistufig aufgebaut. Beim Build laufen die Tests und der Produktionsbuild. Zur Laufzeit braucht das Image nur Node, ohne `node_modules`. Die Assets liegen im Repo, der Build braucht also kein Internet ausser für npm.

## Steuerung

| Aktion | Spieler 1 | Spieler 2 |
|---|---|---|
| Gas / Bremse / Rückwärts | `W` / `S` | `↑` / `↓` |
| Lenken | `A` / `D` | `←` / `→` |
| Handbremse | `Leertaste` | `Strg rechts` / `Shift rechts` / `Num 0` |
| Kamera wechseln | `C` | `Enter` / `.` |
| Pause | `Esc` | |
| Ton an/aus | `M` | |

- Im Einzelspieler funktionieren WASD und die Pfeiltasten gleichzeitig.
- Gamepad: RT Gas, LT Bremse, linker Stick lenken, X/RB Handbremse.
- Viele Tastaturen erkennen nur eine begrenzte Zahl gleichzeitig gedrückter Tasten. Gehen im Splitscreen Eingaben verloren, hilft ein Gamepad für einen der beiden Spieler.

## Netzwerkspiel

1. Den Server starten (Docker oder `npm start`).
2. Alle Mitspieler öffnen `http://<IP-des-Servers>:8090` und wählen **Netzwerkspiel**.
3. Pro Gerät kann man 1 oder 2 Spieler anmelden. Bei 2 Spielern fahren beide im Splitscreen.
4. Wer zuerst in der Lobby ist, ist Host: Er wählt Strecke, Runden und KI-Gegner und startet das Rennen.

![Lobby](docs/lobby.jpg)

So funktioniert es technisch:
- Jeder Client simuliert seine eigenen Autos und sendet deren Zustand 30-mal pro Sekunde.
- Der Server simuliert die KI-Gegner, entscheidet über Runden, Platzierungen und Zieleinlauf und verteilt den Spielstand an alle.
- Fremde Autos werden mit etwa 110 ms Verzögerung interpoliert, damit sie flüssig fahren.

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
1. In `shared/src/tracks.ts` eine Liste von Kontrollpunkten `[x, z, höhe, breite?]` hinzufügen. Dazu ein Theme wählen (`alpine`, `coast`, `city`, `speedway`), optional Galerien/Unterführungen und eine Kurvenüberhöhung (`banking`).
2. `npm test` ausführen. Der Test prüft, dass sich die Strecke nicht selbst schneidet und dass KI-Fahrer sie komplett befahren können.
3. Mit `http://localhost:5173/?view=<strecken-id>@<meter>` fährt die Kamera langsam ab der gewünschten Stelle über die Strecke, das ist praktisch zum Begutachten der Szenerie.

## Grafik-Assets

Alle Modelle und Texturen stehen unter **CC0 (Public Domain)** und liegen in [`client/public/cc0/`](client/public/cc0/CREDITS.md).

| Quelle | Paket | Verwendung |
|---|---|---|
| [Kenney](https://kenney.nl/assets/car-kit) | Car Kit | 4 Autos (`sedan-sports`, `race-future`, `race`, `hatchback-sports`) |
| [Kenney](https://kenney.nl/assets/nature-kit) | Nature Kit | Nadel-, Laub- und Palmbäume, Felsen, Büsche |
| [Kenney](https://kenney.nl/assets/city-kit-suburban) | City Kit (Suburban) | Häuser im Dorf, Chalets |
| [Kenney](https://kenney.nl/assets/city-kit-commercial) | City Kit (Commercial) | Geschäftshäuser und Hochhäuser in Downtown |
| [ambientCG](https://ambientcg.com) | Asphalt031, Grass004, Rock064, Snow010A, Ground080, Gravel043, Concrete034 | Strasse, Gelände, Bankett, Mauern |

`npm run assets` ([scripts/fetch-assets.mjs](scripts/fetch-assets.mjs)) lädt die Original-Pakete herunter und kopiert nur die benötigten Dateien nach `client/public/cc0/`. Dabei entsteht auch die Datei `CREDITS.md` neu.

Fehlen die Assets oder lassen sie sich nicht laden, startet das Spiel automatisch mit der prozeduralen Grafik aus Version 0.1.0.

## Architektur

```
shared/   Fahrphysik, Strecken (Catmull-Rom-Spline), Autos, Rennlogik, KI, Netzwerkprotokoll
client/   Vite + Three.js
  src/render/   Asset-Loader, Gelände (Splat-Shader), Strasse, Szenerie, Automodelle, Kameras
  src/ui/       Menüs, Lobby, Ergebnisse, Menü-Hintergrund
  src/game.ts   Spielschleife (feste 60 Hz), Splitscreen, Interpolation, Netz-Sync
server/   Node + ws: liefert den Client aus, Lobby, autoritativer Rennstatus, KI-Autos
scripts/  Asset-Download
```

- **Physik**: ein eigenes, deterministisches Arcade-Modell (Einspurmodell mit Grip-Limit). Derselbe Code läuft im Browser und auf dem Server.
- **Strecken**: Die Strasse ist ein Spline mit einem Kontrollpunkt etwa alle 2 m. Strassenbelag, Bankette, Leitplanken und Gelände werden daraus erzeugt, die Szenerie wird mit festem Zufalls-Seed verteilt.
- **Rendering**: Bäume, Felsen und Häuser sind InstancedMeshes, so bleibt die Zahl der Draw Calls auch mit tausenden Objekten klein. Der Splitscreen nutzt einen einzigen Renderer mit zwei Scissor-Viewports.

## Versionierung

Das Projekt folgt [Semantic Versioning](https://semver.org/lang/de/). Die aktuelle Version ist **0.3.0**. Änderungen stehen im [CHANGELOG](CHANGELOG.md), Releases sind als Git-Tags `vX.Y.Z` markiert. Die Version steht auch unten rechts im Hauptmenü.

## Lizenz und Credits

- **Code**: [MIT](LICENSE) – created by Adrian S. and Anthropic Claude
- **Modelle und Texturen**: CC0 von [Kenney](https://kenney.nl) und [ambientCG](https://ambientcg.com). Herzlichen Dank! Details stehen in [CREDITS.md](client/public/cc0/CREDITS.md).
- *Need for Speed* ist eine Marke von Electronic Arts. Spidi Race ist ein unabhängiges Fan-Projekt ohne Verbindung zu EA.
