/**
 * This helper file contains the handling of file IO to be used by Skulpt
 * on user code specified files (in Python: open()).
 * At the moment, we only support file IO in the cloud (due to restrictions on 
 * the browser's access to the host file system).
 */
import { vm } from "@/main";
import path from "path-browserify";
import { getCloudDriveHandlerComponentRefId, getMenuLeftPaneUID } from "./editor";
import CloudDriveHandlerComponent from "@/components/CloudDriveHandler.vue";
import MenuComponent from "@/components/Menu.vue";
import { useStore } from "@/store/store";
import { StrypeSyncTarget } from "@/types/types";
import i18n from "@/i18n";
import { CloudFileWithMetaData, CloudFolder, GDFile } from "@/types/cloud-drive-types";

declare const Sk: any;
// Will be set later as we need to make sure Vue application has started...
let cloudDriveHandlerComponent: InstanceType<typeof CloudDriveHandlerComponent>;

const cloudFilesMap: CloudFileWithMetaData[] = [];

// The TS typing to describe the file object implemented by Skulpt
// it depends on Skulpt implementation of course, but having it here is just for ease of using TS.
interface SkulptFile {
    name: string,
    mode: {
        v: string,
        // we don't need the other values
    }, 
    data$: string|Uint8Array,
    pos$: number,
    lineList: string[],
    currentLine: number,
    closed: boolean,
    fileno: number, // internal file number used by Skulpt, external files are number 11
    isInError?: boolean, // custom flag to indicate an error state, we need to know that when closing files.
}

// The cached tree of the Strype's project folder descendants (children their children etc).
// The tree is constructed "on demand", that is we only add the folders when they are referenced in a file path
// that we want to resolve; we don't retrieve all the descendants at once.
const currentStrypeProjectCloudFolderTree: CloudFolder[] =  [];

// Clearing method for cached elements (need to be called externally by the code runner)
export function clearFileIOCaches(): void {
    cloudFilesMap.splice(0);
    currentStrypeProjectCloudFolderTree.splice(0);
}

// This small helper method is used during writing operations (either for Skulpt internally or for us in the cloud)
// Since we can either write strings or bytes arrays depending on the file mode, we just check the type of the first argument.
const concatFileContentParts = (part1: string | Uint8Array, part2: string | Uint8Array): string | Uint8Array => {
    if(typeof part1 == "string"){
        return part1 + part2;
    }
    else{
        const newConcatArray = new Uint8Array(part1.length + part2.length);
        newConcatArray.set(part1, 0);
        newConcatArray.set(part2 as Uint8Array, part1.length);
        return newConcatArray;
    }
};

