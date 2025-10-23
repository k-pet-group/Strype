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
    <!-- The modal dialog for picking folders from WS accounts (see pickFolderForSave() -->
    <ModalDlg :dlgId="folderPickerForWSAccountDlgId" showCloseBtn :okCustomTitle="$t('buttonLabel.select')" :okDisabled="disableFolderSelectionForWSAccountSaveModalDlg">
        <CloudDriveItemPicker :mode="folderPickerForWSAccountSettings.pickerMode" v-on:[CustomEventTypes.exposedCloudDrivePickerPickedItem]="onPickedWSAccountFolderForSave" 
            :pathResolutionMode="folderPickerForWSAccountSettings.pathResolutionMode" :initialFolderToSelectPathParts="folderPickerForWSAccountSettings.initialFolderPathPartsToSelect"
            @[CustomEventTypes.requestedCloudDriveItemChildren]="fetchFolderChildrenForCloudDrivePicker" :rawRootData="folderPickerForWSAccountRawData" :emptyText="folderPickerForWSAccountSettings.emptyPickerText" 
            @[CustomEventTypes.requestedCloudDrivePickerRefresh]="pickFolderForSave(true)" />
    </ModalDlg>
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
import { CloudDriveItemPickerFolderPathResolutionMode, CloudDriveItemPickerItem, CloudDriveItemPickerMode, CloudFileSharingStatus, OneDrivePickConfigurationOptions, OneDriveTokenPurpose } from "@/types/cloud-drive-types";
import { uniqueId } from "lodash";
import { pythonFileExtension, strypeFileExtension } from "@/helpers/common";
import { CloudDriveAPIState } from "@/types/cloud-drive-types";
import { CloudDriveFile } from "@/types/cloud-drive-types";
import { BaseItem, DriveItem, Permission, UploadSession } from "@microsoft/microsoft-graph-types";
import CloudDriveHandlerComponent from "@/components/CloudDriveHandler.vue";
import CloudDriveItemPicker from "@/components/CloudDriveItemPicker.vue";
import ModalDlg from "@/components/ModalDlg.vue";
import { BvModalEvent } from "bootstrap-vue";
import { CustomEventTypes } from "@/helpers/editor";

//////////////////////
//     Component    //
//////////////////////
export default Vue.extend({
    name: "OneDriveComponent",

    components: {
        ModalDlg,
        CloudDriveItemPicker,
    },
    
    props: {
        onFileToLoadPicked: {type: Function as PropType<(cloudTarget: StrypeSyncTarget, fileId: string, fileName?: string) => Promise<void>>, required: true},
        onFolderToSaveFilePicked: {type: Function as PropType<(cloudTarget: StrypeSyncTarget) => void>, required: true},
        onFolderToSavePickCancelled: {type: Function as PropType<() => void>, required: true},
        onUnsupportedByStrypeFilePicked: {type: Function as PropType<() => void>, required: true},
    },

    created() {
        // Register the listener of the File Picker's messages
        window.addEventListener("message", this.onPickerMsg);

        // The events from Bootstrap modal are registered to the root app element.
        this.$root.$on("bv::modal::hide", this.onFolderPickerForWSAccountHideModalDlg); 
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
            // Others
            CustomEventTypes, // Just to have access to custom event types in template
            folderPickerForWSAccountRawData: [] as CloudDriveItemPickerItem[],
        };
    },

    computed:{
        ...mapStores(useStore),

        driveName(): string {
            return "OneDrive";
        },

        driveAPIName(): string{
            return "OneDrive File Picker v8 / Graph REST API";
        },

        modifiedDataSearchOptionName(): string {
            return "lastModifiedDateTime";
        },

        fileMoreFieldsForIO(): string {
            // This property isn't making sense for OneDrive, 
            // we only have it for keepint TS happy.
            return "";
        },

        fileBasicFieldsForIO(): string {
            // This property isn't making sense for OneDrive, 
            // we only have it for keepint TS happy.
            return "";
        },

        // These are specific to the OneDrive component.
        siteOrigin(): string {
            return (process.env.NODE_ENV === "production") ? "https://www.strype.org" : "http://localhost:8081";
        },

        redirectURI(): string {
            const redirectServerEditorPath = "" /*IFTRUE_isPython +"editor" FITRUE_isPython*//*IFTRUE_isMicrobit +"microbit" FITRUE_isMicrobit*/;
            return `${this.siteOrigin}/${redirectServerEditorPath}/`;
        },

        clientId(): string {
            // Our client ID (identifying Strype as an app in Microsoft Azure)
            return "a1973135-8146-49d3-b9e2-347ed673d43b";
        },

        consumerTenantIdForPersonalAccounts(): string {
            return "9188040d-6c67-4c5b-b112-36a304b66dad";
        },

        pathRootIndicator(): string{
            return "/root:";
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

        folderPickerForWSAccountDlgId(): string {
            return "folderPickerForWSAccountDlg";
        },

        folderPickerForWSAccountSettings(): {pickerMode: CloudDriveItemPickerMode, pathResolutionMode: CloudDriveItemPickerFolderPathResolutionMode, initialFolderPathPartsToSelect: string[], emptyPickerText: string} {
            return {
                pickerMode: CloudDriveItemPickerMode.FOLDERS,
                pathResolutionMode: CloudDriveItemPickerFolderPathResolutionMode.BY_NAME,
                initialFolderPathPartsToSelect: (this.appStore.strypeProjectLocationPath??"").split("/"),
                emptyPickerText: this.$i18n.t("appMessage.emptyCloudDrivePicker", {drivename: this.driveName }) as string,
            };
        },

        disableFolderSelectionForWSAccountSaveModalDlg(): boolean {
            return this.folderPickerForWSAccountRawData.filter((item) =>  item.isFolder).length == 0;
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
                // If have a work/school account and we are doing the initial authentication, we need to retrieve the baseUrl too.
                if(!this.isPersonalAccount){
                    const token = await this.getToken(OneDriveTokenPurpose.PICKER_BASE_URL).catch((_) => {
                        return null;
                    });
                    if(token) {
                        const resp = await fetch("https://graph.microsoft.com/v1.0/me/drive", {method: "GET", headers: {"Authorization": `Bearer ${token}`,"Accept": "application/json"}});
                        if (!resp.ok) {
                            throw new Error(`Graph API request failed: ${resp.status} ${resp.statusText}`);
                        }

                        const data = await resp.json() as BaseItem;
                        // Based on observation and ChatGPT, the URL returned is not a base URL but something pointing at "Documents".
                        // So, we need to trim it. The usual pattern for WS accounts base URL is 
                        // "https://{tenant}-my.sharepoint.com/personal/{userPrincipalName with "_" replacing "@"}
                        if(data.webUrl){
                            const patternForTrimming = /https:\/\/.+\.sharepoint\.com\/personal\/[^/]+/g;
                            const matchingRes = data.webUrl.match(patternForTrimming);
                            if(matchingRes){
                                this.baseUrl = data.webUrl.substring(0, matchingRes[0].length); 
                            }
                        }
                    }
                    else{
                        return;
                    }
                }
            
                (this.$parent as InstanceType<typeof CloudDriveHandlerComponent>).updateSignInStatus(StrypeSyncTarget.od, true);
                callback(StrypeSyncTarget.od);
            }
        },   

        
        resetOAuthToken() {
            this.oauthToken = null;
        },

        isOAuthTokenNotSet(){
            return this.oauthToken == null;
        },

        async testCloudConnection(onSuccessCallback: () => void, onFailureCallBack: () => void){
            const token = await this.getToken(OneDriveTokenPurpose.GRAPH_CHECK_FOLDER).catch((_) => {
                onFailureCallBack();
                return;
            });

            const resp = await fetch("https://graph.microsoft.com/v1.0/me/drive", {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if(!resp.ok){
                onFailureCallBack();                
            }
            else{
                onSuccessCallback();
            }
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

        async getFolderNameFromId(folderId: string): Promise<{name: string, path?: string}> {
            const token = await this.getToken(OneDriveTokenPurpose.GRAPH_GET_FILE_DETAILS);
            const driveId = folderId.substring(0, folderId.indexOf("!"));
            const requestURL = (driveId) ? `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folderId}` : ("https://graph.microsoft.com/v1.0/drives/me/items/" + folderId);
            const resp = await fetch(requestURL, 
                {method: "GET", headers: {"Authorization": `Bearer ${token}`, "Accept": "application/json"}});
            if (!resp.ok){
                throw Error(resp.status.toString());
            }
            else{
                const jsonProps = await resp.json() as BaseItem;  
                const fullPath = (jsonProps.parentReference?.path) ?? this.pathRootIndicator;
                const parentPath = fullPath.replace(new RegExp(`^.*${this.pathRootIndicator}($|/)`), "");
                return {name: jsonProps.name??"", path: ((parentPath) ? parentPath + "/" : "") + jsonProps.name};
            }
        },

        checkIsCloudFileReadonly(id: string, onGettingReadonlyStatus: (isReadonly: boolean) => void){
            // We don't retrieve read only files in OneDrive
            onGettingReadonlyStatus(false);
        },

        async pickFolderForSave(doNotOpenPickerModalDlg?: boolean){
            // To date with the File Picker API v8, Microsoft doesn't expose the folder selection in the picker
            // (as well as not filtering on folders only) *for WS account*. Until this is sorted we will use our
            // our own basic folder tree widget.
            if(!this.isPersonalAccount){                
                // We get the folders in one go first and to set up the picker (raw folder data and initial location)
                const rootLevelDriveItems = await this.listDriveItemsAtFolder().catch((_) => {
                    // If we could not get the drive content, we just don't do anything.                    
                    return;
                });
                
                const itemsForPicker = this.transformOneDriveItemsToCloudDriveItemPickerItems(rootLevelDriveItems as DriveItem[]);
                this.folderPickerForWSAccountRawData = itemsForPicker;
                if(!doNotOpenPickerModalDlg){              
                    this.$root.$emit("bv::show::modal", this.folderPickerForWSAccountDlgId);
                }
            }
            else{
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
                    // Default opening to "Strype" seems to be ignored in this configuration
                    entry: {oneDrive: {files: {folder: "Strype", fallbackToRoot: true}}},
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
            }
                
        },

        async onPickedWSAccountFolderForSave(pickedItem: CloudDriveItemPickerItem | null){
            // We received the folder picked by the user in the generic Cloud Drive picker to save at a location.
            // We need to just a few more things before contuining the normal saving workflow (i.e. with personal accounts):
            // We need a BaseItem object to pass it to onPickedFolderForSave(), the shared method for both account types, 
            // so we query Graph to get more details about the file.
            if(pickedItem){
                const token = await this.getToken(OneDriveTokenPurpose.GRAPH_GET_FILE_DETAILS);
                // The drive ID is part of the file ID so we can easily extract it...
                const driveId = pickedItem.id.substring(0, pickedItem.id.indexOf("!"));
                const requestURL = (driveId) ? `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${pickedItem.id}` : ("https://graph.microsoft.com/v1.0/drives/me/items/"+pickedItem.id);
                let resp = await fetch(requestURL, 
                    {method: "GET", headers: {"Authorization": `Bearer ${token}`, "Accept": "application/json"}});
                if (resp.ok){
                    const jsonProps = await resp.json() as BaseItem;  
                    if(jsonProps.parentReference?.id && jsonProps.parentReference.name && jsonProps.parentReference.path){                                    
                        this.onPickedFolderForSave(jsonProps);
                    }
                }     
            }      
        },

        onPickedFolderForSave(pickedFolderItem: BaseItem) {
            this.appStore.strypeProjectLocation = pickedFolderItem.id;
            this.appStore.strypeProjectLocationAlias = pickedFolderItem.name as string;    
            const fullPath = pickedFolderItem.parentReference?.path??this.pathRootIndicator; 
            const parentPath = fullPath.replace(new RegExp(`^.*${this.pathRootIndicator}($|/)`), "");               
            this.appStore.strypeProjectLocationPath = ((parentPath) ? parentPath + "/" : "") + (pickedFolderItem.name as string);
            this.onFolderToSaveFilePicked(StrypeSyncTarget.od);
        },

        onFolderPickerForWSAccountHideModalDlg(event: BvModalEvent, dlgId: string ){
            if(dlgId == this.folderPickerForWSAccountDlgId){
                if(event.trigger == "ok"){
                    // Trigger the selection's validation
                    document.dispatchEvent(new CustomEvent(CustomEventTypes.requestedCloudDrivePickerPickedItem));
                }
                else{
                    this.onFolderToSavePickCancelled();
                }
            }
        },

        async loadPickedFileId(id: string, otherParams: {fileName?: string}, onGettingFileMetadataSucces: (fileNameFromDrive: string, fileModifiedDateTime: string)=>void
            , onGettingFileContentSuccess: (fileContent: string) => void, onGettingFileContentFailure: (errorRespStatus: number) => void){
            // We don't need to query some meta information again against OneDrive because we get them as soon as we pick a file (via the picker).
            // However, we only kept them in this component internal data and now use them.
            // The file content is retrieve via a new query.                  
            
            // We try to retrieve the folder name via the Graph API against an endpoint that INCLUDES the drive ID,
            // which allows us to also open internally shared files rather that just files from own Drive.
            // Note: we don't need to claim the token again when getting the content, the same token is fine.
            const token = await this.getToken(OneDriveTokenPurpose.GRAPH_GET_FILE_DETAILS);
            // The drive ID is part of the file ID so we can easily extract it...
            const driveId = id.substring(0, id.indexOf("!"));
            const requestURL = (driveId) ? `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${id}` : ("https://graph.microsoft.com/v1.0/drives/me/items/"+id);
            let resp = await fetch(requestURL, 
                {method: "GET", headers: {"Authorization": `Bearer ${token}`, "Accept": "application/json"}});
            if (!resp.ok){
                onGettingFileContentFailure(resp.status);
                return;
            }
            else{
                const jsonProps = await resp.json() as BaseItem;  
                if(jsonProps.parentReference?.id && jsonProps.parentReference.name && jsonProps.parentReference.path){                                    
                    this.appStore.strypeProjectLocation = jsonProps.parentReference.id;
                    this.appStore.strypeProjectLocationAlias = jsonProps.parentReference.name; 
                    this.appStore.strypeProjectLocationPath = jsonProps.parentReference.path.replace(new RegExp(`^.*${this.pathRootIndicator}($|/)`), "");
                }
                // If we opened the file via the picker, we have the meta information,
                // if we opened a shared file (internal share) then we retrieve the meta now
                onGettingFileMetadataSucces((otherParams.fileName) ? this.currentFileName : jsonProps.name??"", (otherParams.fileName) ? this.currentFileLastModifiedDate : jsonProps.lastModifiedDateTime??"");
            }          
            
            // Now get the file content
            resp = await fetch(requestURL + "/content", 
                {method: "GET", headers: {"Authorization": `Bearer ${token}`}});
            if (!resp.ok){
                onGettingFileContentFailure(resp.status);
            }
            else{
                const fileContent = await resp.text();                
                onGettingFileContentSuccess(fileContent);
            }          
        },
        
        openFilePicker(): Promise<void> {
            // Launch the file picker for this cloud drive (this would be called after we made sure the connection to OneDrive is (still) valid)
            return this.getToken(OneDriveTokenPurpose.PICKER_OPEN)
                .then((pickerAccessToken) => {
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
                        // The entry folder is only used by WS accounts
                        entry: {oneDrive: {files: {folder: this.appStore.strypeProjectLocationPath, fallbackToRoot: true}}},
                        typesAndSources: {mode: "files", pivots: {oneDrive: true, recent: true}, filters: [`.${pythonFileExtension}`,`.${strypeFileExtension}`]},
                    };
                
                    // now we need to construct our query string
                    const queryString = new URLSearchParams({
                        filePicker: JSON.stringify(this.pickerOptions),
                        locale:  this.$i18n.t("localeOneDrive") as string,
                    });

                    // We create the absolute url by combining the base url, appending the _layouts path, and including the query string
                    // (the layout path is only required for the WS accounts).
                    const layoutPath = (this.isPersonalAccount) ? "" : "/_layouts/15/FilePicker.aspx";
                    const url = `${this.baseUrl + layoutPath}?${queryString}`;
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
                })
                .catch((_) => {
                    return Promise.reject("Something happened while trying to access OneDrive Picker for loading.");
                });                                        
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
            else{
                // Any other error, we return null.
                return checkFolderDoneCallBack(null);
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
            // OneDrive doesn't not seem to have a similar "lock" mechanism than Google Drive, so we ignore that.
            this.isFileLocked = false;
            // Pass on the property value to the success case call back method.
            onSuccess();
        },

        async searchCloudDriveElements(elementName: string, elementLocationId: string, searchAllSPYFiles: boolean, searchOptions: Record<string, string>): Promise<CloudDriveFile[]>{
            // Make a search query on OneDrive, with the provided query parameter.
            // Returns the elements found in the Drive listed by the HTTPRequest object obtained with the Graph API.
            // Note: we do not use the "search()" tool because it retrieves all entries recursively where called 
            // - instead we use "children" and manually filter out results here.     
            // Also, we don't need to order files by date: we use that for finding duplicates on a Cloud for FileIO:
            // OneDrive doesn't allow duplicated names in a same location.
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
                // We have requested on single element, we just get it from the results.
                return Promise.resolve(data.value.filter((entry: BaseItem) => (entry.name??"") == elementName)
                    .map((strypeFileItem: BaseItem) => ({name: strypeFileItem.name, id: strypeFileItem.id} as CloudDriveFile)));
            }
        },

        async readFileContentForIO(fileId: string, isBinaryMode: boolean, filePath: string): Promise<string | Uint8Array | {success: boolean, errorMsg: string}> {
            // This method is used by FileIO to get a file string content.
            // It relies on the file Id passed as argument, and the callback method for handling succes or failure is also passed as arguments.
            // The argument "filePath" is only used for error message.
            // The nature of the answer depends on the reading mode: a string in normal text case, an array of bytes in binary mode.
            const token = await this.getToken(OneDriveTokenPurpose.GRAPH_GET_FILE_DETAILS);
            // The drive ID is part of the file ID so we can easily extract it...
            const driveId = fileId.substring(0, fileId.indexOf("!"));
            const requestURL = (driveId) ? `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${fileId}` : ("https://graph.microsoft.com/v1.0/drives/me/items/" + fileId);
            try{
                const resp = await fetch(requestURL + "/content", 
                    {method: "GET", headers: {"Authorization": `Bearer ${token}`}});
                if (!resp.ok){
                    return Promise.reject(resp.status);
                }
                else{
                    return (isBinaryMode) 
                        ? resp.arrayBuffer().then((buffer) => {
                            return new Uint8Array(buffer);
                        }) 
                        : resp.text().then((text) => {
                            return text;
                        });
                } 
            }
            catch(err){
                return Promise.reject(((typeof err == "string") ? err : (err as Error).message)??"unknown"); 
            }
            
        },

        async writeFileContentForIO(fileContent: string|Uint8Array, fileInfos: {filePath: string, fileName?: string, fileId?: string, folderId?: string}): Promise<string> {
            let catchErr = null;
            const token = await this.getToken(OneDriveTokenPurpose.GRAPH_SAVE_FILE).catch((_) => {
                catchErr = _;
                return null;
            });

            if(token == null){
                return Promise.reject(catchErr);
            }

            const isCreatingFile = !!(fileInfos.folderId);
            const isFileContentEmpty = fileContent.length == 0;
            const requestUrl = (isCreatingFile)
                ? `https://graph.microsoft.com/v1.0/me/drive/items/${fileInfos.folderId}:/${encodeURI(fileInfos.fileName??"")}:/content` //the file name and the containing folder must be set by the caller!
                : ((isFileContentEmpty) 
                    ? `https://graph.microsoft.com/v1.0/me/drive/items/${fileInfos.fileId}/content` // but it may happen the content is empty, in that case we cannot use resumable upload
                    : `https://graph.microsoft.com/v1.0/me/drive/items/${fileInfos.fileId}/createUploadSession`); // the most common case when we write in the file: the content is not empty, we can use resumable upload

            const baseHeadersContent = {"Authorization": `Bearer ${token}`};
            const resp = await fetch(requestUrl, 
                {method: (isFileContentEmpty) ? "PUT" :"POST", headers: (isFileContentEmpty) ? {...baseHeadersContent, "Content-Type": "application/octet-stream", "Content-Length": "0"} : baseHeadersContent});

            if (!resp.ok){
                return Promise.reject(resp.status);
            }
            else if(isFileContentEmpty){
                // Normal resopnse if the file doesn't exist and we have created it
                const jsonProps = await resp.json() as BaseItem;
                return Promise.resolve(jsonProps.id??"");
            }
            else{
                // Resumable upload if the file exists
                const data = await resp.json() as UploadSession;
                const uploadSessionURL = data.uploadUrl;
                // We upload chunks of 5 MB
                const rawFileContent = (typeof fileContent == "string") ? new TextEncoder().encode(fileContent) : fileContent;
                const CHUNK_SIZE = 5*1024*1024;
                // Need to also consider we may write a 0-length file when created the file!
                for (let offset = 0; (offset == 0 && rawFileContent.length == 0) || offset < rawFileContent.length; offset += CHUNK_SIZE) {
                    const chunk = rawFileContent.subarray(offset, offset + CHUNK_SIZE);
                    const resp = await fetch(uploadSessionURL as string, {
                        method: "PUT", 
                        headers: {"Content-Length": chunk.length.toString(), "Content-Range": `bytes ${offset}-${offset + chunk.length - 1}/${rawFileContent.length}`},
                        body: chunk,
                    });
                    const jsonProps = await resp.json() as BaseItem;
                    // On the last chunk, Graph should return the meta data about the created file, so we can get the ID from there.
                    if(jsonProps.id){
                        return Promise.resolve(jsonProps.id);
                    }                    
                }                
            } 
            
            // If we haven't been able to return the ID properly then we are in an error state:
            return Promise.reject("Could not retrieve the file ID when saving file in OneDrive with FileIO.");
        },

        checkIsCloudDriveFileReadonly(_: CloudDriveFile): boolean {
            // Used by FileIO to get the readonly status of a file, OneDrive does not have the same permissions we can find in Google Drive, so we return false
            return false;
        },

        /**
         * Specific to OneDrive
         **/ 
        async getToken(purpose: OneDriveTokenPurpose): Promise<string> {
            this.app = new PublicClientApplication((purpose == OneDriveTokenPurpose.INIT_AUTH) 
                ? this.msalParamsInit 
                : ((this.isPersonalAccount) ? this.msalParamsConsumerPicker : this.msalParamsWorkPicker));
           
            // Next line mentioned by AI and is crucial
            await this.app.initialize();

            let accessToken = ""; let account = null as null | AccountInfo;
            // Logic for the scopes:
            // if we are only authenticating, we get to access the account details personal+work/school (WS) accounts --> "openid".
            // if we are getting a token for using the picker: personal --> "OneDrive.ReadWrite", WS --> default scope for SharePoint
            // if we are getting a token for the picker base url: WS --> "Files.Read"
            // if we are getting a token for retrieving the file details, doing a search or checking folders: personal+WS --> "Files.Read"+"offline_access"+"User.Read"
            // if we are getting a token for creating a folder or saving the file: personal+WS --> Files.ReadWrite
            // if we are getting a token for checking the sharing status of a file: personal+WS --> Files.Read
            // if we are getting a token for sharing the file: personal+WS --> Files.ReadWrite
            const sharePointDefaultScope = (this.isPersonalAccount) ? "" : this.baseUrl.replace(/\/personal\/.*/,"") + "/.default";
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
                scopes.push((this.isPersonalAccount) ? "OneDrive.ReadWrite" : sharePointDefaultScope);
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
                    // According to copilot we can test if the acccount is a personal account if it uses the "consumer" tenant ID
                    this.isPersonalAccount = (account.idTokenClaims?.tid === this.consumerTenantIdForPersonalAccounts);                    
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
                        console.error("unknown message type from OneDrive Picker: "+message.type);
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
                        // We should never end up with the wrong type of file, since the Picker is already configured to filter files.
                        // But since we have already a mechanism in place for that situation, let's double check just for safety...
                        if(!strypeFileItem.name?.endsWith("."+strypeFileExtension) && !strypeFileItem.name?.endsWith("."+pythonFileExtension)){
                            this.onUnsupportedByStrypeFilePicked();
                            break;
                        }
                        this.currentFileName = strypeFileItem.name as string;                    
                        this.currentFileLastModifiedDate = strypeFileItem.lastModifiedDateTime as string;
                        this.onFileToLoadPicked(StrypeSyncTarget.od, fileId, this.currentFileName);
                    }
                    else{
                        this.onPickedFolderForSave(strypeFileItem);                        
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

        isDriveItemAFolder(driveItem: DriveItem): boolean {
            // An item is a folder when it has a folder property AND it doesn't expose a property "remoteItem" nor a property "file" (otherwise we also get shortcuts).
            // AND also isn't a OneNote package (this is deducted from observing the results in testing...)
            return !driveItem.file && !!driveItem.folder && !driveItem.remoteItem && driveItem.package?.type != "oneNote";
        },

        transformOneDriveItemsToCloudDriveItemPickerItems(driveItems: DriveItem[]): CloudDriveItemPickerItem[] {
            // The transformation is pretty straight forward. We only need to be careful about:
            // - not setting a parent ID to to root elements,
            // - detecting when an item is a folder (see function above)
            return driveItems.map((item) => ({id: item.id, name: item.name, isFolder:  this.isDriveItemAFolder(item), parentId: ((item.parentReference?.path??"/drive/root:")=="/drive/root:") ? "" : item.parentReference?.id} as CloudDriveItemPickerItem));
        },

        async fetchFolderChildrenForCloudDrivePicker(folderId: string) { 
            const childrenItems = await this.listDriveItemsAtFolder(folderId);
            document.dispatchEvent(new CustomEvent(CustomEventTypes.exposedCloudDriveItemChidren, {detail: this.transformOneDriveItemsToCloudDriveItemPickerItems(childrenItems)}));
        },

        async listDriveItemsAtFolder(folderId?: string): Promise<DriveItem[]>{
            // This methods lists the content of the Drive at the given (folder) location.
            // If the folderId isn't provided, then we look for items at the Drive's root.
            const token = await this.getToken(OneDriveTokenPurpose.GRAPH_SEARCH);
            const requestURL = (folderId) ? `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children` :  "https://graph.microsoft.com/v1.0/me/drive/root/children";
            const resp = await fetch(requestURL, 
                {method: "GET", headers: {"Authorization": `Bearer ${token}`, "Accept": "application/json"}});
            if (!resp.ok){
                // If we could not get the drive content, we throw an error for the caller to handle that
                throw new Error(resp.status.toString());
            }
            else{
                const jsonProps = await resp.json(); 
                if(jsonProps && jsonProps.value){
                    return jsonProps.value as DriveItem[];
                }
                else {
                    // We shouldn't be in this situation but let's keep TS happy and make sure we return something if we don't get the expected data
                    return [];
                }
            }                
        },
    },   
});
</script>
