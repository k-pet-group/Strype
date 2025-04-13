<template>
    <div>
        <GoogleDriveFilePicker :ref="googleDriveFilePickerComponentId" @picked-file="loadPickedFileId" @picked-folder="savePickedFolder" @nonStrypeFilePicked="onNonStrypeFilePicked" dev-key="AIzaSyDKjPl4foVEM8iCMTkgu_FpedJ604vbm6E" :oauth-token="oauthToken"/>
        <SimpleMsgModalDlg :dlgId="loginErrorModalDlgId" :hideActionListener="signIn"/>
        <SimpleMsgModalDlg :dlgId="nonStrypeFilePickedModalDlgId" :hideActionListener="loadFile" />
        <ModalDlg :dlgId="saveExistingGDProjectModalDlgId" :size="saveExistingFileDlgSize" :elementToFocusId="(isFileLocked) ? saveExistingFileCopyButtonId : saveExistingFileOverwriteButtonId">
            <span style="white-space:pre-wrap">{{$t((isFileLocked)?'appMessage.gdriveLockedFileAlreadyExists':'appMessage.gdriveFileAlreadyExists')}}</span>
            <!-- in order to allow 3 (customed) buttons, we use the slot "modal-footer" made available by Boostrap for the modal; to simply things, we handle both locked/unlocked files there -->
            <template #modal-footer-content="{ok, cancel}">
                <b-button variant="secondary" @click="onSaveGDExistingFileAction(Actions.cancel);cancel()">{{$t('buttonLabel.cancel')}}</b-button>
                <b-button :id="saveExistingFileCopyButtonId" variant="primary" @click="onSaveGDExistingFileAction(Actions.copy);ok()">{{$t('buttonLabel.saveProjectCopy')}}</b-button>
                <b-button :id="saveExistingFileOverwriteButtonId" v-if="!isFileLocked" variant="primary" @click="onSaveGDExistingFileAction(Actions.overwrite);ok()">{{$t('buttonLabel.overwriteProject')}}</b-button>
            </template>
        </ModalDlg>
    </div>
</template>

<script lang="ts">
import GoogleDriveFilePicker from "@/components/GoogleDriveFilePicker.vue";
import ModalDlg from "@/components/ModalDlg.vue";
import SimpleMsgModalDlg from "@/components/SimpleMsgModalDlg.vue";
import { strypeFileExtension } from "@/helpers/common";
import { CustomEventTypes, getAppSimpleMsgDlgId, getSaveAsProjectModalDlg } from "@/helpers/editor";
import i18n from "@/i18n";
import { useStore } from "@/store/store";
import { BootstrapDlgSize, MessageDefinitions, SaveExistingGDProjectInfos, SaveRequestReason, StrypeSyncTarget } from "@/types/types";
import { mapStores } from "pinia";
import Vue from "vue";
import MenuVue from "./Menu.vue";

// This enum is used for flaging the action taken when a request to save a file on Google Drive
// has been done, and a file of the same name already exists on the Drive
enum Actions{
    overwrite,
    copy,
    cancel
}

