# RailKeeper2 Status 2026-05-13

## Stand

Der aktuelle Stand ist lokal gebaut, per Docker Compose gestartet und auf GitHub `main` gepusht. Der Container `railkeeper2` meldete nach den letzten Funktionspunkten jeweils `healthy`.

## Heute abgeschlossen

- Admin-Sitzungsverwaltung in den Einstellungen: Sitzungen anzeigen, aktualisieren und gezielt widerrufen.
- Passwortwechsel für den aktuellen Benutzer inklusive Widerruf anderer eigener Sitzungen.
- Admin-Passwort-Reset widerruft aktive Sitzungen des betroffenen Benutzers.
- Persistente Login- und Setup-Rate-Limits.
- Audit-Log in den Einstellungen inklusive Labels für neue Authentifizierungsereignisse.
- Backup-Restore mit Texteingabe `WIEDERHERSTELLEN`.
- Backup-Export zeigt kompakt lokale Ablagegröße und Dateianzahl.
- Beta-/Prerelease-Updateprüfung ist im Backend und in der Settings-UI aktivierbar.
- Decoder-Preview-Aktionen übernehmen erkannte CV-Werte und Funktionstasten.
- ESU/ECoS-Funktionstastensymbole werden als Stammdaten mit SVG-Bild, Beschreibung und Upload-Pflege gespeichert.
- Messelisten-Einträge nutzen in der Funktionstasten-Maske den Symbol-Picker mit den gespeicherten Stammdaten-SVGs.
- Zusätzliche HTTP-Tests für Passwortwechsel und Session-Management.

## Letzte Commits

```text
08aa197 Cover session management API
410869e Cover password change API
1b054db Label authentication audit events
28cbf81 Revoke sessions after admin password resets
1989e45 Show storage summary for backups
c910fee Enable beta update checks in settings
e0befcd Add current user password change
b4d2690 Add admin session management
```

## Offene Entscheidungen

- PDF-/Druckumfang festlegen: Kurzliste, Versicherungs-/Wertliste oder Detailblatt je Fahrzeug.
- Messe-Druck konkret definieren: welche Spalten, Kopfzeile, Sortierung und ob gesperrte Listen anders markiert werden.
- Zwei-Faktor-Authentifizierung: gewünschtes Verfahren und ob zunächst TOTP reicht.
- LDAP/SSO/OIDC: nur vorbereiten oder wirklich anbinden.
- ESU/LokProgrammer: weitere echte Beispieldateien sammeln, bevor proprietäre ESUX-Blöcke tiefer interpretiert werden.
- Zubehör/Ersatzteile bleiben bewusst zurückgestellt, bis der Fahrzeug-Workflow stabil genug ist.

## Verifikation

- `go test ./...`
- `npm.cmd run build`
- `git diff --check`
- `docker compose up -d --build`
- `Invoke-RestMethod http://localhost:8080/health`
- `docker inspect --format='{{.State.Health.Status}}' railkeeper2`
