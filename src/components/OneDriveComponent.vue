/**
 * The CloudDriveComponent implementation for OneDrive.
 * (Note that here, missing parts from CloudDriveComponent
 *  will not be detected, they will be when this component
 *  is used in CloudDriveHandler).
 * The underlying service we used for authentication is 
 * MSAL, as recommanded by Microsoft.
 * The underlying service we use is OneDrive File picker 
 * (https://learn.microsoft.com/en-us/onedrive/developer/controls/file-pickers/?view=odsp-graph-online)
 */
<template>
    <div></div>
</template>
<script lang="ts">
//////////////////////
//      Imports     //
//////////////////////
import { useStore } from "@/store/store";
import { StrypeSyncTarget } from "@/types/types";
import { mapStores } from "pinia";
import Vue, { PropType } from "vue";
import { AccountInfo, Configuration, PublicClientApplication  } from "@azure/msal-browser";
import { CloudFileSharingStatus, OneDrivePickConfigurationOptions, OneDriveTokenPurpose } from "@/types/cloud-drive-types";
import { uniqueId } from "lodash";
import { pythonFileExtension, strypeFileExtension } from "@/helpers/common";
import { CloudDriveAPIState } from "@/types/cloud-drive-types";
import { CloudDriveFile } from "@/types/cloud-drive-types";
import { BaseItem, Permission, UploadSession } from "@microsoft/microsoft-graph-types";
import CloudDriveHandlerComponent from "@/components/CloudDriveHandler.vue";

