/** Excel import facade: local Worker parsing, flexible mapping and preview workflow. */
export { createImportUI } from '../../src/import/import-ui.js';
export { readExcel } from '../../src/import/reader.mjs';
export {
  detectTemplate, detectPeriod, previewSheet, validateMapping, createProfile,
  parseMinutes, FIELD_LABELS,
} from '../../src/import/engine.mjs';