// Entry point for matching a file in the user code to a Cloud Drive.
// This is a promise that returns an object with a property "succeeded", boolean value, and "errorMsg" for passing the error message.
// On success, the file is mapped in gdFilesMap for future references.
export const skulptOpenFileIO = (skFile: SkulptFile): {succeeded: boolean, errorMsg: string} => {
    // If we are not connected to a cloud file system, then we raise an error.
    if(useStore().syncTarget != StrypeSyncTarget.gd){
        return {succeeded: false, errorMsg: i18n.t("errorMessage.fileIO.notConnectedToCloud") as string};
    }

    // Initialisator of the variable
    if(cloudDriveHandlerComponent == undefined){
        cloudDriveHandlerComponent = ((vm.$children[0].$refs[getMenuLeftPaneUID()] as InstanceType<typeof MenuComponent>).$refs[getCloudDriveHandlerComponentRefId()] as InstanceType<typeof cloudDriveHandlerComponent>);
    }

    // We cannot make any assumption on what the file name path separator is.
    // Because the path is written in the user code, and because the project can be open on any platform,
    // the separator can be anything (even if knowing the project looks up file in the Cloud, "/" is more likely).
    // We take the risk of splitting the path using either "/" or "\" and assuming these are not used in folder or file names.
    const filePath = skFile.name;
    const posixPath = filePath.replaceAll("\\", "/"); 
    const posixPathObj = path.parse(posixPath);
    const fileName = posixPathObj.name + posixPathObj.ext;

    // Look up the file on the Cloud Drive in the location:
    // We don't support parent directory references, so if there are any, we can already return in error...
    if(posixPathObj.dir.split("/").includes("..")){
        return {succeeded: false,errorMsg: i18n.t("errorMessage.fileIO.parentDirRefNotSupported") as string};
    }   
    else {
        return new Sk.misceval.promiseToSuspension(
            // First we need to check/retrieve the file's containing folder.
            getCloudFileFolderIdFromPath(posixPathObj)
                .then((fileFolderId) => {
                    // We have a fileFolder Id so we can now get the file itself within that location
                    return cloudDriveHandlerComponent.searchCloudDriveElements(StrypeSyncTarget.gd, fileName, fileFolderId, false, {orderBy: "modifiedTime", fileFields: "files(id,name,capabilities,contentRestrictions)"})
                        .then((cloudFiles) => {
                            if(cloudFiles[0]){
                                const gdFile = cloudFiles[0] as GDFile;
                                // Before adding the file in the map, we do some basic checks.
                                // Check 1: if the file is in x mode, it can't exist
                                if(skFile.mode.v.startsWith("x")){
                                    return {succeeded: false, errorMsg: i18n.t("errorMessage.fileIO.fileAlreadyExists", {filename: filePath}) as string};

                                }
                                // Check 2: if the file is in write, append, or r+ mode, it can't be readonly. 
                                const isReadonly = !(gdFile.capabilities.canEdit??true) || !(gdFile.capabilities.canModifyContent??true) || !!(gdFile.contentRestrictions?.readOnly);
                                if(isReadonly && /^([wa])|(rb?\+)/.test(skFile.mode.v)) {
                                    return {succeeded: false, errorMsg: i18n.t("errorMessage.fileIO.readonlyFile", {filename: filePath}) as string};
                                }
                                // Can add the matched file to the mapping object unless we are in "x" mode which requires the file not to exist.
                                const fileMapEntry: CloudFileWithMetaData = {...gdFile, filePath: filePath, locationId: fileFolderId, readOnly: isReadonly};
                                cloudFilesMap.push(fileMapEntry);     
                                
                                // If we are in reading mode or append mode, we need to retrieve the file's content.
                                // This is for internal mechanisms, but if we fail to read the file at this stage, we'll raise an error.
                                // For writing mode, we just set the file content to empty as it will be truncated anyway.
                                if(!skFile.mode.v.startsWith("w")){
                                    return skupltReadFileIO(filePath, skFile.mode.v.includes("b")).then((fileContent) => {                                           
                                        (cloudFilesMap.at(-1)as GDFile).content = fileContent;
                                        // Very importantly, the Skulpt internal data buffer is updated here for reading mode:
                                        if(skFile.mode.v.startsWith("r")){
                                            skFile.data$ = Sk.ffi.remapToPy(fileContent);
                                        }
                                        return {succeeded: true, errorMsg: ""};
                                    },
                                    () => {
                                        return {succeeded: false, errorMsg: i18n.t("errorMessage.fileIO.openReadingError", {filename: filePath}) as string};
                                    });
                                }
                                else{
                                    // At this stage everythig is fine, we can return success
                                    return {succeeded: true, errorMsg: ""};
                                }
                            }
                            else{
                                // The file may have not be found, which is a stopper in read mode.
                                // However, in write, append and exclusive creation mode, we can create a file. 
                                // Python creates the file right at the call to open().
                                // So we try that first.
                                if(skFile.mode.v.startsWith("r")){
                                    return {succeeded: false, errorMsg: i18n.t("errorMessage.fileIO.fileNotFound", {filename: filePath}) as string};
                                }
                                else if(skFile.mode.v.startsWith("w") || skFile.mode.v.startsWith("a") || skFile.mode.v.startsWith("x")){
                                    return cloudDriveHandlerComponent.writeFileContentForIO(StrypeSyncTarget.gd, (skFile.mode.v.includes("b") ? new Uint8Array(0) : ""), {filePath: filePath, fileName: fileName, folderId: fileFolderId})
                                        .then((newFileId) => {
                                            // Since the file has been created we can now keep it's fileId in the map:
                                            cloudFilesMap.push({name: fileName, content: "", filePath: filePath, id: newFileId, locationId: fileFolderId,
                                                readOnly: false, capabilities: {canEdit: true, canModifyContent: true}});
                                            return {succeeded: true, errorMsg: ""};
                                        },
                                        (errorMsg) =>  {
                                            return {succeeded: false, errorMsg: errorMsg};
                                        });                               
                                }
                            }
                        },
                        (reason: any) => {
                            const errorMsg = i18n.t("errorMessage.fileIO.accessToGDError", {fileName: filePath, error: (typeof reason == "string") ? reason : (reason.status??"unknown")});
                            return {succeeded:false,errorMsg: errorMsg};
                        });
                },
                (errorMsg) => {
                    return {succeeded: false, errorMsg: errorMsg??i18n.t("errorMessage.fileIO.fileLocationNotFound", {filename: filePath}) as string};
                })     
        );
    }
};

