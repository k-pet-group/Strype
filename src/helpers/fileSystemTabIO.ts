// Orchestration for the "File system" tab (see FileSystemPane.vue): listing, downloading and
// uploading files from the internal Pyodide filesystem's read-only bundled asset roots ("/data",
// "/books", "/images", etc -- see assetsRoots() below), "/local" (writeable scratch area) and
// "/cloud" (the connected cloud drive, when the project is saved to one).
import { saveAs } from "file-saver";
import * as Comlink from "comlink";
import JSZip from "jszip";
import { watch } from "vue";
import { getPythonClient, isPythonWorkerReady } from "@/stryperuntime/main_thread_python_handler";
import { FsTreeNode } from "@/stryperuntime/file_system_tree_types";
import { SyncOrAsyncStrypePyodideWorkerRequest } from "@/stryperuntime/worker_bridge_type";
import { encodeUint8ToString } from "@/stryperuntime/worker_bridge_type";
import { isServiceWorkerChannelResponsive, serviceWorkerReadyAndInControl } from "@/workers/shared_helpers";
import { serviceWorkerChannel } from "@/stryperuntime/main_thread_python_handler";
import * as localFsCache from "@/helpers/localFsCache";
import { cloudCloseFile, cloudCreate, cloudListDir, cloudReadFile, cloudWriteFile } from "@/helpers/cloudFileIO";
import { useStore } from "@/store/store";
import type { ArchiveEntry } from "@/helpers/archive";
import { assetsFilePrefixes, buildAssetTree } from "@/stryperuntime/assets_file_index";

// "/local" and "/cloud" are the two writeable roots; anything else is one of the read-only asset
// roots mounted from src/assetsFilesystem/ (see assetsRoots() below).
export type FsRoot = "/local" | "/cloud" | string;

// The read-only asset roots to show in the File system tab, one per top-level directory under
// src/assetsFilesystem/ (e.g. "/data", "/books", "/images") -- derived dynamically from
// assetsFilePrefixes so this list tracks whatever directories actually exist there, rather than
// being a hard-coded list that would go stale if those directories change.
export function assetsRoots(): FsRoot[] {
    return assetsFilePrefixes.map((prefix) => "/" + prefix);
}

// Whether the project is currently saved to a cloud drive -- the same condition
// PythonExecutionArea.vue uses to decide whether a run mounts "/cloud" at all
// (startInSlashCloud). Used by FileSystemPane.vue to decide whether to show the "/cloud" section.
export function isCloudMounted(): boolean {
    return typeof useStore().strypeProjectLocation === "string";
}

// None of the three kinds of root need a live Pyodide worker just to be listed: "/local" is read
// from localFsCache.ts's own main-thread mirror (see its comment for why that, not a live worker,
// is the single source of truth for what's shown here); "/cloud" goes via cloudFileIO.ts's plain
// main-thread async functions; and the read-only asset roots are built straight from the
// build-time glob in assets_file_index.ts (see buildAssetTree's own comment for why -- avoiding a
// worker round trip here matters for how quickly the worker becomes ready for an actual Run
// straight after the File system tab is opened). Downloading an asset file (downloadFsFile below)
// is the only place that still needs the worker, to lazily mount and fetch that file's real bytes.
export async function listFsRootTree(root: FsRoot): Promise<FsTreeNode | null> {
    if (root === "/local") {
        return localFsCache.listTree();
    }
    if (root === "/cloud") {
        return await listCloudTree();
    }
    const prefix = root.slice(1);
    if (assetsFilePrefixes.includes(prefix)) {
        return buildAssetTree(prefix);
    }
    return null;
}

async function buildCloudTree(cloudFileId: string, virtualPath: string, name: string): Promise<FsTreeNode> {
    const children = await cloudListDir({cloudFileId});
    const childNodes = await Promise.all(children.map(async (child) => {
        const childPath = `${virtualPath}/${child.name}`;
        if (child.isDir) {
            return await buildCloudTree(child.fileId.cloudFileId, childPath, child.name);
        }
        return {name: child.name, path: childPath, isDir: false, size: child.fileSize, cloudFileId: child.fileId.cloudFileId} as FsTreeNode;
    }));
    return {name, path: virtualPath, isDir: true, children: childNodes, cloudFileId};
}

