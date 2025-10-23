<template>
    <div>
        <SimpleMsgModalDlg :dlgId="loginErrorModalDlgId" :hideActionListener="signInFn"/>
        <SimpleMsgModalDlg :dlgId="unsupportedByStrypeFilePickedModalDlgId" :hideActionListener="loadFile" />
        <ModalDlg :dlgId="saveExistingCloudProjectModalDlgId" :size="saveExistingFileDlgSize" :elementToFocusId="(checkIsFileLockedProp()) ? saveExistingFileCopyButtonId : saveExistingFileOverwriteButtonId">
            <span style="white-space:pre-wrap">{{$t((checkIsFileLockedProp())?'appMessage.cloudLockedFileAlreadyExists':'appMessage.cloudFileAlreadyExists', {drivename: getDriveName()})}}</span>
            <!-- in order to allow 3 (customed) buttons, we use the slot "modal-footer" made available by Boostrap for the modal; to simply things, we handle both locked/unlocked files there -->
            <template #modal-footer-content="{ok, cancel}">
                <b-button variant="secondary" @click="onSaveCloudExistingFileAction(Actions.cancel);cancel()">{{$t('buttonLabel.cancel')}}</b-button>
                <b-button :id="saveExistingFileCopyButtonId" variant="primary" @click="onSaveCloudExistingFileAction(Actions.copy);ok()">{{$t('buttonLabel.saveProjectCopy')}}</b-button>
                <b-button :id="saveExistingFileOverwriteButtonId" v-if="!checkIsFileLockedProp()" variant="primary" @click="onSaveCloudExistingFileAction(Actions.overwrite);ok()">{{$t('buttonLabel.overwriteProject')}}</b-button>
            </template>
        </ModalDlg>
        <!-- Each specific drive is created here, but typing inference is done in getSpecificCloudDriveComponent() -->
        <GoogleDriveComponent ref="googleDriveComponent" :onFileToLoadPicked="loadPickedFileId" :onFolderToSaveFilePicked="savePickedFolder" :onFolderToSavePickCancelled="onFolderToSavePickCancelled" :onUnsupportedByStrypeFilePicked="onUnsupportedByStrypeFilePicked" />
        <OneDriveComponent ref="oneDriveComponent" :onFileToLoadPicked="loadPickedFileId" :onFolderToSaveFilePicked="savePickedFolder" :onFolderToSavePickCancelled="onFolderToSavePickCancelled" :onUnsupportedByStrypeFilePicked="onUnsupportedByStrypeFilePicked" />
    </div>
</template>

<script lang="ts">
import Vue from "vue";
import {mapStores} from "pinia";
import {useStore} from "@/store/store";
import Menu from "@/components/Menu.vue";
import App from "@/App.vue";
import SimpleMsgModalDlg from "@/components/SimpleMsgModalDlg.vue";
import ModalDlg from "@/components/ModalDlg.vue";
import i18n from "@/i18n";
import { CustomEventTypes, getAppSimpleMsgDlgId, getFrameUID, getSaveAsProjectModalDlg } from "@/helpers/editor";
import { pythonFileExtension, strypeFileExtension } from "@/helpers/common";
import { BootstrapDlgSize, SaveRequestReason, StrypeSyncTarget } from "@/types/types";
import { CloudDriveAPIState, CloudDriveComponent, CloudDriveFile, CloudFileSharingStatus, isSyncTargetCloudDrive, SaveExistingCloudProjectInfos } from "@/types/cloud-drive-types";
import GoogleDriveComponent from "@/components/GoogleDriveComponent.vue";
import OneDriveComponent from "@/components/OneDriveComponent.vue";
import { generateSPYFileContent } from "@/helpers/load-save";
import { AppSPYFullPrefix } from "@/main";

// This enum is used for flaging the action taken when a request to save a file on a Cloud Drive
// has been done, and a file of the same name already exists on the Drive
enum Actions{
    overwrite,
    copy,
    cancel
}

