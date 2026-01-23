import { MIMEDesc, ProjectLocation } from "@/types/types";

/**
 * This helper file provides access to the file picker (File System Access API: https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API).
 * Currently, not all browsers support this API, therefore to bypass the Typescript errors using the methods on (the JS object) window, we use a non-typed
 * alias instead (cf. noTypedWindow below).
 * This helper DOES NOT propose alternatives if the API isn't supported, so that's the caller to handle this case. 
 * The API support can be tested via the values of the 2 flags canBrowserOpenFilePicker and canBrowserSaveFilePicker.
 */

const noTypedWindow = window as any;
export function canBrowserOpenFilePicker() : boolean {
    return (noTypedWindow.showOpenFilePicker != undefined) && !window.Cypress && !noTypedWindow.Playwright;
}
export function canBrowserSaveFilePicker() : boolean {
    return (noTypedWindow.showSaveFilePicker != undefined) && !window.Cypress && !noTypedWindow.Playwright;
} 

export function saveFile(suggestedFileName: string, mimeTypesArray: MIMEDesc[], startInFolder: ProjectLocation, fileContent: string, onSuccess: (fileHandle: FileSystemFileHandle) => void): void{
    const options = {
        suggestedName: suggestedFileName,
        types: mimeTypesArray,
        startInFolder: startInFolder,
    };

    noTypedWindow.showSaveFilePicker(options).then((fileSysHandle: FileSystemFileHandle) => {
        // Write the file content (we hope for the best)
        // Because of some issue with the description of FileSystemFileHandle and FileSystemWritebaleFileStream, we need to case the objects of these type to any
        let fsStream: any;
        (fileSysHandle as any).createWritable().then((stream: any) => {
            fsStream = stream;
            stream.write(fileContent).then(() => fsStream?.close());
        });

        // Call the success callback method
        onSuccess(fileSysHandle);
    }, (reason: any) => {
        console.error("Save with showFilePicker failed with reason:\n" + reason);
    });
}

export function openFile(mimeTypesArray: MIMEDesc[], startInFolder: ProjectLocation, onSuccess: (fileHandles: FileSystemFileHandle[]) => void): void{
    const options = {
        types: mimeTypesArray,  
        startInFolder: startInFolder,
    };
 
    noTypedWindow.showOpenFilePicker(options).then((fileSysHandles: FileSystemFileHandle[]) => onSuccess(fileSysHandles),
        (reason: any) => {
            console.error("Load with showFilePicker failed with reason:\n" + reason);
        });
}