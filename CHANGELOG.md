# Changelog

Alle nennenswerten Änderungen an diesem Projekt. Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionierung nach [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

### Hinzugefügt
- **Roki** (Offroad): roter, kastiger Geländewagen mit weissem Dach, runden Scheinwerfern und schwarzem Reserverad an der Hecktür; auch in der Übungsstadt wählbar

## [1.7.0] – 2026-10-24

### Hinzugefügt
- Übungsstadt und Kart-Battle: **Friedhof** – wer hineinfährt, bekommt eine rot blinkende Warnung mit Countdown („pietätlos“), nach 5 Sekunden ist die Fahrt vorbei
- **Fussgänger anfahren** gibt eine Verwarnung (auch Hund und Kinderwagen), beim dritten Mal ist die Fahrt vorbei; die Leute weichen langsamen Autos aus, schnellen nicht mehr ganz
- Reisende laufen zwischen Flughafen-Bahnhof und Terminal, drei Polizisten an der Polizeistation
- Raketensprung auch in der Luft, z.B. mitten im Sprung über eine Rampe

### Geändert
- Wer ausscheidet (Friedhof, Fussgänger, Hafenbecken), beendet nur die eigene Fahrt: im Duell und im Kart-Battle (auch im Netzwerk) fahren die anderen weiter; solche Fahrten zählen nicht
- Flughafen-Bahnhof näher am Terminal, zwischen Parkplatz und Flughafengebäude
- Fussgänger queren Strassen nur auf Zebrastreifen (Einkäufer am Spidi-Markt, Reisende über die Vorfeld-Zufahrt)
- Auf Gleisen und Schotter rüttelt das Auto wie auf den Offroad-Strecken, und der Motor rumpelt auf rauem Untergrund

 – 2026-10-24

### Hinzugefügt
- Übungsstadt: **Fussgänger** (Kenney Mini Characters): Frauen, Männer und Kinder in Parks, Gärten und auf den Plätzen, mit Hund oder Kinderwagen auf den Gehwegen, Einkäufer zwischen Parkplatz und Spidi-Markt, Spaziergänger auf dem Friedhof, Sitzende auf Bänken; sie springen zur Seite, wenn ein Auto kommt
- **Bahn bis zum Flughafen**: die S-Bahn fährt vom Ostbahnhof über den nördlichen Grünstreifen zum neuen **Flughafen-Bahnhof** und zurück, der Güterzug pendelt auf einem zweiten Gleis zwischen den Tunneln – es fährt immer mindestens ein Zug. Die Gleise sind offen und befahrbar, Züge schieben Autos beiseite
- **Flugzeuge in Bewegung**: eines rollt ständig über Rollweg und Vorfeldrand, ein anderes rollt zur Piste, hebt bei zwei Dritteln ab und steigt weg, danach kommt das nächste
- **Offroad-Park** zwischen Flughafen und Hafen: Rundkurs mit Kicker, Tisch-Sprüngen, Sand, Schlamm, Wasserloch und Schikane, Felsen und Kakteen aus dem Canyon
- **Feuerwache und Polizeistation** mit Feuerwehr- und Streifenwagen neben dem nördlichen Supermarkt
- Dampf aus den Kühltürmen des Kraftwerks
- Alle Strassen-, Offroad- und Micro-Autos sind in der Übungsstadt wählbar (gezähmt auf ca. 65–85 km/h)
- Raketensprung auch für Sturmvogel RS und Steinbock DC (in allen Modi)
- Neues Übersichtsbild der Stadt im README

### Geändert
- Weltenbummler in der Stadt: 80 km/h
- Sterne sammeln (allein und im Duell): der nächste Stern erscheint weiter weg (mindestens rund 220 m, weitere Ziele häufiger)
- Einparken: das Zielfeld hat dieselbe hohe Lichtsäule wie ein Stern

### Behoben
- Frachthalle am Flughafen: unsichtbare Wand – das Hallenmodell stand 8,6 m neben seiner Kollisionsbox
- Kirche: keine offenen Bögen mehr im Kirchenschiff, das Portal hat eine Tür – man sieht nicht mehr durch das Gebäude

 – 2026-10-20

### Geändert
- **Flughafen-Rennstrecke neu** (5,2 km), nach einem Luftbild des Zürcher Flughafens nachgezeichnet: Start und Ziel auf der langen Schräg-Piste 14/32, an ihrem Ende rechts auf den Rollweg über die Querpiste 10/28, rechts entlang der Docks, ein Haken ins Vorfeld (scharf links, Haarnadel rechts), schräg über die Hauptpiste 16/34 in eine weite Schleife, zurück über 10/28 und 16/34 direkt an ihrer Kreuzung, Schlenker auf den Parallelrollweg, über den Schnellabrollweg auf 16/34 und durch die Haarnadel am Pistenende zurück auf 14/32
- Flughafen-Gelände wie in Zürich angeordnet: 14/32 östlich von 16/34, Querpiste 10/28 schräg über 16/34, Dock E zwischen den Pisten, Terminal mit Dock A und B südlich der Querpiste, Parallelrollweg östlich der Hauptpiste mit Rollwegbrücke über eine Servicestrasse, Vorfeld West mit Aussenpositionen. Die Kartstrecke bleibt unverändert
- Startende Flugzeuge: im Autorennen auf 34 (steigen über die Strecke weg), im Kart-Rennen auf 28 und 14
- Bestzeiten der alten Flughafen-Strecke passen nicht mehr zur neuen Strecke

## [1.4.1] – 2026-10-19

### Geändert
- README: neues Übersichtsbild der Übungsstadt von oben, mit Flugplatz, Bahnhof und Hafen

## [1.4.0] – 2026-10-19

### Hinzugefügt
- **Flugplatz in der Übungsstadt** auf dem Grünstreifen im Westen (Stadtgrenze nach Westen verschoben): gerade Piste entlang dem Rand, Parallelrollweg mit drei Verbindungen, Vorfeld, Terminal mit Fluggastbrücken, Frachthalle mit ein paar Containern, Tower, Windsack, Parkplatz; geparkte Flugzeuge am Terminal, auf dem Vorfeld, an der Frachthalle und auf dem Rollweg, eines am Pistenende startbereit. Piste, Rollweg und Vorfeld sind befahrbar, die Flugzeuge sind Hindernisse, auf der Stadtkarte eingezeichnet
- Flughafen: dritte, schräge Piste 14/32; die Querpiste 10/28 kreuzt nun beide anderen Pisten (wie in Zürich), Vorfeld Nord, Frachtvorfeld mit Frachthalle und Containern, deutlich mehr Flugzeuge (Vorfeld Nord, Fracht, Rollweg, Pistenanfang) und zwei Flugzeuge, die immer wieder auf 28 und 14 starten und über die Strecke wegsteigen
- Raketensprung des Weltenbummlers auch am Gamepad: △ (PlayStation, Logitech Chillstream) bzw. Y

### Geändert
- **Flughafen-Rennstrecke neu** (5,1 km): über alle drei gekreuzten Pisten – lange Gerade auf 16/34, links auf 10/28, Haarnadel auf die Schräg-Piste 14/32, dann über Rollweg „W“ mit einer Schleife über das Vorfeld (vier 90°-Ecken) zurück auf 16/34. Alle Pisten mit Beton-Belag. Die Rollwegbrücke bleibt als Kulisse. Die bisherigen Bestzeiten der Flughafen-Strecke wurden gelöscht
- **Älteste Strecken aufgefrischt** mit den Gebäuden der Übungsstadt und mehr Farben: Alpenpass mit bunten Chalets, Fachwerkdorf am Start und Laubbäumen im Tal; Küstenstrasse mit allen 21 Haustypen und Altstadthäusern in vielen Farben, Fischer- und Segelbooten und Bojen; Downtown mit eingefärbten Geschäftshäusern, Hochhäusern und Backsteinhäusern, mehr Baumarten; Speedway mit Fahrerlager im Innenraum (Garagen, Team-Transporter, Container, Rennleitung) und mehr Baumarten
- Weltenbummler: Verfolgerkamera so hoch und weit hinten wie beim Feuerwehrauto (in allen Modi), damit man über den Camper hinwegsieht
- Gamepad-Belegung in allen Modi gleich (Rennen, Kart-Rennen, Battle, Übungsfahrt): Kamera wechseln immer mit Select / Back (oder Steuerkreuz ↑), Handbremse □ / X (oder R1 / RB); △ / Y ist Raketensprung bzw. im Kart-Rennen das Item
- Steuerungsseite und README zeigen die neue Belegung

## [1.3.0] – 2026-10-19

### Hinzugefügt
- Drei neue Fahrzeuge von Markus Kramis (Pull Request #2), prozedural modelliert, auch als Stadt-Varianten:
  - **Weltenbummler** (Strasse): anthrazitfarbener Camper mit Aufstelldach und **Raketensprung** mit Fassrolle – Spieler 1 `F`, Spieler 2 `Num 2` / `Entf`, Touch-Knopf „ROCKET“; HUD mit Schub, Landung und Abkühlzeit
  - **Steinbock DC** (Offroad): weisser Doppelkabinen-Pickup mit offener Ladefläche und Geländereifen
  - **Toro Fulmine** (Strasse): oranger V12-Supersportwagen
- Tests für Raketensprung und Fassrolle

### Geändert
- Fantasienamen und deutsche Beschreibungen statt Markennamen, ohne Markenlogos am Kühlergrill

## [1.2.0] – 2026-10-19

### Hinzugefügt
- **Flughafen** als gemeinsame Welt (angelehnt an einen grossen Schweizer Landesflughafen, nicht massstabsgetreu, ohne Namen und Logos): lange Nord-Süd-Piste mit Parallelrollweg, kreuzende Piste im Norden, Rollwege, Vorfeld, Terminal, Dock A und Dock B mit Fluggastbrücken, Tower, Hangars, Rollwegbrücke über eine Servicestrasse
- **Flughafen** (nur Autorennen, 5,7 km): 2,4 km Vollgas auf der Piste, zurück über den Parallelrollweg mit 90°-Abzweigen und unter der Rollwegbrücke durch
- **Flughafen Kart** (nur Kart-Rennen, 3,4 km, Runde ca. 1:50): Start-Ziel-Gerade auf der Piste, dann schneller Bogen, Schikane, S-Kurven, Haarnadel am Tower und 90°-Ecken entlang der Hangars; die ?-Boxen-Reihen liegen nach dem Bogen, auf der Geraden an den Hangars und vor der letzten Kurve
- Prozedurale Passagierjets im Low-Poly-Stil (4 Farbvarianten, instanziert), Pisten- und Rollwegmarkierungen, Befeuerung, Windsäcke, Vorfeld-Fahrzeuge, Zaun und Baumgruppen
- Strecken können einem Modus zugeordnet werden (`modes: ['race']` / `['kart']`); Menü, Lobby, Server und Rangliste zeigen je Modus nur die passenden Strecken. Alle bisherigen Strecken bleiben unverändert in ihren Modi
- Tests für beide Flughafenstrecken, die Modus-Zuordnung, die Lage der ?-Boxen, den Abstand der Kulisse zur Fahrbahn und Items auf der Kartstrecke

### Geändert
- Die Entwickleransicht `?view=<strecke>@<meter>` kennt Strecken-IDs mit Bindestrich

## [1.1.0] – 2026-10-17

### Hinzugefügt
- Netzwerk-Lobby: Gäste melden sich mit **Bereit**; der Host sieht „Rennen starten (2/3 bereit)“, und der Start fragt einmal nach, solange er allein ist oder nicht alle bereit sind. Nach jedem Rennen bestätigen alle wieder
- Die Lobby zeigt pro Fahrer den Status (Host, bereit, noch nicht bereit, fährt, wartet aufs nächste Rennen), die Rennart und die Adresse für Mitspieler
- Kommt jemand während eines Rennens in die Lobby, bekommt der Host im Rennen eine Meldung

### Geändert
- Netzwerkspiel: Beim Beitreten gibt man nur noch Namen und Spielerzahl an. Das Fahrzeug wählt man in der Lobby mit der grossen Fahrzeugkarte, immer passend zur eingestellten Rennart (Strasse, Offroad, Micro oder Kart) – vorher wählte man zuerst ein Strassenauto, das bei Offroad- oder Kart-Rennen wieder ersetzt wurde

## [1.0.1] – 2026-10-17

### Hinzugefügt
- **Logitech Chillstream** (046d:cad1) wird als PlayStation-Controller erkannt und hat dieselbe Belegung wie der PS3-Controller (✕ Gas, ○ Bremse, □/R1 Handbremse, △ Kamera bzw. Item, Select, Start, beide Sticks, Steuerkreuz), auch ohne Standard-Belegung des Browsers (Logitech-Tastenreihenfolge, Steuerkreuz als Hat-Achse unter Linux und Windows)

## [1.0.0] – 2026-10-17

Erste stabile Version: Das Spiel ist auf echter Hardware getestet.

### Hinzugefügt
- **Zweiter Skaterpark** neben dem Parkplatz des zweiten Supermarkts, gleich aufgebaut wie der erste (Funbox, Kicker mit Landung, Halfpipe, Quarterpipe, Rails, Grind-Boxen, Bänke); die übrige Stadt bleibt unverändert
- **Gas am Gamepad über einen Stick** (Steuerung → „Gas am Gamepad“): *Trigger / Taste* wie bisher, *Rechter Stick* (hoch = Gas, runter = Bremse / Rückwärts, gelenkt wird mit dem linken Stick) oder *Linker Stick* (Lenken und Gas mit einem Stick). Trigger und Tasten geben in jeder Einstellung weiterhin Gas; die Steuerungshilfe der Übungsfahrt zeigt die gewählte Belegung

### Geändert
- README: alle Screenshots neu (Version 1.0.0), dazu neue Bilder von Kart-Rennen, Kart-Battle, Skaterpark und Hafen
- Entwicklerhilfe `?townview=x,z,Blickrichtung,Höhe` kennt `&nofog` (Stadtübersicht ohne Nebel)

### Behoben
- Stadt: Keine unsichtbaren Wände mehr in der Luft. Geparkte Autos, Strassenlaternen, Bäume, Gebäude, Vordach-Pfosten, Tanks und Containerstapel reichen in der Kollision nur noch so hoch wie ihr Modell – vorher waren sie unendlich hoch, und wer aus der Quarterpipe über den Parkplatz sprang, prallte mitten in der Luft ab

## [0.19.0] – 2026-10-16

### Hinzugefügt
- **Grafik-Einstellung** im Hauptmenü: Auto, Hoch oder Niedrig (ohne Kantenglättung, geringere Auflösung)
- **Bis zu 3 Items sammeln** in Kart-Rennen und Battle: sie werden nacheinander eingesetzt, die gesammelten stehen klein neben dem Item-Slot
- Netzwerkspiel: eigene Schüsse, Minen, Schild und Turbo erscheinen sofort beim Drücken, der Server bestätigt sie; ein abgelehnter Einsatz verschwindet wieder

### Geändert
- Neue Kart-Fahrer: kleiner, mit Helm in der Kartfarbe, weissem Streifen und dunklem Visier, Rennanzug und Händen am Lenkrad – statt der grossen, blassen Kugel

### Behoben
- Stadt: Über niedrige Hindernisse (Rails, Grind-Boxen, Bänke, Paletten, einzelne Container, Hütchen, Poller) kann man jetzt springen – vorher stiess man in der Luft an ihren unsichtbaren Grundriss
- Skaterpark: Seiten- und Rückwände der Rampen sind jetzt Wände, an denen man abprallt. Vorher wurde ein Auto, das tief dagegen flog, schlagartig nach oben gerissen oder mit Tempo seitlich hineinfahrend bis zu 30 m hoch katapultiert

## [0.18.0] – 2026-10-16

### Hinzugefügt
- **Kart-Battle im Netzwerkspiel**: Der Host wählt in der Lobby „Kart-Battle in der Stadt“ und 0–4 Computer-Karts, insgesamt bis zu 8 Karts (zwei neue Startkreuzungen)
  - der Server führt Ballons, Item-Boxen, Projektile, Minen, Treffer, die Bots und den Sturz ins Hafenbecken; jedes Gerät fährt seine eigenen Karts
  - Ergebnis für alle mit „Zurück zur Lobby“; wer das Spiel verlässt, scheidet aus

### Geändert
- Kart-Battle: keine Ballons mehr über den Karts – die Ballons stehen nur noch im HUD; ein Treffer zeigt einen kleinen weissen Puff

## [0.17.0] – 2026-10-16

### Hinzugefügt
- **Kart-Rennen im Netzwerkspiel**: Der Host schaltet in der Lobby auf „Kart-Rennen mit Items“; alle wählen ihr Kart direkt in der Lobby
  - der Server führt Item-Boxen, Würfeln nach Platzierung, Projektile, Minen und Treffer für alle sowie die KI-Karts mit ihrer Item-Taktik
  - Clients senden nur „Item benutzen“ und den Drift-/Boost-Zustand ihrer Karts; Treffer, Schild und Turbo kommen mit den Snapshots zurück
  - Online-Kart-Zeiten trägt der Server in die Kart-Rangliste ein

## [0.16.0] – 2026-10-16

### Hinzugefügt
- **Touch-Steuerung** für Smartphones und Tablets (Spieler 1): Lenkfeld links, Gas, Bremse, Drift und – in den Kart-Modi – Item rechts, Kamera und Pause oben; mehrere Finger gleichzeitig, Hinweis bei Hochformat, Vollbild beim Spielstart, kein Zoomen oder Scrollen
- Leichtere Grafik auf Touch-Geräten (geringere Auflösung, keine Kantenglättung)

### Behoben
- Spielschleifen: Ein negativer Zeitschritt (der erste Bild-Zeitstempel kann vor `performance.now()` liegen) konnte die Physik für viele Sekunden anhalten
- „Nochmal“ und „Neustart“ entfernten das HUD des neuen Spiels: Jedes Spiel räumt jetzt nur noch seine eigenen HUD-Elemente weg

## [0.15.0] – 2026-10-15

### Hinzugefügt
- **Kart-Battle in der Stadt** (Kart-Menü → „Battle in der Stadt“): 1 oder 2 Spieler im Splitscreen und 0–4 Computer-Karts
  - je 3 Ballons über dem Fahrer, ein Treffer kostet einen, ein Sturz ins Hafenbecken alle; wer zuletzt Ballons hat, gewinnt, spätestens nach 3 Minuten
  - ?-Boxen auf jeder zweiten Kreuzung, Projektile prallen an Gebäuden ab, Zielsucher jagen das nächste Kart
  - Bots fahren über das Strassenraster zu Boxen und Gegnern und setzen ihre Items gezielt ein
  - HUD mit Ballons aller Karts, Restzeit, Item-Slot; Ergebnis mit Platzierung, Ballons und Treffern

### Geändert
- Die Item-Logik arbeitet mit „Arenen“ (Strecke oder Stadt), die Kart-Regeln mit beliebiger Fahrphysik darunter

## [0.14.0] – 2026-10-15

### Geändert
- Hafen: viel voller – zwei Containerlager mit Stapeln bis drei hoch, Sattelschlepper, zwei weitere Lagerhallen; Container und Lastwagen in echten Massen (40- und 20-Fuss-Container)
- Hafen: kein Geländer und keine Poller mehr am Kai. Wer ins Wasser fährt, fällt hinein (mit Fontäne) und die Fahrt ist zu Ende – ohne Ranglisten-Eintrag; im Duell gewinnt dann der andere
- Skaterpark: Die Quarterpipes haben oben keine Wand mehr, schnelle Autos springen über die Kante; die Figuren sind entfernt
- Karts fahren etwa 30 % schneller (Höchstgeschwindigkeit und Beschleunigung jedes Karts im gleichen Verhältnis)
- Industrieareal: Container in echter Grösse statt der viel zu breiten Kit-Modelle, teils gestapelt; das Windrad dreht sich
- README: neues Übersichtsbild der Stadt aus der Vogelperspektive; `.nvmrc` mit Node 22

## [0.13.0] – 2026-10-15

### Hinzugefügt
- **Kart-Rennen mit Items** (Hauptmenü): auf allen Strassen- und Offroad-Strecken, allein oder im Splitscreen, gegen KI-Karts
  - 5 Karts mit Alien-Fahrern aus dem Kenney Car Kit
  - ?-Boxen in drei Reihen pro Runde, Item nach Platzierung gewichtet, Roulette im HUD
  - Items: Blaster (prallt an der Leitplanke ab), Zielsucher, Mine, Turbo, Schild; Treffer lassen das Kart drehen, danach kurz unverwundbar
  - Drift-Boost in drei Stufen mit farbigen Funken, Hüpfer beim Driftstart (über Minen springen)
  - KI-Karts setzen Items gezielt ein und driften in engen Kurven
  - Treffer mit fliegenden Trümmerteilen, Kamera-Wackler, Meldungen „Getroffen von …“, Projektile auf der Minikarte, synthetisierte Sounds
  - Item-Taste: `E` / `Ende` / `-` / `Num 1`, am Gamepad Y bzw. △ (die Kamera liegt im Kart-Rennen auf Back/Select bzw. Steuerkreuz hoch)
  - Eigene Kart-Ranglisten pro Strecke mit Umschalter „Autos / Karts“
- Die Item-Logik ist rein, deterministisch und ohne Browser (`shared/src/items.ts`), als Grundlage für spätere Netzwerk-Kart-Rennen

## [0.12.0] – 2026-10-15

### Hinzugefügt
- Übungsstadt erweitert, die bestehenden Quartiere bleiben unverändert:
  - **Hafen** am Südrand: Kai mit Pollern und Barriere, Lagerhallen, Containerstapel, Parkfelder; im Wasser festgemachte Frachter, Schlepper, Fischer- und Hausboote, Bojen und drei fahrende Boote
  - **Bahn** am Ostrand: eingezäuntes Gleis zwischen zwei Tunnelportalen, Backstein-Bahnhof mit Bahnsteig, Vordach und Parkplatz; S-Bahn und Güterzug fahren abwechselnd ein, halten 15 s und fahren weiter
  - **Skaterpark** (statt eines Parks): Funbox, Kicker mit Landung, Halfpipe und Quarterpipe sind befahrbar – Autos fahren hoch, springen und landen; dazu Rails, Grind-Boxen, Bänke und Skater
  - **Kirche mit Friedhof** (statt eines Häuserblocks neben der Altstadt): Kirche aus Steinwänden mit Turm, Spitzhelm und Kreuz; Friedhof mit Eisenzaun und zwei Toren, Grabreihen, Grüften, Laternen, Kiefern und Bänken
  - Neue Sterne und Parkfelder im Hafen, am Bahnhof und im Skaterpark; die Stadtkarte zeigt Hafen und Bahn
- Neue CC0-Modelle: Kenney Mini Skate, Watercraft Kit, Train Kit, Graveyard Kit, Blaster Kit (für den Kart-Modus) sowie Karts und Trümmerteile aus dem Car Kit

### Behoben
- Die Bäume der Übungsstadt wurden doppelt gezeichnet

## [0.11.2] – 2026-10-15

### Sicherheit
- Der Server stürzt nicht mehr ab, wenn er kaputte Nachrichten (`null`, leere Spieler, leere Autos) oder kaputte URLs (`/%E0%A4%A`, `//`) bekommt; das waren 5 Wege, das Spiel für alle mit einer einzigen Nachricht zu beenden
- Autozustände aus dem Netz werden bereinigt (Typen, Wertebereiche), und kein Auto kann sich mehr weiter bewegen, als es fahren kann (Speedhack)
- Rangliste: Untergrenze je Auto statt pauschal 396 km/h, Auto muss zur Streckenklasse passen, Netzwerkrennen trägt nur der Server ein, Rate-Limit 10 Einträge pro Minute und IP; ohne `track` liefert die API nur noch die Top 50 jeder Wertung
- WebSocket nimmt nur Verbindungen von der eigenen Seite an (Origin-Prüfung); Pfadprüfung der Statik mit `relative()` statt Präfixvergleich
- Sicherheits-Header (Content-Security-Policy, `nosniff`, Referrer-Policy)
- Docker: Node 22 statt des abgelaufenen Node 20, gehärtete `docker-compose.yml` (schreibgeschützt, keine Capabilities, Speicherlimit)
- Abhängigkeiten: Vitest 5, esbuild 0.25, fflate 0.8.3 – `npm audit` meldet 0 Schwachstellen

### Behoben
- Die Rennuhr im Netzwerkspiel lief 3 % zu schnell (Node rundet `setInterval` ab); die Server-Schleife rechnet jetzt auf Echtzeit
- Geisterspieler: Verbindungen ohne Antwort auf Ping werden nach etwa 30 s getrennt
- Die Rangliste schreibt gebündelt und asynchron (höchstens alle 2 s) und blockiert das Rennen nicht mehr; beim Stoppen des Containers wird Ungespeichertes noch geschrieben, Schreibfehler werden deutlich gemeldet
- Statische Dateien mit ETag/304 und gzip: Modelle und Texturen werden nicht mehr bei jedem Aufruf neu geladen

### Geändert
- Menü-Code aufgeteilt (`ui/app.ts`, `menus`, `town`, `results`, `lobby`, `widgets`, `prefs`); alle HTML-Templates escapen Einsetzungen automatisch (`ui/html.ts`)
- Die Ranglisten-Ansicht lädt pro Strecke
- CI mit GitHub Actions (Typecheck, Tests, Build)
- Neue Tests für Server (Absturzversuche, Rechte, Speedhack, Uhr, Ping), HTTP (URLs, Pfade, Header, Origin, Rate-Limit) und das Escaping

## [0.11.1] – 2026-10-14

### Behoben
- Backstein-Viertel: Die Häuser waren unvollständig (teils nur 3 Wände, frei stehende Rahmenteile), weil die Fassadenplatten des Retro Urban Kits nach innen zeigten; jetzt sind alle vier Seiten geschlossen, Ladenfronten mit Markisen zur Strasse
- Hochhauszone: Unter dem Vordach des Hochhauses mit Eingangsdach kann man jetzt durchfahren; nur die beiden Stützen sind Hindernisse. Allgemein kollidieren Gebäude der Übungsstadt nur noch mit ihren Wänden am Boden (gemessen aus den Modellen mit `scripts/footprints.mjs`), nicht mehr mit Vordächern und Dachüberständen

## [0.11.0] – 2026-10-14

### Hinzugefügt
- **Übungsstadt mit Quartieren**: Backstein-Viertel (Retro Urban Kit), Altstadt mit Fachwerkhäusern und Marktplatz samt Brunnen (Fantasy Town Kit), Industriequartier mit Hallen, Wasserturm, Windrad und Containerlager sowie ein Kraftwerk mit Schornsteinen (City Kit Industrial)
- **Zwei Supermärkte** („SPIDI MARKT“), jeder direkt neben einem Parkplatz, mit Vorplatz, Eingang zum Parkplatz und Einkaufswagen-Unterstand
- **Farbvielfalt**: Wände und Dächer werden pro Gebäude aus Farbpaletten gewählt (Shader färbt die Palettenfelder der Kenney-Kits um); alle 21 Haustypen des Suburban-Kits
- Hochhauszone in der Mitte mit unterschiedlich hohen und getönten Türmen und einer Plaza mit Brunnen, Bänken und Bäumen
- Stadtkarte im HUD zeigt die neuen Quartiere; Entwickler-Ansicht `?townview=x,z,richtung,höhe`
- Neue CC0-Assets: Kenney City Kit Industrial, Fantasy Town Kit, Retro Urban Kit

### Geändert
- Anzahl und Lage der 5 Parkplätze, Übungsplatz und Hochhauszone bleiben unverändert; ersetzt wurden Einfamilienhaus-Blöcke am Rand, zwei Geschäftsblöcke und zwei Parks

## [0.10.1] – 2026-10-12

### Geändert
- PlayStation-Controller: Handbremse wieder auf □ (wie vor 0.9.1), ✕ gibt wieder Gas

## [0.10.0] – 2026-10-12

### Hinzugefügt
- **Übungsfahrt mit Ende und Rangliste**: Bei Sterne sammeln und Einparken wählt man 5, 10 oder 20 Ziele; nach einem Countdown läuft die Zeit, bis alle geschafft sind. Ergebnis mit schnellstem Ziel und Eintrag in die neuen Ranglisten **Stadt: Sterne** und **Stadt: Einparken** (je Anzahl Ziele)
- **Splitscreen-Duell** in der Stadt: Start in entgegengesetzten Ecken, beide jagen dasselbe Ziel, das ungefähr gleich weit von beiden entfernt erscheint; Punkt für den Schnelleren, nach 3 Minuten gewinnt, wer mehr Punkte hat
- HUD der Übungsfahrt mit Zähler, Uhr bzw. Restzeit und Countdown

### Geändert
- Der bisherige 2-Spieler-Modus mit getrennten Zielen entfällt; zu zweit gibt es „Frei fahren“ oder das Duell

## [0.9.1] – 2026-10-12

### Geändert
- PlayStation-Controller: Handbremse auf ✕ statt □; □ gibt jetzt Gas (wie R2)
- Übungsfahrt: Die Kamera richtet sich nach der Höhe des Autos; bei Familienauto, Taxi, Polizei und Feuerwehr sitzt sie höher und weiter hinten, man sieht über das Auto hinweg
- Die Steuerungshilfe zeigt die Knöpfe passend zum Controller (Xbox oder PlayStation)

### Behoben
- Xbox- und andere Standard-Controller ohne Standard-Belegung (z. B. Firefox unter Linux): das Auto lenkte dauernd nach links, weil der linke Trigger als rechter Stick gelesen wurde; Trigger, Start und Steuerkreuz werden jetzt richtig erkannt

## [0.9.0] – 2026-10-12

### Hinzugefügt
- **Übungsfahrt in der Stadt**: offene Stadt von 1 × 1 km zum freien Herumfahren, ohne Rennen und ohne Zeitdruck – gedacht zum Kennenlernen von Tastatur und Gamepad
  - Strassenraster mit zweispurigen Strassen, Zebrastreifen, Trottoirs, Einfamilienhäusern, Geschäften, Hochhäusern, Parks, fünf Parkplätzen und einem Übungsplatz mit Pylonen-Slalom und -Kreis
  - Gärten und Innenhöfe sind befahrbar: Jedes Gebäude hat eine eigene Kollision, nur die Stadt selbst ist von einer Mauer umgeben
  - Aufgaben: **Frei fahren**, **Sterne sammeln** (Stern auf Lichtsäule, Richtungspfeil und Distanz) oder **Einparken** (leuchtendes Parkfeld, vorwärts oder rückwärts; das nächste Feld liegt meist auf einem anderen Parkplatz)
  - Langsamer **Verkehr** (aus / wenig / mehr): Autos fahren rechts, warten an Kreuzungen und halten Abstand, auch zu den Spielern
  - 1 oder 2 Spieler (Splitscreen), Stadtkarte mit Ziel, **Steuerungshilfe** mit Tasten bzw. Gamepad-Knöpfen, die beim Drücken aufleuchten (`H` blendet sie aus)
  - Pause-Menü mit „Auto zum Start“
- Neue Fahrzeugklasse **Stadt** mit gemütlichen Alltagsautos (Spitze ca. 65 km/h): **Familienauto**, **Taxi**, **Polizeiauto**, **Feuerwehr**; dazu der Formelwagen **Kaito ZX** (ca. 90 km/h) für Fortgeschrittene
- Neue CC0-Modelle aus dem Kenney Car Kit: `sedan`, `taxi`, `police`, `firetruck`, `van`, `delivery`

### Geändert
- Die Fahrphysik ist in einen gemeinsamen Kern (`driveCar`) und den Streckenrand bzw. die Stadt-Kollision aufgeteilt
- Die Verfolgerkamera rückt bei grossen Fahrzeugen weiter weg, die Stossstangenkamera sitzt vorne am Auto

## [0.8.1] – 2026-10-12

### Hinzugefügt
- Gamepad: Auch der rechte Stick lenkt (es zählt der weiter ausgelenkte Stick)

## [0.8.0] – 2026-10-12

### Hinzugefügt
- Gamepad: Steuerkreuz lenkt, Y/△ wechselt die Kamera, Start pausiert
- PS3-Controller (DualShock 3) auch ohne Standard-Mapping des Browsers (Firefox unter Linux); Hinweis zu DsHidMini für Windows 11

### Behoben
- Gamepads werden nach Anschlussreihenfolge den Spielern zugeordnet; reine Sensor-Geräte (z. B. „Motion Sensors“ des PS3-Controllers unter Linux) belegen keinen Platz mehr

## [0.7.0] – 2026-10-12

### Hinzugefügt
- **Micro-Klasse** im Stil von *Micro Machines*: Spielzeugautos im Massstab ~1:100 auf einem riesigen Frühstückstisch
  - **Frühstückstisch** (~0,9 km): Haarnadeln um Müslischale und Schneidbrett, S-Kurve, Strohhalme als Banden, verstreute Cornflakes und Krümel; rundherum Küche mit Fliesenboden, Wänden und Arbeitsplatte
  - Autos: **Mini-Blitz**, **Taschen-Flitzer**, **Zwergrakete** – spritzig, wendig, mit hohem, surrendem Motorklang
- **Vogelperspektive** als vierte Kamera (feste Ausrichtung, blickt in Fahrtrichtung voraus); auf Micro-Strecken voreingestellt, sonst per Kamerataste wählbar
- Micro-Auto wird pro Spieler gemerkt; Lobby und Server wählen automatisch Autos der passenden Klasse
- Neue CC0-Assets: Kenney Food Kit, ambientCG Wood049

### Geändert
- Der Menü-Hintergrund zeigt das Auto der Klasse der gewählten Strecke

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

[1.4.1]: https://github.com/defendeggu/spidi-race/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/defendeggu/spidi-race/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/defendeggu/spidi-race/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/defendeggu/spidi-race/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/defendeggu/spidi-race/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/defendeggu/spidi-race/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/defendeggu/spidi-race/compare/v0.19.0...v1.0.0
[0.19.0]: https://github.com/defendeggu/spidi-race/compare/v0.18.0...v0.19.0
[0.18.0]: https://github.com/defendeggu/spidi-race/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/defendeggu/spidi-race/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/defendeggu/spidi-race/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/defendeggu/spidi-race/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/defendeggu/spidi-race/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/defendeggu/spidi-race/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/defendeggu/spidi-race/compare/v0.11.2...v0.12.0
[0.11.2]: https://github.com/defendeggu/spidi-race/compare/v0.11.1...v0.11.2
[0.11.1]: https://github.com/defendeggu/spidi-race/compare/v0.11.0...v0.11.1
[0.11.0]: https://github.com/defendeggu/spidi-race/compare/v0.10.1...v0.11.0
[0.10.1]: https://github.com/defendeggu/spidi-race/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/defendeggu/spidi-race/compare/v0.9.1...v0.10.0
[0.9.1]: https://github.com/defendeggu/spidi-race/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/defendeggu/spidi-race/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/defendeggu/spidi-race/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/defendeggu/spidi-race/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/defendeggu/spidi-race/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/defendeggu/spidi-race/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/defendeggu/spidi-race/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/defendeggu/spidi-race/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/defendeggu/spidi-race/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/defendeggu/spidi-race/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/defendeggu/spidi-race/releases/tag/v0.1.0
