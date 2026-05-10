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
- automatic thumbnails for JPEG/PNG images
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
- decoder profile suggestions for CV values and files
- visible CV change history
- responsive inventory table/card switch

## Next Practical Milestones

1. Local media polish
   - optional WebP thumbnail generation

2. Decoder and CV data polish
   - CV comparison helpers for imported decoder files

3. Responsive inventory polish
   - compact mobile layout

4. Vehicle import polish
   - secure backend import for XLS
   - field-level import preview before updating existing vehicles

5. ESU LokProgrammer import
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
