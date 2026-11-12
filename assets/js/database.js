/** Public IndexedDB API for the MVP. Persistence stays in the versioned db modules. */
export { DB_NAME, DB_VERSION, STORES, openDatabase, readTables } from '../../src/db/database.mjs';
export {
  readImportState, activeImports, assessImport, saveImport, cancelImport,
  saveProject, createProject, saveEmployee, getProfiles, saveProfile,
} from '../../src/db/import-store.mjs';
export { listEmployees, listProjects, queryOTRecords, getEmployeeOTSummary, getOTReport, getEmployeeOTHistory } from '../../src/db/ot-service.mjs';
export { readFullBackup, validateBackup, restoreFullBackup } from '../../src/db/backup.mjs';