//////////////////////
//     Component    //
//////////////////////
export default Vue.extend({
    name: "OneDriveComponent",
    
    props: {
        driveName: { type: String, required: true },
        apiName: { type: String, required: true },
        onFileToLoadPicked: {type: Function as PropType<(cloudTarget: StrypeSyncTarget, fileId: string, fileName?: string) => Promise<void>>, required: true},
        onFolderToSaveFilePicked: {type: Function as PropType<(cloudTarget: StrypeSyncTarget) => void>, required: true},
        onUnsupportedByStrypeFilePicked: {type: Function as PropType<() => void>, required: true},
    },

    created() {
        // Register the listener of the File Picker's messages
        window.addEventListener("message", this.onPickerMsg);
    },


    data: function () {
        return {
            // Implements CloudDriveComponent
            isFileLocked: false,
            previousCloudFileSharingStatus: CloudFileSharingStatus.UNKNOWN,
            // Specific to OneDrive:
            oauthToken: null as string | null,
            isPersonalAccount: false,
            app: null as PublicClientApplication | null,
            baseUrl: "https://onedrive.live.com/picker", // default value for personal accounts
            pickerPopup: null as WindowProxy | null,
            pickerOptions: null as OneDrivePickConfigurationOptions | null,
            pickerPort: null as MessagePort | null,
            isPickingFile: true, // flag to indicate whether the picker is in file or folder picking mode
            currentFileLastModifiedDate: "",
            currentFileName: "",
            publicShareByStrypeWebLink: "", // We keep the link URL when Strype sets a file for public share so we don't need to query that again
        };
    },

    computed:{
        ...mapStores(useStore),

        siteOrigin(): string {
            return (process.env.NODE_ENV === "production") ? "https://www.strype.org" : "http://localhost:8081";
        },

        redirectURI(): string {
            const redirectServerEditorPath = "" /*IFTRUE_isPython +"editor" FITRUE_isPython*//*IFTRUE_isMicrobit +"microbit" FITRUE_isMicrobit*/;
            return `${this.siteOrigin}/${redirectServerEditorPath}/`;
        },

        // These are specific to the OneDrive component.
        clientId(): string {
            return "ee29b56f-8714-472f-a1c8-37e8551e3ec5";
        },

        msalParamsInit(): Configuration {
            return {
                auth: {
                    authority: "https://login.microsoftonline.com/common",
                    clientId: this.clientId,
                    redirectUri: this.redirectURI,
                },
            };
        },

        msalParamsConsumerPicker(): Configuration {
            return {
                auth: {
                    authority: "https://login.microsoftonline.com/consumers",
                    clientId: this.clientId,
                    redirectUri: this.redirectURI,
                },
            };
        },

        msalParamsWorkPicker(): Configuration {
            return {
                auth: {
                    authority: "https://login.microsoftonline.com/organizations",
                    clientId: this.clientId,
                    redirectUri: this.redirectURI,
                },
            };
        },
    },


    methods: {
        /**
         * Implements CloudDriveComponent
         **/ 
        async signIn(callback: (cloudTarget: StrypeSyncTarget) => void) {
            // We just get a request a token for authenticating the users (we don't use it for something else)         
            this.oauthToken = await this.getToken(OneDriveTokenPurpose.INIT_AUTH).catch((_) => {
                return null;
            });

            if(this.oauthToken){
                (this.$parent as InstanceType<typeof CloudDriveHandlerComponent>).updateSignInStatus(StrypeSyncTarget.od, true);

                // test: check if we can do something more clever to handle the accounts here:
                // If have a work/school account and we are doing the initial authentication, we need to retrieve the baseUrl too.
                if(!this.isPersonalAccount){
                    console.log("requesting Graph query to the drive");
                    const token = await this.getToken(OneDriveTokenPurpose.PICKER_BASE_URL);
                    const resp = await fetch("https://graph.microsoft.com/v1.0/me/drive", {method: "GET", headers: {"Authorization": `Bearer ${token}`,"Accept": "application/json"}});
                    if (!resp.ok) {
                        throw new Error(`Graph API request failed: ${resp.status} ${resp.statusText}`);
                    }

                    const data = await resp.json();
                    this.baseUrl = data.webUrl;
                }
                callback(StrypeSyncTarget.od);                

            }
        },   

        
        resetOAuthToken() {
            this.oauthToken = null;
        },

        isOAuthTokenNotSet(){
            return this.oauthToken == null;
        },

        testCloudConnection(onSuccessCallback: () => void, onFailureCallBack: () => void){
            //TODO
            const xhr = new XMLHttpRequest();
            xhr.open("GET",
                "https://www.googleapis.com/drive/v3/about?fields=user&" +
                "access_token=" + this.oauthToken);
            xhr.onreadystatechange = function (e) {                
                if(xhr.readyState == xhr.DONE) {
                    if(JSON.parse(xhr.response)["user"]){
                        onSuccessCallback();
                    }
                    else if(JSON.parse(xhr.response)["error"]){
                        onFailureCallBack();
                    }
                }
            };
            xhr.send(null);
        },

        getCloudAPIStatusWhenLoadedOrFailed(): Promise<CloudDriveAPIState> {
            // There is no API loading for OneDrive, we can return "Loaded" right away.
            return Promise.resolve(CloudDriveAPIState.LOADED);           
        },

        async getCurrentCloudFileCurrentSharingStatus(saveFileId: string): Promise<CloudFileSharingStatus> {
            // Reset the shared link we might have saved in a previous call
            this.publicShareByStrypeWebLink = "";

            // Get the permissions
            const permission = await this.getCloudFileAnonymousLinkPermission(saveFileId);
           
            // We only look for the permissions containing a link property with scope "anonymous"
            return Promise.resolve((permission) ? CloudFileSharingStatus.PUBLIC_SHARED : CloudFileSharingStatus.INTERNAL_SHARED);
        },

        async restoreCloudDriveFileSharingStatus(saveFileId: string): Promise<void>{
            // We use the same token purpose than sharing the file: in the end, it is still a sharing request...
            // Note that we only remove the first permission we have having an anonymous scope: it is unlikely another
            // permission had been set by the time the user has cancelled the sharing in Strype (or chose internal sharing).
            if(this.previousCloudFileSharingStatus == CloudFileSharingStatus.INTERNAL_SHARED){
                // First we get the permissions to retrieve the right one
                const permission =  await this.getCloudFileAnonymousLinkPermission(saveFileId);
                
                // Then we revoke the permission
                const token = await this.getToken(OneDriveTokenPurpose.GRAPH_SHARE_FILE).catch((_) => {
                    return Promise.reject(_);
                });

                const resp = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${saveFileId}/permissions/${permission?.id}`, {
                    method: "DELETE",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                if(!resp.ok){
                    return Promise.reject(resp.status);
                }
                return Promise.resolve();
            }
            return Promise.resolve();
        },
        
        getPublicSharedProjectContent(sharedFileID: string): Promise<{isSuccess: boolean, encodedURIFileContent: string, errorMsg: string}> {            
            // With OneDrive, it seems we can't generate a permanent raw file link, so we won't get here.
            return Promise.resolve({isSuccess: false, encodedURIFileContent: "", errorMsg: "Not supported."});
        },

        async shareCloudDriveFile(saveFileId: string): Promise<boolean>{
            // If the file was already public shared we don't need to check anything again
            if(this.previousCloudFileSharingStatus == CloudFileSharingStatus.PUBLIC_SHARED){
                return true;
            }
            
            // Otherwise, we set the file shared on OneDrive
            try{
                const token = await this.getToken(OneDriveTokenPurpose.GRAPH_SHARE_FILE).catch((reason) => {
                    return Promise.reject(reason);
                });
                const resp = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${saveFileId}/createLink`,
                    {
                        method: "POST",
                        headers: {"Authorization": `Bearer ${token}`, "Content-Type": "application/json"},
                        body: "{type: 'view', scope:'anonymous'}",
                    });

                if(!resp.ok){
                    return Promise.reject(resp.status+" "+resp.statusText);
                }

                // Save the share link for later so we don't have to query again to fetch it...
                const jsonProps = await resp.json() as Permission;
                this.publicShareByStrypeWebLink = jsonProps.link?.webUrl??"";

                return true;
            } 
            catch(err) {
                return false;
            }
        },

        async getPublicShareLink(saveFileId: string): Promise<{respStatus: number, webLink: string}> {
            // Get the link: if we had a public share link that we got when setting the file publicly shared ourself.
            if(this.publicShareByStrypeWebLink.length > 0){
                return Promise.resolve({respStatus: 200, webLink: this.publicShareByStrypeWebLink});
            }

            // ... otherwise we query it
            const permission = await this.getCloudFileAnonymousLinkPermission(saveFileId);
            return Promise.resolve({respStatus: 200, webLink: permission?.link?.webUrl??""});                        
        },

        getFolderNameFromId(folderId: string): Promise<string> {
            //TODO
            return Promise.resolve("DUMMU_FOLDER_NAME");
        },

        checkIsCloudFileReadonly(id: string, onGettingReadonlyStatus: (isReadonly: boolean) => void){
            //TODO
            onGettingReadonlyStatus(false);
        },

        async pickFolderForSave(){
            // We call the picker again, but only allow folders this time.
            const pickerAccessToken = await this.getToken(OneDriveTokenPurpose.PICKER_OPEN).catch((_) => {
                console.error("Something happened while trying to access OneDrive Picker FOR SAVING.");
                return "";
            });

            if(pickerAccessToken.length == 0){
                return;
            }
            
            // create a new window. The Picker's recommended maximum size is 1080x680, but it can scale down to
            // a minimum size of 250x230 for very small screens or very large zoom.
            this.pickerPopup = window.open("", "Picker", "width=1080,height=680");
            this.isPickingFile = false;
        
            // options: These are the picker configuration, see the schema link for a full explaination of the available options
            this.pickerOptions = {
                sdk: "8.0", 
                authentication:{},
                messaging: {
                    channelId: uniqueId(),
                    origin: this.siteOrigin,
                },
                //TODO : see if the folder default value to start the picker works for work accounts, it doesn't for personal
                entry: {oneDrive: {files: {folder: "Strype",fallbackToRoot: true}}},
                typesAndSources: {mode: "folders", pivots: {oneDrive: true, recent: true}, filters: ["folder"]},
            };
            
            // now we need to construct our query string
            const queryString = new URLSearchParams({
                filePicker: JSON.stringify(this.pickerOptions),
                locale:  this.$i18n.t("localeOneDrive") as string,
            });

            // we create the absolute url by combining the base url, appending the _layouts path, and including the query string
            const url = `${this.baseUrl}?${queryString}`;
            // create a form
            const form = this.pickerPopup?.document.createElement("form");
            if(this.pickerPopup && form){
                // set the action of the form to the url defined above
                // This will include the query string options for the picker.
                form.setAttribute("action", url);

                // must be a post request
                form.setAttribute("method", "POST");

                // Create a hidden input element to send the OAuth token to the Picker.
                // This optional when using a popup window but required when using an iframe.
                const tokenInput = this.pickerPopup.document.createElement("input");
                tokenInput.setAttribute("type", "hidden");
                tokenInput.setAttribute("name", "access_token");
                tokenInput.setAttribute("value", pickerAccessToken);
                form.appendChild(tokenInput);

                // append the form to the body
                this.pickerPopup.document.body.append(form);

                // submit the form, this will load the picker page
                form.submit();
            }    
        },

        async loadPickedFileId(id: string, otherParams: {fileName?: string}, onGettingFileMetadataSucces: (fileNameFromDrive: string, fileModifiedDateTime: string)=>void
            , onGettingFileContentSuccess: (fileContent: string) => void, onGettingFileContentFailure: (errorRespStatus: number) => void){
            // We don't need to query some meta information again against OneDrive because we get them as soon as we pick a file (via the picker).
            // However, we only kept them in this component internal data and now use them.
            // The file content is retrieve via a new query.                  
            
            // We try to retrieve the folder name via the Graph API.
            // Note: we don't need to claim the token again when getting the content, the same token is fine.
            const token = await this.getToken(OneDriveTokenPurpose.GRAPH_GET_FILE_DETAILS);
            const requestURL = `https://graph.microsoft.com/v1.0/drive/items/${id}`;
            let resp = await fetch(requestURL, 
                {method: "GET", headers: {"Authorization": `Bearer ${token}`, "Accept": "application/json"}});
            if (!resp.ok){
                onGettingFileContentFailure(resp.status);
            }
            else{
                const jsonProps = await resp.json() as BaseItem;                
                if(jsonProps.parentReference?.id && jsonProps.parentReference.name){                                    
                    this.appStore.strypeProjectLocation = jsonProps.parentReference.id;
                    this.appStore.strypeProjectLocationAlias = jsonProps.parentReference.name;                    
                }
                // If we opened the file via the picker, we have the meta information,
                // if we opened a shared file (internal share) then we retrieve the meta now
                onGettingFileMetadataSucces((otherParams.fileName) ? this.currentFileName : jsonProps.name??"", (otherParams.fileName) ? this.currentFileLastModifiedDate : jsonProps.lastModifiedDateTime??"");
            }          
            
            // Now get the file content
            const requestContentURL = `https://graph.microsoft.com/v1.0/drive/items/${id}/content`;
            resp = await fetch(requestContentURL, 
                {method: "GET", headers: {"Authorization": `Bearer ${token}`}});
            if (!resp.ok){
                onGettingFileContentFailure(resp.status);
                alert(`Graph API request failed: ${resp.status} ${resp.statusText}`);
            }
            else{
                const fileContent = await resp.text();                
                onGettingFileContentSuccess(fileContent);
            }          
        },
        
        async doLoadFile(openSharedProjectFileId: string): Promise<void> {
            if(this.oauthToken != null){
                // When we load for the very first time, we may not have a Drive location to look for. In that case, we look for a Strype folder existence 
                // (however we do not create it here, we would do this on a save action). If a location is already set, we make sure it still exists. 
                // If it doesn't exist anymore, we set the default location to the Strype folder (if available) or just the Drive itself if not.
                // NOTE: we do not need to check a folder when opening a shared project
                if(openSharedProjectFileId.length == 0){
                    const pickerAccessToken = await this.getToken(OneDriveTokenPurpose.PICKER_OPEN).catch((_) => {
                        return Promise.reject("Something happened while trying to access OneDrive Picker.");
                    });
                    if(pickerAccessToken.length == 0){
                        return Promise.reject();
                    }
                    
                    // create a new window. The Picker's recommended maximum size is 1080x680, but it can scale down to
                    // a minimum size of 250x230 for very small screens or very large zoom.
                    this.pickerPopup = window.open("", "Picker", "width=1080,height=680");
                    this.isPickingFile = true;
                
                    // options: These are the picker configuration, see the schema link for a full explaination of the available options
                    this.pickerOptions = {
                        sdk: "8.0", 
                        authentication:{},
                        messaging: {
                            channelId: uniqueId(),
                            origin: this.siteOrigin,
                        },
                        //TODO : see if the folder selection works for work accounts, it doesn't for personal
                        entry: {oneDrive: {files: {folder: "Strype",fallbackToRoot: true}}},
                        typesAndSources: {mode: "files", pivots: {oneDrive: true, recent: true}, filters: [`.${pythonFileExtension}`,`.${strypeFileExtension}`]},
                    };
                
                    // now we need to construct our query string
                    const queryString = new URLSearchParams({
                        filePicker: JSON.stringify(this.pickerOptions),
                        locale:  this.$i18n.t("localeOneDrive") as string,
                    });

                    // we create the absolute url by combining the base url, appending the _layouts path, and including the query string
                    const url = `${this.baseUrl}?${queryString}`;
                    // create a form
                    const form = this.pickerPopup?.document.createElement("form");
                    if(this.pickerPopup && form){
                        // set the action of the form to the url defined above
                        // This will include the query string options for the picker.
                        form.setAttribute("action", url);

                        // must be a post request
                        form.setAttribute("method", "POST");

                        // Create a hidden input element to send the OAuth token to the Picker.
                        // This optional when using a popup window but required when using an iframe.
                        const tokenInput = this.pickerPopup.document.createElement("input");
                        tokenInput.setAttribute("type", "hidden");
                        tokenInput.setAttribute("name", "access_token");
                        tokenInput.setAttribute("value", pickerAccessToken);
                        form.appendChild(tokenInput);

                        // append the form to the body
                        this.pickerPopup.document.body.append(form);

                        // submit the form, this will load the picker page
                        form.submit();
                    }
                    return Promise.resolve();
                }
                else{
                    // Opening a shared file (internally shared)
                    return this.onFileToLoadPicked(StrypeSyncTarget.od, openSharedProjectFileId);
                }
            }
            else{
                // Nothing to do..
                return Promise.resolve();
            }
        },

        async doSaveFile(saveFileId: string|undefined, projetLocation: string, fullFileName: string, fileContent: string, isExplictSave: boolean, onSuccess: (savedFileId: string) => void, onFailure: (errRespStatus: number) => void){                 
            // We use the Graph API to retrieve an upload session URL upon which we can save the file content (either creating a new file or changing an existing file).
            // It doesn't seem possible to give OneDrive a thumbnail for our files nor actually setting the MIME type (so it it prevails over the extension of the file).
            const token = await this.getToken(OneDriveTokenPurpose.GRAPH_SAVE_FILE).catch((_) => onFailure(404));
            const requestUrl = (saveFileId)
                ? `https://graph.microsoft.com/v1.0/me/drive/items/${saveFileId}/createUploadSession`
                : `https://graph.microsoft.com/v1.0/me/drive/items/${projetLocation}:/${encodeURI(fullFileName)}:/createUploadSession`;

            const resp = await fetch(requestUrl, 
                {method: "POST", headers: {"Authorization": `Bearer ${token}`,"Content-Type": "application/json"}});

            if (!resp.ok){
                onFailure(resp.status);
            }
            else{
                const data = await resp.json() as UploadSession;
                const uploadSessionURL = data.uploadUrl;
                // We upload chunks of 5 MB
                const rawFileContent = new TextEncoder().encode(fileContent);
                const CHUNK_SIZE = 5*1024*1024;
                for (let offset = 0; offset < rawFileContent.length; offset += CHUNK_SIZE) {
                    const chunk = rawFileContent.subarray(offset, offset + CHUNK_SIZE);
                    const resp = await fetch(uploadSessionURL as string, {
                        method: "PUT", 
                        headers: {"Content-Length": chunk.length.toString(), "Content-Range": `bytes ${offset}-${offset + chunk.length - 1}/${rawFileContent.length}`, "Content-Type": "text/x-python"},
                        body: chunk,
                    });
                    const jsonProps = await resp.json();
                    // On the last chunk, Graph should return the meta data about the created file, so we can get the ID from there.
                    if(jsonProps.parentReference){
                        onSuccess((jsonProps as BaseItem).id??"");
                    }
                }                
            }          
        },

        async checkDriveStrypeOrOtherFolder(createIfNone: boolean, checkStrypeFolder: boolean, checkFolderDoneCallBack: (strypeFolderId: string | null) => Promise<void>, failedConnectionCallBack?: () => Promise<void>): Promise<void> {
            // Check if the Strype folder (when checkStrypeFolder is true) or the state's folder (otherwise) exists on the Drive. If not, we create it if createIfNone is set to true.
            // Returns the file ID or null if the file couldn't be found/created.
            // Note that we need to specify the parent folder of the search (root folder) otherwise we would also get subfolders; and don't get trashed folders 
            // (that will also discard shared folders, so we don't need to check the writing rights...)
            if(!this.oauthToken){
                // If the user hasn't yet authenticated with our intial authentication step, then we trigger an authentication first.
                if(failedConnectionCallBack){
                    failedConnectionCallBack();
                }
                return;
            }
            const token = await this.getToken(OneDriveTokenPurpose.GRAPH_CHECK_FOLDER);
            const locationPathToSearch = (checkStrypeFolder) ? "/root:/Strype" : "/items/"+this.appStore.strypeProjectLocation?.toString();
            const resp = await fetch("https://graph.microsoft.com/v1.0/me/drive/" + locationPathToSearch,
                {method: "GET", headers: {"Authorization": `Bearer ${token}`,"Accept": "application/json"}});
            if (resp.ok) {
                const data = await resp.json() as BaseItem;
                return checkFolderDoneCallBack(data.id??"");
            }
            else if(resp.status == 404 && checkStrypeFolder && createIfNone){
                // The Strype folder doesn't exist: we create it if requested (we would not create another folder but Strype)
                const token = await this.getToken(OneDriveTokenPurpose.GRAPH_CREATE_FOLDER);
                const resp = await fetch("https://graph.microsoft.com/v1.0/me/drive/root/children",
                    {
                        method: "POST",
                        headers: {"Authorization": `Bearer ${token}`,"Content-Type": "application/json"},
                        body: "{name: 'Strype', 'folder':{}}",
                    });
                if (resp.ok) {
                    const data = await resp.json() as BaseItem;
                    return checkFolderDoneCallBack(data.id??"");
                }
            }
        },

        lookForAvailableProjectFileName(fileLocation: string|undefined, fileName: string, onFileAlreadyExists: (existingFileId: string) => void, onSuccessCallback: VoidFunction, onFailureCallBack: VoidFunction){
            // We check if the currently suggested file name is not already used in the location we save the file.
            this.searchCloudDriveElements("", ((fileLocation) ? fileLocation : ""), true, {})
                .then((filesArray) => {
                    let hasAlreadyFile = false, existingFileId = "";
                    this.isFileLocked = false;                    
                    filesArray.forEach((file) => {
                        const listingThisFile = (file.name == (fileName + "." + strypeFileExtension));
                        hasAlreadyFile ||= listingThisFile;
                        if(listingThisFile){
                            existingFileId = file.id;
                        }
                    });

                    if(hasAlreadyFile){
                        onFileAlreadyExists(existingFileId);
                        return;                    
                    }
                    // Keep on with the flow of actions if everything went smooth so far
                    onSuccessCallback();
                },(_) => {
                    // We shouldn't have an issue at this stage, but if it happens, we just attempt to connect again
                    onFailureCallBack();
                });
        },

        checkIsFileLocked(existingFileId: string, onSuccess: VoidFunction, onFailure: VoidFunction) {
            //TODO: is there an equivalent in OneDrive? If not, just return as never locked...
            // // Following the addition of a locking file settings in Drive (Sept 2023) we need to check if a file is locked when we want to save.
            // This method retrieves this property for a given file by its file ID.
            // It is the responsablity of the caller of that method to provide a valid file ID and have passed authentication.
            // However, we still handle potential API access issues in this method, hence this methods expects the methods to run in case of success or failure
            this.isFileLocked = false;
            // Pass on the property value to the success case call back method.
            onSuccess();
        },

        async searchCloudDriveElements(elementName: string, elementLocationId: string, searchAllSPYFiles: boolean, searchOptions: Record<string, string>): Promise<CloudDriveFile[]>{
            //TODO
            // Make a search query on OneDrive, with the provided query parameter.
            // Returns the elements found in the Drive listed by the HTTPRequest object obtained with the Graph API.
            // Note: we do not use the "search()" tool because it retrieves all entries AT ROOT LEVEL - instead we use "children"
            // and manually filter out results here.
     
            const token = await this.getToken(OneDriveTokenPurpose.GRAPH_SEARCH).catch((_) => {
                return Promise.reject([]);
            });
            const requestURL = `https://graph.microsoft.com/v1.0/me/drive/items/${elementLocationId}/children`;
            const resp = await fetch(requestURL,
                {method: "GET", headers: {"Authorization": `Bearer ${token}`,"Accept": "application/json"}});
            if (!resp.ok) {
                throw new Error(`Graph API request failed: ${resp.status} ${resp.statusText}`);
            }

            const data = await resp.json();
            if(searchAllSPYFiles){
                // We just make sure all the results are SPY files...
                return Promise.resolve(data.value.filter((entry: BaseItem) => (entry.name??"").endsWith("."+strypeFileExtension))
                    .map((strypeFileItem: BaseItem) => ({name: strypeFileItem.name, id: strypeFileItem.id} as CloudDriveFile)));
            }
            else{
                alert("//TODO");
            }
            return Promise.resolve([]);
        },

        readFileContentForIO(fileId: string, isBinaryMode: boolean, filePath: string): Promise<string | Uint8Array | {success: boolean, errorMsg: string}> {
            //TODO
            // This method is used by FileIO to get a file string content.
            // It relies on the file Id passed as argument, and the callback method for handling succes or failure is also passed as arguments.
            // The argument "filePath" is only used for error message.
            // The nature of the answer depends on the reading mode: a string in normal text case, an array of bytes in binary mode.
            return Promise.resolve("dummy text content");
        },

        writeFileContentForIO(fileContent: string|Uint8Array, fileInfos: {filePath: string, fileName?: string, fileId?: string, folderId?: string}): Promise<string> {
            //TODO
            return Promise.resolve("a dummy file ID");
        },

        /**
         * Specific to OneDrive
         **/ 
        async getToken(purpose: OneDriveTokenPurpose): Promise<string> {
            console.log("requesting token for purpose = " + OneDriveTokenPurpose[purpose]);
            this.app = new PublicClientApplication((purpose == OneDriveTokenPurpose.INIT_AUTH) 
                ? this.msalParamsInit 
                : ((this.isPersonalAccount) ? this.msalParamsConsumerPicker : this.msalParamsWorkPicker));
           
            // Next line mentioned by AI and is crucial
            await this.app.initialize();

            let accessToken = ""; let account = null as null | AccountInfo;
            // Logic for the scopes:
            // if we are only authenticating, we get to access the account details personal+work/school(?) accounts --> "openid".
            // if we are getting a token for the picker: personal --> "OneDrive.ReadWrite"
            // if we are getting a token for the picker base url: work --> "Files.Read"? (no need for personal)
            // if we are getting a token for retrieving the file details, doing a search or checking folders: personal --> "Files.Read"+"offline_access"+"User.Read"
            // if we are getting a token for creating a folder or saving the file: personal --> Files.ReadWrite
            // if we are getting a token for checking the sharing status of a file: personal --> Files.Read
            // if we are getting a token for sharing the file: personal --> Files.ReadWrite
            let scopes = [];
            switch(purpose){
            case OneDriveTokenPurpose.INIT_AUTH:
                scopes.push("openid");
                break;
            case OneDriveTokenPurpose.PICKER_BASE_URL:
            case OneDriveTokenPurpose.GRAPH_GET_FILE_DETAILS:
            case OneDriveTokenPurpose.GRAPH_CHECK_FOLDER:
            case OneDriveTokenPurpose.GRAPH_SEARCH:
                scopes.push(...["Files.Read", "offline_access", "User.Read"]);
                break;
            case OneDriveTokenPurpose.GRAPH_CHECK_SHARING:
                scopes.push("Files.Read");
                break;
            case OneDriveTokenPurpose.PICKER_OPEN:
            case OneDriveTokenPurpose.PICKER_ACTIVITY:            
                scopes.push((this.isPersonalAccount) ? "OneDrive.ReadWrite" :"??");
                break;
            case OneDriveTokenPurpose.GRAPH_CREATE_FOLDER:
            case OneDriveTokenPurpose.GRAPH_SAVE_FILE:
            case OneDriveTokenPurpose.GRAPH_SHARE_FILE:
                scopes.push("Files.ReadWrite");
                break;
            default:
                break;
            }
            const authParams = {scopes: scopes};     
            console.log("requesting tokens for:");
            console.log(authParams); 

            if(purpose == OneDriveTokenPurpose.INIT_AUTH ){
                // NOTE: there is a very tricky behaviour with MSAL: it seems that Azure will try its best to keep users
                // logged in, for example with SSO. We request a login, but if the user has used MFA with email to log in
                // before, next time the popup will show a prompt to give that email address again to very that same account.
                // The only way to change user is to click on "use your password" and then the user can use another account. 
                const resp = await this.app.loginPopup((purpose != OneDriveTokenPurpose.INIT_AUTH) ? authParams : {...authParams, prompt: "login"});
                this.app.setActiveAccount(resp.account);
                account = resp.account;

                if (resp.idToken) {
                    const resp2 = await this.app.acquireTokenSilent(authParams);
                    accessToken = resp2.accessToken;
                }
                // If we got the token we can we look up the type of account.
                if(accessToken && account){
                    // According to copilot we can tesk this like that (partly, sustainable?)
                    this.isPersonalAccount = (account.idTokenClaims?.tid === "9188040d-6c67-4c5b-b112-36a304b66dad");                    
                }                
            }
            else{
                try {
                    // see if we have already the idtoken saved
                    const resp = await this.app.acquireTokenSilent(authParams);
                    accessToken = resp.accessToken;
                    account = resp.account;
                }
                catch (e) {
                    // Per examples we fall back to popup
                    
                    // We specifically request to provide credentials for the account again in the prompt property 
                    // to make MSAL doesn't use a saved account profile automatically.
                    const resp = await this.app.loginPopup(authParams);
                    this.app.setActiveAccount(resp.account);
                    account = resp.account;

                    if (resp.idToken) {
                        const resp2 = await this.app.acquireTokenSilent(authParams);
                        accessToken = resp2.accessToken;
                    }
                    else {
                        // throw the error that brought us here
                        throw e;
                    }
                }
            }       
            console.log(">>>> got a token");
            return accessToken;
        },

        async onPickerMsg(event: MessageEvent){
            // we validate the message is for us, win here is the same variable as above
            if (event.source && event.source === this.pickerPopup) {
                const message = event.data;
                // the channelId is part of the configuration options, but we could have multiple pickers so that is supported via channels
                // On initial load and if it ever refreshes in its window, the Picker will send an 'initialize' message.
                // Communication with the picker should subsequently take place using a `MessageChannel`.
                if (message.channelId === this.pickerOptions?.messaging.channelId) {
                    //TODO : check that channel still applies for later messages
                    switch(message.type){
                    case "initialize":
                        // grab the port from the event
                        this.pickerPort = event.ports[0];
                        // add an event listener to the port (example implementation is in the next section)
                        this.pickerPort.addEventListener("message", this.onPickerMsgChannelMsg);
                        // start ("open") the port
                        this.pickerPort.start();
                        // tell the picker to activate
                        this.pickerPort.postMessage({
                            type: "activate",
                        });
                        break;
                    default:
                        console.log("unknown message type from OneDrive Picker: "+message.type);
                        break;
                    }
                }
            }
        },    

        async onPickerMsgChannelMsg(message: MessageEvent) {
            switch (message.data.type) {
            case "notification":
                break;
            case "command":
                this.pickerPort?.postMessage({
                    type: "acknowledge",
                    id: message.data.id,
                });                
                switch (message.data.data.command) {
                case "authenticate":{
                    // We should not need that because we do the authentication in a previous step, but...
                    const token = await this.getToken(OneDriveTokenPurpose.PICKER_ACTIVITY);
                    if (typeof token !== "undefined" && token !== null) {
                        this.pickerPort?.postMessage({
                            type: "result",
                            id: message.data.id,
                            data: {
                                result: "token",
                                token,
                            },
                        });
                    } 
                    else {
                        console.error(`Could not get auth token for command: ${JSON.stringify(message.data.data)}`);
                    }}
                    break;
                case "close":
                    this.pickerPopup?.close();
                    break;
                case "pick":
                {
                    this.pickerPort?.postMessage({
                        type: "result",
                        id: message.data.id,
                        data: {
                            result: "success",
                        },
                    });
                    this.pickerPopup?.close();
                    // Trigger the actual retrieval of the file (if we had selected a file) or get the folder details (if we had selected a folder)
                    const strypeFileItem = message.data.data.items[0] as BaseItem;
                    const fileId = strypeFileItem.id??"";
                    if(this.isPickingFile){
                        this.currentFileName = strypeFileItem.name as string;                    
                        this.currentFileLastModifiedDate = strypeFileItem.lastModifiedDateTime as string;
                        this.onFileToLoadPicked(StrypeSyncTarget.od, fileId, this.currentFileName);
                    }
                    else{
                        this.appStore.strypeProjectLocation = fileId;
                        this.appStore.strypeProjectLocationAlias = strypeFileItem.name as string;
                        this.onFolderToSaveFilePicked(StrypeSyncTarget.od);
                    }
                    break;
                }
                default:
                    console.warn(`Unsupported command: ${JSON.stringify(message.data.data)}`, 2);
                    this.pickerPort?.postMessage({
                        result: "error",
                        error: {
                            code: "unsupportedCommand",
                            message: message.data.data.command,
                        },
                        isExpected: true,
                    });
                    break;
                }
                break;
            }
        },

        async getCloudFileAnonymousLinkPermission(saveFileId: string): Promise<Permission|undefined> {
            // We use Graph to query the file's permissions, which in turn informs us about the sharing status.
            const token = await this.getToken(OneDriveTokenPurpose.GRAPH_CHECK_SHARING).catch((_) => {
                return Promise.reject(_);
            });

            const resp = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${saveFileId}/permissions`, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            });

            if(!resp.ok){
                return Promise.reject(resp.status);
            }

            const jsonProps = await resp.json(); //as Permi
            const permissions = jsonProps.value as Permission[];
            return permissions.find((perm) => perm.link?.scope == "anonymous" && perm.link.type == "view");
        },
    },   
});
</script>