async function listCloudTree(): Promise<FsTreeNode | null> {
    const loc = useStore().strypeProjectLocation;
    if (typeof loc !== "string") {
        return null;
    }
    // Mirrors file_getRoot's handling in main_bridge_handler.ts exactly (the project's own file id
    // is used as the root folder id for cloud file lookups) -- see that file's comment for why.
    return await buildCloudTree(loc, "/cloud", "cloud");
}

// Reads one file's raw bytes from whichever root it's under -- shared by downloadFsFile (a single
// file), downloadFsDirectoryAsZip (every file under a directory, zipped up) below, and
// FileSystemPane.vue's onView() (the "view file" feature, which needs the raw bytes to classify
// and render a preview from, not just to trigger a save-to-disk).
export async function readFsFileBytes(node: FsTreeNode, root: FsRoot): Promise<Uint8Array | undefined> {
    if (root === "/local") {
        return localFsCache.readFile(node.path);
    }
    if (root === "/cloud") {
        if (node.cloudFileId == null) {
            return undefined;
        }
        // Read the whole file: the listed size can't be trusted to be accurate (or even present),
        // and a size of 0 would otherwise silently yield an empty file.
        return await cloudReadFile({cloudFileId: node.cloudFileId}, 0, Number.MAX_SAFE_INTEGER, node.path);
    }

    const client = getPythonClient();
    if (client == null) {
        return undefined;
    }
    // client.call() (comsync's SyncClient) throws immediately if the client isn't in its "idle"
    // state -- it doesn't queue -- and createPyodideSlot() already has one client.call() running
    // from page load (awaiting the worker's onReady) until Pyodide finishes loading. Calling
    // client.call() again (for readFsFile, below) while that's still in flight throws "State is
    // running, not idle" -- silently, since callers of this function (onDownload/onDownloadDir,
    // FileSystemPane.vue) fire it without awaiting it, so the rejection becomes an invisible
    // unhandled promise rejection rather than a console error. Wait out both: isPythonWorkerReady
    // (true once onReady's *callback* has fired -- see main_thread_python_handler.ts) first, then
    // client.state actually settling back to "idle" (there's a brief further gap while the
    // pyodideExpose wrapper finishes returning over Comlink). Previously this whole race was masked
    // by accident: opening the File system tab always listed "/data" via a plain (non-client.call())
    // worker RPC first, which took long enough that Pyodide -- and thus onReady's call -- had
    // always finished by the time a download's client.call() ran. Listing no longer touches the
    // worker at all (see listFsRootTree() above), so that accidental ordering guarantee is gone and
    // must be made explicit here instead. Once past this first call, later calls (e.g. one per file
    // while zipping a directory) never need to wait: comsync resets state back to "idle" in a
    // finally block that runs before client.call()'s own promise settles, so it's already idle
    // again by the time our await above returns.
    if (!isPythonWorkerReady.value) {
        await new Promise<void>((resolve) => {
            const stopWatching = watch(isPythonWorkerReady, (ready) => {
                if (ready) {
                    stopWatching();
                    resolve();
                }
            });
        });
    }
    while (client.state !== "idle") {
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    // readFsFile is pyodideExpose'd (see python-execution.ts's own comment for why) so, unlike
    // the plain worker RPCs above, it must go via client.call() and is handed a callback for any
    // synchronous request it makes back to the main thread while reading -- in practice the only
    // kind it can ever issue is "assetFile_fetch" (fetching a lazily-loaded asset file's bytes).
    // This mirrors PythonExecutionArea.vue's own sync-request handling in execPythonCode(), just
    // narrowed to the one request kind relevant here.
    if (!(await isServiceWorkerChannelResponsive(serviceWorkerChannel.baseUrl))) {
        console.error("Service worker sync channel not responding; file download may fail");
    }
    return await client.call(
        client.workerProxy.readFsFile,
        node.path,
        Comlink.proxy((asreq: SyncOrAsyncStrypePyodideWorkerRequest) => {
            if (asreq.kind !== "sync" || asreq.request.request !== "assetFile_fetch") {
                console.error("Unexpected request while reading a file for the File system tab: " + JSON.stringify(asreq));
                return;
            }
            const req = asreq.request;
            fetch(req.url).then((resp) => resp.arrayBuffer()).then((arr) => encodeUint8ToString(new Uint8ClampedArray(arr)))
                .then(async (r) => {
                    await serviceWorkerReadyAndInControl();
                    await client.writeMessage({request: req.request, response: r});
                })
                .catch(async (err) => {
                    await serviceWorkerReadyAndInControl();
                    await client.writeMessage({request: req.request, error: err.toString()});
                });
        })
    );
}

export async function downloadFsFile(node: FsTreeNode, root: FsRoot): Promise<void> {
    const bytes = await readFsFileBytes(node, root);
    if (bytes != null) {
        saveAs(new Blob([bytes as BlobPart], {type: "application/octet-stream"}), node.name);
    }
}

// Recursively collects every file under dirNode (paths relative to dirNode itself), zips them, and
// triggers a download of "<dirNode.name>.zip". Files are fetched sequentially (not in parallel):
// for the read-only asset roots, they all share the one Pyodide worker client, whose client.call()
// can only ever have one request in flight at a time (see readFsFileBytes's own comment).
export async function downloadFsDirectoryAsZip(dirNode: FsTreeNode, root: FsRoot): Promise<void> {
    const zip = new JSZip();

    async function addNode(node: FsTreeNode, relativePath: string): Promise<void> {
        if (node.isDir) {
            for (const child of node.children ?? []) {
                await addNode(child, `${relativePath}/${child.name}`);
            }
            return;
        }
        const bytes = await readFsFileBytes(node, root);
        if (bytes != null) {
            zip.file(relativePath, bytes);
        }
    }

    for (const child of dirNode.children ?? []) {
        await addNode(child, child.name);
    }

    const blob = await zip.generateAsync({type: "blob"});
    saveAs(blob, `${dirNode.name}.zip`);
}

// Whether dirNode already has a direct child (file or folder) with the given name -- used to warn
// before an upload would silently overwrite (files) or merge into (folders) an existing entry.
// dirNode's children are whatever was last listed for it (listFsRootTree), so this is a check
// against that snapshot, not a fresh round trip.
export function dirHasEntryNamed(dirNode: FsTreeNode, name: string): boolean {
    return (dirNode.children ?? []).some((child) => child.name === name);
}

// Deletes a file, or every file under a directory, from "/local". Directories aren't stored as
// entries of their own in localFsCache.ts (they're purely implicit in the files' paths), so
// "deleting" one just means deleting every file whose path falls under it.
export function deleteFromLocal(node: FsTreeNode): void {
    if (node.isDir) {
        for (const child of node.children ?? []) {
            deleteFromLocal(child);
        }
        return;
    }
    localFsCache.deleteFile(node.path);
}

// Files at or above this size can't be pinned (see togglePinLocal below) -- kept in sync with the
// identical constant in FileSystemTree.vue, which uses it to grey out the pin button rather than
// relying solely on this function silently refusing (that constant isn't imported here to avoid
// pulling FileSystemTree.vue's presentational code into this file, or vice versa).
export const MAX_PINNABLE_FILE_SIZE = 1024 * 1024;

// Toggles whether a "/local" file is pinned (saved into the .spy file itself -- see load-save.ts's
// savePinnedLocalFiles()/loadPinnedLocalFiles()). Refuses to newly pin a file at or above
// MAX_PINNABLE_FILE_SIZE, but never refuses to unpin one already over that size (e.g. from an
// older project saved before this limit existed, or before the file grew past it).
export function togglePinLocal(node: FsTreeNode): void {
    const currentlyPinned = localFsCache.isPinned(node.path);
    if (!currentlyPinned && (node.size ?? 0) >= MAX_PINNABLE_FILE_SIZE) {
        return;
    }
    localFsCache.setPinned(node.path, !currentlyPinned);
}

// ---- Upload validation ----
// A reject list of file types that must never be written into the user-visible file system
// ("/local", "/cloud"), whether uploaded directly, extracted from a zip, or restored from a project
// file's pinned files (see load-save.ts's loadPinnedLocalFiles()).
//
// Strype only ever runs Python code (inside Pyodide), so none of these types is needed for anything
// it does. They're refused because the File system tab can hand files back out again (download,
// and /cloud syncs to a real cloud drive), so accepting them would let Strype act as a carrier for
// native executables, OS scripts or JavaScript. HTML/XHTML files are deliberately *not* refused:
// they're legitimate data for Python programs (e.g. parsing or generating web pages), and Strype
// never renders them as HTML itself -- FileViewerDlg.vue shows them as plain text.
//
// Matched on the file's final extension, case-insensitively (see uploadExtensionOf()), plus -- for
// a direct upload only -- the MIME type the browser reports for it (see BLOCKED_UPLOAD_MIME_TYPES).
// Python files, data files, images, sounds, text, web pages, and zip archives (whose contents are
// checked separately, see FileSystemPane.vue's onUpload()) all remain allowed.
const BLOCKED_UPLOAD_EXTENSIONS: ReadonlySet<string> = new Set([
    // Windows executables, installers, libraries and shortcuts:
    "exe", "msi", "msp", "msix", "appx", "dll", "com", "scr", "cpl", "sys", "drv", "ocx", "lnk", "pif", "reg",
    // Windows scripts:
    "bat", "cmd", "ps1", "psm1", "psd1", "vbs", "vbe", "wsf", "wsh", "hta", "jse",
    // Unix/macOS executables, scripts, libraries and packages. Not ".bin": despite the name it's
    // the conventional extension for raw binary *data* (e.g. a Python program's own
    // open("data.bin", "wb") output), so refusing it would block legitimate files:
    "sh", "bash", "zsh", "csh", "ksh", "command", "run", "elf", "so", "dylib", "app", "dmg", "pkg", "deb", "rpm",
    // Java / Android:
    "jar", "war", "ear", "class", "apk",
    // JavaScript:
    "js", "mjs", "cjs", "jsx",
]);

// The same categories as BLOCKED_UPLOAD_EXTENSIONS, as MIME types. A browser doesn't sniff a file's
// content to fill in File.type: it derives it from the extension, using the OS's own file-type
// registrations (and leaves it empty when it doesn't know). So this is a secondary check rather
// than a content check: it catches an extension the list above doesn't name but which the user's
// OS knows to be one of these types. It only applies where a MIME type exists at all, i.e. a direct
// upload -- zip entries and pinned project files carry just a name.
const BLOCKED_UPLOAD_MIME_TYPES: ReadonlySet<string> = new Set([
    // Windows executables and installers:
    "application/x-msdownload", "application/x-msdos-program", "application/x-dosexec",
    "application/vnd.microsoft.portable-executable", "application/x-ms-installer", "application/x-msi",
    "application/x-ms-shortcut", "application/hta",
    // Windows scripts:
    "application/x-bat", "application/x-msbatch", "application/x-ms-powershell",
    // Unix/macOS executables, scripts and packages:
    "application/x-executable", "application/x-elf", "application/x-sharedlib", "application/x-mach-binary",
    "application/x-sh", "application/x-shellscript", "application/x-csh", "text/x-shellscript",
    "application/x-apple-diskimage", "application/x-debian-package", "application/vnd.debian.binary-package",
    "application/x-rpm", "application/x-redhat-package-manager",
    // Java / Android:
    "application/java-archive", "application/x-java-archive", "application/java-vm", "application/x-java-class",
    "application/vnd.android.package-archive",
    // JavaScript:
    "text/javascript", "application/javascript", "application/x-javascript", "application/ecmascript", "text/ecmascript",
]);

// The extension that actually determines how an OS/browser would treat the file, lowercased:
// trailing dots and whitespace are stripped first since Windows ignores them ("evil.exe." or
// "evil.exe " both end up as "evil.exe" once saved there). Only the *last* extension counts, so
// "photo.jpg.exe" is caught while "notes.exe.txt" is a plain text file. Returns "" if there's no
// extension at all (including dot-files like ".bashrc", which have a name but no extension).
function uploadExtensionOf(fileName: string): string {
    // Only the base name -- a zip entry path like "folder.js/readme.txt" must not be judged on its
    // folder's name:
    const baseName = fileName.split(/[/\\]/).pop() ?? "";
    const trimmed = baseName.replace(/[.\s]+$/, "");
    const dotIndex = trimmed.lastIndexOf(".");
    if (dotIndex <= 0) {
        return "";
    }
    return trimmed.slice(dotIndex + 1).toLowerCase();
}

// Whether a file with this name (or zip entry path) must be refused -- see
// BLOCKED_UPLOAD_EXTENSIONS above.
export function isBlockedUploadFileName(fileName: string): boolean {
    return BLOCKED_UPLOAD_EXTENSIONS.has(uploadExtensionOf(fileName));
}

// Whether a directly-uploaded file must be refused, by its name or by the MIME type the browser
// gives it ("text/javascript; charset=utf-8" is treated as "text/javascript").
export function isBlockedUploadFile(file: { name: string, type: string }): boolean {
    const mimeType = file.type.split(";")[0].trim().toLowerCase();
    return isBlockedUploadFileName(file.name) || BLOCKED_UPLOAD_MIME_TYPES.has(mimeType);
}

// The subset of the given names/paths that are refused, in their original order -- used to name
// the offending entries when rejecting a whole archive.
export function blockedUploadFileNames(fileNames: string[]): string[] {
    return fileNames.filter(isBlockedUploadFileName);
}

// Last line of defence for both upload functions below: FileSystemPane.vue already refuses blocked
// file types (see the upload validation above) before calling either, with a message for the user, so
// this should never actually throw -- it's here so that no future caller can write one by mistake.
// All-or-nothing, like unzipEntries()'s own refusal, so a rejected batch leaves nothing behind.
function assertNoBlockedEntries(entries: ArchiveEntry[]): void {
    const blocked = blockedUploadFileNames(entries.map((entry) => entry.path));
    if (blocked.length > 0) {
        throw new Error("Refusing to upload file(s) of a type that isn't allowed: " + blocked.join(", "));
    }
}

// Uploads a set of files (a single plain upload becomes a one-entry array -- see
// FileSystemPane.vue's uploadPlainFile()/onUnzipContents(), the only two callers) into "/local" at
// the given directory node's path (e.g. "/local" itself, or a subfolder), preserving each entry's
// own subfolder structure -- localFsCache.listTree() already builds nested directories from flat
// paths, so no special-casing is needed here beyond joining the path. Writes straight into the
// main-thread cache -- callers must not allow this while Python is executing (see
// FileSystemPane.vue): the cache is only resynced with a running worker at the start/end of a run
// (see terminateAndRestartPyodide(), main_thread_python_handler.ts), so a write made mid-run here
// would silently be lost when that run's own snapshot is taken at the end.
export async function uploadEntriesToLocal(dirNode: FsTreeNode, entries: ArchiveEntry[]): Promise<void> {
    assertNoBlockedEntries(entries);
    for (const entry of entries) {
        const path = dirNode.path === "/local" ? `/local/${entry.path}` : `${dirNode.path}/${entry.path}`;
        localFsCache.writeFile(path, entry.data);
    }
}

// Uploads a set of files (a single plain upload becomes a one-entry array -- see
// FileSystemPane.vue's uploadPlainFile()/onUnzipContents()) into "/cloud" at the given directory
// node (its cloudFileId is the parent folder to create the new file(s) in). Goes straight through
// cloudFileIO.ts's main-thread functions -- create, write the actual content, then close (which
// awaits the write actually landing, the same way a Python open()/write()/close() would via the
// worker's sync bridge -- see cloudCloseFile's own comment for why closing is what forces/awaits
// the flush). Unlike /local, entries are flattened into the target folder using just their base
// file name: cloudCreate() (cloudFileIO.ts) can't create directories at all (Strype's cloud file IO
// only ever creates files, never folders), so there's no way to recreate an archive's subfolder
// structure in the cloud drive. Sequential (not parallelised) to keep this simple and avoid
// hammering the cloud API with a burst of concurrent create+write+close calls for a large archive.
export async function uploadEntriesToCloud(dirNode: FsTreeNode, entries: ArchiveEntry[]): Promise<void> {
    if (dirNode.cloudFileId == null) {
        return;
    }
    assertNoBlockedEntries(entries);
    for (const entry of entries) {
        const name = entry.path.split("/").pop() as string;
        const filePath = `${dirNode.path}/${name}`;
        const newFileId = await cloudCreate({cloudFileId: dirNode.cloudFileId}, name, false, filePath);
        await cloudWriteFile(newFileId, entry.data, 0, filePath, true);
        await cloudCloseFile(newFileId);
    }
}
