/**
 * This helper file contains the handling of file IO to be used by Pyodide
 * on user code specified files (in Python: open(), read(), write(), etc).
 * At the moment, we only support file IO in the cloud (due to restrictions on 
 * the browser's access to the host file system).
 */
import { useStore } from "@/store/store";
import i18n from "@/i18n";
import { CloudDriveFile, CloudFileWithMetaData, CloudFolder, isSyncTargetCloudDrive } from "@/types/cloud-drive-types";
import {CloudFileId, CloudFileInfo} from "@/stryperuntime/worker_bridge_type";
import { vueComponentsAPIHandler } from "./vueComponentAPI";
import { CloudDriveHandlerComponentAPI } from "@/types/vue-component-api-types";

function getCloud() : CloudDriveHandlerComponentAPI {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return vueComponentsAPIHandler.cloudDriveHandlerComponentAPI!;
}

const cloudFilesMap: CloudFileWithMetaData[] = [];

// The cached tree of the Strype's project folder descendants (children their children etc).
// The tree is constructed "on demand", that is we only add the folders when they are referenced in a file path
// that we want to resolve; we don't retrieve all the descendants at once.
const currentStrypeProjectCloudFolderTree: CloudFolder[] =  [];

// Clearing method for cached elements (need to be called externally by the code runner)
export function clearFileIOCaches(): void {
    cloudFilesMap.splice(0);
    currentStrypeProjectCloudFolderTree.splice(0);
}

export function cloudLookupFile(parent: CloudFileId, name: string) : Promise<CloudFileInfo | undefined> {
    // If we are not connected to a cloud file system, then we raise an error:
    if(!isSyncTargetCloudDrive(useStore().syncTarget)){
        return Promise.reject(i18n.global.t("errorMessage.fileIO.notConnectedToCloud") as string);
    }
    
    const cloud : CloudDriveHandlerComponentAPI = getCloud();

    const searchOptions : Record<string, string> = {};
    const modifiedDataSearchOptionName = cloud.modifiedDataSearchOptionName(useStore().syncTarget);
    if (modifiedDataSearchOptionName) {
        searchOptions.orderBy = modifiedDataSearchOptionName;
    }
    const fileMoreFieldsForIO = cloud.fileMoreFieldsForIO(useStore().syncTarget);
    if (fileMoreFieldsForIO) {
        searchOptions.fileFields = fileMoreFieldsForIO;
    }
    return cloud.searchCloudDriveElements(useStore().syncTarget, name, parent.cloudFileId, false, searchOptions)
        .then((cloudFolderFiles : CloudDriveFile[]) => {
            // The search succeeded and we expect only one folder to be found (if any, so we'll use the first one returned).
            // We can save that folder in the cache and either return it's ID if we don't have other folder to resolve, or continue resolving otherwise.
            if(cloudFolderFiles.length > 0){
                return Promise.resolve({fileId: {cloudFileId: cloudFolderFiles[0].id}, isDir: cloudFolderFiles[0].isDir, name: cloudFolderFiles[0].name, fileSize: cloudFolderFiles[0].fileSize});
            }
            else{
                return Promise.resolve(undefined);
            }
        },
        (error) => Promise.reject(error.result));
}

export function cloudListDir(parent: CloudFileId) : Promise<CloudFileInfo[]> {
    // If we are not connected to a cloud file system, then we raise an error:
    if(!isSyncTargetCloudDrive(useStore().syncTarget)){
        return Promise.reject(i18n.global.t("errorMessage.fileIO.notConnectedToCloud") as string);
    }
    const cloud : CloudDriveHandlerComponentAPI = getCloud();

    return cloud.searchCloudDriveElements(useStore().syncTarget, undefined, parent.cloudFileId, false, {})
        .then((cloudFolderFiles : CloudDriveFile[]) => {
            return Promise.resolve(cloudFolderFiles.map((cloudFolderFile) => {
                return {
                    fileId: {cloudFileId: cloudFolderFile.id},
                    name: cloudFolderFile.name,
                    isDir: cloudFolderFile.isDir,
                    fileSize: cloudFolderFile.fileSize,
                };
            }));
        },
        (error) => Promise.reject(error.result));
}


export function cloudOpenFile(file: CloudFileId, flags: number) : Promise<boolean> {
    // There's not actually anything to do here; cloud files are generally read/written
    // in their entirety, so there's not really a concept of holding them open.
    // We don't read the content yet; we wait for first read or write for that.
    // But it's nice to have functions that mirror the Pyodide API in case of future changes.
    return Promise.resolve(true);
}

export async function cloudCloseFile(file: CloudFileId) : Promise<boolean> {
    const details = cloudFileContent.get(file.cloudFileId);
    if (details) {
        // We need to force flush.  First await any pending write, which might
        // have been writing stale data:
        if (details.pendingWrite) {
            await details.pendingWrite;
        }
        if (details.content.sequence > details.lastWritePerformed) {
            // Then do one last write if there is new content to write:
            await cloudWriteFile(file, details.content.bytes, 0, details.filePath, true);
            // This should always exist now, because we have just forced a write:
            if (details.pendingWrite) {
                await details.pendingWrite;
            }
        }
        // Delete from cache now we're closing:
        cloudFileContent.delete(file.cloudFileId);
    }
    return true;
}

// We know if there is still something to be written by comparing
// content.sequence to lastWritePerformed.  If they are equal, nothing to write.
// If we only read and never wrote, they will both be zero, so that will stop writing
// to files we only read from.
interface CloudFileContent {
    content: {bytes: Uint8Array, sequence: number};
    filePath: string;
    lastWritePerformed: number;
    // If this is undefined, no pending error:
    pendingError: Error | undefined;
    // If this is undefined, there are no pending writes:
    pendingWrite: Promise<void> | undefined;
    lastWrittenTime: number; // A date, e.g. from Date.now()
}

