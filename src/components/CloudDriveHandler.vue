<template>
    <div>
        <SimpleMsgModalDlg :dlgId="loginErrorModalDlgId" :hideActionListener="signInFn"/>
        <SimpleMsgModalDlg :dlgId="unsupportedByStrypeFilePickedModalDlgId" :hideActionListener="loadFile" />
        <ModalDlg :dlgId="saveExistingCloudProjectModalDlgId" :size="saveExistingFileDlgSize" :elementToFocusId="(checkIsFileLockedProp()) ? saveExistingFileCopyButtonId : saveExistingFileOverwriteButtonId">
            <span style="white-space:pre-wrap">{{$t((checkIsFileLockedProp())?'appMessage.cloudLockedFileAlreadyExists':'appMessage.cloudFileAlreadyExists', {drivename: getDriveName()})}}</span>
            <!-- in order to allow 3 (customed) buttons, we use the slot "modal-footer-content" made available in the underlying BModal; to simply things, we handle both locked/unlocked files there -->
            <template #modal-footer-content="{ok, cancel}">
                <BButton variant="secondary" @click="onSaveCloudExistingFileAction(Actions.cancel);cancel()">{{$t('buttonLabel.cancel')}}</BButton>
                <BButton :id="saveExistingFileCopyButtonId" variant="primary" @click="onSaveCloudExistingFileAction(Actions.copy);ok()">{{$t('buttonLabel.saveProjectCopy')}}</BButton>
                <BButton :id="saveExistingFileOverwriteButtonId" v-if="!checkIsFileLockedProp()" variant="primary" @click="onSaveCloudExistingFileAction(Actions.overwrite);ok()">{{$t('buttonLabel.overwriteProject')}}</BButton>
            </template>
        </ModalDlg>
        <!-- For Git providers, saving is committing: the user gives the commit message (see doSaveFile()) -->
        <ModalDlg :dlgId="gitCommitModalDlgId" :dlgTitle="$t('appMessage.gitCommitTitle', {providername: getDriveName()})" :okCustomTitle="$t('buttonLabel.save')"
            :okDisabled="gitCommitMessage.trim().length == 0" :elementToFocusId="gitCommitMessageInputId" size="lg" showCloseBtn>
            <div class="git-commit-dlg-container">
                <span>{{gitCommitDetails}}</span>
                <label :for="gitCommitMessageInputId">{{$t("appMessage.gitCommitMessage")}}</label>
                <input :id="gitCommitMessageInputId" v-model="gitCommitMessage" :placeholder="$t('appMessage.gitCommitMessagePlaceholder')" type="text" autocomplete="off" class="form-control" />
            </div>
        </ModalDlg>
        <!-- Each specific drive is created here, but typing inference is done in getSpecificCloudDriveComponent() -->
        <GoogleDriveComponent ref="googleDriveComponent" :onFileToLoadPicked="loadPickedFileId" :onFolderToSaveFilePicked="savePickedFolder" :onFolderToSavePickCancelled="onFolderToSavePickCancelled" :onUnsupportedByStrypeFilePicked="onUnsupportedByStrypeFilePicked" />
        <OneDriveComponent ref="oneDriveComponent" :onFileToLoadPicked="loadPickedFileId" :onFolderToSaveFilePicked="savePickedFolder" :onFolderToSavePickCancelled="onFolderToSavePickCancelled" :onUnsupportedByStrypeFilePicked="onUnsupportedByStrypeFilePicked" />
        <GitHubComponent ref="gitHubComponent" :onFileToLoadPicked="loadPickedFileId" :onFolderToSaveFilePicked="savePickedFolder" :onFolderToSavePickCancelled="onFolderToSavePickCancelled" :onUnsupportedByStrypeFilePicked="onUnsupportedByStrypeFilePicked" />
        <GitLabComponent ref="gitLabComponent" :onFileToLoadPicked="loadPickedFileId" :onFolderToSaveFilePicked="savePickedFolder" :onFolderToSavePickCancelled="onFolderToSavePickCancelled" :onUnsupportedByStrypeFilePicked="onUnsupportedByStrypeFilePicked" />
    </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {mapStores} from "pinia";
import {useStore} from "@/store/store";
import SimpleMsgModalDlg from "@/components/SimpleMsgModalDlg.vue";
import ModalDlg from "@/components/ModalDlg.vue";
import { CustomEventTypes, getAppSimpleMsgDlgId, getCloudLoginErrorModalDlgId, getFrameUID, getSaveAsProjectModalDlg } from "@/helpers/editor";
import { escapeHTML, pythonFileExtension, strypeFileExtension } from "@/helpers/common";
import { BootstrapDlgSize, LoadRequestReason, SaveRequestReason, StrypeSyncTarget } from "@/types/types";
import { CloudDriveAPIState, CloudDriveComponent, CloudDriveFile, CloudFileSharingStatus, isSyncTargetCloudDrive, isSyncTargetGitProvider, SaveExistingCloudProjectInfos } from "@/types/cloud-drive-types";
import GoogleDriveComponent from "@/components/GoogleDriveComponent.vue";
import OneDriveComponent from "@/components/OneDriveComponent.vue";
import { generateSPYFileContent } from "@/helpers/load-save";
import { vueComponentsAPIHandler } from "@/helpers/vueComponentAPI";
import { AppSPYFullPrefix, eventBus } from "@/helpers/appContext";
import { BButton, BvTriggerableEvent } from "bootstrap-vue-next";
import GitHubComponent from "@/components/GitHubComponent.vue";
import GitLabComponent from "@/components/GitLabComponent.vue";
import { GitProviderComponent, parseGitFileId } from "@/types/git-provider-types";
import { getDefaultGitCommitMessage } from "@/helpers/gitProvider";

