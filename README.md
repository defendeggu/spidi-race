# Spidi Race 🏁

Ein Arcade-Rennspiel im Browser, inspiriert von *Need for Speed II: Special Edition*: Low-Poly-3D, exotische Sportwagen, Alpenpässe und Küstenstrassen. Alles ist prozedural erzeugt, es werden keine externen Grafiken oder Sounds benötigt.

## Features

- **2 Strecken**: *Alpenpass* (Serpentinen, Lawinengalerie, Schneeberge) und *Küstenstrasse* (Fischerdorf, Klippen, Leuchtturm)
- **4 Autos** mit unterschiedlichen Fahreigenschaften (Tempo, Beschleunigung, Handling, Bremsen)
- **Computergegner** (0–7) in drei Stärken
- **Splitscreen** für 2 Spieler an einer Tastatur, Gamepads werden ebenfalls unterstützt
- **Netzwerkspiel im LAN**: bis zu 8 Autos, auch kombinierbar mit Splitscreen
- HUD mit Platzierung, Runden- und Bestzeiten, Tacho, Drehzahl und Minimap
- Synthetischer Motor-, Reifen- und Crash-Sound (WebAudio)
- 3 Kameraperspektiven

## Starten mit Docker

```bash
docker compose up -d --build
```

Danach im Browser **http://localhost:8090** öffnen. Mitspieler im Heimnetz öffnen `http://<IP-dieses-Rechners>:8090`.
Einen anderen Port wählst du mit `SPIDI_PORT=9000 docker compose up -d`.

## Entwicklung

Voraussetzung: Node.js ≥ 20.19

```bash
npm install
npm run dev        # Vite-Client auf :5173 (mit Hot-Reload) + Spielserver auf :8090
npm test           # Physik-, Strecken- und KI-Rennsimulationstests
npm run typecheck
npm run build && npm start   # Produktionsbuild, alles auf :8090
```

## Steuerung

| Aktion | Spieler 1 | Spieler 2 |
|---|---|---|
| Gas / Bremse / Rückwärts | W / S | ↑ / ↓ |
| Lenken | A / D | ← / → |
| Handbremse | Leertaste | Strg rechts / Shift rechts / Num 0 |
| Kamera | C | Enter / . |
| Pause / Ton | Esc / M | |

Im Einzelspieler gehen WASD und die Pfeiltasten. Gamepad: RT Gas, LT Bremse, Stick lenken, X/RB Handbremse.
Hinweis: Viele Tastaturen erkennen nur eine begrenzte Zahl gleichzeitig gedrückter Tasten. Gehen im Splitscreen Eingaben verloren, hilft ein Gamepad für einen der beiden Spieler.

## Architektur

```
shared/   Fahrphysik, Strecken (Catmull-Rom-Spline), Autos, Rennlogik, KI, Netzwerkprotokoll
client/   Vite + Three.js: Rendering, Splitscreen, HUD, Menüs, Sound, WebSocket-Client
server/   Node + ws: liefert den Client aus, Lobby, autoritativer Rennstatus, KI-Autos
```

- Die Physik ist ein eigenes, deterministisches Arcade-Modell (Bicycle-Model mit Grip-Limit, Drift und Handbremse). Es läuft identisch im Browser und auf dem Server.
- Im Netzwerkspiel simuliert jeder Client seine eigenen Autos und sendet den Zustand mit 30 Hz. Der Server simuliert die KI, zählt Runden und Platzierungen und verteilt Snapshots. Fremde Autos werden mit ca. 110 ms Verzögerung interpoliert.
- Neue Strecken entstehen in `shared/src/tracks.ts` aus einer Liste von Kontrollpunkten `[x, z, höhe, breite?]`. Der Test `npm test` prüft automatisch, dass sich die Strecke nicht selbst schneidet und dass die KI sie fahren kann.
