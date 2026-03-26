# wirkungsmessung — CONTEXT

> Maschinenlesbar. Lies das ZUERST.

## TL;DR
- **Live**: Docker (Port 18791)
- **Stack**: Node.js 22, Express, SQLite (WAL-Mode)
- **Status**: Working | Branch: main
- **Stand**: 26.03.2026

## PRODUKT
- **Problem**: Wirkungsmessung für Projekte/Initiativen
- **Lösung**: Web-App zur Erfassung und Auswertung von Wirkungsindikatoren
- **Nicht-Scope**: Automatisierte Datenerhebung

## KRITISCH — Build & Dev
```bash
npm install
npm start   # Express-Server
```

## DEPLOY
- Docker Container auf Port 18791
- SQLite-DB unter /data (persistent Volume!)

## BEKANNTE FALLEN
- SQLite WAL-Mode braucht persistentes /data Volume — bei Container-Neustart gehen Daten verloren ohne Volume
- `npm start` (kein Build-Step)
