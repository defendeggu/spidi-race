# Spidi Race 🏁

![Version](https://img.shields.io/badge/version-0.14.0-ffcc00)
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
- [Kart-Rennen mit Items](#kart-rennen-mit-items)
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

- **20 Fahrzeuge** mit eigenen Fahrwerten, je nach Streckenklasse bzw. Modus:

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
  | Oobi, Oodi, Ooli, Oopi, Oozi | Kart | Karts mit Alien-Fahrern | Allrounder, Beschleunigung, Kurven, Spitze, Gewicht |

- **Kart-Rennen mit Items** auf allen Strassen- und Offroad-Strecken: ?-Boxen, Blaster, Zielsucher, Minen, Turbo und Schild, Drift-Boost, KI-Karts mit Items, siehe [unten](#kart-rennen-mit-items)
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

Das Image ist zweistufig aufgebaut (Node 22). Beim Build laufen die Tests und der Produktionsbuild. Zur Laufzeit braucht das Image nur Node, ohne `node_modules`. Die Assets liegen im Repo, der Build braucht also kein Internet ausser für npm.

**Sicherheit und Betrieb**
- Der Container läuft als Benutzer `node`, mit schreibgeschütztem Dateisystem (nur `./data` ist beschreibbar), ohne Linux-Capabilities und mit höchstens 512 MB Speicher (`docker-compose.yml`). Der Ordner `./data` muss für die Benutzer-ID 1000 beschreibbar sein.
- Gedacht ist der Server fürs Heimnetz: ohne Anmeldung und ohne TLS. Wer ihn im Internet betreibt, setzt einen Reverse-Proxy mit TLS davor (z. B. Caddy).
- Der Server prüft alle Netzwerknachrichten, begrenzt die Bewegung der Autos auf das, was das Auto fahren kann, nimmt WebSocket-Verbindungen nur von der eigenen Seite an (Origin-Prüfung) und trennt stumme Verbindungen nach etwa 30 s.
- Statische Dateien kommen mit ETag, gzip und Sicherheits-Headern (u. a. Content-Security-Policy).

## Steuerung

| Aktion | Spieler 1 | Spieler 2 |
|---|---|---|
| Gas / Bremse / Rückwärts | `W` / `S` | `↑` / `↓` |
| Lenken | `A` / `D` | `←` / `→` |
| Handbremse | `Leertaste` | `Strg rechts` / `Shift rechts` / `Num 0` |
| Kamera wechseln | `C` | `Enter` / `.` |
| Pause | `Esc` | |
| Item benutzen (Kart-Rennen) | `E` | `Ende` / `-` / `Num 1` |
| Steuerungshilfe ein/aus (Übungsfahrt) | `H` | |
| Ton an/aus | `M` | |

- Im Einzelspieler funktionieren WASD und die Pfeiltasten gleichzeitig.
- Gamepads: Spieler 1 bekommt das erste angeschlossene Gamepad, Spieler 2 das zweite.

  | Aktion | Xbox / Standard-Gamepad | PlayStation (PS3, PS4, PS5) |
  |---|---|---|
  | Gas | RT oder A | R2 oder ✕ |
  | Bremse / Rückwärts | LT oder B | L2 oder ○ |
  | Lenken | linker oder rechter Stick, Steuerkreuz | linker oder rechter Stick, Steuerkreuz |
  | Handbremse | X oder RB | □ oder R1 |
  | Kamera / Pause | Y / Start | △ / Start |
  | Kart-Rennen: Item / Kamera | Y / Back oder Steuerkreuz ↑ | △ / Select oder Steuerkreuz ↑ |

  Erkannt werden sowohl Gamepads mit Standard-Belegung als auch die rohe Linux-Belegung, die Firefox für manche Controller meldet (Xbox-Controller mit Triggern als Achsen, DualShock 3).
- **PS3-Controller:** Unter Linux per USB oder Bluetooth direkt nutzbar (Treiber `hid-sony` ist im Kernel), in Chrome und Firefox. Unter Windows 11 gibt es keinen eingebauten Treiber: [DsHidMini](https://github.com/nefarius/DsHidMini) installieren und den Controller im *XInput*-Modus betreiben, dann erscheint er als Xbox-Controller. Den Browser erkennt das Gamepad erst nach dem ersten Tastendruck.
- Viele Tastaturen erkennen nur eine begrenzte Zahl gleichzeitig gedrückter Tasten. Gehen im Splitscreen Eingaben verloren, hilft ein Gamepad für einen der beiden Spieler.

## Kart-Rennen mit Items

Hauptmenü → **Kart-Rennen mit Items**. Gefahren wird auf allen Strassen- und Offroad-Strecken, allein oder zu zweit im Splitscreen, gegen bis zu 7 KI-Karts. Netzwerkspiel mit Karts gibt es noch nicht.

| Was | Details |
|---|---|
| Karts | 5 Karts mit Alien-Fahrern (Kenney Car Kit), ca. 120–135 km/h, mit Boost mehr, sehr wendig |
| ?-Boxen | drei Reihen pro Runde (bei 20 %, 55 % und 85 % der Strecke); wer mit leerem Slot durchfährt, bekommt nach einer kurzen Roulette ein Item. Die Boxen sind nach 2 s wieder da |
| Vergabe | nach Platzierung: Vorne gibt es eher Minen und Blaster, hinten eher Turbo und Zielsucher |
| Blaster 🔫 | Schaumstoffpfeil geradeaus, prallt bis zu dreimal an der Leitplanke ab |
| Zielsucher 🎯 | verfolgt das Kart direkt vor dir |
| Mine 💣 | wird hinter dem Kart abgelegt |
| Turbo 🚀 | 1,5 s mehr Tempo |
| Schild 🛡️ | 5 s Schutz vor einem Treffer |
| Treffer | das Kart dreht sich einmal und verliert sein Tempo; danach ist es kurz unverwundbar |
| Drift-Boost | Handbremse + Lenken ab ca. 30 km/h: der Drift lädt in drei Stufen (blaue, orange, violette Funken), beim Loslassen gibt es einen Turbo. Beim Driftstart hüpft das Kart – so springt man über Minen |
| Rangliste | eigene Kart-Listen pro Strecke (Umschalter „Autos / Karts“ in der Rangliste) |

Die Item-Logik (`shared/src/items.ts`) läuft ohne Browser und deterministisch, damit sie später für das Netzwerkspiel auf dem Server laufen kann.

## Übungsfahrt in der Stadt

Hauptmenü → **Übungsfahrt in der Stadt**. Gedacht für Kinder und alle, die erst einmal die Steuerung kennenlernen wollen: kein Rennen, keine Zeit, kein Gegner.

| Was | Details |
|---|---|
| Stadt | gut 1 × 1 km, Strassen alle 100 m mit zwei Spuren (Rechtsverkehr), Parkplätze und ein Übungsplatz mit Pylonen. Gärten und Innenhöfe sind befahrbar, aussen steht eine Mauer |
| Am Stadtrand | **Hafen** im Süden: Lagerhallen, Containerlager mit Stapeln bis drei hoch, Sattelschlepper und Parkfelder; der Kai hat **kein Geländer** – wer ins Wasser fährt, fällt hinein und die Fahrt ist zu Ende (im Duell gewinnt der andere). Im Wasser Frachter, Schlepper, Fischer- und Hausboote, Boote fahren durchs Becken · **Bahn** im Osten: eingezäuntes Gleis zwischen zwei Tunnelportalen, Backstein-Bahnhof mit Bahnsteig, Vordach und Parkplatz; S-Bahn und Güterzug halten abwechselnd |
| Quartiere | bunte Einfamilienhäuser, Geschäftsstrassen, Hochhauszone mit Plaza in der Mitte, **Backstein-Viertel**, **Altstadt** mit Fachwerkhäusern und Marktplatz, **Industriequartier** mit Wasserturm, drehendem Windrad und Containern, **Kraftwerk**, Parks, **zwei Supermärkte** direkt neben Parkplätzen, eine **Kirche mit Friedhof** und ein befahrbarer **Skaterpark** mit Funbox, Kicker zum Springen, Halfpipe und Quarterpipe – schnelle Autos springen auch über die Kante der Quarterpipes. Wände und Dächer haben pro Gebäude eigene Farben |
| Start | auf dem Übungsplatz (gelbe Startfelder) neben Slalom und Pylonenkreis |
| Autos | Familienauto, Taxi, Polizeiauto, Feuerwehr: gutmütig, viel Grip, Spitze ca. 65 km/h (Feuerwehr etwas langsamer). Kaito ZX: Formelwagen mit ca. 90 km/h für Fortgeschrittene |
| Allein | Bei Sterne sammeln und Einparken wählt man **5, 10 oder 20 Ziele**. Nach einem Countdown läuft die Zeit, bis alle geschafft sind. Die Zeit kommt in die **Rangliste** („Stadt: Sterne“ bzw. „Stadt: Einparken“, getrennt nach Anzahl) |
| Duell | Zu zweit im Splitscreen mit Sternen oder Einparken: Start in **entgegengesetzten Ecken** der Stadt, beide jagen **dasselbe Ziel**, das ungefähr gleich weit (Strassenweg) von beiden entfernt erscheint. Wer zuerst dort ist, bekommt den Punkt. Nach **3 Minuten** gewinnt, wer mehr Punkte hat (kein Eintrag in der Rangliste) |
| Frei fahren | allein oder zu zweit ohne Ziel und ohne Zeit |
| Aufgaben | **Frei fahren** · **Sterne sammeln**: ein Stern auf einer Lichtsäule, oben zeigt ein Pfeil die Richtung · **Einparken**: ein Parkfeld leuchtet, meist auf einem anderen der 5 Parkplätze; gerade hineinfahren (vorwärts oder rückwärts) und kurz stehen bleiben |
| Verkehr | aus, wenig (10 Autos) oder mehr (22 Autos), höchstens 30 km/h; die Autos warten an Kreuzungen und halten hinter den Spielern an |
| Hilfe | Unten links leuchten die gedrückten Tasten (bzw. Gamepad-Knöpfe) auf, `H` blendet die Hilfe aus. Rechts oben zeigt die Stadtkarte Ziel, Spieler und Verkehr |
| Pause | `Esc` / Start: Weiter, **Auto zum Start**, Neustart, Hauptmenü |

![Übungsstadt von oben](docs/stadt-uebersicht.jpg)

| Supermarkt | Altstadt | Industrie |
|---|---|---|
| ![Supermarkt](docs/stadt-supermarkt.jpg) | ![Altstadt](docs/stadt-altstadt.jpg) | ![Industrie](docs/stadt-industrie.jpg) |

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
- Für die Übungsfahrt gibt es zwei eigene Listen, **Stadt: Sterne** und **Stadt: Einparken**. Gewertet wird die Gesamtzeit für 5, 10 oder 20 Ziele, dazu wird das schnellste einzelne Ziel angezeigt. Erlaubt sind nur Stadtautos.
- Kart-Rennen haben pro Strecke eigene Listen (`kart:<strecke>`), nur mit Karts; wegen der Boosts liegt die Untergrenze 35 % unter der Höchstgeschwindigkeit.
- Der Server speichert alles in `data/leaderboard.json`. Diese Datei ist **git-ignoriert**. Im Repo liegt nur die leere Vorlage `data/leaderboard.template.json`, mit der ein neuer Server startet.
- Mit Docker wird `./data` in den Container eingebunden. Die Rangliste übersteht Neustarts und Image-Updates und lässt sich einfach sichern.
- Zurücksetzen: `data/leaderboard.json` löschen und den Server neu starten.
- Die API ist `GET /api/leaderboard?track=<id>` (ohne `track`: die Top 50 jeder Wertung) und `POST /api/leaderboard` mit `{ entries: [...] }`.
- Unplausible Zeiten werden abgewiesen: Keine Runde darf schneller sein, als das gewählte Auto die Strecke mit Höchstgeschwindigkeit durchfahren könnte, und das Auto muss zur Streckenklasse passen. Netzwerkrennen trägt nur der Server selbst ein, per HTTP gehen nur Einzel- und Splitscreen-Zeiten. Pro IP sind 10 Einträge pro Minute erlaubt. Einzel- und Splitscreen-Zeiten werden im Browser gemessen und lassen sich deshalb nicht völlig fälschungssicher prüfen.

## Entwicklung

Voraussetzung: **Node.js ≥ 22** (`.nvmrc` liegt bei, also reicht `nvm use`)

```bash
npm install
npm run dev          # Vite-Client auf :5173 (Hot-Reload) + Spielserver auf :8090
npm test             # Strecken-, Physik-, KI-Rennsimulation, Stadt, Server und Rangliste (Vitest)
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
| [Kenney](https://kenney.nl/assets/city-kit-commercial) | City Kit (Commercial) | Geschäftshäuser und Hochhäuser in Downtown und der Übungsstadt |
| [Kenney](https://kenney.nl/assets/city-kit-industrial) | City Kit (Industrial) | Hallen, Fabriken, Wasserturm, Schornsteine, Container, Windrad (Übungsstadt) |
| [Kenney](https://kenney.nl/assets/fantasy-town-kit) | Fantasy Town Kit | Fachwerkwände, Brunnen, Marktstände, Laternen der Altstadt; Steinwände und Rundbogenfenster der Kirche |
| [Kenney](https://kenney.nl/assets/retro-urban-kit) | Retro Urban Kit | Fassaden, Markisen und Bänke des Backstein-Viertels |
| [Kenney](https://kenney.nl/assets/food-kit) | Food Kit | Frühstückstisch: Müslischale, Tassen, Teller, Croissant, Besteck, Obst |
| [Kenney](https://kenney.nl/assets/mini-skate) | Mini Skate | Rails, Grind-Boxen, Bänke und Skater im Skaterpark |
| [Kenney](https://kenney.nl/assets/watercraft-kit) | Watercraft Kit | Frachter, Schlepper, Boote, Container und Bojen im Hafen |
| [Kenney](https://kenney.nl/assets/train-kit) | Train Kit | S-Bahn, Lok und Güterwagen |
| [Kenney](https://kenney.nl/assets/graveyard-kit) | Graveyard Kit | Grabsteine, Grüfte, Eisenzaun, Laternen und Kiefern des Friedhofs |
| [Kenney](https://kenney.nl/assets/blaster-kit) | Blaster Kit | Blaster auf den Karts, Schaumstoffpfeile, Granaten als Minen |
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
  src/ui/       app.ts (Ablauf, Pause) · menus · town · results (Ergebnis, Rangliste) · lobby · widgets · prefs
                html.ts: Templates, die jede Einsetzung automatisch escapen
  src/game.ts   Spielschleife (feste 60 Hz), Splitscreen, Interpolation, Netz-Sync
  src/townGame.ts, townHud.ts, render/townWorld.ts   Übungsfahrt in der Stadt
  src/render/buildingKit.ts   Gebäude der Übungsstadt: Farbvarianten per Shader, Häuser aus Bauteilen, Supermarkt
scripts/footprints.mjs      misst die Grundflächen der Stadtgebäude (Kollision ohne Vordächer) → shared/src/townFootprints.ts
server/   Node + ws: app.ts (HTTP, Statik, API, WebSocket-Upgrade), room.ts (Lobby, Rennstatus, KI), leaderboard.ts
.github/  CI: Typecheck, Tests und Build bei jedem Push
scripts/  Asset-Download
```

- **Physik**: ein eigenes, deterministisches Arcade-Modell (Einspurmodell mit Grip-Limit). Derselbe Code läuft im Browser und auf dem Server. Der Fahrkern `driveCar` ist für Strecken und Stadt gleich, nur der Rand unterscheidet sich: Leitplanken entlang des Splines bzw. Gebäude, Bäume und Pylonen in der Stadt.
- **Strecken**: Die Strasse ist ein Spline mit einem Kontrollpunkt etwa alle 2 m. Strassenbelag, Bankette, Leitplanken und Gelände werden daraus erzeugt, die Szenerie wird mit festem Zufalls-Seed verteilt.
- **Rendering**: Bäume, Felsen und Häuser sind InstancedMeshes, so bleibt die Zahl der Draw Calls auch mit tausenden Objekten klein. Der Splitscreen nutzt einen einzigen Renderer mit zwei Scissor-Viewports.

## Versionierung

Das Projekt folgt [Semantic Versioning](https://semver.org/lang/de/). Die aktuelle Version ist **0.14.0**. Änderungen stehen im [CHANGELOG](CHANGELOG.md), Releases sind als Git-Tags `vX.Y.Z` markiert. Die Version steht auch unten rechts im Hauptmenü.

## Lizenz und Credits

- **Code**: [MIT](LICENSE) – created by Adrian S. and Anthropic Claude
- **Modelle und Texturen**: CC0 von [Kenney](https://kenney.nl) und [ambientCG](https://ambientcg.com). Herzlichen Dank! Details stehen in [CREDITS.md](client/public/cc0/CREDITS.md).
- *Need for Speed* ist eine Marke von Electronic Arts. Spidi Race ist ein unabhängiges Fan-Projekt ohne Verbindung zu EA.
