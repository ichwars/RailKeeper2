# RailKeeper2 Designrichtung

Stand: 12. Mai 2026

## Bambuddy-Übernahmen

- Dunkles Design weiter in Richtung neutral-dunkler Werkzeugoberfläche schärfen: weniger Blaufläche, mehr ruhige Panels, grüne Akzente.
- Primäraktionen konsequent grün, möglichst mit Icon und kurzer Beschriftung.
- Sidebar und mobiles Menü enger an Bambuddy anlehnen: kompaktes Logo, klare Icon-Navigation und reduzierte Footer-Aktionen.
- Fehler-melden-Aktion unten rechts als zurückhaltender Floating Button.
- Statuswerte bevorzugt als Pills darstellen.
- Tabellen-/Kartenumschalter als Segmented Control führen.
- Einstellungsseiten kompakter und stärker wie eine Werkzeugoberfläche strukturieren.
- Fahrzeugaktionen weiterhin als Iconbuttons mit Tooltip und ARIA-Beschriftung ausbauen.
- Bestandswerkzeuge wie Suche, Filter, Ansicht, Druck und Refresh in einer kompakten Werkzeugzeile führen.
- Übersichtskacheln dürfen lokal ausgeblendet und sortiert werden, solange das Dashboard informativ bleibt.
- Kontextmenüs passen zu RailKeeper, wenn sie direkte Fahrzeugaktionen bündeln und nicht jede Aktion als Textbutton sichtbar machen.
- Dashboard-Aktionen dürfen drucken, aktualisieren und Kennzahlen exportieren, solange sie als ruhige Werkzeugleiste erscheinen.
- Login führt standardmäßig auf die Übersicht, damit der erste Blick immer Status und offene Aufgaben zeigt.

## Stand 12. Mai 2026

- Logo, Sidebar-Footer und Fehler-melden-Button sind in RailKeeper übernommen.
- Desktop-Sidebar ist einklappbar, mobile Navigation bleibt als Hamburger-Menü.
- Bestandsliste hat Tabelle/Karten, Druck, Refresh, Filterpills und transparente Icon-Werkzeuge.
- Fahrzeug-Kurzmenü bündelt Anzeigen, Bearbeiten, QR-Code, Drucken, Uploads, Wartung und Löschen mit Icons.
- Übersicht enthält sortier-/ausblendbare Widgets, Druck und JSON-Kennzahlenexport.
- Update-Prüfung ist als konfigurierbarer, offline-sicherer Systemstatus vorbereitet.

## Offen im Design

- Wartungsbereich im Bestand weiter an Bambuddy-Top-Karten orientieren.
- Tabellenkopf und Zeilen-Hover nach realer Nutzung weiter feinjustieren.
- Einstellungen noch kompakter machen, sobald Authentifizierung/Update/Standarddrucker funktional klarer sind.
- RailKeeper-passendes erweitertes Kurzmenü für zukünftige Aktionen wie Ersatzteile und direkte Uploads entwerfen.

## Bewusst nicht übernommen

- SmartSwitch und Tastatur-Shortcut aus dem Bambuddy-Sidebar-Footer.
- Drucker-, Slicer- und Bambu-spezifische Funktionsbereiche.
- Vollständiges Drag-and-drop für Dashboardkacheln, solange einfache Reihungsbuttons wartbarer sind.
