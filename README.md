# ScooterMap

Community-Karte für Roller-, Mofa- und Mopedstrecken in Deutschland.

## Funktionen

- OpenStreetMap-Karte mit Leaflet
- Anschauen- und Bearbeiten-Modus
- Ortssuche über OpenStreetMap/Nominatim
- Marker, Kreis-Gebiete und freie Flächen
- Kategorien für Fahrbahn, Sicherheit, Community und Warnungen
- Geräteübergreifende Speicherung über MySQL/MariaDB
- automatischer Sync zwischen Geräten über die API
- lokaler `localStorage`-Fallback, wenn die API nicht läuft
- einfache Bewertung: `Existiert noch` / `Nicht mehr da`

## Datenbank

Die App erwartet eine MySQL/MariaDB-Datenbank:

- Host für den Node-Server: standardmäßig `127.0.0.1`
- User: `root`
- Passwort: `root`
- Datenbank: `scootermap`
- Kollation: `utf8mb4_uca1400_ai_ci`

Die Tabellen werden beim Start von `server.js` automatisch angelegt. Alternativ kannst du `schema.sql` manuell ausführen.

Wichtig: Der Browser und das Handy sprechen nicht direkt mit MariaDB, sondern mit dem Node-Server. Wenn Node auf demselben Rechner wie MariaDB läuft, ist `127.0.0.1` korrekt. Die LAN-IP nutzt du nur zum Öffnen der Website vom Handy aus.

## Start

```bash
npm install
npm start
```

Danach im Browser öffnen:

```text
http://localhost:3000
```

Im LAN auf dem Handy verwendest du die IP des PCs, z.B.:

```text
http://192.168.20.xxx:3000
```

## Bootstrap Und Seed

Tabellen ohne Testdaten anlegen:

```bash
npm run db:bootstrap
```

Tabellen anlegen und Demo-Einträge einfügen, falls `reports` leer ist:

```bash
npm run db:seed
```

Beim Öffnen der App werden vorhandene lokale Browser-Einträge automatisch in die Datenbank übernommen, wenn die API erreichbar und die Datenbank noch leer ist.

## Standort Auf Dem Handy

iOS und moderne Browser erlauben Standortzugriff nur in sicheren Kontexten. `localhost` funktioniert auf dem eigenen Gerät, eine normale LAN-Adresse per `http://...` auf dem iPhone meistens nicht. Für echten Handy-Standort brauchst du später HTTPS, z.B. über einen Reverse Proxy mit Zertifikat.