export default Vue.extend({
    name: "CloudDriveHandler",
    
    components: {
        SimpleMsgModalDlg,
        ModalDlg,
        GoogleDriveComponent,
        OneDriveComponent,
    },

    props: {
        openSharedProjectFileId: String,
    },

    data: function(){
        return {
            currentCloudTarget: StrypeSyncTarget.none, // updated whenever this cloud handler is called for a given Drive
            getDriveName: (() => "") as () => string, // updated whenever this cloud handler is called for a given Drive           
            checkIsFileLockedProp: (() => false) as () => boolean, // flag to be set by a specific drive's saving actions (updated whenever this cloud handler is called for a given Drive)
            signInFn: () => {}, // the siginin method of the given Cloud Drive (updated whenever this cloud handler is called for a given Drive)
            genericSignInCallBack: () => {}, // a callback function a caller to this component can set for specific callback after signing in to the Cloud provider
            currentAction: null as "generic-sign-in" | "load" | "save" | null, // flag the request current action for async workflow;
            saveReason: SaveRequestReason.unloadPage, // flag the reason of the save action
            saveFileName: "", // The file name, will be set via the Menu when a name is provided for saving, or when loading a project            
            Actions, // this is required to be accessible in the template
            saveExistingCloudProjectInfos: {} as SaveExistingCloudProjectInfos,
        };
    },

    computed: {
        ...mapStores(useStore),        
        
        loginErrorModalDlgId(): string {
            return "cloudLoginErrorModalDlg";
        },

        unsupportedByStrypeFilePickedModalDlgId(): string {
            return "cloudUnsupportedByStrypeFilePickedModalDlg";
        },

        saveFileId: {
            // This actually uniquely identifies the file to save to:
            get(): undefined|string {
                return this.appStore.currentCloudSaveFileId;
            },
            set(value: string|undefined){
                this.appStore.currentCloudSaveFileId = value;
            },
        },
        
        enterFileNameLabel(): string {
            return i18n.t("appMessage.enterFileNameLabel") as string;
        },

        saveExistingCloudProjectModalDlgId(): string {
            return "saveExistingCloudProjectModalDlg";
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
   
    methods: {  
        getSpecificCloudDriveComponent(cloudTarget: StrypeSyncTarget): CloudDriveComponent | null {
            // This method is crucially called to do anything related to a specific Cloud Drive (e.g. Google Drive).
            // It retunrs the right component which implements the necessary methods we need to Cloud-based operations.
            // Note that because we use Javascript, we don't have a good way to implement inheritance, but we use interfaces
            // of Typescript to get some definition, at least, of what each Cloud Drive component should implement.
            // We do not add the specific Cloud Drive's components via the <template> part, to allow us typing them properly
            // (see the cloud types file, it's a struggle to work that out).
            // Anyway, there is no styling require for these components so it's not a loss...
            // Each Cloud Drive is created on request (that is, only if such Cloud Drive is needed by the user).
            // (IMPORTANT note: we return a *Promise* because we need to wait for the watcher to perform its actions.)
            let component = null as CloudDriveComponent | null;
            if(cloudTarget == StrypeSyncTarget.gd){
                // Google Drive
                component = this.$refs.googleDriveComponent as InstanceType<typeof GoogleDriveComponent>;
            }
            else{
                // OneDrive
                component = this.$refs.oneDriveComponent as InstanceType<typeof OneDriveComponent>;
            }
            // We only update the specific Drive's method delegates when needed (that is when the cloudTarget changes)
            if(this.currentCloudTarget != cloudTarget){
                const resetToDefault = (cloudTarget ==  StrypeSyncTarget.none || cloudTarget == StrypeSyncTarget.fs);
                this.$set(this, "getDriveName", (resetToDefault) ? () => "" : () => (component as CloudDriveComponent).driveName);
                this.$set(this, "checkIsFileLockedProp", (resetToDefault) ? () => false : () => (component as CloudDriveComponent).isFileLocked);
                this.signInFn = (resetToDefault) ? () => {} : () => (component as CloudDriveComponent).signIn((cloudTarget: StrypeSyncTarget) => { 
                    if(this.currentAction == "load"){
                        this.doLoadFile(cloudTarget, this.openSharedProjectFileId, this.isSwappingCloudDriveTarget(cloudTarget));
                    }
                    else if(this.currentAction == "save"){
                        this.saveFile(cloudTarget, this.saveReason);
                    }
                    else if(this.currentAction == "generic-sign-in"){
                        // In a simple signing mechanism we may have callback function, if it's set, we call it.
                        this.genericSignInCallBack();
                    }
                });
            }
            // Update the flag before leaving.
            this.currentCloudTarget = cloudTarget;
            return component;
        },

        isSwappingCloudDriveTarget(cloudTarget: StrypeSyncTarget){
            // We need to handle swapping cloud drive targets to make sure we don't attempt opening a folder which ID is from another cloud or get other things mixed up.
            return (cloudTarget != this.appStore.syncTarget && isSyncTargetCloudDrive(cloudTarget) && isSyncTargetCloudDrive(this.appStore.syncTarget));                        
        },

        setGenericSignInCallBack(cloudTarget: StrypeSyncTarget, callBackFnToSet: () => void){
            this.currentAction = "generic-sign-in";
            this.genericSignInCallBack = callBackFnToSet;
            // Call the instance of the targeted cloud provider to register the callback against it
            this.getSpecificCloudDriveComponent(cloudTarget);
        },

        // After signing in or signed out the Cloud Drive:
        updateSignInStatus(cloudTarget: StrypeSyncTarget,signed: boolean) {
            if(signed){
                this.$root.$emit(CustomEventTypes.addFunctionToEditorProjectSave, {syncTarget: cloudTarget, function: (saveReason: SaveRequestReason) => this.saveFile(cloudTarget, saveReason)});
            }  
            else{
                // If signing fails, reset to no sync
                this.appStore.syncTarget = StrypeSyncTarget.none; 
                this.$root.$emit(CustomEventTypes.removeFunctionToEditorProjectSave, cloudTarget);
                // At the very end, emit event for notifying the attempt to open a shared project is finished
                this.$emit(CustomEventTypes.openSharedFileDone);
            }            
        },

        // Request the specific cloud drive component to test if the connection is still valid.
        // We provide the compoent the callbacks methods for success or failure of the test which it will call accordingly.
        testCloudConnection(cloudTarget: StrypeSyncTarget){
            const cloudDriveComponent = this.getSpecificCloudDriveComponent(cloudTarget);
            cloudDriveComponent?.testCloudConnection(() => {
                this.$root.$emit(CustomEventTypes.addFunctionToEditorProjectSave, {syncTarget: cloudTarget, function: (saveReason: SaveRequestReason) => this.saveFile(cloudTarget, saveReason)});
                this.doLoadFile(cloudTarget, this.openSharedProjectFileId, this.isSwappingCloudDriveTarget(cloudTarget));
            }, () => {
                cloudDriveComponent.resetOAuthToken();
                this.signInFn();
            });
        },
        
        doLoadFile(cloudTarget: StrypeSyncTarget, openSharedProjectFileId: string, isSwappingCloudDriveTarget: boolean): Promise<void>{
            // If a user is attempting to open a project explicitly from the cloud (i.e. not via a shared project):
            // When we load for the very first time, we may not have a Drive location to look for. In that case, we look for a Strype folder existence 
            // (however we do not create it here, we would do this on a save action). If a location is already set*, we make sure it still exists. 
            // If it doesn't exist anymore, we set the default location to the Strype folder (if available) or just the Drive itself if not.
            // NOTE: we do not need to check a folder when opening a shared project
            // (*) so the logic is like so we always check a folder location in the Drive - if the strypeProjectLocation is a non-empty string 
            // then we check that folder name; if it's an empty string, or not a string (i.e. when we were on a project opened on the File System)
            // then we check for "Strype", because it is our default location.
            const cloudDriveComponent = this.getSpecificCloudDriveComponent(cloudTarget);
            if(cloudDriveComponent){
                if(!cloudDriveComponent.isOAuthTokenNotSet()){
                    if(openSharedProjectFileId.length == 0){
                        return cloudDriveComponent.checkDriveStrypeOrOtherFolder(false, isSwappingCloudDriveTarget || !(this.appStore.strypeProjectLocation) || (typeof this.appStore.strypeProjectLocation != "string"), (strypeFolderId: string | null) => {
                            if(!isSwappingCloudDriveTarget && strypeFolderId){
                                return cloudDriveComponent.getFolderNameFromId(strypeFolderId).then((folderNameAndPath) => {
                                    this.appStore.strypeProjectLocationAlias = folderNameAndPath.name;
                                    this.appStore.strypeProjectLocationPath = folderNameAndPath.path??"";
                                    return cloudDriveComponent.openFilePicker(strypeFolderId);
                                });
                            }
                            else{
                                // Folder not found, we set Strype as default folder if it exists
                                this.appStore.strypeProjectLocation = (strypeFolderId) ? strypeFolderId : undefined;
                                this.appStore.strypeProjectLocationAlias = (strypeFolderId) ? "Strype" : "";
                                this.appStore.strypeProjectLocationPath = (strypeFolderId) ? "Strype" : "";
                                return cloudDriveComponent.openFilePicker(strypeFolderId??undefined);
                            }                                    
                        });
                    }
                    else{
                        // Open the internally shared project
                        return cloudDriveComponent.onFileToLoadPicked(StrypeSyncTarget.od, openSharedProjectFileId);
                    }
                }
                else{
                    // Nothing to do..
                    return Promise.resolve();
                }
            }
            else{
                return Promise.reject();
            }
        },

        loadFile(cloudTarget: StrypeSyncTarget) {
            this.currentAction = "load";

            // We might not have a value in cloudTarget when we reload the picker after a file with unsupported extension has been selected,
            // in that case we use the current target
            if(!cloudTarget){
                cloudTarget = this.currentCloudTarget;
            }

            const cloudDriveComponent = this.getSpecificCloudDriveComponent(cloudTarget);
            if(cloudDriveComponent){
                // This method is the entry point to load a file from a Drive. We check or request to sign-in to a specific Drive here.
                // (that is redundant with the previous "save" action if we were already syncing, but this method can be called when we were not syncing so it has to be done.)
                if(cloudDriveComponent.isOAuthTokenNotSet()){
                    this.signInFn();
                    // We wait for the signing checks are done, the loading mechanism will continue later in doLoadFile()
                }
                else{
                // We test the connection to make sure it's still valid: if so, we continue with the loading, and if not we reset the token and
                // call this method again so signing will be requested
                    this.testCloudConnection(cloudTarget);
                }
            }
        },

        getCloudAPIStatusWhenLoadedOrFailed(cloudTarget: StrypeSyncTarget){
            return this.getSpecificCloudDriveComponent(cloudTarget)?.getCloudAPIStatusWhenLoadedOrFailed();
        },

        getPublicSharedProjectContent(cloudTarget: StrypeSyncTarget, sharedFileID: string) {
            // This mechanism to load file isn't using OAuth but our API key instead. 
            // It is only relevant for getting a Strype project content of a PUBLICLY SHARED project.
            // We wait for relevant Cloud API to be loaded, or show an error message if it failed.
            // (Note that it is possible a Cloud Drive doesn't support that...)
            const cloudDriveComponent = this.getSpecificCloudDriveComponent(cloudTarget);
            return cloudDriveComponent?.getCloudAPIStatusWhenLoadedOrFailed()
                .then((cloudApiState) =>{
                    if(cloudApiState == CloudDriveAPIState.LOADED){
                        let alertMsgKey = "", alertParams = "";
                        // Attempt the retrieval of the file, if the Cloud Drive supports it
                        return cloudDriveComponent.getPublicSharedProjectContent(sharedFileID)
                            .then(({isSuccess, encodedURIFileContent, errorMsg}) => {
                                if(isSuccess){
                                    return this.appStore.setStateFromJSONStr({stateJSONStr: decodeURIComponent(escape(encodedURIFileContent)), showMessage: false })
                                        .then(() => {
                                            alertMsgKey = "appMessage.retrievedSharedGenericProject";
                                            alertParams = this.appStore.projectName;

                                            // Remove things in the state that were related to the Cloud Drive
                                            this.cleanCloudDriveRelatedInfosInState();
                                        })
                                        .catch((reason) => {
                                            alertMsgKey = "errorMessage.retrievedSharedGenericProject";
                                            alertParams = reason;
                                        });   
                                }
                                else{
                                    alertMsgKey = "errorMessage.retrievedSharedGenericProject";
                                    alertParams = errorMsg;
                                }
                            })
                            .finally(() => {
                                // Show a message to the user that the project has (/not) been loaded
                                (this.$root.$children[0] as InstanceType<typeof App>).finaliseOpenShareProject(alertMsgKey, alertParams);
                            });
                    }
                    else{
                        (this.$root.$children[0] as InstanceType<typeof App>).finaliseOpenShareProject("errorMessage.retrievedSharedGenericProject", this.$i18n.t("errorMessage.cloudAPIFailed", {apiname: cloudDriveComponent.driveAPIName}) as string);
                    }
                });
        },

        shareCloudDriveFile(cloudTarget: StrypeSyncTarget): Promise<boolean>{
            return (this.getSpecificCloudDriveComponent(cloudTarget)?.shareCloudDriveFile(this.saveFileId as string))??Promise.reject("No Cloud target!"); // We should never get to the reject clause here, keep TS happy
        },

        getCurrentCloudFileCurrentSharingStatus(cloudTarget: StrypeSyncTarget): Promise<CloudFileSharingStatus> {
            return (this.getSpecificCloudDriveComponent(cloudTarget)?.getCurrentCloudFileCurrentSharingStatus(this.saveFileId as string)) ?? Promise.reject("No Drive component is loaded!");
        },

        backupPreviousCloudFileSharingStatus(cloudTarget: StrypeSyncTarget, prevCloudFileSharingStatus: CloudFileSharingStatus): Promise<void>{
            const cloudDriveComponent = this.getSpecificCloudDriveComponent(cloudTarget);
            if(cloudDriveComponent){
                cloudDriveComponent.previousCloudFileSharingStatus = prevCloudFileSharingStatus;
                return Promise.resolve();
            }
            return Promise.reject("No Cloud component is loaded!");
        },

        restoreCloudDriveFileSharingStatus(cloudTarget: StrypeSyncTarget) {
            const cloudDriveComponent = this.getSpecificCloudDriveComponent(cloudTarget);
            return cloudDriveComponent?.restoreCloudDriveFileSharingStatus(this.saveFileId as string)
                ?.catch((_) => {
                    // Something happened, we let the user know
                    const erroMsg = (typeof _ == "string") ? _ : JSON.stringify(_);
                    this.appStore.simpleModalDlgMsg = this.$i18n.t("errorMessage.clouldFileRestoreSharingStatus", {drivename: cloudDriveComponent.driveName, errordetails: erroMsg}) as string;
                    this.$root.$emit("bv::show::modal", getAppSimpleMsgDlgId());
                })
                .finally(() => {
                    // Reset the flag we kept during the sharing action
                    this.backupPreviousCloudFileSharingStatus(this.appStore.syncTarget, CloudFileSharingStatus.UNKNOWN);
                });
        },

        getPublicShareLink(cloudTarget: StrypeSyncTarget) {
            return this.getSpecificCloudDriveComponent(cloudTarget)?.getPublicShareLink(this.saveFileId as string)??Promise.reject("No Cloud target!"); // We should never get to the reject clause here, keep TS happy
        },

        saveFile(cloudTarget: StrypeSyncTarget, saveReason: SaveRequestReason) {
            // Method called to trigger the file save -- this would be called after the connection to a Cloud Drive is (still) valid
            this.currentAction = "save";
            this.saveReason = saveReason;
            
            const continueSavingProcess = () => {
                // When an explicit save is requested, it acts as a "save as" and we generate a new file in the specified Cloud Drive.
                // In any other case, we only save a file if there is a save file id set
                if(saveReason == SaveRequestReason.saveProjectAtLocation || saveReason == SaveRequestReason.saveProjectAtOtherLocation){
                    // If we don't have a set location, we ask for the location (with /Strype as the default location -- which is created if non existant)
                    // We detect the need for checking/creating "Strype" when the target is a cloud drive different than the current cloud drive target,
                    // and the folder is "Strype". In the case we know the user didn't explictly request to save a given location so we target "Strype".
                    let isStrypeForNewCloudDriveTargetSave = saveReason == SaveRequestReason.saveProjectAtLocation 
                        && this.isSwappingCloudDriveTarget(cloudTarget)
                        && ((this.$parent as InstanceType<typeof Menu>).currentDriveLocation == "Strype");
                    const createStrypeFolder = isStrypeForNewCloudDriveTargetSave || !(this.appStore.strypeProjectLocation) || (typeof this.appStore.strypeProjectLocation != "string");
                    cloudDriveComponent?.checkDriveStrypeOrOtherFolder(createStrypeFolder, createStrypeFolder, (strypeFolderId: string | null) => {
                        // Show the file picker to select a folder (with default location) if the location specified doesn't exist, or if the user asked for changing it
                        if(strypeFolderId != null && (this.appStore.strypeProjectLocation == undefined || isStrypeForNewCloudDriveTargetSave)){
                            // No location is set, we set the Strype folder
                            this.appStore.strypeProjectLocation = strypeFolderId;
                            this.appStore.strypeProjectLocationAlias = "Strype";
                            this.appStore.strypeProjectLocationPath = "Strype";
                        }

                        // The project save method may not exist (the case when a user has loaded a read-only Drive project, then wants to save: sync is off, but connection probably still maintained)
                        this.$root.$emit(CustomEventTypes.addFunctionToEditorProjectSave, {syncTarget: cloudTarget, function: (saveReason: SaveRequestReason) => this.saveFile(cloudTarget, saveReason)});

                        if(saveReason == SaveRequestReason.saveProjectAtOtherLocation){
                            cloudDriveComponent.pickFolderForSave();
                            // Save will be done after the file has been picked.   
                        }
                        else{
                            this.lookForAvailableProjectFileName(cloudTarget, strypeFolderId??"");
                        }
                        return Promise.resolve();
                    }, () => {
                        this.proceedFailedConnectionCheckOnSave(cloudTarget);
                        return Promise.resolve();
                    });
                }
                else {
                    if(this.saveFileId){
                        this.doSaveFile(cloudTarget, this.appStore.strypeProjectLocation as string);
                    }
                    else{
                        // Notify the application that if we were saving for loading now we are done
                        if(this.saveReason == SaveRequestReason.loadProject) {
                            this.$root.$emit(CustomEventTypes.saveStrypeProjectDoneForLoad);
                        }      
                    }
                }
            };

            const cloudDriveComponent = this.getSpecificCloudDriveComponent(cloudTarget);
            // In any case, we check that the given location (if provided) still exists. We set the alias (name of the folder) here.
            // If the folder doesn't exist, for all reasons for saving, we reset the Strype project location flags in the store (subsequent code will handle what to do)
            if(this.appStore.strypeProjectLocation && this.appStore.syncTarget == cloudTarget){
                cloudDriveComponent?.getFolderNameFromId(this.appStore.strypeProjectLocation as string)
                    .then((folderNameAndPath) => {
                        // Folder is found, we get the name and the path if available
                        this.appStore.strypeProjectLocationAlias = folderNameAndPath.name;
                        this.appStore.strypeProjectLocationPath = folderNameAndPath.path??"";
                        continueSavingProcess();
                    })
                    .catch((responseStatusCode) => {
                        // The following error status codes were relevant for Google Drive. 
                        // We keep them for the general cases, but add a catch up case for other error codes
                        // that may be sent by other Cloud Drives.
                        // Connection issue?
                        if(responseStatusCode == 401 || responseStatusCode == 403){
                            this.proceedFailedConnectionCheckOnSave(cloudTarget);
                            return;
                        }
                        
                        // Folder not found and any other error (400+).
                        if(responseStatusCode - 400 >= 0){
                            this.appStore.strypeProjectLocation = undefined;
                            this.appStore.strypeProjectLocationAlias = "";
                            this.appStore.strypeProjectLocationPath = "";
                            this.appStore.projectLastSaveDate = -1;
                        }
                    });
            } 
            else{
                continueSavingProcess();
            }          
        },

        doSaveFile(cloudTarget: StrypeSyncTarget, strypeProjectLocation: string){
            const isExplictSave = (this.saveReason == SaveRequestReason.saveProjectAtLocation || this.saveReason == SaveRequestReason.saveProjectAtOtherLocation);
            if(isExplictSave){
                this.saveFileId = undefined;
            }
            // We need to set the name properly by what the user set in the save dialog (if applicable)
            const newProjectName = (isExplictSave || this.saveReason == SaveRequestReason.overwriteExistingProject) ? this.saveFileName  : this.appStore.projectName;
            this.appStore.projectName = newProjectName;
            const fileContent = generateSPYFileContent(); 
            // The file name depends on the context: normal save, we use the filed this.saveName that is in line with what the user provided in the input field
            // while when do autosave etc, we use th PROJECT saved name in the store.
            const fullFileName = newProjectName + "." + strypeFileExtension;
            const cloudDriveComponent = this.getSpecificCloudDriveComponent(cloudTarget);
            cloudDriveComponent?.doSaveFile(this.saveFileId, strypeProjectLocation, fullFileName, fileContent, isExplictSave, (savedFileId: string) => {
                // Save the save file ID 
                this.saveFileId = savedFileId;
                // Set the sync target 
                this.appStore.syncTarget = cloudTarget;
                this.appStore.isEditorContentModified = false;
                // Reset the "Save As" flag of the Men
                (this.$parent as InstanceType<typeof Menu>).requestSaveAs = false;
                // Set the project name when we have made an explicit saving
                if(isExplictSave || this.saveReason == SaveRequestReason.overwriteExistingProject){
                    this.appStore.projectName = this.saveFileName;
                    // We also make sure the target is clearly set in the menu: since we have several cloud drives,
                    // it is not possible that a sync target changes between open and save or between saves.
                    (this.$parent as InstanceType<typeof Menu>).saveTargetChoice(cloudTarget);
                }               
                // The saving date is updated in any cases
                this.appStore.projectLastSaveDate = Date.now();     
                // Notify the application that if we were saving for loading now we are done
                if(this.saveReason == SaveRequestReason.loadProject || (this.$parent as InstanceType<typeof Menu>).requestOpenProjectLater) {
                    this.$root.$emit(CustomEventTypes.saveStrypeProjectDoneForLoad);
                }                
            }, (errRespStatus: number) => {
                // If we have an authorised error (for example, timed-out connexion) we should disconnect and warn the users
                // (not to sure why rawResp.status doesn't give the right stuff, but based on debugging, this works...)
                if(errRespStatus == 401){
                    this.proceedFailedConnectionCheckOnSave(cloudTarget);
                }
                else if((errRespStatus??400) >= 400 && this.saveFileId != undefined){
                    // We assume something went wrong regarding saving against the specified file id.
                    // This can notably happen if the file has been locked in the meantime that we tried to save it.
                    // We show a modal and remove saving mechanisms.
                    this.appStore.simpleModalDlgMsg = this.$i18n.t((this.saveReason == SaveRequestReason.reloadBrowser) ? "errorMessage.driveNoFile" :"errorMessage.driveSaveFailed", {drivename: cloudDriveComponent.driveName}) as string;
                    this.$root.$emit("bv::show::modal", getAppSimpleMsgDlgId());
                    this.updateSignInStatus(cloudTarget,false);
                    // Reset the "Save As" flag of the Men
                    (this.$parent as InstanceType<typeof Menu>).requestSaveAs = false;
                    // When we tried to save a project upon request by the user when the a project was reloaded in the brower, failure to connect clears off the Drive information
                    if(this.saveReason == SaveRequestReason.reloadBrowser){
                        this.appStore.currentCloudSaveFileId = undefined;
                        this.appStore.strypeProjectLocation = undefined;
                        this.appStore.strypeProjectLocationAlias = "";
                        this.appStore.strypeProjectLocationPath = "";
                    }
                }
            });
        },       

        proceedFailedConnectionCheckOnSave(cloudTarget: StrypeSyncTarget){
            // Do something in case of connection failure depending on the reason for saving
            // normal saving: --> try to reconnect, if failed, then we stop synchronising to Google Drive
            // save to load + unload --> try to reconnect, if failed, stop sync + modal message
            // Even if the user may sign-in again, we first make sure everything shows as "not syncing" in case the signing process is not completed
            // (because if the user just drop the signing action, we have no way to get events on that...)
            this.getSpecificCloudDriveComponent(cloudTarget)?.resetOAuthToken(); 
            this.updateSignInStatus(cloudTarget, false);
            if(this.saveReason == SaveRequestReason.loadProject || this.saveReason == SaveRequestReason.unloadPage){
                const modalMsg = (this.saveReason == SaveRequestReason.loadProject) ? this.$i18n.t("errorMessage.gdriveConnectionSaveToLoadProjFailed") : this.$i18n.t("errorMessage.gdriveConnectionSaveToUnloadPageFailed") ;
                this.appStore.simpleModalDlgMsg = modalMsg as string;
                this.$root.$emit("bv::show::modal", this.loginErrorModalDlgId);
                // The signIn method will be called when the modal is dismissed
            }
            else{
                this.signInFn();
            }
        },
        
        loadPickedFileId(cloudTarget: StrypeSyncTarget, id : string, fileName?: string) {
            // The file name is either already set in the call of this method (case of choosing from the Drive Picker for example),
            // or we need to check it directly against the Drive. 
            // In any case, we retrieve the last saved date on the Drive directly.
            // Note: we let the internal specific Drive's methods do the retrieval: most won't allow getting fields and content in one call,
            // so we let the Drive know what to do after retrieving one and the other, and let it use that.
            let lastSaveDate = -1; // Need to be kept on a temporary var as the file content will overwrite this.
            let otherParams = {fileName: fileName};
            const cloudDriveComponent = this.getSpecificCloudDriveComponent(cloudTarget);
            cloudDriveComponent?.loadPickedFileId(id, otherParams, (fileNameFromDrive: string, fileModifiedDateTime: string) => {
                if(this.openSharedProjectFileId.length > 0){
                    otherParams.fileName = fileNameFromDrive;
                    fileName = fileNameFromDrive;
                }
                // The date conversion works fine for a date set as *RFC 3339 date format*
                lastSaveDate = Date.parse(fileModifiedDateTime);
            }, (fileContent: string) => {
                // SPY file shouldn't be based on the state anymore. But just for keeping them working, we can support both situations:
                // we check if the file is an object like (old format SPY) or starts with our special comments (new format SPY).
                const isPurePython = otherParams.fileName?.endsWith(`.${pythonFileExtension}`)??false;
                const isSpyNewFormat = (otherParams.fileName?.endsWith(`.${strypeFileExtension}`)??false) && fileContent.startsWith(AppSPYFullPrefix);
                if(isPurePython){
                    // The loading mechanisms for a Python file differs from a Strype file AND it doens't maintain a "link" to Google Drive.
                    (this.$root.$children[0] as InstanceType<typeof App>).setStateFromPythonFile(fileContent, otherParams.fileName as string, lastSaveDate, false).then(() => {
                        this.saveFileId = undefined;
                        this.updateSignInStatus(cloudTarget, false);
                        this.appStore.strypeProjectLocation = undefined;
                        this.appStore.strypeProjectLocationAlias = "";
                        this.appStore.strypeProjectLocationPath = "";
                        this.appStore.projectLastSaveDate = lastSaveDate;
                        (this.$parent as InstanceType<typeof Menu>).saveTargetChoice(StrypeSyncTarget.none);
                        // Give focus to the current (focusable) frame element so interaction can happen
                        document.getElementById(getFrameUID(this.appStore.currentFrame.id))?.focus();                        
                        // At the very end, emit event for notifying the attempt to open a shared project is finished in case that Python file was shared
                        this.$emit(CustomEventTypes.openSharedFileDone);   
                    });
                }
                else{
                    // The default case of a .spy (Strype) file.
                    // Some flags in the store SHOULD NOT BE lost when we load a file, so we make a backup of those here:
                    const strypeLocation = this.appStore.strypeProjectLocation;
                    const strypeLocationAlias = this.appStore.strypeProjectLocationAlias;
                    const strypeProjectLocationPath = this.appStore.strypeProjectLocationPath;
                    // Load the file content in the editor
                    const isOpenedSharedProject = (this.openSharedProjectFileId.length > 0);
                    const fileLoadFn = (isSpyNewFormat) 
                        ? (this.$root.$children[0] as InstanceType<typeof App>).setStateFromPythonFile(fileContent, otherParams.fileName as string, lastSaveDate, false)
                        : this.appStore.setStateFromJSONStr({stateJSONStr: fileContent, showMessage: !isOpenedSharedProject});
                    fileLoadFn.then(() => {
                        // Give focus to the current (focusable) frame element so interaction can happen
                        document.getElementById(getFrameUID((isSpyNewFormat) ? this.appStore.getImportsFrameContainerId : this.appStore.currentFrame.id))?.click();
                        // Only update things if we could set the new state
                        if(isOpenedSharedProject){
                            this.cleanCloudDriveRelatedInfosInState();
                        }
                        else{
                            this.saveFileId = id;
                            // Restore the fields we backed up before loading
                            this.appStore.strypeProjectLocation = strypeLocation;
                            this.appStore.strypeProjectLocationAlias = strypeLocationAlias;
                            this.appStore.strypeProjectLocationPath = strypeProjectLocationPath;
                            this.appStore.projectLastSaveDate = lastSaveDate;
                        }
                        // Users may have changed the file name directly on Drive, so we make sure at this stage we get the project with that same name
                        // (At this stage, we shouldn't have an undefined name, but for safety we use the default project name if so.)
                        const fileNameNoExt = (fileName) ? fileName.substring(0, fileName.lastIndexOf(".")) : i18n.t("defaultProjName") as string;
                        this.appStore.projectName = fileNameNoExt;
                        this.saveFileName = fileNameNoExt;
                        
                        // And finally register the correct target flags via the Menu 
                        // (it is necessary when switching from FS to a Drive to also update the Menu flags, which will update the state too)
                        (this.$parent as InstanceType<typeof Menu>).saveTargetChoice((isOpenedSharedProject) ? StrypeSyncTarget.none : cloudTarget);

                        // We check that the file has write access and isn't locked (in the Drive). 
                        // We use that also (regardless the access rights) to make accessed shared project READONLY.
                        cloudDriveComponent.checkIsCloudFileReadonly(id, (isReadonly: boolean) => {
                            if(isOpenedSharedProject || isReadonly){
                                this.saveFileId = undefined;
                                this.updateSignInStatus(cloudTarget, false);
                                if(isOpenedSharedProject){
                                    (this.$root.$children[0] as InstanceType<typeof App>).finaliseOpenShareProject("appMessage.retrievedSharedGenericProject", fileNameNoExt);
                                }
                                else{
                                    this.appStore.simpleModalDlgMsg = this.$i18n.t("errorMessage.driveFileReadOnly", {drivename: cloudDriveComponent.driveName}) as string;
                                    this.$root.$emit("bv::show::modal", getAppSimpleMsgDlgId());
                                }
                            }
                        });                    
                        
                        // At the very end, emit event for notifying the attempt to open a shared project is finished
                        this.$emit(CustomEventTypes.openSharedFileDone);                  
                    }, (reason: string) => {
                        // When loading a file didn't work, we only need to handle the situation of opening a shared file 
                        // (because the error message would have been shown before for normal opening from the Drive picker)
                        if(this.openSharedProjectFileId.length > 0){
                            (this.$root.$children[0] as InstanceType<typeof App>).finaliseOpenShareProject("errorMessage.retrievedSharedGenericProject", reason);
                        }
                    }); 
                }
            }, (errorRespStatus: number) => {
                if(errorRespStatus == 404){
                    this.appStore.simpleModalDlgMsg = this.$i18n.t("errorMessage.driveNoFile", {drivename: cloudDriveComponent.driveName}) as string;                    
                    this.$root.$emit("bv::show::modal", getAppSimpleMsgDlgId());
                }
                else{
                    this.appStore.simpleModalDlgMsg = this.$i18n.t("errorMessage.cloudDriveError", {drivename: cloudDriveComponent.driveName, error: errorRespStatus}) as string;                    
                    this.$root.$emit("bv::show::modal", getAppSimpleMsgDlgId());
                }
                // At the very end, emit event for notifying the attempt to open a shared project is finished
                this.$emit(CustomEventTypes.openSharedFileDone);  
            });
        },

        savePickedFolder(cloudTarget: StrypeSyncTarget){
            // Doesn't matter the extact nature of the reason for saving, as long as we specify one of the 2 values for explicit saving.
            this.saveReason = SaveRequestReason.saveProjectAtLocation;
            this.lookForAvailableProjectFileName(cloudTarget, this.appStore.strypeProjectLocation as string);
        },

        onFolderToSavePickCancelled(){
            // Reset the "Save As" flag of the Men
            (this.$parent as InstanceType<typeof Menu>).requestSaveAs = false;
        },

        onUnsupportedByStrypeFilePicked(){
            // When a non-Strype file was picked to load, we notify the user on a modal dialog, and trigger the Drive picker again
            this.appStore.simpleModalDlgMsg = this.$i18n.t("errorMessage.gdriveWrongFile") as string;
            this.$root.$emit("bv::show::modal", this.unsupportedByStrypeFilePickedModalDlgId);
        },

        lookForAvailableProjectFileName(cloudTarget: StrypeSyncTarget, strypeProjectLocation: string){
            const cloudDriveComponent = this.getSpecificCloudDriveComponent(cloudTarget);
            const onSuccessCallback = () => this.doSaveFile(cloudTarget, strypeProjectLocation);
            cloudDriveComponent?.lookForAvailableProjectFileName(strypeProjectLocation, this.saveFileName, (existingFileId) => {
                // Check if the file is locked before we propose to overwrite
                cloudDriveComponent.checkIsFileLocked(existingFileId, () => {
                    // We show a dialog to the user to make their choice about what to do next
                    this.$root.$emit("bv::show::modal", this.saveExistingCloudProjectModalDlgId);                        
                }, () => {
                    // We shouldn't have an issue at this stage, but if it happens, we just attempt to connect again
                    this.proceedFailedConnectionCheckOnSave(cloudTarget);
                });
                // We do not continue the saving process at this stage: we wait for the user action,
                // but we save the bits we need for continuing the process later (initiate the request to copy file to false at this stage)
                this.saveExistingCloudProjectInfos = {existingFileId: existingFileId, existingFileName: this.saveFileName, resumeProcessCallback: onSuccessCallback, isCopyFileRequested: false};                
                
                this.$root.$emit("bv::show::modal", this.saveExistingCloudProjectModalDlgId);
            }, onSuccessCallback, () => this.proceedFailedConnectionCheckOnSave(cloudTarget));            
        },

        onSaveCloudExistingFileAction(action: Actions){
            // This method processes the user action (based on what dialog button has been clicked) to decide what to do next.
            // Actions to take are really JUST about the saving workflow: we don't need to worry about dealing with the dialog itself, 
            // because that is already handles by Bootstrap.
            if(action == Actions.overwrite){
                // User chose "overwrite": we do an overwriting save with the existing file Id (on Drive)
                this.saveReason = SaveRequestReason.overwriteExistingProject;
                this.saveFileId = this.saveExistingCloudProjectInfos.existingFileId;
                this.saveExistingCloudProjectInfos.resumeProcessCallback();
            }
            else if(action == Actions.copy){
                // User chose "copy": we invite the user to choose a new name in the next Vue rendering
                this.saveExistingCloudProjectInfos.isCopyFileRequested = true;
                this.$nextTick(() => {
                    this.$root.$emit("bv::show::modal", getSaveAsProjectModalDlg());
                }); 
            }
            else{
                // If user chose "cancel": we only reset the "Save As" flag of the Men
                (this.$parent as InstanceType<typeof Menu>).requestSaveAs = false;
            }
        },

        cleanCloudDriveRelatedInfosInState(){
            this.appStore.currentCloudSaveFileId = undefined;
            this.appStore.strypeProjectLocation = undefined;
            this.appStore.strypeProjectLocationAlias = "";
            this.appStore.strypeProjectLocationPath = "";
            this.appStore.projectLastSaveDate = -1;
            this.saveFileId = undefined;
        },

        searchCloudDriveElements(cloudTarget: StrypeSyncTarget, fileName: string, fileLocationId: string, searchAllSPYFiles: boolean, searchOptions: Record<string, string>): Promise<CloudDriveFile[]> {
            return this.getSpecificCloudDriveComponent(cloudTarget)?.searchCloudDriveElements(fileName, fileLocationId,searchAllSPYFiles, searchOptions)??Promise.reject("No Cloud target!"); // We should never get to the reject clause here, keep TS happy
        },
        
        /**
         * FileIO parts
         */
        readFileContentForIO(cloudTarget: StrypeSyncTarget, fileId: string, isBinaryMode: boolean, filePath: string): Promise<string | Uint8Array | {success: boolean, errorMsg: string}> {
            // This method is used by FileIO to get a file string content.
            // It relies on the Cloud File Id passed as argument, and the callback method for handling succes or failure is also passed as arguments.
            // The argument "filePath" is only used for error message.
            // The nature of the answer depends on the reading mode: a string in normal text case, an array of bytes in binary mode.
            return this.getSpecificCloudDriveComponent(cloudTarget)?.readFileContentForIO(fileId, isBinaryMode, filePath).catch((errorMsg) => {
                return Promise.reject({success: false, errorMsg: this.$i18n.t("errorMessage.fileIO.fetchFileError", {filename: filePath, error: errorMsg})});
            })??Promise.reject("No Cloud target!"); // We should never get to the reject clause here, keep TS happy
        },

        writeFileContentForIO(cloudTarget: StrypeSyncTarget, fileContent: string|Uint8Array, fileInfos: {filePath: string, fileName?: string, fileId?: string, folderId?: string}): Promise<string> {
            // Write file supports 2 modes: normal writing that only relies on the content and fileId,
            // and file creation which relies on the folderId, fileName and returns the generated fileId.
            // The fileName is always set because it may be used inside the error message.
            // The method returns a string promise: the file ID on success, the error message on failure.
            return this.getSpecificCloudDriveComponent(cloudTarget)?.writeFileContentForIO(fileContent, fileInfos).catch((errorMsg) => {
                return Promise.reject(i18n.t("errorMessage.fileIO.writingFileFailed", {filename: fileInfos.filePath, error: errorMsg}));        
            })??Promise.reject("No Cloud target!"); // We should never get to the reject clause here, keep TS happy
        },
        /** end FileIO */
    },
        
});
</script>
