/**
 * Opens a project file of the Files tab's "/local" folder in a new Strype tab that Strype itself opens.
 *
 * "/local" only exists in the memory of each tab (see localFsCache.ts), so the new tab can't read the file:
 * the tab opening it gives it the file's content with postMessage():
 * - the opener tab opens the new tab itself (on a click: a page can't trigger this) with a flag in the URL,
 *   and keeps the new tab's window object with the file to give it;
 * - the new tab removes the flag from its URL right away, and tells its opener it's ready (a message sent
 *   before the new tab listens would be lost);
 * - the opener only answers a window it opened, from Strype's origin, and only to that window (with Strype's
 *   origin as target), so no other tab gets the file; the new tab only accepts an answer from its opener.
 * The content is taken when the user clicks: the new tab gets the file as it was then.
 */

// The query parameter of the new tab's URL
export const localFileQueryKey = "open_local_file";

const READY_MESSAGE_TYPE = "strype-local-file-ready";
const FILE_MESSAGE_TYPE = "strype-local-file";
// How long the new tab waits for its opener's answer
const REPLY_TIMEOUT_MS = 20 * 1000;

export interface LocalFileForNewTab {
    fileName: string,
    content: string,
}

/**
 * Opener's side
 */
const filesForNewTabs = new Map<Window, LocalFileForNewTab>();
let isListeningToNewTabs = false;

// Opens a new Strype tab that opens the given file of "/local".
// Must be called directly in the handler of the user's click (the browser would block the new tab otherwise).
// Returns false if the new tab couldn't be opened.
export function openLocalFileInNewTab(file: LocalFileForNewTab): boolean {
    // (no "noopener": the new tab needs window.opener to tell it's ready)
    const newTab = window.open(`${window.location.origin}${window.location.pathname}?${localFileQueryKey}`, "_blank");
    if(newTab == null){
        return false;
    }
    if(!isListeningToNewTabs){
        window.addEventListener("message", onNewTabMessage);
        isListeningToNewTabs = true;
    }
    filesForNewTabs.set(newTab, file);
    return true;
}

function onNewTabMessage(event: MessageEvent): void {
    if(event.origin !== window.location.origin || event.data?.type !== READY_MESSAGE_TYPE){
        return;
    }
    const newTab = event.source as Window | null;
    const file = (newTab != null) ? filesForNewTabs.get(newTab) : undefined;
    if(newTab == null || file == undefined){
        return;
    }
    filesForNewTabs.delete(newTab);
    newTab.postMessage({type: FILE_MESSAGE_TYPE, file}, window.location.origin);
}

/**
 * New tab's side
 */
let isFileRequested = false;

// To call when Strype starts, before anything uses the session storage: takes the flag out of the URL (so the file isn't asked
// for again, for example on reloading) and clears the session storage copied from the opener (the browser copies it to a tab
// opened with window.open()), which notably has the opener's tab ID (it must be a new tab for the autosave).
export function takeLocalFileRequestFromURL(): void {
    const queryParams = new URLSearchParams(window.location.search);
    if(!queryParams.has(localFileQueryKey)){
        return;
    }
    queryParams.delete(localFileQueryKey);
    const otherQueryParams = queryParams.toString();
    window.history.replaceState({}, document.title, window.location.pathname + ((otherQueryParams.length > 0) ? `?${otherQueryParams}` : ""));
    try{
        sessionStorage.clear();
    }
    catch{
        // The storage may be unavailable: then there is nothing copied from the opener either.
    }
    // Only a tab opened by Strype has a file to get, it has an opener.
    isFileRequested = (window.opener != null);
}

export function isLocalFileRequested(): boolean {
    return isFileRequested;
}

// Tells the opener we're ready, and gets the file from it (once).
// Resolves to null if there is none (no request, or no answer in time: the opener may have been closed or reloaded).
export function requestLocalFile(): Promise<LocalFileForNewTab | null> {
    const opener = window.opener as Window | null;
    if(!isFileRequested || opener == null){
        return Promise.resolve(null);
    }
    isFileRequested = false;
    return new Promise((resolve) => {
        let timeoutHandle = -1;
        const finish = (file: LocalFileForNewTab | null) => {
            window.removeEventListener("message", onOpenerMessage);
            window.clearTimeout(timeoutHandle);
            // We don't need the opener anymore: cut the link to it.
            window.opener = null;
            resolve(file);
        };
        const onOpenerMessage = (event: MessageEvent) => {
            if(event.origin !== window.location.origin || event.source !== opener || event.data?.type !== FILE_MESSAGE_TYPE){
                return;
            }
            const file = event.data.file as Partial<LocalFileForNewTab> | null | undefined;
            finish((typeof file?.fileName === "string" && typeof file.content === "string") ? {fileName: file.fileName, content: file.content} : null);
        };
        window.addEventListener("message", onOpenerMessage);
        timeoutHandle = window.setTimeout(() => finish(null), REPLY_TIMEOUT_MS);
        try{
            opener.postMessage({type: READY_MESSAGE_TYPE}, window.location.origin);
        }
        catch{
            finish(null);
        }
    });
}