// Originally we used the LRU cache for this to limit the number of held files.
// But in that case when we added a file we could evict an old one, and fail to write,
// and leave to the odd circumstance that read("bar.txt") needs to give an error that
// writing foo.txt (an old pending write) has failed.  So we instead allow an arbitrary
// unlimited number of open files, and only flush writes when that file is written
// or closed.
// The key in the cache is the CloudFileId
const cloudFileContent = new Map<string, CloudFileContent>();

export async function cloudTruncateFile(id: CloudFileId, size: number, filePath: string) : Promise<number> {
    const fullContent = await fetchAndCacheContentFor(id, filePath);
    // Don't need to truncate unless it's longer than wanted:
    if (fullContent.content.bytes.length > size) {
        fullContent.content.bytes = fullContent.content.bytes.slice(0, size);
        fullContent.content.sequence = fullContent.content.sequence + 1;
        // Now queue a write of the bytes at position 0.  You'd think this wouldn't do any truncation,
        // just an overwrite, but because we have truncated the bytes above in the cached object, and we always
        // write the full file content to the cloud, this will overwrite the whole file with 
        // the newly truncated bytes we've stored:
        await cloudWriteFile(id, fullContent.content.bytes, 0, filePath);
    }
    return fullContent.content.bytes.length;
}

// Note: the writes are queued for async, it won't necessarily have written by the time the Promise succeeds.
// Because of this, the force parameter doesn't await, it just force queues.  Awaiting pendingWrite after if you want.
export async function cloudWriteFile(file: CloudFileId, content: Uint8Array | Uint8ClampedArray, atPosition: number, filePath: string, force = false) : Promise<void>  {
    // First get the full file content:
    const fullContent = await fetchAndCacheContentFor(file, filePath);
    // Now we must copy in our written portion, which might involve re-allocating the array:
    fullContent.content.bytes = copyBetweenUint8Array(fullContent.content.bytes, atPosition, content);
    fullContent.content.sequence = fullContent.content.sequence + 1;
    // If a previous error, throw it now:
    if (fullContent.pendingError) {
        const e = fullContent.pendingError;
        fullContent.pendingError = undefined; // Clear it so that we can potentially try again
        throw e;
    }
    
    // Now we either write (if it's been long enough since last write) or setup a pending write:
    if (!fullContent.pendingWrite || force) {
        // 5 seconds since last write:
        if (Date.now() > fullContent.lastWrittenTime + 5000 || force) {
            const seq = fullContent.content.sequence;
            const bytes = fullContent.content.bytes;
            fullContent.pendingWrite = (async () => {
                try {
                    await getCloud().writeFileContentForIO(useStore().syncTarget, bytes, {filePath,fileId: file.cloudFileId});
                    fullContent.lastWritePerformed = seq;
                }
                catch (e) {
                    fullContent.pendingError = e instanceof Error ? e : new Error(String(e));
                }
                finally {
                    fullContent.pendingWrite = undefined;
                    fullContent.lastWrittenTime = Date.now();
                }
            })();
        }
    }
}

// Returns dest array, which might be a re-allocated copy if it was not long enough to fit complete source.
function copyBetweenUint8Array(
    dest: Uint8Array,
    destPos: number,
    src: Uint8Array | Uint8ClampedArray,
    srcStart = 0,
    srcEnd = src.length
): Uint8Array {
    const sliceLen = srcEnd - srcStart;
    const required = destPos + sliceLen;

    if (required > dest.length) {
        const newDest = new Uint8Array(required);
        newDest.set(dest, 0);
        dest = newDest;
    }

    dest.set(src.subarray(srcStart, srcEnd), destPos);
    return dest;
}


async function fetchAndCacheContentFor(file: CloudFileId, filePath: string) : Promise<CloudFileContent> {
    let fullContent: CloudFileContent | undefined = cloudFileContent.get(file.cloudFileId);
    if (!fullContent) {
        const bytes = await getCloud().readFileContentForIO(useStore().syncTarget, file.cloudFileId, filePath);
        fullContent = {
            content: {bytes, sequence: 0},
            lastWritePerformed: 0,
            filePath,
            pendingWrite: undefined,
            pendingError: undefined,
            lastWrittenTime: Date.now(),
        };
        cloudFileContent.set(file.cloudFileId, fullContent);
    }
    return fullContent;
}

export async function cloudReadFile(file: CloudFileId, fromByte: number, lengthBytes: number, filePath: string) : Promise<Uint8Array> {
    // Try cache first:
    const fullContent = await fetchAndCacheContentFor(file, filePath);
    // Now we have to slice it for the return:
    return fullContent.content.bytes.slice(fromByte, fromByte + lengthBytes);
}

export async function cloudCreate(parent: CloudFileId, name: string, isDir: boolean, filePath: string) : Promise<CloudFileId> {
    // If we are not connected to a cloud file system, then we raise an error:
    if(!isSyncTargetCloudDrive(useStore().syncTarget)){
        return Promise.reject(i18n.global.t("errorMessage.fileIO.notConnectedToCloud") as string);
    }
    const cloud : CloudDriveHandlerComponentAPI = getCloud();
    
    if (isDir) {
        return Promise.reject(i18n.global.t("errorMessage.fileIO.cannotCreateDirectory") as string);
    }
    else {
        // Write an empty file (this will be awaited by the caller):
        return cloud.writeFileContentForIO(useStore().syncTarget, new Uint8Array(0), {filePath: filePath, fileName: name, folderId: parent.cloudFileId}).then((id: string) => {
            return {cloudFileId: id};
        });
    }
}
