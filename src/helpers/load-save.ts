import { deflateRaw, inflateRaw } from "pako";
import { Base64 } from "js-base64";
import { parseCodeAndGetParseElements } from "@/parser/parser";
import { useStore } from "@/store/store";
import {StrypeLayoutDividerSettings, StrypePEALayoutMode} from "@/types/types";
import { AppName, AppPlatform, AppSPYFullPrefix, AppSPYSaveVersion } from "./appContext";
import * as localFsCache from "@/helpers/localFsCache";
import { isBlockedUploadFileName } from "@/helpers/fileSystemTabIO";

export function saveDivider(divider: StrypeLayoutDividerSettings | undefined) : string | undefined {
    if (divider === undefined) {
        return undefined;
    }
    const obj: Record<string, number> = {};
    Object.entries(divider).forEach(([key, value]) => {
        if (value !== undefined) {
            obj[key] = Math.round(value * 100) / 100; // round to 2 decimals
        }
    });
    return JSON.stringify(obj);    
}

export function loadDivider(json: string | undefined): StrypeLayoutDividerSettings | undefined {
    if (json === undefined) {
        return undefined;
    }
    const obj = JSON.parse(json) as Record<string, number>;
    const map = {} as StrypeLayoutDividerSettings;
    Object.entries(obj).forEach(([key, value]) => {
        const enumKey = StrypePEALayoutMode[key as keyof typeof StrypePEALayoutMode];
        if (value !== undefined) {
            map[enumKey] = value;
        }
    });
    return map;
}

// The header key each pinned "/local" file is stored under, followed by a 1-based index
// (e.g. "pinnedLocalFile1", "pinnedLocalFile2", ...) so that every file gets its own header line
// rather than one big JSON blob crammed onto a single line.
const pinnedLocalFileHeaderPrefix = "pinnedLocalFile";

// The key the same pinned-file headers are stored under in the session autosave's JSON state
// (see the store's generateStateJSONStrWithCheckpoint()/doSetStateFromJSONStr()), so that they also
// survive a plain page refresh, not just saving to and loading from a .spy file.
export const pinnedLocalFilesStateKey = "pinnedLocalFiles";

// Serialises every currently-pinned "/local" file (see localFsCache.ts's listPinnedEntries()) into
// one header per file: "pinnedLocalFile<n>" -> "<relativePath>:<base64>", where <relativePath> is
// the file's path relative to "/local" (e.g. "sub/a.txt", not "/local/sub/a.txt" -- shorter, and
// portable if "/local" itself were ever renamed) and <base64> is the base64 of its deflated bytes
// (following the same compress-then-base64 approach already used for the "share link" feature --
// see Menu.vue's shareContentZippedBase64). Base64 never contains ":", so splitting the value on
// the *last* ":" unambiguously recovers <base64> even if <relativePath> itself contains one.
// Sorted alphabetically by relative path so that saving the same set of pinned files always
// produces the same headers (and hence the same .spy content) regardless of pin order.
// Returns an empty object when nothing is pinned.
export function savePinnedLocalFiles(): Record<string, string> {
    const entries = localFsCache.listPinnedEntries();
    const relativePaths = Object.keys(entries).map((path) => path.replace(/^\/local\//, "")).sort();
    const headers: Record<string, string> = {};
    relativePaths.forEach((relativePath, index) => {
        const base64Data = Base64.fromUint8Array(deflateRaw(entries[`/local/${relativePath}`]));
        headers[`${pinnedLocalFileHeaderPrefix}${index + 1}`] = `${relativePath}:${base64Data}`;
    });
    return headers;
}

// The other side of savePinnedLocalFiles() above -- restores each pinned file straight into
// localFsCache.ts (marked pinned again, so re-saving the project keeps them) so they show up in
// the File system tab's "Local files" section next time it's opened, exactly like any other
// "/local" file. Called from App.vue's setStateFromPythonFile() alongside the divider restoration.
export function loadPinnedLocalFiles(headers: Record<string, string>): void {
    const fileHeaderKeys = Object.keys(headers)
        .filter((key) => new RegExp(`^${pinnedLocalFileHeaderPrefix}\\d+$`).test(key))
        .sort((a, b) => parseInt(a.substring(pinnedLocalFileHeaderPrefix.length), 10) - parseInt(b.substring(pinnedLocalFileHeaderPrefix.length), 10));
    for (const key of fileHeaderKeys) {
        const value = headers[key];
        const separatorIndex = value.lastIndexOf(":");
        const relativePath = value.substring(0, separatorIndex);
        // A project file is untrusted input (it may have been hand-edited or come from someone
        // else), so it mustn't be a way around the File system tab's upload reject list -- see
        // fileSystemTabIO.ts's upload validation. Skipped rather than failing the whole load, since the rest of
        // the project is still perfectly usable without it:
        if (isBlockedUploadFileName(relativePath)) {
            console.warn("Not restoring pinned file of a disallowed type: " + relativePath);
            continue;
        }
        const base64Data = value.substring(separatorIndex + 1);
        const bytes = inflateRaw(Base64.toUint8Array(base64Data)) as Uint8Array;
        const path = `/local/${relativePath}`;
        localFsCache.writeFile(path, bytes);
        localFsCache.setPinned(path, true);
    }
}

// The header ("#(=> testingShowing:true") recording that the third section was showing the Testing code, rather than
// My code, when the project was saved, so that it opens the same way. It is left out when My code was showing.
export const testingShowingHeader = "testingShowing";

export function generateSPYFileContent(): string {
    let saveContent = parseCodeAndGetParseElements(false, "spy").parsedOutput;
    // We add the initial headers:
    const headers = new Map<string, string | undefined>();
    headers.set(AppName, AppSPYSaveVersion + ":" + AppPlatform);
    headers.set("editorCommandsSplitterPane2Size", saveDivider(useStore().editorCommandsSplitterPane2Size));
    // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
    const peaLayoutMode = useStore().peaLayoutMode;
    headers.set("peaLayoutMode", (peaLayoutMode === undefined || peaLayoutMode == StrypePEALayoutMode.tabsCollapsed) ? undefined : StrypePEALayoutMode[peaLayoutMode]);
    headers.set("peaCommandsSplitterPane2Size", saveDivider(useStore().peaCommandsSplitterPane2Size));
    headers.set("peaSplitViewSplitterPane1Size", saveDivider(useStore().peaSplitViewSplitterPane1Size));
    headers.set("peaExpandedSplitterPane2Size", saveDivider(useStore().peaExpandedSplitterPane2Size));
    Object.entries(savePinnedLocalFiles()).forEach(([key, value]) => headers.set(key, value));
    headers.set(testingShowingHeader, useStore().mainSectionShowsTests ? "true" : undefined);
    // #v-endif
    saveContent = Array.from(headers.entries()).filter(([k, v]) => v !== undefined).map((e) => AppSPYFullPrefix + " " + e[0] + ":" + e[1] + "\n").join("") + saveContent;
    return saveContent;
}
