// The file store.ts handles the Pinia in-memory store definitions.
// This file deals with saving and loading the store content from IndexedDB.
// We use IndexedDB rather than localStorage because localStorage has a limit
// of around 5-10MB, and since we will be storing a state per-tab, it is possible
// that with some image literals involved and several tabs, the total storage could
// be larger than that.
//
// Here's how the storage model works:
// - Saving:
//   - We make a tabId and save it to sessionStorage (this is the only real way to identify tabs)
//   - We save the browser state (periodically) to IndexedDB, using tabId as an identifier, and
//     also store times for last modified/last alive.
//   - When the browser tab is closed, we can't save to IndexedDB because that's async and we have
//     no time to do that.  So we "emergency save" to localStorage.  In this case, we know the tab was closed.
// - Loading:
//   - When the page loads it first calls tidyUpDatabaseState which does two things:
//     - It moves any emergency saves into IndexedDB proper so everything is in one place (on load, we have time).
//     - It cleans out any old saves which are >= 8 days old, based on lastAliveAt
//   - Then when loading up, we first check if we have a tabId.  If we do, we check if we have
//     an associated saved state.  If so, we automatically load it.  This usually means we've been
//     reloaded using the refresh button.
//   - If there is a recent state which was modified after save (this may happen if the user closed the tab then did Ctrl-Shift-T),
//     we show a banner message suggesting they may want to reload that state.


import { autoSaveFreqMins, AutoSaveKeyNames } from "@/helpers/editor";
import { z } from "zod";
import { ceil } from "lodash";

// How long a session is dead before we automatically clean it up; 8 days (weekly class + one day):
const MAX_SESSION_AGE_MILLIS_UNSAVED = 8 * 24 * 60 * 60 * 1000;
// We don't want to clean saved immediately, as we need it for reloading:
const MAX_SESSION_AGE_MILLIS_SAVED = 1 * 24 * 60 * 60 * 1000;

const DB_NAME = AutoSaveKeyNames.strypeIndexDatabaseName;
const DB_VERSION = 2;
let STORE : string;
// #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
STORE = AutoSaveKeyNames.strypePythonDBStore;
// #v-else    
STORE = AutoSaveKeyNames.strypeMicrobitDBStore;
// #v-endif

// We don't actually need to specify the database schema in a type, but here are the fields and types:
enum DatabaseFieldNames {
    tabId = "tabId", // string; Sessions are saved per-tab based on a unique ID we generate for each 
    data = "data", // string; The actual data (a compressed JSON string of the state)
    projectName = "projectName", // string; The name of the project (also present in data but we want easy access)
    
    lastModifiedAt = "lastModifiedAt", // timestamp; The last time a change was made to the data field
    lastAliveAt = "lastAliveAt", // timestamp; The last time the tab was confirmed as alive.  Used to clear out old tab sessions.
    stillAlive = "stillAlive", // This is a string with either "maybe" or "false".  We never know for sure if the tab is still alive,
                               // but we do know if some cases whether it is not.
    
    modifiedSinceExternalSave = "modifiedSinceExternalSave", // A string with "true" or "false"; was this state modified after last
                                                             // saving externally (e.g. to disk, google drive), 
    userDecidedOnReloading = "userDecidedOnReloading", // A string with "true" or "false"; has the user previously decided on whether
                                                       // or not to reload this state based on a banner shown to them?
}

