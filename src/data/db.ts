import { openDB } from "idb";
export const dbPromise = openDB("scan-licences", 1, {
  upgrade(db) {
    db.createObjectStore("outbox", { keyPath: "id" });
  }
});