// This enum is used for flaging the action taken when a request to save a file on a Cloud Drive
// has been done, and a file of the same name already exists on the Drive
enum Actions{
    overwrite,
    copy,
    cancel
}

export default defineComponent({
    name: "CloudDriveHandler",
    
    components: {
        SimpleMsgModalDlg,
        ModalDlg,
        GoogleDriveComponent,
        OneDriveComponent,
        GitHubComponent,
        GitLabComponent,
        BButton,
    },

    created() {
        // Expose this component that other components might need.
        // Vue 3 has deprecated direct access to components.
        // (we don't set it in setup() because we want to have this accessible, and the component created!)
        vueComponentsAPIHandler.cloudDriveHandlerComponentAPI =  {
            getDriveName: () => {
                return this.getDriveName();
            },
            getSpecificCloudDriveComponent: this.getSpecificCloudDriveComponent,
            getCloudAPIStatusWhenLoadedOrFailed: this.getCloudAPIStatusWhenLoadedOrFailed,
            setGenericSignInCallBack: this.setGenericSignInCallBack,
            updateSignInStatus: this.updateSignInStatus,
            signInFn: () => {
                return this.signInFn();
            },
            shareCloudDriveFile: this.shareCloudDriveFile,
            getCurrentCloudFileCurrentSharingStatus: this.getCurrentCloudFileCurrentSharingStatus,
            backupPreviousCloudFileSharingStatus: this.backupPreviousCloudFileSharingStatus,
            restoreCloudDriveFileSharingStatus: this.restoreCloudDriveFileSharingStatus,
            getPublicShareLink: this.getPublicShareLink,
            getPublicSharedProjectContent: this.getPublicSharedProjectContent,
            searchCloudDriveElements: this.searchCloudDriveElements,
            readFileContentForIO: this.readFileContentForIO,
            writeFileContentForIO: this.writeFileContentForIO,
            getSaveExistingCloudProjectInfos: () => {
                return this.saveExistingCloudProjectInfos;
            },
            setSaveExistingCloudProjectInfos: (v: SaveExistingCloudProjectInfos) => {
                this.saveExistingCloudProjectInfos = v;
            },
            setSaveFileName: (v: string) => {
                this.saveFileName = v;
            },
            saveFile: this.saveFile,
            loadFile: this.loadFile,
            modifiedDataSearchOptionName: (cloudTarget: StrypeSyncTarget) => {
                return this.getSpecificCloudDriveComponent(cloudTarget)?.modifiedDataSearchOptionName;
            },
            fileMoreFieldsForIO: (cloudTarget: StrypeSyncTarget) => {
                return this.getSpecificCloudDriveComponent(cloudTarget)?.fileMoreFieldsForIO;
            },
        };
    },

    mounted() {
        eventBus.on(CustomEventTypes.strypeModalShown, this.onGitCommitDlgShown);
        eventBus.on(CustomEventTypes.strypeModalHidden, this.onGitCommitDlgHidden);
    },

    beforeUnmount() {
        eventBus.off(CustomEventTypes.strypeModalShown, this.onGitCommitDlgShown);
        eventBus.off(CustomEventTypes.strypeModalHidden, this.onGitCommitDlgHidden);
    },

    props: {
        openSharedProjectFileId: {type: String, required: true},
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
            loadReason: LoadRequestReason.standardUserLoad, // flag the reason of the load action
            saveFileName: "", // The file name, will be set via the Menu when a name is provided for saving, or when loading a project            
            Actions, // this is required to be accessible in the template
            saveExistingCloudProjectInfos: {} as SaveExistingCloudProjectInfos,
            // For the commit dialog of Git providers (see doSaveFile())
            gitCommitDetails: "",
            gitCommitMessage: "",
            pendingGitCommit: null as ((commitMessage: string) => void) | null,
            // When the user chose where to save in a Git provider's dialog, they also gave the commit message there (see savePickedFolder())
            gitCommitMessageFromSaveChoice: undefined as string | undefined,
        };
    },

    computed: {
        ...mapStores(useStore),        
        
        loginErrorModalDlgId(): string {
            return getCloudLoginErrorModalDlgId();
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
            return this.$t("appMessage.enterFileNameLabel");
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

        gitCommitModalDlgId(): string {
            return "gitCommitModalDlg";
        },

        gitCommitMessageInputId(): string {
            return "gitCommitMessageInput";
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
                // ("satisfies" checks that the component implements CloudDriveComponent, as $refs are untyped)
                component = this.$refs.googleDriveComponent as InstanceType<typeof GoogleDriveComponent> satisfies CloudDriveComponent;
            }
            else if(cloudTarget == StrypeSyncTarget.od){
                // OneDrive
                component = this.$refs.oneDriveComponent as InstanceType<typeof OneDriveComponent> satisfies CloudDriveComponent;
            }
            else if(cloudTarget == StrypeSyncTarget.gl){
                // GitLab (the CloudDriveComponent check is done in the component itself, on what it exposes)
                component = this.$refs.gitLabComponent as CloudDriveComponent;
            }
            else{
                // GitHub (the CloudDriveComponent check is done in the component itself, on what it exposes)
                component = this.$refs.gitHubComponent as CloudDriveComponent;
            }
            // We only update the specific Drive's method delegates when needed (that is when the cloudTarget changes)
            if(this.currentCloudTarget != cloudTarget){
                const resetToDefault = (cloudTarget ==  StrypeSyncTarget.none || cloudTarget == StrypeSyncTarget.fs);
                this.getDriveName = (resetToDefault) ? () => "" : () => component.driveName;
                this.checkIsFileLockedProp = (resetToDefault) ? () => false : () => component.isFileLocked;
                this.signInFn = (resetToDefault) ? () => {} : () => component.signIn((cloudTarget: StrypeSyncTarget) => { 
                    if(this.currentAction == "load"){
                        this.doLoadFile(cloudTarget, this.loadReason, this.openSharedProjectFileId, this.isSwappingCloudDriveTarget(cloudTarget));
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
                eventBus.emit(CustomEventTypes.addFunctionToEditorProjectSave, {syncTarget: cloudTarget, function: (saveReason: SaveRequestReason) => this.saveFile(cloudTarget, saveReason)});
            }  
            else{
                // If signing fails, reset to no sync
                this.appStore.syncTarget = StrypeSyncTarget.none; 
                eventBus.emit(CustomEventTypes.removeFunctionToEditorProjectSave, cloudTarget);
                // At the very end, emit event for notifying the attempt to open a shared project is finished
                eventBus.emit(CustomEventTypes.openSharedFileDone);
            }            
        },

        // Request the specific cloud drive component to test if the connection is still valid.
        // We provide the compoent the callbacks methods for success or failure of the test which it will call accordingly.
        testCloudConnection(cloudTarget: StrypeSyncTarget){
            const cloudDriveComponent = this.getSpecificCloudDriveComponent(cloudTarget);
            cloudDriveComponent?.testCloudConnection(() => {
                eventBus.emit(CustomEventTypes.addFunctionToEditorProjectSave, {syncTarget: cloudTarget, function: (saveReason: SaveRequestReason) => this.saveFile(cloudTarget, saveReason)});
                this.doLoadFile(cloudTarget, LoadRequestReason.standardUserLoad, this.openSharedProjectFileId, this.isSwappingCloudDriveTarget(cloudTarget));
            }, () => {
                cloudDriveComponent.resetOAuthToken();
                this.signInFn();
            });
        },
        
        doLoadFile(cloudTarget: StrypeSyncTarget, loadReason: LoadRequestReason, openSharedProjectFileId: string, isSwappingCloudDriveTarget: boolean): Promise<void>{
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
                                    // The picker is only requested when doing an explicit (default) loading
                                    if(loadReason == LoadRequestReason.standardUserLoad){
                                        return cloudDriveComponent.openFilePicker(strypeFolderId);
                                    }
                                    else {
                                        // ... the other case for LoadRequestReason.reloadBrowser
                                        return cloudDriveComponent.onFileToLoadPicked(cloudTarget, this.appStore.currentCloudSaveFileId??"" );
                                    }
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
                        cloudDriveComponent.onFileToLoadPicked(cloudTarget, openSharedProjectFileId);
                        return Promise.resolve();
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

        loadFile(cloudTarget: StrypeSyncTarget, loadReason?: LoadRequestReason) {
            this.currentAction = "load";
            this.loadReason = loadReason ?? LoadRequestReason.standardUserLoad;

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
                    // Before attempting to sign in, make sure the Drive's API actually managed to load (it may not have,
                    // e.g. if there is no network connection to reach it). Without this check, if the API failed to load,
                    // signInFn() would silently do nothing and the user would get no feedback at all.
                    cloudDriveComponent.getCloudAPIStatusWhenLoadedOrFailed().then((cloudApiState) => {
                        if(cloudApiState == CloudDriveAPIState.FAILED){
                            this.appStore.simpleModalDlgMsg = this.$t("errorMessage.cloudAPIFailed", {apiname: cloudDriveComponent.driveAPIName});
                            eventBus.emit(CustomEventTypes.showStrypeModal, getAppSimpleMsgDlgId());
                        }
                        else{
                            this.signInFn();
                            // We wait for the signing checks are done, the loading mechanism will continue later in doLoadFile()
                        }
                    });
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
                        // Show a progress indication on the editor
                        vueComponentsAPIHandler.appComponentAPI?.applyShowAppProgress({requestAttention: true, message: this.$t("appMessage.loadEditorFile")});   
                        return cloudDriveComponent.getPublicSharedProjectContent(sharedFileID)
                            .then(({isSuccess, projectName, decodedURIFileContent, errorMsg}) => {
                                if(isSuccess){
                                    // We need to check if we're loading the new SPY format or the old one.
                                    const isSpyNewFormat = decodedURIFileContent.startsWith(AppSPYFullPrefix);
                                    const loadFn = (isSpyNewFormat) 
                                        ? vueComponentsAPIHandler.appComponentAPI?.setStateFromPythonFile(decodedURIFileContent, projectName, -1, false, "import")
                                        : this.appStore.setStateFromJSONStr({stateJSONStr: decodedURIFileContent, showMessage: false });                            
                                    return loadFn
                                        ?.then(() => {
                                            // If we have loaded the project with the new SPY format, the project name isn't part of the file, so we need to set it explicitly
                                            if(isSpyNewFormat){
                                                this.appStore.projectName  = projectName;
                                            }

                                            // Remove things in the state that were related to the Cloud Drive
                                            this.cleanCloudDriveRelatedInfosInState();

                                            // And we make sure we show the project is unmodified
                                            this.appStore.isEditorContentModified = false;
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
                                // Make sure the progress indication on the editor is removed.
                                vueComponentsAPIHandler.appComponentAPI?.applyShowAppProgress({requestAttention: false});
                                // Finalise action after the project has (/not) been loaded
                                vueComponentsAPIHandler.appComponentAPI?.finaliseOpenShareProject((alertMsgKey) ? {key: alertMsgKey, param: alertParams} : undefined);
                            });
                    }
                    else{
                        vueComponentsAPIHandler.appComponentAPI?.finaliseOpenShareProject({key: "errorMessage.retrievedSharedGenericProject", param: this.$t("errorMessage.cloudAPIFailed", {apiname: cloudDriveComponent.driveAPIName})});
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
                    this.appStore.simpleModalDlgMsg = this.$t("errorMessage.clouldFileRestoreSharingStatus", {drivename: cloudDriveComponent.driveName, errordetails: erroMsg});
                    eventBus.emit(CustomEventTypes.showStrypeModal, getAppSimpleMsgDlgId());
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
            
            // (a commit message given in a previous, unfinished, save can't be used for this one)
            this.gitCommitMessageFromSaveChoice = undefined;

            // If the project comes from a Python file opened from this Drive, its first save there is done in the folder of that file
            // (or, when saving at another location, the folder picker starts there).
            // For a Git provider, that's only for "Save" (see Menu's saveToSuggestedCloudLocation()): with "Save As", the user chooses
            // the location in the provider's save dialog as usual (which already opens in the folder of the file loaded last).
            const suggestedLocation = this.appStore.suggestedCloudSaveLocation;
            const isSavingToSuggestedLocation = suggestedLocation != undefined && suggestedLocation.target == cloudTarget
                && this.appStore.syncTarget == StrypeSyncTarget.none
                && (saveReason == SaveRequestReason.saveProjectAtLocation || saveReason == SaveRequestReason.saveProjectAtOtherLocation)
                && (!isSyncTargetGitProvider(cloudTarget) || (saveReason == SaveRequestReason.saveProjectAtLocation && !vueComponentsAPIHandler.menuComponentAPI?.getRequestSaveAs()));
            if(isSavingToSuggestedLocation){
                this.appStore.strypeProjectLocation = suggestedLocation.location;
                this.appStore.strypeProjectLocationAlias = suggestedLocation.alias;
                this.appStore.strypeProjectLocationPath = suggestedLocation.path;
            }

            const continueSavingProcess = () => {
                // When an explicit save is requested, it acts as a "save as" and we generate a new file in the specified Cloud Drive.
                // In any other case, we only save a file if there is a save file id set
                if(isSyncTargetGitProvider(cloudTarget) && !isSavingToSuggestedLocation && (saveReason == SaveRequestReason.saveProjectAtLocation || saveReason == SaveRequestReason.saveProjectAtOtherLocation)){
                    // For a Git provider, the save dialog doesn't propose a location: once we know the connection is valid (signing in if needed,
                    // after which this method is called again), the user chooses where to save in the provider's own dialog, with the commit message.
                    // (the save continues in savePickedFolder() when that's done)
                    // When saving in the folder of the Python file the project comes from, we save like for a Drive below (the user is only asked for the commit message).
                    const startGitSaveChoice = () => {
                        eventBus.emit(CustomEventTypes.addFunctionToEditorProjectSave, {syncTarget: cloudTarget, function: (saveReason: SaveRequestReason) => this.saveFile(cloudTarget, saveReason)});
                        (cloudDriveComponent as CloudDriveComponent & GitProviderComponent).pickSaveLocation(this.saveFileName + "." + strypeFileExtension);
                    };
                    if(!cloudDriveComponent || cloudDriveComponent.isOAuthTokenNotSet()){
                        this.proceedFailedConnectionCheckOnSave(cloudTarget);
                    }
                    else{
                        cloudDriveComponent.testCloudConnection(startGitSaveChoice, () => this.proceedFailedConnectionCheckOnSave(cloudTarget));
                    }
                }
                else if(saveReason == SaveRequestReason.saveProjectAtLocation || saveReason == SaveRequestReason.saveProjectAtOtherLocation){
                    // If we don't have a set location, we ask for the location (with /Strype as the default location -- which is created if non existant)
                    // We detect the need for checking/creating "Strype" when the target is a cloud drive different than the current cloud drive target,
                    // and the folder is "Strype". In the case we know the user didn't explictly request to save a given location so we target "Strype".
                    let isStrypeForNewCloudDriveTargetSave = saveReason == SaveRequestReason.saveProjectAtLocation 
                        && this.isSwappingCloudDriveTarget(cloudTarget)
                        && (vueComponentsAPIHandler.menuComponentAPI?.getCurrentDriveLocation() == "Strype");
                    // (when saving in the folder of the Python file the project comes from, we only check that folder)
                    const updateStrypeProjectLocation = !isSavingToSuggestedLocation
                        && (isStrypeForNewCloudDriveTargetSave || (typeof this.appStore.strypeProjectLocation != "string") || this.appStore.syncTarget == StrypeSyncTarget.none);
                    const createStrypeFolder = updateStrypeProjectLocation || !(this.appStore.strypeProjectLocation);
                    cloudDriveComponent?.checkDriveStrypeOrOtherFolder(createStrypeFolder, createStrypeFolder, (strypeFolderId: string | null) => {
                        if(isSavingToSuggestedLocation && strypeFolderId == null){
                            // The folder of the Python file isn't available anymore: we forget it and let the user choose where to save
                            // in the save dialog, as for any other project (in "Strype" by default)
                            this.appStore.suggestedCloudSaveLocation = undefined;
                            this.appStore.strypeProjectLocation = undefined;
                            this.appStore.strypeProjectLocationAlias = "";
                            this.appStore.strypeProjectLocationPath = "";
                            eventBus.emit(CustomEventTypes.showStrypeModal, getSaveAsProjectModalDlg());
                            return Promise.resolve();
                        }

                        // Show the file picker to select a folder (with default location) if the location specified doesn't exist, or if the user asked for changing it
                        if(strypeFolderId != null && (this.appStore.strypeProjectLocation == undefined  || updateStrypeProjectLocation)){
                            // No location is set, we set the Strype folder
                            this.appStore.strypeProjectLocation = strypeFolderId;
                            this.appStore.strypeProjectLocationAlias = "Strype";
                            this.appStore.strypeProjectLocationPath = "Strype";
                        }

                        // The project save method may not exist (the case when a user has loaded a read-only Drive project, then wants to save: sync is off, but connection probably still maintained)
                        eventBus.emit(CustomEventTypes.addFunctionToEditorProjectSave, {syncTarget: cloudTarget, function: (saveReason: SaveRequestReason) => this.saveFile(cloudTarget, saveReason)});

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
                            eventBus.emit(CustomEventTypes.saveStrypeProjectDoneForLoad);
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
                        // In this generic Cloud Drive handler, we are not sure what the nature of responseStatusCode is: it can be number, a number as string, or
                        // a proper response object that contains the status property. So we evaluate if the status property exists on responseStatusCode first and 
                        // if it doesn't exist, we assume responseStatusCode is a number-like variable.
                        const errorCode = responseStatusCode.status ?? responseStatusCode;
                        // The following error status codes were relevant for Google Drive. 
                        // We keep them for the general cases, but add a catch up case for other error codes
                        // that may be sent by other Cloud Drives.
                        // Connection issue?
                        if(errorCode){
                            this.proceedFailedConnectionCheckOnSave(cloudTarget);
                            return;
                        }
                        
                        // Folder not found and any other error (400+).
                        if(errorCode - 400 >= 0){
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
            if(!isSyncTargetGitProvider(cloudTarget)){
                this.proceedSaveFile(cloudTarget, strypeProjectLocation);
                return;
            }
            // For a Git provider, saving is committing (and pushing) the file: we need a commit message.
            // If the user just chose where to save in the provider's dialog, they gave it there.
            if(this.gitCommitMessageFromSaveChoice != undefined){
                const commitMessage = this.gitCommitMessageFromSaveChoice;
                this.gitCommitMessageFromSaveChoice = undefined;
                this.proceedSaveFile(cloudTarget, strypeProjectLocation, commitMessage);
                return;
            }
            // Otherwise we ask the user for it, with a default one.
            // Nothing is changed before the user confirms, so cancelling leaves the project as it was (not saved).
            const isExplictSave = (this.saveReason == SaveRequestReason.saveProjectAtLocation || this.saveReason == SaveRequestReason.saveProjectAtOtherLocation);
            // (when we save into an existing file, we commit to that file, see the provider's doSaveFile())
            const fileName = parseGitFileId((isExplictSave) ? "" : (this.saveFileId ?? ""))?.fileName ?? (this.getProjectNameForSave(isExplictSave) + "." + strypeFileExtension);
            this.gitCommitDetails = this.$t("appMessage.gitCommitDetails", {filename: fileName, location: this.appStore.strypeProjectLocationAlias});
            this.gitCommitMessage = getDefaultGitCommitMessage();
            this.pendingGitCommit = (commitMessage: string) => this.proceedSaveFile(cloudTarget, strypeProjectLocation, commitMessage);
            eventBus.emit(CustomEventTypes.showStrypeModal, this.gitCommitModalDlgId);
        },

        onGitCommitDlgShown(event: BvTriggerableEvent){
            if(event.componentId == this.gitCommitModalDlgId){
                // The default message is selected, so the user can simply type their own message instead
                (document.getElementById(this.gitCommitMessageInputId) as HTMLInputElement | null)?.select();
            }
        },

        onGitCommitDlgHidden(event: BvTriggerableEvent){
            if(event.componentId != this.gitCommitModalDlgId){
                return;
            }
            const pendingGitCommit = this.pendingGitCommit;
            this.pendingGitCommit = null;
            if(event.trigger == "ok"){
                // (the dialog can't be validated with an empty message, which Git doesn't allow)
                pendingGitCommit?.(this.gitCommitMessage.trim());
            }
            else{
                // The save is cancelled: we only reset the "Save As" flag of the Menu
                vueComponentsAPIHandler.menuComponentAPI?.setRequestSaveAs(false);
            }
        },

        getProjectNameForSave(isExplictSave: boolean): string {
            // We need to set the name properly by what the user set in the save dialog (if applicable)
            return (isExplictSave || this.saveReason == SaveRequestReason.overwriteExistingProject) ? this.saveFileName  : this.appStore.projectName;
        },

        proceedSaveFile(cloudTarget: StrypeSyncTarget, strypeProjectLocation: string, commitMessage?: string){
            const isExplictSave = (this.saveReason == SaveRequestReason.saveProjectAtLocation || this.saveReason == SaveRequestReason.saveProjectAtOtherLocation);
            if(isExplictSave){
                this.saveFileId = undefined;
            }
            const newProjectName = this.getProjectNameForSave(isExplictSave);
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
                // Reset the "Save As" flag of the Menu
                vueComponentsAPIHandler.menuComponentAPI?.setRequestSaveAs(false);
                // Set the project name when we have made an explicit saving
                if(isExplictSave || this.saveReason == SaveRequestReason.overwriteExistingProject){
                    this.appStore.projectName = this.saveFileName;
                    // We also make sure the target is clearly set in the menu: since we have several cloud drives,
                    // it is not possible that a sync target changes between open and save or between saves.
                    vueComponentsAPIHandler.menuComponentAPI?.saveTargetChoice(cloudTarget);
                }               
                // The saving date is updated in any cases
                this.appStore.projectLastSaveDate = Date.now();     
                // Notify the application that if we were saving for loading now we are done
                if(this.saveReason == SaveRequestReason.loadProject || vueComponentsAPIHandler.menuComponentAPI?.getRequestOpenProjectLater()) {
                    eventBus.emit(CustomEventTypes.saveStrypeProjectDoneForLoad);
                }
            }, (errRespStatus: number, errorDetails?: string) => {
                // If we have an authorised error (for example, timed-out connexion) we should disconnect and warn the users
                // (not to sure why rawResp.status doesn't give the right stuff, but based on debugging, this works...)
                if(errRespStatus == 401){
                    this.proceedFailedConnectionCheckOnSave(cloudTarget);
                    return;
                }
                // When the target explains why saving failed (for example, a Git provider for a protected branch), we show it to the user.
                // (it's text from the target, shown in a dialog that renders HTML: we escape it)
                const errorDetailsMsg = (errorDetails) ? this.$t("errorMessage.saveFailedDetails", {details: escapeHTML(errorDetails).replace(/\n+/g, "<br>")}) : "";
                // If a new file couldn't be created in the folder of the Python file the project comes from (for example, the user can't write in it),
                // we don't save there anymore: the next save shows the save dialog.
                if(isExplictSave && this.saveFileId == undefined
                    &&this.appStore.suggestedCloudSaveLocation?.target == cloudTarget && this.appStore.suggestedCloudSaveLocation.location == strypeProjectLocation){
                    this.appStore.suggestedCloudSaveLocation = undefined;
                }
                // Unlike with a Drive, committing a new file to a Git provider can fail for reasons the user should know about
                // (for example, a protected branch): we tell the user (the case of an existing file is handled below for all targets).
                if(isSyncTargetGitProvider(cloudTarget) && this.saveFileId == undefined){
                    this.appStore.simpleModalDlgMsg = this.$t("errorMessage.gitCommitFailed", {providername: cloudDriveComponent.driveName, error: errRespStatus}) + errorDetailsMsg;
                    eventBus.emit(CustomEventTypes.showStrypeModal, getAppSimpleMsgDlgId());
                    vueComponentsAPIHandler.menuComponentAPI?.setRequestSaveAs(false);
                    return;
                }
                if(isExplictSave && this.saveFileId == undefined){
                    // A new file couldn't be created in the chosen folder (for example, the user can't write in it): we tell the user.
                    this.appStore.simpleModalDlgMsg = this.$t("errorMessage.driveSaveFailed", {drivename: cloudDriveComponent.driveName}) + errorDetailsMsg;
                    eventBus.emit(CustomEventTypes.showStrypeModal, getAppSimpleMsgDlgId());
                    vueComponentsAPIHandler.menuComponentAPI?.setRequestSaveAs(false);
                }
                else if((errRespStatus??400) >= 400 && this.saveFileId != undefined){
                    // We assume something went wrong regarding saving against the specified file id.
                    // This can notably happen if the file has been locked in the meantime that we tried to save it.
                    // We show a modal and remove saving mechanisms.
                    this.appStore.simpleModalDlgMsg = this.$t((this.saveReason == SaveRequestReason.reloadBrowser) ? "errorMessage.driveNoFile" :"errorMessage.driveSaveFailed", {drivename: cloudDriveComponent.driveName}) + errorDetailsMsg;
                    eventBus.emit(CustomEventTypes.showStrypeModal, getAppSimpleMsgDlgId());
                    this.updateSignInStatus(cloudTarget,false);
                    // Reset the "Save As" flag of the Menu
                    vueComponentsAPIHandler.menuComponentAPI?.setRequestSaveAs(false);
                    // When we tried to save a project upon request by the user when the a project was reloaded in the brower, failure to connect clears off the Drive information
                    if(this.saveReason == SaveRequestReason.reloadBrowser){
                        this.appStore.currentCloudSaveFileId = undefined;
                        this.appStore.strypeProjectLocation = undefined;
                        this.appStore.strypeProjectLocationAlias = "";
                        this.appStore.strypeProjectLocationPath = "";
                    }
                }
            }, commitMessage);
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
                const modalMsg = (this.saveReason == SaveRequestReason.loadProject) ? this.$t("errorMessage.gdriveConnectionSaveToLoadProjFailed") : this.$t("errorMessage.gdriveConnectionSaveToUnloadPageFailed") ;
                this.appStore.simpleModalDlgMsg = modalMsg as string;
                eventBus.emit(CustomEventTypes.showStrypeModal, this.loginErrorModalDlgId);
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
            // Show a progress indication on the editor
            vueComponentsAPIHandler.appComponentAPI?.applyShowAppProgress({requestAttention: true, message: this.$t("appMessage.loadEditorFile")});
            // Get the file content
            const cloudDriveComponent = this.getSpecificCloudDriveComponent(cloudTarget);
            cloudDriveComponent?.loadPickedFileId(id, otherParams, (fileNameFromDrive: string, fileModifiedDateTime: string) => {
                if(this.openSharedProjectFileId.length > 0 || this.loadReason == LoadRequestReason.reloadBrowser){
                    otherParams.fileName = fileNameFromDrive;
                    fileName = fileNameFromDrive;
                }
                // The date conversion works fine for a date set as *RFC 3339 date format*
                lastSaveDate = Date.parse(fileModifiedDateTime);
            }, (fileContent: string) => {
                // If we're reconnecting to a previously-synced Cloud Drive project at startup (see
                // resyncToCloudDriveAtStartup()) and the local copy has edits that were never pushed
                // to the Drive, back it up before we overwrite it with the remote version. Named
                // distinctly ("(local edits)") so it doesn't get confused, in the recent-states
                // banner/Open Recent menu, with the official copy of the same project we're about
                // to reload:
                if (this.loadReason == LoadRequestReason.reloadBrowser && this.appStore.isEditorContentModified) {
                    eventBus.emit(CustomEventTypes.backupEditorProjectBeforeDiscard, {
                        projectNameOverride: `${this.appStore.projectName} (local edits)`,
                    });
                }
                // SPY file shouldn't be based on the state anymore. But just for keeping them working, we can support both situations:
                // we check if the file is an object like (old format SPY) or starts with our special comments (new format SPY).
                const isPurePython = otherParams.fileName?.endsWith(`.${pythonFileExtension}`)??false;
                const isSpyNewFormat = (otherParams.fileName?.endsWith(`.${strypeFileExtension}`)??false) && fileContent.startsWith(AppSPYFullPrefix);
                if(isPurePython){
                    // The loading mechanisms for a Python file differs from a Strype file AND it doens't maintain a "link" to the Drive.
                    // However, we keep the file's folder (set by the Drive when the file was picked) so the first save there is proposed in that folder,
                    // as a Strype file with the same name (except for a shared file: the user may not be able to write in its folder).
                    vueComponentsAPIHandler.appComponentAPI?.setStateFromPythonFile(fileContent, otherParams.fileName as string, lastSaveDate, false, "cloud").then(() => {
                        if(this.openSharedProjectFileId.length == 0 && this.appStore.strypeProjectLocation && typeof this.appStore.strypeProjectLocation == "string"){
                            const suggestedLocation = {target: cloudTarget, location: this.appStore.strypeProjectLocation, alias: this.appStore.strypeProjectLocationAlias, path: this.appStore.strypeProjectLocationPath};
                            this.appStore.suggestedCloudSaveLocation = suggestedLocation;
                            // (Google Drive gets the folder's name asynchronously when the file is picked, it may not be there yet)
                            if(!suggestedLocation.alias){
                                cloudDriveComponent.getFolderNameFromId(suggestedLocation.location).then((folderNameAndPath) => {
                                    if(this.appStore.suggestedCloudSaveLocation?.target == cloudTarget && this.appStore.suggestedCloudSaveLocation.location == suggestedLocation.location){
                                        this.appStore.suggestedCloudSaveLocation = {...suggestedLocation, alias: folderNameAndPath.name, path: folderNameAndPath.path??""};
                                    }
                                }, () => {});
                            }
                        }
                        this.saveFileId = undefined;
                        this.updateSignInStatus(cloudTarget, false);
                        this.appStore.strypeProjectLocation = undefined;
                        this.appStore.strypeProjectLocationAlias = "";
                        this.appStore.strypeProjectLocationPath = "";
                        this.appStore.projectLastSaveDate = lastSaveDate;
                        vueComponentsAPIHandler.menuComponentAPI?.saveTargetChoice(StrypeSyncTarget.none);
                        // Give focus to the current (focusable) frame element so interaction can happen
                        document.getElementById(getFrameUID(this.appStore.currentFrame.id))?.focus();                        
                        // At the very end, emit event for notifying the attempt to open a shared project is finished in case that Python file was shared
                        eventBus.emit(CustomEventTypes.openSharedFileDone);   
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
                        ? vueComponentsAPIHandler.appComponentAPI?.setStateFromPythonFile(fileContent, otherParams.fileName as string, lastSaveDate, false, "cloud")
                        : this.appStore.setStateFromJSONStr({stateJSONStr: fileContent, showMessage: !isOpenedSharedProject});
                    fileLoadFn?.then(() => {
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

                        // And we make sure we show the project is unmodified
                        this.appStore.isEditorContentModified = false;

                        // Users may have changed the file name directly on Drive, so we make sure at this stage we get the project with that same name
                        // (At this stage, we shouldn't have an undefined name, but for safety we use the default project name if so.)
                        const fileNameNoExt = (fileName) ? fileName.substring(0, fileName.lastIndexOf(".")) : this.$t("defaultProjName");
                        this.appStore.projectName = fileNameNoExt;
                        this.saveFileName = fileNameNoExt;
                        
                        // And finally register the correct target flags via the Menu 
                        // (it is necessary when switching from FS to a Drive to also update the Menu flags, which will update the state too)
                        vueComponentsAPIHandler.menuComponentAPI?.saveTargetChoice((isOpenedSharedProject) ? StrypeSyncTarget.none : cloudTarget);

                        // We check that the file has write access and isn't locked (in the Drive). 
                        // We use that also (regardless the access rights) to make accessed shared project READONLY.
                        cloudDriveComponent.checkIsCloudFileReadonly(id, (isReadonly: boolean) => {
                            if(isOpenedSharedProject || isReadonly){
                                this.saveFileId = undefined;
                                this.updateSignInStatus(cloudTarget, false);
                                if(isOpenedSharedProject){
                                    vueComponentsAPIHandler.appComponentAPI?.finaliseOpenShareProject();
                                }
                                else{
                                    this.appStore.simpleModalDlgMsg = this.$t("errorMessage.driveFileReadOnly", {drivename: cloudDriveComponent.driveName});
                                    eventBus.emit(CustomEventTypes.showStrypeModal, getAppSimpleMsgDlgId());
                                }
                            }
                        });                    
                        
                        // At the very end, emit event for notifying the attempt to open a shared project is finished
                        eventBus.emit(CustomEventTypes.openSharedFileDone);                  
                    }, (reason: string) => {
                        // When loading a file didn't work, we only need to handle the situation of opening a shared file 
                        // (because the error message would have been shown before for normal opening from the Drive picker)
                        if(this.openSharedProjectFileId.length > 0){
                            vueComponentsAPIHandler.appComponentAPI?.finaliseOpenShareProject({key: "errorMessage.retrievedSharedGenericProject", param: reason});
                        }
                    }); 
                }
            }, (errorRespStatus: number) => {
                if(errorRespStatus == 404){
                    this.appStore.simpleModalDlgMsg = this.$t("errorMessage.driveNoFile", {drivename: cloudDriveComponent.driveName});                    
                    eventBus.emit(CustomEventTypes.showStrypeModal, getAppSimpleMsgDlgId());
                }
                else{
                    this.appStore.simpleModalDlgMsg = this.$t("errorMessage.cloudDriveError", {drivename: cloudDriveComponent.driveName, error: errorRespStatus});                    
                    eventBus.emit(CustomEventTypes.showStrypeModal, getAppSimpleMsgDlgId());
                }
                // At the very end, emit event for notifying the attempt to open a shared project is finished
                eventBus.emit(CustomEventTypes.openSharedFileDone);  
            }, () => {
                // The finally clause only makes sure the progress indication on the editor is removed.
                vueComponentsAPIHandler.appComponentAPI?.applyShowAppProgress({requestAttention: false});
            });
        },

        savePickedFolder(cloudTarget: StrypeSyncTarget, commitMessage?: string){
            // Doesn't matter the extact nature of the reason for saving, as long as we specify one of the 2 values for explicit saving.
            this.saveReason = SaveRequestReason.saveProjectAtLocation;
            // (for a Git provider, the commit message the user gave with the location, used by doSaveFile())
            this.gitCommitMessageFromSaveChoice = commitMessage;
            this.lookForAvailableProjectFileName(cloudTarget, this.appStore.strypeProjectLocation as string);
        },

        onFolderToSavePickCancelled(){
            // Reset the "Save As" flag of the Menu
            vueComponentsAPIHandler.menuComponentAPI?.setRequestSaveAs(false);
        },

        onUnsupportedByStrypeFilePicked(){
            // When a non-Strype file was picked to load, we notify the user on a modal dialog, and trigger the Drive picker again
            this.appStore.simpleModalDlgMsg = this.$t("errorMessage.gdriveWrongFile");
            eventBus.emit(CustomEventTypes.showStrypeModal, this.unsupportedByStrypeFilePickedModalDlgId);
        },

        lookForAvailableProjectFileName(cloudTarget: StrypeSyncTarget, strypeProjectLocation: string){
            const cloudDriveComponent = this.getSpecificCloudDriveComponent(cloudTarget);
            const onSuccessCallback = () => this.doSaveFile(cloudTarget, strypeProjectLocation);
            cloudDriveComponent?.lookForAvailableProjectFileName(strypeProjectLocation, this.saveFileName, (existingFileId) => {
                // Check if the file is locked before we propose to overwrite
                cloudDriveComponent.checkIsFileLocked(existingFileId, () => {
                    // We show a dialog to the user to make their choice about what to do next
                    eventBus.emit(CustomEventTypes.showStrypeModal, this.saveExistingCloudProjectModalDlgId);                        
                }, () => {
                    // We shouldn't have an issue at this stage, but if it happens, we just attempt to connect again
                    this.proceedFailedConnectionCheckOnSave(cloudTarget);
                });
                // We do not continue the saving process at this stage: we wait for the user action,
                // but we save the bits we need for continuing the process later (initiate the request to copy file to false at this stage)
                this.saveExistingCloudProjectInfos = {existingFileId: existingFileId, existingFileName: this.saveFileName, resumeProcessCallback: onSuccessCallback, isCopyFileRequested: false};                
                
                eventBus.emit(CustomEventTypes.showStrypeModal, this.saveExistingCloudProjectModalDlgId);
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
                // We resume once this dialog is closed: for a Git provider, resuming shows another dialog (to get the commit message)
                const onSaveExistingDlgHidden = (event: BvTriggerableEvent) => {
                    if(event.componentId == this.saveExistingCloudProjectModalDlgId){
                        eventBus.off(CustomEventTypes.strypeModalHidden, onSaveExistingDlgHidden);
                        this.saveExistingCloudProjectInfos.resumeProcessCallback();
                    }
                };
                eventBus.on(CustomEventTypes.strypeModalHidden, onSaveExistingDlgHidden);
            }
            else if(action == Actions.copy){
                // User chose "copy": we invite the user to choose a new name in the next Vue rendering
                this.saveExistingCloudProjectInfos.isCopyFileRequested = true;
                this.$nextTick(() => {
                    eventBus.emit(CustomEventTypes.showStrypeModal, getSaveAsProjectModalDlg());
                }); 
            }
            else{
                // If user chose "cancel": we only reset the "Save As" flag of the Menu
                vueComponentsAPIHandler.menuComponentAPI?.setRequestSaveAs(false);
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

        searchCloudDriveElements(cloudTarget: StrypeSyncTarget, fileName: string | undefined, fileLocationId: string, searchAllSPYFiles: boolean, searchOptions: Record<string, string>): Promise<CloudDriveFile[]> {
            return this.getSpecificCloudDriveComponent(cloudTarget)?.searchCloudDriveElements(fileName, fileLocationId,searchAllSPYFiles, searchOptions)??Promise.reject("No Cloud target!"); // We should never get to the reject clause here, keep TS happy
        },
        
        /**
         * FileIO parts
         */
        readFileContentForIO(cloudTarget: StrypeSyncTarget, fileId: string, filePath: string): Promise<Uint8Array> {
            // This method is used by FileIO to get a file string content.
            // It relies on the Cloud File Id passed as argument.
            // The argument "filePath" is only used for error message.
            // The return is an array of bytes.
            return this.getSpecificCloudDriveComponent(cloudTarget)?.readFileContentForIO(fileId, filePath).catch((errorMsg) => {
                return Promise.reject(this.$t("errorMessage.fileIO.fetchFileError", {filename: filePath, error: errorMsg}));
            })??Promise.reject("No Cloud target!"); // We should never get to the reject clause here, keep TS happy
        },

        writeFileContentForIO(cloudTarget: StrypeSyncTarget, fileContent: string|Uint8Array, fileInfos: { filePath: string, fileName: string, folderId: string } | { filePath: string, fileId: string }): Promise<string> {
            // Write file supports 2 modes: normal writing that only relies on the content and fileId,
            // and file creation which relies on the folderId, fileName and returns the generated fileId.
            // The fileName is always set because it may be used inside the error message.
            // The method returns a string promise: the file ID on success, the error message on failure.
            return this.getSpecificCloudDriveComponent(cloudTarget)?.writeFileContentForIO(fileContent, fileInfos).catch((errorMsg) => {
                return Promise.reject(this.$t("errorMessage.fileIO.writingFileFailed", {filename: fileInfos.filePath, error: errorMsg}));        
            })??Promise.reject("No Cloud target!"); // We should never get to the reject clause here, keep TS happy
        },
        /** end FileIO */
    },
        
});
</script>

<style lang="scss">
.git-commit-dlg-container {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.git-commit-dlg-container > label {
    margin-top: 10px;
    font-weight: 600;
}
</style>
