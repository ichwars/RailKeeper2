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
- vehicle CSV/TSV/XLSX/JSON import and export
- maintenance and condition history
- images and attachments per maintenance entry
- digital function mapping
- structured CV values and CV files
- responsive inventory table/card switch

## Next Practical Milestones

1. Local media polish
   - optional WebP thumbnail generation

2. Maintenance and condition polish
   - richer dashboard summaries for planned maintenance

3. Digital functions polish
   - richer icon picker
   - import/export of function mappings

4. Decoder and CV data polish
   - decoder profiles
   - change history

5. Responsive inventory polish
   - compact mobile layout
   - richer dashboard summaries

6. Vehicle import polish
   - secure backend import for XLS/ODS
   - duplicate matching and update mode for existing vehicles

7. ESU LokProgrammer import
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
