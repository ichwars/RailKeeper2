# RailKeeper2 Status 2026-05-13

## Stand

Der aktuelle Stand ist lokal gebaut, per Docker Compose gestartet und auf GitHub `main` gepusht. Der Container `railkeeper2` meldete nach den letzten Funktionspunkten jeweils `healthy`.

## Heute abgeschlossen

- Admin-Sitzungsverwaltung in den Einstellungen: Sitzungen anzeigen, aktualisieren und gezielt widerrufen.
- Sitzungsansicht lädt serverseitig begrenzt nur die benötigten Einträge und ist per API-Test abgesichert.
- Passwortwechsel für den aktuellen Benutzer inklusive Widerruf anderer eigener Sitzungen.
- Admin-Passwort-Reset widerruft aktive Sitzungen des betroffenen Benutzers.
- Persistente Login- und Setup-Rate-Limits.
- Audit-Log in den Einstellungen inklusive Labels für neue Authentifizierungsereignisse.
- Backup-Restore mit Texteingabe `WIEDERHERSTELLEN`.
- Backup-Export zeigt kompakt lokale Ablagegröße und Dateianzahl.
- Backup-Export/Restore ist gegen versehentliche Auth-Tabellen, Sitzungen und Passworthashes abgesichert; ignorierte Auth-Tabellen werden in der Validierung als Warnung behandelt.
- Messelisten und Messelisteneinträge werden im Backup gesichert und wiederhergestellt; ältere Backups ohne diese Tabellen bleiben kompatibel.
- Beta-/Prerelease-Updateprüfung ist im Backend und in der Settings-UI aktivierbar.
- Decoder-Preview-Aktionen übernehmen erkannte CV-Werte und Funktionstasten.
- ESU/ECoS-Funktionstastensymbole werden als Stammdaten mit SVG-Bild, Beschreibung und Upload-Pflege gespeichert.
- Messelisten-Einträge nutzen in der Funktionstasten-Maske den Symbol-Picker mit den gespeicherten Stammdaten-SVGs.
- Messelisten-Druck gibt den aktuellen Tabellenstand inklusive Bildspalte, Notizen, Sperrstatus und Funktionstasten-Symbolen aus.
- Messe-API ist per HTTP-Test für Messe-Rollenzugriff und gesperrte Listen abgesichert.
- Messe-Eintrag-Rechte sind per HTTP-Test abgesichert: Einträge anlegen/bearbeiten erlaubt, Einträge löschen und Listenverwaltung nur Admin.
- Reine Messe-Benutzer sind backend- und frontendseitig von Viewer-/Bestandsrouten getrennt; kombinierte Rollen werden als Rollenunion behandelt.
- Messe-/Messelisten-Aktionen werden im Audit-Log mit eigenen Labels protokolliert und per Lifecycle-Tests für Listen und Einträge abgesichert.
- Fehlende GitHub-Releases werden beim Update-Check ruhig als eigener Status `no_release` behandelt und in den Einstellungen als "kein Release" angezeigt.
- Zusätzliche HTTP-Tests für Passwortwechsel und Session-Management.

## Letzte Commits

```text
2c21ae0 Allow older backups without exhibition tables
026e2b1 Cover backup table coverage
b320d0d Include exhibition data in backups
13ff961 Refresh status after settings safeguards
83c66a9 Cover ignored auth backup tables
6fa4356 Cover backup auth table exclusions
778eed2 Cover session list API limit
57f2cf6 Limit session list in API
68bd0c1 Align planned integration cards
19bd1eb Polish settings security layout
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
