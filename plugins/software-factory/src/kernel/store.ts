/**
 * The artifact store's public surface: the folder backend factory, goal-root
 * reads and record sealing. The implementation is split by area under
 * `store/`.
 */
export type { ArtifactWriter } from "./store/types.js";
export { createFolderStore, readGoalFile } from "./store/folder.js";
export {
  recordDirName,
  sealRecord,
  sealedRecordDirs,
  unsealRecord,
} from "./store/folder-records.js";
