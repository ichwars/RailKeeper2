# Roadmap

## Completed Foundation

- Go API and static frontend runtime
- SQLite migrations and seed loading
- first-run setup and authentication
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
- overview dashboard
- vehicle CSV/TSV/XLSX/ODS/JSON import and export
- safe duplicate update mode for vehicle imports
- maintenance and condition history
- images and attachments per maintenance entry
- maintenance radar and dashboard summaries
- digital function mapping
- digital function icon picker
- digital function JSON import/export
- structured CV values and CV files
- CV import comparison preview
- decoder profile suggestions for CV values and files
- visible CV change history
- responsive inventory table/card switch

## Next Practical Milestones

1. Responsive inventory polish
   - compact mobile layout

2. Vehicle import polish
   - secure backend import for XLS
   - field-level import preview before updating existing vehicles

3. ESU LokProgrammer import
   - read safe ESUX metadata such as decoder, address, project name and preview image
   - import ESUX files as decoder attachments
   - evaluate LokProgrammer CSV/XML/text exports for CV values and function mappings
   - only reverse-engineer proprietary ESUX blocks if no supported export path exists

## Explicitly Deferred

- accessories
- spare parts tab with targeted web search, images, prices, source, article numbers and update checks
- public sharing by default
- cloud sync
- multi-tenant hosting
