/** Public IndexedDB API for the MVP. Persistence stays in the versioned db modules. */
export { DB_NAME, DB_VERSION, STORES, openDatabase, readTables } from '../../src/db/database.mjs';
export {
  readImportState, activeImports, assessImport, saveImport, cancelImport, deleteImport,
  saveProject, createProject, saveEmployee, getProfiles, saveProfile,
} from '../../src/db/import-store.mjs?v=0.6.0';
export { listEmployees, listProjects, queryOTRecords, getEmployeeOTSummary, getOTReport, getEmployeeOTHistory } from '../../src/db/ot-service.mjs?v=0.6.0';
export { readFullBackup, validateBackup, restoreFullBackup } from '../../src/db/backup.mjs';
