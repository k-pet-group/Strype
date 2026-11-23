// Archive handling for the "File system" tab's upload flow (see FileSystemPane.vue): detecting a
// .zip upload and extracting its entries. Uses the vendored "jszip" npm dependency, which Vite
// bundles straight into the app's own JS output -- no runtime fetch to an external host, matching
// CLAUDE.md's "no runtime server contact for JS/wasm libraries" principle just as fully as the
// public/js/-vendored assets (tree-sitter, Pyodide) do; the difference is only that a pure-JS
// library like this one can be inlined into the build rather than needing to be fetched as a
// separate binary asset at runtime.
import JSZip from "jszip";
import { blockedUploadFileNames } from "@/helpers/fileSystemTabIO";

export function isZipFile(file: File): boolean {
    return file.name.toLowerCase().endsWith(".zip");
}

export interface ArchiveEntry {
    // Relative path within the archive, e.g. "folder/file.txt" -- forward-slash separated,
    // regardless of platform, per the zip spec.
    path: string,
    data: Uint8Array,
}

// A zip entry path that could escape the target directory once joined onto it (zip-slip -- see
// https://snyk.io/research/zip-slip-vulnerability, and JSZipObject.unsafeOriginalName's own doc
// comment, which flags exactly this).
function isUnsafeZipEntryPath(path: string): boolean {
    return path.startsWith("/") || path.split("/").some((part) => part === "..");
}

// The path of every file entry (not directory entries) in a .zip File, without decompressing any of
// them -- JSZip only needs to read the archive's central directory for this. Used to vet an
// archive's contents (see fileSystemTabIO.ts's upload validation) before offering to store or unzip it. Throws if
// the file isn't a readable zip at all.
export async function listZipEntryPaths(file: File): Promise<string[]> {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const paths: string[] = [];
    zip.forEach((relativePath, zipObject) => {
        if (!zipObject.dir) {
            paths.push(relativePath);
        }
    });
    return paths;
}

// Extracts every file entry from a .zip File (skipping directory entries, which need no action --
// the caller derives any needed subfolders from file paths), rejecting any unsafe path outright
// rather than silently sanitising it, so a malicious archive can't cause files to land somewhere
// the user didn't expect.
export async function unzipEntries(file: File): Promise<ArchiveEntry[]> {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entries: ArchiveEntry[] = [];
    const pending: Promise<void>[] = [];
    let sawUnsafeEntry = false;
    zip.forEach((relativePath, zipObject) => {
        if (zipObject.dir) {
            return;
        }
        if (isUnsafeZipEntryPath(relativePath)) {
            sawUnsafeEntry = true;
            return;
        }
        pending.push(zipObject.async("uint8array").then((data) => {
            entries.push({path: relativePath, data});
        }));
    });
    await Promise.all(pending);
    if (sawUnsafeEntry) {
        throw new Error("Archive contains one or more entries with an unsafe path and was not unzipped.");
    }
    // Callers vet the archive with listZipEntryPaths() before getting here (so the user gets a
    // proper message), but refuse again here too so no caller can extract a blocked file type by
    // skipping that step -- see fileSystemTabIO.ts's upload validation:
    if (blockedUploadFileNames(entries.map((entry) => entry.path)).length > 0) {
        throw new Error("Archive contains one or more files of a type that isn't allowed and was not unzipped.");
    }
    return entries;
}
