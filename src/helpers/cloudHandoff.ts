/**
 * Hands the connection to a Cloud Drive over to a new Strype tab that Strype itself opens (to open a project file
 * of the Files tab's "/cloud" folder in that tab), so the user doesn't have to connect to the Cloud Drive again there.
 *
 * Tokens are only kept in memory by each tab (see the Cloud Drive components), so they must be given to the new tab.
 * That is done as restrictively as we can, with postMessage() between the two windows only:
 * - the opener tab opens the new tab itself (on a click: a page can't trigger this) with a single-use random nonce in the URL,
 *   and keeps the new tab's window object;
 * - the new tab removes the nonce from its URL right away, and asks its opener for the hand-over, giving the nonce;
 * - the opener only answers if the request comes from Strype's origin, from the very window it opened with that nonce,
 *   and in time; the nonce is forgotten as soon as it's used (whatever the outcome) or expired;
 * - the opener answers that window only (with Strype's origin as target), and the new tab only accepts an answer
 *   coming from Strype's origin, from its opener, and for its nonce.
 * Nothing is ever written in the URL or the storages, and no other tab (even another Strype tab) can get the credentials.
 * Credentials that can only be used once (refresh tokens) are not handed over (see each Cloud Drive's exportHandoffCredentials()):
 * when what was handed over expires, the new tab asks the user to connect again, as usual.
 */
import { randomBase64UrlString } from "@/helpers/common";
import { vueComponentsAPIHandler } from "@/helpers/vueComponentAPI";
import { useStore } from "@/store/store";
import { CloudHandoffCredentials, isSyncTargetCloudDrive } from "@/types/cloud-drive-types";
import { StrypeSyncTarget } from "@/types/types";

// The query parameter of the new tab's URL with the nonce
export const cloudHandoffQueryKey = "cloud_handoff";

const READY_MESSAGE_TYPE = "strype-cloud-handoff-ready";
const HANDOFF_MESSAGE_TYPE = "strype-cloud-handoff";
// How long the opener waits for the new tab to ask (it must load Strype first, which can be long on a slow machine)
const PENDING_HANDOFF_LIFETIME_MS = 2 * 60 * 1000;
// How long the new tab waits for its opener's answer (the opener may need to contact the Cloud Drive to renew a token)
const HANDOFF_REPLY_TIMEOUT_MS = 20 * 1000;
const NONCE_BYTES = 32;

// The project file to open in the new tab, and the folder it's in (which becomes the project's location)
export interface CloudHandoffFile {
    target: StrypeSyncTarget,
    fileId: string,
    fileName: string,
    folderId: string,
}

export interface CloudHandoff extends CloudHandoffFile {
    // Null if the opener couldn't give them (for example, it isn't connected anymore)
    credentials: CloudHandoffCredentials | null,
}

/**
 * Opener's side
 */
interface PendingHandoff {
    newTab: Window,
    file: CloudHandoffFile,
    expiryTimeoutHandle: number,
}
const pendingHandoffs = new Map<string, PendingHandoff>();
let isListeningToNewTabs = false;

// Opens a new Strype tab that opens the given file of the Cloud Drive the project is saved to, with the same connection.
// Must be called directly in the handler of the user's click (the browser would block the new tab otherwise).
// Returns false if the new tab couldn't be opened.
export function openCloudFileInNewTab(file: CloudHandoffFile): boolean {
    const nonce = randomBase64UrlString(NONCE_BYTES);
    // (no "noopener": the new tab needs window.opener to ask for the hand-over)
    const newTab = window.open(`${window.location.origin}${window.location.pathname}?${cloudHandoffQueryKey}=${nonce}`, "_blank");
    if(newTab == null){
        return false;
    }
    if(!isListeningToNewTabs){
        window.addEventListener("message", onNewTabMessage);
        isListeningToNewTabs = true;
    }
    pendingHandoffs.set(nonce, {
        newTab,
        file,
        expiryTimeoutHandle: window.setTimeout(() => pendingHandoffs.delete(nonce), PENDING_HANDOFF_LIFETIME_MS),
    });
    return true;
}

