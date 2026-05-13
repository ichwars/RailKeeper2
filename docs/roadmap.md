# Roadmap

## Completed Foundation

- Go API and static frontend runtime
- SQLite migrations and seed loading
- first-run setup and authentication
- persistent setup and login rate limiting
- CSRF and role checks
- vehicle CRUD
- master data management
- inventory number schemes and history
- article data search review workflow
- master data import/export
- QR code generation
- article-search image suggestions and primary image selection
- local image uploads with drag and drop
- automatic thumbnails for JPEG/PNG/WebP images
- image deletion reference checks
- vehicle attachments
- backup and restore
- backup compatibility preflight
- typed restore confirmation before destructive backup import
- overview dashboard
- vehicle CSV/TSV/XLSX/XLS/ODS/JSON import and export
- manual column mapping for unknown vehicle import headers
- field-level update preview for vehicle imports
- safe duplicate update mode for vehicle imports
- maintenance and condition history
- images and attachments per maintenance entry
- maintenance radar and dashboard summaries
- digital function mapping
- digital function icon picker
- ESU/ECoS function symbol master data with stored SVG graphics and upload/edit support
- digital function JSON import/export
- structured CV values and CV files
- CV import comparison preview
- decoder profile suggestions for CV values and files
- visible CV change history
- ESU/LokProgrammer project files as decoder attachments with safe metadata preview and extraction
- safe decoder preview image detection for embedded JPG/PNG/WebP images
- LokProgrammer/decoder CSV, XML and text preview for CV values and function mappings
- decoder preview actions for CV import review and function mapping import
- responsive inventory table/card switch
- compact mobile inventory layout
- compact vehicle quick menu for rows/cards/mobile entries
- icon-supported vehicle quick menu actions
- configurable overview dashboard with hide, reorder and reset controls
- overview statistics export
- login redirect to the overview dashboard
- configurable update-check endpoint with offline-safe UI status
- default GitHub release update endpoint for stable release checks
- optional prerelease update checks for beta channels
- system printer discovery with optional configured printer list
- admin user management for local accounts and Admin, Editor, Viewer and Messe role assignment
- admin session management with targeted local session revocation
- current-user password change with automatic revocation of other sessions
- admin password resets revoke affected user sessions
- settings security event review for audit logs
- compact backup export storage summary in settings

## Next Practical Milestones

1. ESU LokProgrammer import
   - only reverse-engineer proprietary ESUX blocks if no supported export path exists
   - keep expanding supported export formats when real samples become available
2. Settings and system integration
   - decide how far print jobs should be automated beyond the browser system dialog
   - decide which authentication options should become functional instead of informational
   - keep storage usage, backup and restore visible without making settings feel overloaded
3. Ongoing Bambuddy-inspired design polish
   - continue refining dense toolbar/table layouts without boxed hover effects
   - keep icon buttons transparent by default with color-only hover feedback
   - review mobile navigation after the collapsible desktop sidebar work
   - continue checking table, card and modal readability in dark mode
   - refine maintenance placement and visual hierarchy in the inventory area
   - adapt Bambuddy-style row context menus further where they add clear value
4. Vehicle action depth
   - evaluate direct upload shortcuts in the quick menu where useful
   - keep destructive actions separated and confirmed

## Explicitly Deferred

- accessories
- spare parts tab with targeted web search, images, prices, source, article numbers and update checks
- public sharing by default
- cloud sync
- multi-tenant hosting