export default Vue.extend({
    name: "GoogleDrive",
    
    components: {
        GoogleDriveFilePicker,
        SimpleMsgModalDlg,
        ModalDlg,
    },

    data: function(){
        return {
            client: null as google.accounts.oauth2.TokenClient | null, // The Google Identity client
            oauthToken : null as string | null,
            currentAction: null as "load" | "loadAsResync" | "save" | null, // flag the request current action for async workflow;
            saveReason: SaveRequestReason.autosave, // flag the reason of the save action
            saveFileName: "", // The file name, will be set via the Menu when a name is provided for saving, or when loading a project (we need to keep it live for autosave)
            isFileLocked: false, // Flag to notify when a file is locked (used for saving);
            Actions, // this is required to be accessible in the template
            saveExistingGDProjectInfos: {} as SaveExistingGDProjectInfos,
        };
    },

    computed: {
        ...mapStores(useStore),    
        
        googleDriveScope(): string {
            return "https://www.googleapis.com/auth/drive";
        },

        googleDriveFilePickerComponentId(): string {
            return "googleDriveFilePickerComponent";
        },

        loginErrorModalDlgId(): string {
            return "gdLoginErrorModalDlg";
        },

        nonStrypeFilePickedModalDlgId(): string {
            return "gdNonStrypeFilePickedModalDlg";
        },

        saveFileId: {
            // This actually uniquely identifies the file to save to:
            get(): undefined|string {
                return this.appStore.currentGoogleDriveSaveFileId;
            },
            set(value: string|undefined){
                this.appStore.currentGoogleDriveSaveFileId = value;
            },
        },
        
        enterFileNameLabel(): string {
            return i18n.t("appMessage.enterFileNameLabel") as string;
        },

        saveExistingGDProjectModalDlgId(): string {
            return "saveExistingGDProjectModalDlg";
        },

        saveExistingFileDlgSize(): BootstrapDlgSize {
            return "lg";
        },

        saveExistingFileCopyButtonId(): string {
            return "saveExistingFileCopyButton";
        },
        
        saveExistingFileOverwriteButtonId(): string {
            return "saveExistingFileOverwriteButton";
        },
    },

    created() {
        // There's two parts to accessing Google Drive: we need to load the Drive API (the GAPI part)
        // but we also need to load Google Identity in order to be able to sign in.

        // From https://stackoverflow.com/a/60257961/412908 and https://stackoverflow.com/a/70772647/412908
        const scripts : { [key: string]: () => void } = {
            "https://accounts.google.com/gsi/client": () => this.onGSILoad(),
            "https://apis.google.com/js/api.js" : () => this.onGAPILoad(),
        };
        // Can't believe this is how we have to load external scripts in Vue, but that's what the Internet says:
        Object.keys(scripts).forEach((url) => {
            let tag = document.createElement("script");
            tag.onload = scripts[url];
            tag.src = url;
            tag.defer = true;
            tag.async = true;
            document.head.appendChild(tag);
        });
    },

    methods: {
        // Load up general Google API:
        onGAPILoad() {
            gapi.load("client", this.gapiStart);
        },
        
        // After Google API loaded, initialise client:
        gapiStart() {
            gapi.client.init({
            }).then(function (response) {
                console.log("GAPI loaded");
            }, function (reason) {
                console.log("GAPI Error: " + reason.result.error.message);
            });
        },

        // Load Google Identity services API:
        onGSILoad() {
            this.client = google.accounts.oauth2.initTokenClient({
                client_id: "802295052786-h65netp8r9961pekqnhnt3oapcb9o8ji.apps.googleusercontent.com",
                scope: this.googleDriveScope,
                // Note: this callback is after *sign-in* (happens on button press), NOT on simply loading the client:
                callback: (response: google.accounts.oauth2.TokenResponse) => {
                    // We check the permission is given to the scope required by Strype. If not given, show message.
                    if(!google.accounts.oauth2.hasGrantedAllScopes(response, this.googleDriveScope)) {
                        this.oauthToken = null;
                        this.appStore.simpleModalDlgMsg = this.$i18n.t("errorMessage.gdrivePermissionsNotMet") as string;
                        this.$root.$emit("bv::show::modal", this.loginErrorModalDlgId);
                    }                   
                             
                    if (response && response.error == undefined) {
                        this.oauthToken = response.access_token;
                        this.updateSignInStatus(true);
                    }

                    // In any case, continue the action requested by the user (need to do it in a next tick to make sure the oauthToken is updated in all Vue components)
                    this.$nextTick(() => {
                        if(this.currentAction == "load" || this.currentAction == "loadAsResync"){
                            this.doLoadFile();
                        }
                        else if(this.currentAction == "save"){
                            this.saveFile(this.saveReason);
                        }
                    });
                },
            });
        },

        // Entry point of the signing mechanism:
        signIn() {
            this.client?.requestAccessToken();
        },

        // After signing in or signed out:
        updateSignInStatus(signed: boolean) {
            if(signed){
                this.$root.$emit(CustomEventTypes.addFunctionToEditorAutoSave, {name: "GD", function: (saveReason: SaveRequestReason) => this.saveFile(saveReason)});
            }  
            else{
                // If signing fails, reset to no sync
                this.appStore.syncTarget = StrypeSyncTarget.none; 
                this.$root.$emit(CustomEventTypes.removeFunctionToEditorAutoSave, "GD");
            }            
        },

        // Test the connection is still valid, and allow callbacks for success or failure of the test
        testGoogleDriveConnection(onSuccessCallback: () => void, onFailureCallBack: () => void){
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

        loadFile(loadAsResync?: boolean) {
            this.currentAction = (loadAsResync) ? "loadAsResync" : "load";
            // This method is the entry point to load a file from Google Drive. We check or request to sign-in to Google Drive here.
            // (that is redundant with the previous "save" action if we were already syncing, but this method can be called when we were not syncing so it has to be done.)
            if(this.oauthToken == null){                
                this.signIn();
                // We wait for the signing checks are done, the loading mechanism will continue later in doLoadFile()
            }
            else{
                // We test the connection to make sure it's still valid: if so, we continue with the loading, and if not we reset the token and
                // call this method again so signing will be requested
                this.testGoogleDriveConnection(() => this.doLoadFile(), () => {
                    this.oauthToken = null;
                    this.signIn();
                });
            }
        },

        doLoadFile() {
            if(this.oauthToken != null){
                // When we load for the very first time, we may not have a Drive location to look for. In that case, we look for a Strype folder existence 
                // (however we do not create it here, we would do this on a save action). If a location is already set, we make sure it still exists. 
                // If it doesn't exist anymore, we set the default location to the Strype folder (if available) or just the Drive itself if not.
                this.checkDriveStrypeFolder(false, (strypeFolderId) => {
                    if(this.appStore.strypeProjectLocation && (this.appStore.strypeProjectLocation instanceof String)){
                        gapi.client.request({
                            path: "https://www.googleapis.com/drive/v3/files/" + this.appStore.strypeProjectLocation,
                            method: "GET",
                        }).then((response) => {
                            // Folder is found, we get the name
                            this.appStore.strypeProjectLocationAlias = JSON.parse(response.body).name;
                        }, () => {
                            // Folder not found, we set Strype as default folder if it exists
                            this.appStore.strypeProjectLocation = (strypeFolderId) ? strypeFolderId : undefined;
                            this.appStore.strypeProjectLocationAlias = (strypeFolderId) ? "Strype" : "";
                        });
                    }
                    else{
                        this.appStore.strypeProjectLocation = (strypeFolderId) ? strypeFolderId : undefined;
                        this.appStore.strypeProjectLocationAlias = (strypeFolderId) ? "Strype" : "";
                    }

                    if(this.currentAction == "loadAsResync"){
                        // When we want to load a file as a resyincing mechanism (when browser is opened/reloaded) we don't use the file picker
                        this.loadPickedFileId(this.appStore.currentGoogleDriveSaveFileId as string);
                    }
                    else {
                        // Method called to trigger the file load -- this would be called after we made sure the connection to Google Drive is (still) valid
                        (this.$refs[this.googleDriveFilePickerComponentId] as InstanceType<typeof GoogleDriveFilePicker>).startPicking(false);
                    }
                });
            }
        },

        saveFile(saveReason: SaveRequestReason) {
            // Method called to trigger the file save -- this would be called after the connection to Google Drive is (still) valid
            this.currentAction = "save";
            this.saveReason = saveReason;

            // In any case, we check that the given location (if provided) still exists. We set the alias (name of the folder) here.
            // If the folder doesn't exist, for all reasons for saving, we reset the Strype project location flags in the store (subsequent code will handle what to do)
            if(this.appStore.strypeProjectLocation){
                gapi.client.request({
                    path: "https://www.googleapis.com/drive/v3/files/" + this.appStore.strypeProjectLocation,
                    method: "GET",
                }).then((response) => {
                    // Folder is found, we get the name
                    this.appStore.strypeProjectLocationAlias = JSON.parse(response.body).name;
                }, (reason) => {
                    // Connection issue?
                    if(reason.status == 401 || reason.status == 403){
                        this.proceedFailedConnectionCheckOnSave();
                        return;
                    }
                    
                    // Folder not found
                    if(reason.status == 404){
                        this.appStore.strypeProjectLocation = undefined;
                        this.appStore.strypeProjectLocationAlias = "";
                    }
                });
            }            

            // When an explicit save is requested, it acts as a "save as" and we generate a new file in Google Drive.
            // In any other case, we only save a file if there is a save file id set
            if(saveReason == SaveRequestReason.saveProjectAtLocation || saveReason == SaveRequestReason.saveProjectAtOtherLocation){
                // For this case, we ask for the location (with /Strype as the default location -- which is created if non existant)
                this.checkDriveStrypeFolder(true, (strypeFolderId: string | null)=> {
                    // Show the file picker to select a folder (with default location) if the location specified doesn't exist, or if the user asked for changing it
                    if(strypeFolderId != null && this.appStore.strypeProjectLocation == undefined){
                        // No location is set, we set the Strype folder
                        this.appStore.strypeProjectLocation = strypeFolderId;
                        this.appStore.strypeProjectLocationAlias = "Strype";
                    }

                    // The autosave method may not exist (the case when a user has loaded a read-only Drive project, then wants to save: sync is off, but connection probably still maintained)
                    this.$root.$emit(CustomEventTypes.addFunctionToEditorAutoSave, {name: "GD", function: (saveReason: SaveRequestReason) => this.saveFile(saveReason)});

                    if(saveReason == SaveRequestReason.saveProjectAtOtherLocation){
                        (this.$refs[this.googleDriveFilePickerComponentId] as InstanceType<typeof GoogleDriveFilePicker>).startPicking(true);
                        // Save will be done after the file has been picked.   
                    }
                    else{
                        this.lookForAvailableProjectFileName(this.doSaveFile);
                    }
                }, this.proceedFailedConnectionCheckOnSave);
            }
            else {
                if(this.saveFileId){
                    this.doSaveFile();
                }
                else{
                    // Notify the application that if we were saving for loading now we are done
                    if(this.saveReason == SaveRequestReason.loadProject)                     {
                        this.$root.$emit(CustomEventTypes.saveStrypeProjectDoneForLoad);
                    }      
                }
            }
        },

        doSaveFile(){
            const isExplictSave = (this.saveReason == SaveRequestReason.saveProjectAtLocation || this.saveReason == SaveRequestReason.saveProjectAtOtherLocation);
            if(isExplictSave){
                this.saveFileId = undefined;
            }
            const fileContent = this.appStore.generateStateJSONStrWithCheckpoint();   
            // The file name depends on the context: normal save, we use the filed this.saveName that is in line with what the user provided in the input field
            // while when do autosave etc, we use th PROJECT saved name in the store.
            const fullFileName = ((isExplictSave || this.saveReason == SaveRequestReason.overwriteExistingProject) ? this.saveFileName  : this.appStore.projectName) + "." + strypeFileExtension;        
            // Using this example: https://stackoverflow.com/a/38475303/412908
            // Arbitrary long string:
            const boundary = "2db8c22f75474a58cd13fa2d3425017015d392ce0";
            const body : string[] = [];
            // Prepare the request body parameters. Note that we only set the parent ID for explicit save
            const bodyReqParams: {name: string, mimeType: string, contentHints: {thumbnail: {image: string, mimeType: string}}, parents?: [string]} = 
                {
                    name: fullFileName,
                    mimeType: "application/strype",
                    contentHints: {thumbnail: {image: "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", 
                        mimeType: "image/png"}},
                };
            if(isExplictSave && this.appStore.strypeProjectLocation){
                bodyReqParams.parents = [this.appStore.strypeProjectLocation.toString()];
            }
            body.push("Content-Type: application/json; charset=UTF-8\n\n" + JSON.stringify(bodyReqParams) + "\n");
            body.push("Content-Type: text/plain; charset=UTF-8\n\n" + fileContent + "\n");
            const fullBody = body.map((s) => "--" + boundary + "\n" + s).join("") + "--" + boundary + "--\n";
            gapi.client.request({
                path: "https://www.googleapis.com/upload/drive/v3/files" + (this.saveFileId === undefined ? "" : "/" + this.saveFileId),
                method: this.saveFileId === undefined ?  "POST" : "PATCH",
                params: {"uploadType": "multipart"},
                headers: {
                    "Content-Type" : "multipart/related; boundary=\"" + boundary + "\"",
                },
                body: fullBody,
            }).then(
                // Success of the request
                (resp) => {
                    // Save the save file ID 
                    this.saveFileId = JSON.parse(resp.body)["id"];
                    // Set the sync target 
                    this.appStore.syncTarget = StrypeSyncTarget.gd;
                    this.appStore.isEditorContentModified = false;
                    // Set the project name when we have made an explicit saving
                    if(isExplictSave || this.saveReason == SaveRequestReason.overwriteExistingProject){
                        this.appStore.projectName = this.saveFileName;
                    }                    
                    // Notify the application that if we were saving for loading now we are done
                    if(this.saveReason == SaveRequestReason.loadProject)                     {
                        this.$root.$emit(CustomEventTypes.saveStrypeProjectDoneForLoad);
                    }                
                },
                (reason) => {
                    // If we have an authorised error (for example, timed-out connexion) we should disconnect and warn the users
                    // (not to sure why rawResp.status doesn't give the right stuff, but based on debugging, this works...)
                    if(reason.status == 401){
                        this.proceedFailedConnectionCheckOnSave();
                    }
                    else if((reason.status??400) >= 400 && this.saveFileId != undefined){
                        // We assume something went wrong regarding saving against the specified file id.
                        // This can notably happen if the file has been locked in the meantime that we tried to save it.
                        // We show a modal and stop sync
                        this.appStore.simpleModalDlgMsg = this.$i18n.t("errorMessage.GDriveSaveFailed") as string;
                        this.$root.$emit("bv::show::modal", getAppSimpleMsgDlgId());
                        this.updateSignInStatus(false);
                    }
                }
            );   
        },       

        proceedFailedConnectionCheckOnSave(){
            // Do something in case of connection failure depending on the reason for saving
            // normal saving: --> try to reconnect, if failed, then we stop synchronising to Google Drive
            // auto-save: --> show banner message and stop synchronising
            // save to load + unload --> try to reconnect, if failed, stop sync + modal message
            // Even if the user may signing again, we first make sure everything shows as "not syncing" in case the signing process is not completed
            // (because if the user just drop the signing action, we have no way to get events on that...)
            this.oauthToken = null; 
            this.updateSignInStatus(false);
            if(this.saveReason != SaveRequestReason.autosave){
                if(this.saveReason == SaveRequestReason.loadProject || this.saveReason == SaveRequestReason.unloadPage){
                    const modalMsg = (this.saveReason == SaveRequestReason.loadProject) ? this.$i18n.t("errorMessage.gdriveConnectionSaveToLoadProjFailed") : this.$i18n.t("errorMessage.gdriveConnectionSaveToUnloadPageFailed") ;
                    this.appStore.simpleModalDlgMsg = modalMsg as string;
                    this.$root.$emit("bv::show::modal", this.loginErrorModalDlgId);
                    // The signIn method will be called when the modal is dismissed
                }
                else{
                    this.signIn();
                }
            }
            else{
                this.updateSignInStatus(false);
                const message = MessageDefinitions.GDriveConnectToSaveFailed;
                this.appStore.showMessage(message, null);
            }
        },
        
        loadPickedFileId(id : string, fileName?: string) : void {
            if(this.currentAction == "loadAsResync"){
                // When we resync the file, we can't get the file name from the Drive picker, so we need to find it with another method.
                gapi.client.request({
                    path: "https://www.googleapis.com/drive/v3/files/" + id,
                    method: "GET",
                    params: {},
                }).execute((resp) => {
                    fileName = resp.name;
                });
            }

            // Get the file content
            gapi.client.request({
                path: "https://www.googleapis.com/drive/v3/files/" + id,
                method: "GET",
                params: {alt: "media"},
            }).execute((resp) => {
                // Some flags in the store SHOULD NOT BE lost when we load a file, so we make a backup of those here:
                const strypeLocation = this.appStore.strypeProjectLocation;
                const strypeLocationAlias = this.appStore.strypeProjectLocationAlias;
                // Load the file content in the editor
                this.appStore.setStateFromJSONStr(
                    {
                        // The response from Google Drive would be encoded in UTF-8, so we need to decode it.
                        // cf https://stackoverflow.com/questions/13356493/decode-utf-8-with-javascript
                        stateJSONStr: decodeURIComponent(escape(JSON.stringify(resp))),
                    }                    
                ).then(() => {
                    // Only update things if we could set the new state
                    this.saveFileId = id;
                    // Users may have changed the file name directly on Drive, so we make sure at this stage we get the project with that same name
                    // (At this stage, we shouldn't have an undefined name, but for safety we use the default project name if so.)
                    const fileNameNoExt = (fileName) ? fileName.substring(0, fileName.lastIndexOf(".")) : i18n.t("defaultProjName") as string;
                    this.appStore.projectName = fileNameNoExt;
                    this.saveFileName = fileNameNoExt;
                    // Restore the fields we backed up before loading
                    this.appStore.strypeProjectLocation = strypeLocation;
                    this.appStore.strypeProjectLocationAlias = strypeLocationAlias;
                    // And finally register the correc target flags via the Menu 
                    // (it is necessary when switching from FS to GD to also update the Menu flags, which will update the state too)
                    (this.$parent as InstanceType<typeof MenuVue>).saveTargetChoice(StrypeSyncTarget.gd);
                }, () => {});

                // We check that the file has write access. If it doesn't we shouldn't propose the sync anymore.
                gapi.client.request({
                    path: "https://www.googleapis.com/drive/v3/files/" + id,
                    method: "GET",
                    params: {fields: "capabilities/canEdit"},
                }).execute((resp) => {
                    if(!resp["capabilities"]["canEdit"]){
                        this.saveFileId = undefined;
                        this.updateSignInStatus(false);
                        this.appStore.simpleModalDlgMsg = this.$i18n.t("errorMessage.gdriveReadOnly") as string;
                        this.$root.$emit("bv::show::modal", getAppSimpleMsgDlgId());
                    }
                });
            });
        },

        savePickedFolder(){
            // Doesn't matter the extact nature of the reason for saving, as long as we specify one of the 2 values for explicit saving.
            // (necessary as autosave may have been triggered in between)
            this.saveReason = SaveRequestReason.saveProjectAtLocation;
            this.lookForAvailableProjectFileName(this.doSaveFile);
        },

        onNonStrypeFilePicked(){
            // When a non-Strype file was picked to load, we notify the user on a modal dialog, and trigger the Drive picker again
            this.appStore.simpleModalDlgMsg = this.$i18n.t("errorMessage.gdriveWrongFile") as string;
            this.$root.$emit("bv::show::modal", this.nonStrypeFilePickedModalDlgId);
        },

        checkDriveStrypeFolder(createIfNone: boolean, checkFolderDoneCallBack: (strypeFolderId: string | null) => void, failedConnectionCallBack?: () => void) {
            // Check if the Strype folder exists on the Drive. If not, we create it if createIfNone is set to true.
            // Returns the file ID or null if the file couldn't be found/created.
            // Note that we need to specify the parent folder of the search (root folder) otherwise we would also get subfolders; and don't get trashed folders 
            // (that will also discard shared folders, so we don't need to check the writing rights...)
            let strypeFolderId: string | null = null;
            gapi.client.request({
                path: "https://www.googleapis.com/drive/v3/files",
                params: {"q": "mimeType='application/vnd.google-apps.folder' and name='Strype' and parents='root' and trashed=false"},
            }).then((response) => {
                // Check if the response returns a folder. As Google Drive allows entries with same name, it is possible that several "Strype" folder exists; we will use the first one.
                const filesArray: {id: string}[] = JSON.parse(response.body).files;
                if(filesArray.length > 0){
                    // If the Strype root folder exists, then we make it the location reference if none is defined yet.
                    strypeFolderId = filesArray[0].id;
                    // Continue with callback method after check is done
                    checkFolderDoneCallBack(strypeFolderId);
                }
                else if(createIfNone){
                    // If the Strype root folder doesn't exist in the user's Drive, we create one when requested
                    const body = JSON.stringify({
                        "name": "Strype",
                        "mimeType": "application/vnd.google-apps.folder",
                    });
                    gapi.client.request({
                        path: "https://www.googleapis.com/drive/v3/files",
                        method: "POST",
                        params: {"uploadType": "media"},
                        body: body,
                    }).then((resp) => {
                        strypeFolderId = JSON.parse(resp.body).id; 
                        // Continue with callback method after check is done
                        checkFolderDoneCallBack(strypeFolderId);
                    },
                    (reason) => {
                        // If the Strype folder cound't be created, we alert the user (temporary message banner) but we proceed with the save file workflow1
                        this.appStore.showMessage(MessageDefinitions.GDriveCantCreateStrypeFolder, 3000);  
                        // Continue with callback method after check is done
                        checkFolderDoneCallBack(strypeFolderId);
                    });
                }
                else{
                    // Continue with callback method after check is done
                    checkFolderDoneCallBack(strypeFolderId);
                }

            },(reason) => {
                // If the login to the Google failed (or the user wasn't logged in), handle it via the callback
                if(failedConnectionCallBack && (reason.status == 401 || reason.status == 403)){
                    failedConnectionCallBack();
                }
            });
        },

        lookForAvailableProjectFileName(onSuccessCallback: () => void){
            // We check if the currently suggested file name is not already used in the location we save the file.
            // (note: it seems that searching against regex isn't supported. cf https://developers.google.com/drive/api/guides/ref-search-terms,
            // the matching works in a very strange way, on a prefix and word basis, but yet I get results I didn't expect, so better double check on the results to make sure).
            gapi.client.request({
                path: "https://www.googleapis.com/drive/v3/files",
                params: {"q": "name contains '*.spy' and parents='" + ((this.appStore.strypeProjectLocation) ? this.appStore.strypeProjectLocation : "root") + "' and trashed=false"},
            }).then((response) => {
                let hasAlreadyFile = false, existingFileId = "";
                this.isFileLocked = false;
                const filesArray: {name: string, id: string}[] = JSON.parse(response.body).files;
                filesArray.forEach((file) => {
                    const listingThisFile = (file.name == (this.saveFileName + "." + strypeFileExtension));
                    hasAlreadyFile ||= listingThisFile;
                    if(listingThisFile){
                        existingFileId = file.id;
                    }
                });

                if(hasAlreadyFile){
                    // Check if the file is locked before we propose to overwrite
                    this.checkIsFileLocked(existingFileId, () => {
                        // We show a dialog to the user to make their choice about what to do next
                        this.$root.$emit("bv::show::modal", this.saveExistingGDProjectModalDlgId);                        
                    }, () => {
                        // We shouldn't have an issue at this stage, but if it happens, we just attempt to connect again
                        this.proceedFailedConnectionCheckOnSave();
                    });

                    // We do not continue the saving process at this stage: we wait for the user action,
                    // but we save the bits we need for continuing the process later (initiate the request to copy file to false at this stage)
                    this.saveExistingGDProjectInfos = {existingFileId: existingFileId, existingFileName: this.saveFileName, resumeProcessCallback: onSuccessCallback, isCopyFileRequested: false};                
                    return;                    
                }
                // Keep on with the flow of actions if everything went smooth so far
                onSuccessCallback();
            },(reason) => {
                // We shouldn't have an issue at this stage, but if it happens, we just attempt to connect again
                this.proceedFailedConnectionCheckOnSave();
            });
        },

        checkIsFileLocked(fileId: string, onSuccessCallback: () => void, onFailureCallBack: VoidFunction): void {
            // Following the addition of a locking file settings in Drive (Sept 2023) we need to check if a file is locked when we want to save.
            // This method retrieves this property for a given file by its file ID.
            // It is the responsablity of the caller of that method to provide a valid file ID and have passed authentication.
            // However, we still handle potential API access issues in this method, hence this methods expects the methods to run in case of success or failure
            gapi.client.request({
                path: "https://www.googleapis.com/drive/v3/files/" + fileId,
                method: "GET",
                params: {fields: "contentRestrictions"},
            }).execute((resp) => {
                if(resp["error"]){
                    // An error happened, we call the failure case method
                    onFailureCallBack();
                    return;
                }
                // Look up the property in the response
                this.isFileLocked = (resp.contentRestrictions) ? resp.contentRestrictions[0].readOnly : false;
                // Pass on the property value to the success case call back method.
                onSuccessCallback();
            });
        },

        onSaveGDExistingFileAction(action: Actions){
            // This method processes the user action (based on what dialog button has been clicked) to decide what to do next.
            // Actions to take are really JUST about the saving workflow: we don't need to worry about dealing with the dialog itself, 
            // because that is already handles by Bootstrap.
            if(action == Actions.overwrite){
                // User chose "overwrite": we do an overwriting save with the existing file Id (on Drive)
                this.saveReason = SaveRequestReason.overwriteExistingProject;
                this.saveFileId = this.saveExistingGDProjectInfos.existingFileId;
                this.saveExistingGDProjectInfos.resumeProcessCallback();
            }
            else if(action == Actions.copy){
                // User chose "copy": we invite the user to choose a new name in the next Vue rendering
                this.saveExistingGDProjectInfos.isCopyFileRequested = true;
                this.$nextTick(() => {
                    this.$root.$emit("bv::show::modal", getSaveAsProjectModalDlg());
                }); 
            }

            // If user chose "cancel": we do nothing  
        },
    },
});
</script>

<style lang="scss">
.google-drive-container {
    flex-direction: column;
    padding: 0px !important;
    width: $strype-menu-entry-width;
}

.google-drive-container > * {
    padding: $strype-menu-entry-padding;
}
</style>