function onNewTabMessage(event: MessageEvent): void {
    if(event.origin !== window.location.origin || event.data?.type !== READY_MESSAGE_TYPE || typeof event.data.nonce !== "string"){
        return;
    }
    const nonce = event.data.nonce as string;
    const pendingHandoff = pendingHandoffs.get(nonce);
    if(pendingHandoff == undefined){
        return;
    }
    // The nonce can only be used once: if the request doesn't come from the tab we opened with it, it has leaked,
    // and that tab won't get anything either.
    pendingHandoffs.delete(nonce);
    window.clearTimeout(pendingHandoff.expiryTimeoutHandle);
    if(event.source !== pendingHandoff.newTab){
        return;
    }
    const {file, newTab} = pendingHandoff;
    // The credentials are only given if the project is still saved to the same Cloud Drive (the user may have changed it since the click).
    // The new tab still gets the file to open: the user can connect there.
    const cloudDriveComponent = (useStore().syncTarget == file.target)
        ? vueComponentsAPIHandler.cloudDriveHandlerComponentAPI?.getSpecificCloudDriveComponent(file.target)
        : undefined;
    (cloudDriveComponent?.exportHandoffCredentials() ?? Promise.resolve(null))
        .catch(() => null)
        .then((credentials) => {
            try{
                newTab.postMessage({type: HANDOFF_MESSAGE_TYPE, nonce, handoff: {...file, credentials} satisfies CloudHandoff}, window.location.origin);
            }
            catch(error){
                // The credentials couldn't be sent (they must be plain data, see CloudHandoffCredentials):
                // the new tab still gets the file to open, the user can connect there.
                console.error(`Could not hand the connection over to the new tab: ${(error as Error).message}`);
                newTab.postMessage({type: HANDOFF_MESSAGE_TYPE, nonce, handoff: {...file, credentials: null} satisfies CloudHandoff}, window.location.origin);
            }
        });
}

/**
 * New tab's side
 */
let requestedHandoffNonce: string | null = null;

// To call when Strype starts, before anything uses the session storage: takes the nonce out of the URL (so it can't be used
// again, for example on reloading) and, for a tab Strype opened for a hand-over, clears the session storage copied from the opener
// (the browser copies it to a tab opened with window.open()), which notably has the opener's tab ID (it must be a new tab for the autosave).
export function takeCloudHandoffRequestFromURL(): void {
    const queryParams = new URLSearchParams(window.location.search);
    const nonce = queryParams.get(cloudHandoffQueryKey);
    if(nonce == null){
        return;
    }
    queryParams.delete(cloudHandoffQueryKey);
    const otherQueryParams = queryParams.toString();
    window.history.replaceState({}, document.title, window.location.pathname + ((otherQueryParams.length > 0) ? `?${otherQueryParams}` : ""));
    try{
        sessionStorage.clear();
    }
    catch{
        // The storage may be unavailable: then there is nothing copied from the opener either.
    }
    // Only a tab opened by Strype can get a hand-over, it has an opener.
    if(window.opener != null){
        requestedHandoffNonce = nonce;
    }
}

export function isCloudHandoffRequested(): boolean {
    return requestedHandoffNonce != null;
}

// Asks the opener for the hand-over (once). Resolves to null if there is none (no request, refused or no answer in time).
export function requestCloudHandoff(): Promise<CloudHandoff | null> {
    const nonce = requestedHandoffNonce;
    requestedHandoffNonce = null;
    const opener = window.opener as Window | null;
    if(nonce == null || opener == null){
        return Promise.resolve(null);
    }
    return new Promise((resolve) => {
        let timeoutHandle = -1;
        const finish = (handoff: CloudHandoff | null) => {
            window.removeEventListener("message", onOpenerMessage);
            window.clearTimeout(timeoutHandle);
            // We don't need the opener anymore: cut the link to it.
            window.opener = null;
            resolve(handoff);
        };
        const onOpenerMessage = (event: MessageEvent) => {
            if(event.origin !== window.location.origin || event.source !== opener || event.data?.type !== HANDOFF_MESSAGE_TYPE || event.data.nonce !== nonce){
                return;
            }
            finish(parseHandoff(event.data.handoff));
        };
        window.addEventListener("message", onOpenerMessage);
        timeoutHandle = window.setTimeout(() => finish(null), HANDOFF_REPLY_TIMEOUT_MS);
        try{
            opener.postMessage({type: READY_MESSAGE_TYPE, nonce}, window.location.origin);
        }
        catch{
            finish(null);
        }
    });
}

function parseHandoff(data: unknown): CloudHandoff | null {
    const handoff = data as Partial<CloudHandoff> | null | undefined;
    if(typeof handoff?.target !== "number" || !isSyncTargetCloudDrive(handoff.target)
        || typeof handoff.fileId !== "string" || handoff.fileId.length == 0
        || typeof handoff.fileName !== "string" || typeof handoff.folderId !== "string"){
        return null;
    }
    const credentials = (typeof handoff.credentials === "object" && handoff.credentials != null) ? handoff.credentials : null;
    return {target: handoff.target, fileId: handoff.fileId, fileName: handoff.fileName, folderId: handoff.folderId, credentials};
}