export function openIndexedDBConnection(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
              
            // We always create both stores together, otherwise we cannot use one db for 2 stores.
            let otherStore = AutoSaveKeyNames.strypeMicrobitDBStore;
            // #v-ifdef STRYPE_PLATFORM == VITE_MICROBIT_MODE
            otherStore = AutoSaveKeyNames.strypePythonDBStore;
            // #v-endif

            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, {
                    keyPath: DatabaseFieldNames.tabId,
                });
            }

            if (!db.objectStoreNames.contains(otherStore)) {
                db.createObjectStore(otherStore, {
                    keyPath: DatabaseFieldNames.tabId,
                });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// This saves the session state.  If the state has changed (as decided by string comparison),
// the lastModifiedAt is updated.  Regardless of that, lastAliveAt is always modified
// If the modified and alive times are omitted from the params, Date.now() is used
export async function saveSessionState(tabId: string, projectName: string, data: string, stillAlive: "maybe" | "false", modifiedSinceExternalSave: boolean, lastModifiedAt?: number, lastAliveAt?: number, db?: IDBDatabase) : Promise<void> {
    db = db ?? await openIndexedDBConnection();

    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);

        // Must read existing in order to be able to decide if it was modified:
        const request = store.openCursor(IDBKeyRange.only(tabId));
        
        request.onsuccess = () => {
            const cursor = request.result;

            const now = Date.now();
            
            if (!cursor) {
                // No existing record, so write a new record:
                store.put({
                    [DatabaseFieldNames.tabId]: tabId,
                    [DatabaseFieldNames.projectName]: projectName,
                    [DatabaseFieldNames.data]: data,
                    [DatabaseFieldNames.lastModifiedAt]: lastModifiedAt ?? now,
                    // May as well update lastAliveAt too, since we're alive if we're saving:
                    [DatabaseFieldNames.lastAliveAt]: lastAliveAt ?? now,
                    [DatabaseFieldNames.stillAlive]: stillAlive,
                    [DatabaseFieldNames.modifiedSinceExternalSave]: modifiedSinceExternalSave ? "true" : "false",
                    [DatabaseFieldNames.userDecidedOnReloading]: "false",
                });
            }
            else {
                const record = cursor.value;
                record[DatabaseFieldNames.projectName] = projectName;
                record[DatabaseFieldNames.lastAliveAt] = lastAliveAt ?? now;
                if (data != record[DatabaseFieldNames.data] as string) {
                    record[DatabaseFieldNames.data] = data;
                    record[DatabaseFieldNames.lastModifiedAt] = lastModifiedAt ?? now;
                }
                record[DatabaseFieldNames.stillAlive] = stillAlive;
                record[DatabaseFieldNames.modifiedSinceExternalSave] = modifiedSinceExternalSave ? "true" : "false";
                cursor.update(record);
            }
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// Don't need the tabId as that's in the key of the item
// Don't need stillAlive as we know emergency saves are closed
const EmergencySaveSchema = z.object({
    [DatabaseFieldNames.projectName]: z.string(),
    [DatabaseFieldNames.data]: z.string(),
    [DatabaseFieldNames.lastModifiedAt]: z.number(),
    [DatabaseFieldNames.lastAliveAt]: z.number(),
    [DatabaseFieldNames.modifiedSinceExternalSave]: z.boolean(),
});
type EmergencySave = z.infer<typeof EmergencySaveSchema>;

export function emergencySaveSessionState(tabId: string, projectName: string, data: string, lastModifiedAt: number, modifiedSinceExternalSave: boolean) : void {
    let storageString = AutoSaveKeyNames.pythonEditorState;
    // #v-ifdef STRYPE_PLATFORM == VITE_MICROBIT_MODE
    storageString = AutoSaveKeyNames.mbEditor;
    // #v-endif
    const value : EmergencySave = {
        [DatabaseFieldNames.projectName]: projectName,
        [DatabaseFieldNames.data]: data,
        [DatabaseFieldNames.lastModifiedAt]: lastModifiedAt,
        [DatabaseFieldNames.lastAliveAt]: Date.now(),
        [DatabaseFieldNames.modifiedSinceExternalSave]: modifiedSinceExternalSave,
    };
    localStorage.setItem(storageString + ":" + tabId, JSON.stringify(value));
}

// Load session state, if it exists, or return undefined if not found:
export async function loadSessionState(tabId: string, db?: IDBDatabase) : Promise<string | null> {
    db = db ?? await openIndexedDBConnection();

    return new Promise<string | null>((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const store = tx.objectStore(STORE);

        const request = store.get(tabId);

        request.onsuccess = () => {
            if (request.result) {
                resolve(request.result[DatabaseFieldNames.data] as string);
            }
            else {
                resolve(null);
            }
        };

        request.onerror = () => reject(request.error);
    });
}

function formatDuration(rtf: Intl.RelativeTimeFormat, seconds: number) : string {
    // We need to use abs because "ago" values are negative:
    if (Math.abs(seconds) <= 60) {
        // Anything <= 60 seconds is shown in seconds:
        return rtf.format(seconds, "second");
    }
    else if (Math.abs(seconds) <= 60 * 60) {
        // Anything else less than an hour is shown in minutes:
        return rtf.format(Math.floor(seconds / 60), "minute");
    }
    else if (Math.abs(seconds) <= 2 * 24 * 60 * 60) {
        // Anything else less than 2 days old is shown in hours:
        return rtf.format(Math.floor(seconds / (60 * 60)), "hour");
    }
    else {
        // Otherwise we measure in days:
        return rtf.format(Math.floor(seconds / (24 * 60 * 60)), "day");
    }
}

// This function checks if there is a recent state the user might want to load, for one of two reasons:
// Via an auto-displayed banner message (reason="banner"):
//   - The criteria for this is:
//     - stillAlive == false; we know the tab is closed
//     - modifiedSinceExternalSave == true; it was modified after its last external save
//     - lastAliveAt sooner than 2 minutes ago; the user re-navigated to the website (or used Ctrl-Shift-T) soon after it was closed
//     - userDecidedOnReloading decided on reloading is false (i.e. not shown in a banner previously)
// Via the load menu:
//   - The criteria for this is:
//     - stillAlive == false || lastAliveAt older than (autoSaveFreqMins * 2) in millis; tab is presumed dead or inactive
//     - modifiedSinceExternalSave == true; it was modified after its last external save
// Note that for banner, the list returned is always size 0 or 1; for load_menu it can be any size
export async function checkForRecentSaveStates(locale: string, reason: "banner" | "load_menu") : Promise<{projectName: string, data: string, when: string, tabId: string}[]> {
    const db = await openIndexedDBConnection();
    return new Promise<{projectName: string, data: string, when: string, tabId: string}[]>((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const store = tx.objectStore(STORE);
        
        const request = store.getAll();

        request.onsuccess = () => {
            if (request.result) {
                // Makes it into e.g. "5 seconds ago", translated to the given locale.
                const rtf = new Intl.RelativeTimeFormat(locale, { style: "long" });
                const now = Date.now();
                let candidates : { lastAlive: number; projectName: string; data: string; tabId: string, when: string}[] = [];
                for (let item of request.result) {
                    const lastAlive = Number(item[DatabaseFieldNames.lastAliveAt]);
                    // For dev mode extend this so that it's easier to load recent states:
                    const recentAliveMinutes = import.meta.env.DEV ? 24*60 : 2;
                    if ((item[DatabaseFieldNames.stillAlive] == "false" || (reason == "load_menu" && (now - lastAlive) > autoSaveFreqMins * 2 * 60 * 1000)) 
                        && item[DatabaseFieldNames.modifiedSinceExternalSave] == "true"
                        && (item[DatabaseFieldNames.userDecidedOnReloading] == "false" || reason == "load_menu")
                        && (lastAlive >= now - recentAliveMinutes * 60 * 1000 || reason == "load_menu")) {
                        // Suitable for loading.  Add it to candidates:
                        candidates.push({
                            lastAlive,
                            projectName: item[DatabaseFieldNames.projectName],
                            data: item[DatabaseFieldNames.data],
                            tabId: item[DatabaseFieldNames.tabId],
                            when: formatDuration(rtf, ceil((lastAlive - now) / 1000)),
                        });
                    }
                }
                // Most recently alive will be position 0:
                candidates.sort((a, b) => b.lastAlive - a.lastAlive);
                
                if (reason == "banner") {
                    // Mark others past the first as seen:
                    const otherTabIdsToMark = candidates.slice(1).map((x) => x.tabId);
                    markUserDecisionOnReloading(otherTabIdsToMark).then(() => {
                        // Take only the first:
                        resolve(candidates.slice(0,1));
                    });
                }
                else {
                    resolve(candidates);
                }
            }
            else {
                resolve([]);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

export async function markUserDecisionOnReloading(tabIds: string[]): Promise<void> {
    // Short-circuit:
    if (tabIds.length == 0) {
        return;
    }
    const db = await openIndexedDBConnection();

    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);

        for (const tabId of tabIds) {
            const request = store.get(tabId);

            request.onsuccess = () => {
                const record = request.result;
                if (!record) {
                    console.error("Did not find tab: " + tabId + " to mark as decided.");
                    return;
                }

                store.put({...record, [DatabaseFieldNames.userDecidedOnReloading]: "true"});
            };

            request.onerror = () => {
                console.error(`Failed to load ${tabId}`, request.error);
            };
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

// This cleans up old sessions.  Old here means sessions that were not seen alive recently.
// We have a timer task running that marks us as alive, but it's important to note that browsers
// can suspend tabs that have not been used for a while.  So if you have an old Strype tab
// lurking for days or weeks it will stop marking itself as alive, and will get cleaned out of storage.
// There's three options for what happens then once it's gone:
// - User returns to the tab, timers wake up, auto-save saves again, no data lost
// - User closes tab, the code wakes up and handles the tab closing, which means auto-save, no data lost
// - Browser or machine die unexpectedly, data is lost even though the tab was open.  But it hadn't been used in
//   a long time, so that's tough luck.
async function cleanupOldSessions(db: IDBDatabase) : Promise<void> {
    const cutoffUnsaved = Date.now() - MAX_SESSION_AGE_MILLIS_UNSAVED;
    const cutoffSaved = Date.now() - MAX_SESSION_AGE_MILLIS_SAVED;

    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);

        const request = store.openCursor();

        request.onsuccess = () => {
            const cursor = request.result;

            if (!cursor) {
                resolve();
                return;
            }

            const record = cursor.value;

            // use lastAliveAt as the liveness signal
            const lastAlive = record[DatabaseFieldNames.lastAliveAt];
            if (!lastAlive || lastAlive < cutoffUnsaved) {
                cursor.delete();
            }
            if (record[DatabaseFieldNames.stillAlive] == "false"
                && record[DatabaseFieldNames.modifiedSinceExternalSave] == "false"
                && lastAlive < cutoffSaved) {
                // We can clean up states which are closed and which were never modified after save:
                cursor.delete();
            }

            cursor.continue();
        };

        request.onerror = () => reject(request.error);
    });
}

// This should be run before looking at the DB.  It removes old sessions, and also
// moves any old local storage (which can exist from a version before we added indexed DB)
// into indexed DB, plus any emergency-sync-written state from a page unload into the DB too.
// That way, all code after this function only has to look at the DB.
export async function tidyUpDatabaseState(ourTabId : string, db: IDBDatabase, onError: (err: string) => void) : Promise<void> {
    // We need to find any "emergency" localStorage items which were saved during page unload or refresh,
    // and move them into the database where they belong:
    const toAddToDatabase: Record<string, {content: EmergencySave, keyToDelete: string}> = {};
    let storeKey = AutoSaveKeyNames.pythonEditorState;
    // #v-ifdef STRYPE_PLATFORM == VITE_MICROBIT_MODE
    storeKey = AutoSaveKeyNames.mbEditor;
    // #v-endif
    const prefix = storeKey + ":";

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
            const parsed = EmergencySaveSchema.safeParse(JSON.parse(localStorage.getItem(key) as string));
            if (parsed.success) {
                toAddToDatabase[key.slice(prefix.length)] = {content: parsed.data, keyToDelete: key};
            }
        }
    }
    
    for (const tabId of Object.keys(toAddToDatabase)) {
        const item = toAddToDatabase[tabId];
        // We know it's not still alive because it's an emergency save:
        await saveSessionState(tabId, item.content.projectName, item.content.data, "false", item.content.modifiedSinceExternalSave, item.content.lastModifiedAt, item.content.lastAliveAt, db)
            .catch(onError)
            .then((() => {
                // Only delete key if save was successful:
                localStorage.removeItem(item.keyToDelete);
            }));
    }
    
    // We also claim any old storage item (from old versions of Strype) and associate it with the current tab:
    const oldSingleItem = localStorage.getItem(storeKey);
    if (oldSingleItem) {
        // We assume it was changed since last modification:
        // This <Old project> should only appear once ever just as we update, so not worth localised:
        await saveSessionState(ourTabId, "<Old project>", oldSingleItem, "false", true, undefined, undefined, db)
            .catch(onError)
            .then(() => {
                // Only delete key if save was successful:
                localStorage.removeItem(storeKey);
            });
    }
    
    await cleanupOldSessions(db);
}

export async function deleteStates(tabIds: string[]) : Promise<void> {
    const db = await openIndexedDBConnection();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);

        const idsToDelete = new Set(tabIds);

        const request = store.openCursor();

        request.onerror = () => reject(request.error);

        request.onsuccess = () => {
            const cursor = request.result;

            if (!cursor) {
                return;
            }

            const value = cursor.value as { tabId: string };

            if (idsToDelete.has(value.tabId)) {
                cursor.delete();
            }

            cursor.continue();
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