const getCloudFileFolderIdFromPath = (fileFolderPath: path.PathObject): Promise<string> => {
    // We retrieve (and check) the location of the file, specified by fileFolderPath.
    // The base location of the Cloud Drive search is the project's current directory.
    // We do not allow references to parent directories, therefore we can never go "up" the Strype project directory.
    // Also, we resolve the path one folder at a time, and keep it for reference in our folder tree, currentStrypeProjectCloudFolderTree.
    const baseFolderLocationId = useStore().strypeProjectLocation as string;
    if(fileFolderPath.dir && fileFolderPath.dir != "./"){
        // We need to look up the directory/directories from top to bottom, unless it is already cached in currentStrypeProjectCloudFolderTree.
        const cleanedPath = fileFolderPath.dir.replace(/^.\//,"");
        const userGivenFolderParts = cleanedPath.split("/");
        let currentCachedFolder = null as CloudFolder | null;       

        const resolveFilePath = (folderNameToCheck: string, folderChildrenNames: string[]): Promise<string> => {
            const handleFoundFolder = (foundCachedFolder: CloudFolder): Promise<string> => {
                if(folderChildrenNames.length > 0){
                    currentCachedFolder = foundCachedFolder;
                    return resolveFilePath(folderChildrenNames[0], folderChildrenNames.slice(1));
                }
                else{
                    return Promise.resolve(foundCachedFolder.id);
                }
            };

            // When resolving the token ".", we stay where are, move on the next token if needed
            if(folderNameToCheck == "."){                
                if(folderChildrenNames.length > 0){
                    return resolveFilePath(folderChildrenNames[0], folderChildrenNames.slice(1));
                }
                else{
                    // The silly case users would type "./././filename" should be handled.
                    return Promise.resolve((currentCachedFolder?.id)??baseFolderLocationId);
                }
            }

            // Is this path part already cached?
            const toLookIn = (currentCachedFolder) ? currentCachedFolder.children : currentStrypeProjectCloudFolderTree;
            const cachedChildFolder = toLookIn.find((folder: CloudFolder) => folder.name == folderNameToCheck); 
            if(cachedChildFolder){
                // It's cached, we either return the file ID when there is nothing else to resolve, otherwise we change our pointers and keep resolving
                return handleFoundFolder(cachedChildFolder);
            }
            else{
                // It's not cached: we need to look for it against the Cloud Drive.
                return cloudDriveHandlerComponent.searchCloudDriveElements(StrypeSyncTarget.gd, folderNameToCheck, (currentCachedFolder?.id)??baseFolderLocationId, false, {orderBy: "modifiedTime", fileFields: "files(id,name)"})
                    .then((cloudFolderFiles) => {                             
                        // The search succeeded and we expect only one folder to be found (if any, so we'll use the first one returned).
                        // We can save that folder in the cache and either return it's ID if we don't have other folder to resolve, or continue resolving otherwise.
                        if(cloudFolderFiles.length > 0){
                            const toAppendIn = (currentCachedFolder) ? currentCachedFolder.children : currentStrypeProjectCloudFolderTree;
                            toAppendIn.push({id: cloudFolderFiles[0].id, name: cloudFolderFiles[0].name, children: []});
                            currentCachedFolder = toAppendIn.at(-1) as CloudFolder;
                            return handleFoundFolder(currentCachedFolder);
                        }
                        else{
                            return Promise.reject(undefined);
                        }
                    },
                    (error) => Promise.reject(error.result));
            }
        };        
        return resolveFilePath(userGivenFolderParts[0], userGivenFolderParts.slice(1));
    }
    
    // No directory specified, we're in the project location, we can return now.
    return Promise.resolve(baseFolderLocationId as string);
};

// Handling the closing request of a file from Skulpt. In our Cloud Drive context.
// We make sure to make the actual writing of the file on the Drive, and clean up the file map. 
export const skulptCloseFileIO = (skFile: SkulptFile): {succeeded: boolean, errorMsg: string} => {
    const fileEntryIndex = cloudFilesMap.findIndex((entry) => entry.filePath == skFile.name);
    if(fileEntryIndex == -1){
        return {succeeded: false, errorMsg: i18n.t("errorMessage.fileIO.closeInternalError") as string};
    }
    // If we are in strict reading mode OR in error*, we don't need to do any async part.
    // Otherise, we need to make the actual writing to the file. (* an error may be raised 
    // in Skulpt on something from the user code, but close() is called to clean things.
    // When this situation happens, we set a flag on the file object from Skulpt.)
    // In all cases when we need to write something, we just write the buffer content.
    // One exception to this: append mode will write at the end of the file.
    const finaliseClose = (): {succeeded: boolean, errorMsg: string} => {
        cloudFilesMap.splice(fileEntryIndex, 1);
        return {succeeded: true, errorMsg: ""};
    };

    const needWriting = (!skFile.isInError ) && (!/^rb?$/.test(skFile.mode.v));
    // Prepare what to write. 
    if(needWriting){
        const toWrite = (skFile.mode.v.startsWith("a")) ? concatFileContentParts(cloudFilesMap[fileEntryIndex].content, Sk.ffi.remapToJs(skFile.data$)) : Sk.ffi.remapToJs(skFile.data$);
        return new Sk.misceval.promiseToSuspension(
            skulptWriteFileIO(skFile, toWrite)
                .then((successData: {succeeded: boolean, errorMsg: string}) => {
                    if(successData.succeeded){
                        return finaliseClose();
                    }
                    else {
                        return successData;
                    }
                })
        );
    }
    else{
        return finaliseClose();
    }
};

// Read method, with retrieves the content of a file on Cloud Drive.
// The content is either a string content for text modes, bytes for binary modes.
// On failure, the content contains the error message.
const skupltReadFileIO = (filePath: string, isBinary: boolean): Promise<string|Uint8Array> => {
    // We retrieve the Cloud Drive file ID - it should be valid as no call to this when a file is closed in Skulpt should happen.
    const fileId = cloudFilesMap.find((mapEntry) => mapEntry.filePath == filePath)?.id??"";
    return new Promise<string|Uint8Array>((resolve, reject) => {
        cloudDriveHandlerComponent.readFileContentForIO(StrypeSyncTarget.gd, fileId, isBinary, filePath)
            .then((fileContent) => {
                resolve(fileContent as string|Uint8Array);
            }, (error) => {
                reject(error);
            });       
    });
};

// This method is a handler for the internal Skulpt write (to external file).
// It doens't actually write in the external file, but update the Skulpt's internal buffer of the Skulpt file object.
// It concatenates toWrite to the current buffer, excpet for "r+" (see details)
export const skulptInteralFileWrite = (skFile: SkulptFile, toWrite: string | Uint8Array): void => {
    if(/^rb?\+$/.test(skFile.mode.v)){
        // This weird mode is handled by us. 
        // We replace every part of the buffer for the given towrite content, at the current pointer position.
        const bufferPos = Sk.ffi.remapToJs(skFile.pos$);
        let newData;
        if(skFile.mode.v.includes("b")){
            newData = Sk.ffi.remapToJs(skFile.data$) as Uint8Array;
            // First write what we can in the existing array
            const writeUpToInclWritePos = Math.min(newData.length - bufferPos, toWrite.length);
            newData.set(toWrite.slice(0, writeUpToInclWritePos + 1) as Uint8Array, bufferPos);
            if(writeUpToInclWritePos < toWrite.length - 1){
                // The reminder to write, we need to create a new buffer.
                newData = concatFileContentParts(newData, toWrite.slice(writeUpToInclWritePos + 1)) as Uint8Array;
            }
        }
        else{
            const strData = Sk.ffi.remapToJs(skFile.data$) as string;
            newData = strData.substring(0, bufferPos) + toWrite + ((strData.length - bufferPos > toWrite.length) ? strData.substring(bufferPos + toWrite.length) : "");
        }
        // Set the new buffer and position to the file. We take the rule to move the position on write.
        skFile.data$ = Sk.ffi.remapToPy(newData);
        skFile.pos$ = Sk.ffi.remapToPy(bufferPos + toWrite.length);
    }
    else{
        skFile.data$ = Sk.ffi.remapToPy(concatFileContentParts(Sk.ffi.remapToJs(skFile.data$), toWrite));
    }
};

// This write method is internally called by the the closing method (see skulptCloseFileIO) when the latter is called by Skulpt.
// All intermediate buffer writing is done by Skulpt which calls skulptInteralFileWrite above.
// Note: we write a full file content every time. That means that sometimes we need to write more than the internal buffer content,
// for example in append mode. It is the job of skulptCloseFileIO to check all that - this methods just writes.
const skulptWriteFileIO = (skFile: SkulptFile, toWrite: string|Uint8Array): Promise<{succeeded: boolean, errorMsg: string}> => {
    // We retrieve the Cloud Drive file ID - it should be valid as no call to this after a file is closed in Skulpt should happen.
    const fileId = cloudFilesMap.find((mapEntry) => mapEntry.filePath == skFile.name)?.id??"";
    return cloudDriveHandlerComponent.writeFileContentForIO(StrypeSyncTarget.gd, toWrite, {filePath: skFile.name, fileId: fileId})
        .then((_) => {
            return {succeeded: true, errorMsg: ""};
        },
        (errorMsg) => {
            // We do not reject here, everything is treated as resolved (for Skulpt to handle the error messages)
            return {succeeded: false, errorMsg: errorMsg};
        });
   
};
