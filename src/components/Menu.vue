<template>
    <!-- keep the tabindex attribute, it is necessary to handle focus properly -->
    <div @keydown="handleKeyEvent" @keyup="handleKeyEvent" tabindex="-1" @mousedown.self.stop.prevent>
        <GoogleDrive :ref="googleDriveComponentId" />
        <div>
            <a href="https://strype.org/" :title="$i18n.t('appMenu.homepage')"><img class="top-left-strype-logo" :src="require('@/assets/images/Strype-logo-128-2x.png')"></a>
        </div>
        <Slide 
            :isOpen="showMenu"
            :burgerIcon="false"
            @openMenu="handleMenuOpen"
            @closeMenu="toggleMenuOnOff(null)"
            width="200"
        >
            <!-- download python/hex section -->
            /* IFTRUE_isMicrobit 
            <a v-if="showMenu" class="strype-menu-link strype-menu-item" @click="downloadHex();showMenu=false;" v-t="'appMenu.downloadHex'" />
            FITRUE_isMicrobit */
            <a v-if="showMenu" class="strype-menu-link strype-menu-item" @click="downloadPython();showMenu=false;" v-t="'appMenu.downloadPython'" />
            <div class="menu-separator-div"></div>
            <!-- load/save section -->
            <a :id="loadProjectLinkId" v-show="showMenu" class="strype-menu-link strype-menu-item" v-b-modal.load-strype-project-modal-dlg 
                @click="openLoadProjectModal">{{$t('appMenu.loadProject')}}<span class="strype-menu-kb-shortcut">{{loadProjectKBShortcut}}</span></a>
            <ModalDlg :dlgId="loadProjectModalDlgId" :autoFocusButton="'ok'">
                <div v-if="changesNotSavedOnLoad">
                    <span  v-t="'appMessage.editorConfirmChangeCode'" class="load-project-lost-span"/>
                    <br/>
                </div>
                <div>
                    <span v-t="'appMessage.loadToTarget'" class="load-save-label"/>
                    <b-button-group :ref="loadProjectTargetButtonGpId" size="sm">
                        <b-button :value="syncGDValue" :variant="(getSyncTargetStatus(syncGDValue)) ? 'primary' :'outline-primary'" class="toggle-button" @click="changeTempSyncTarget(syncGDValue)" @keydown.self="onTargetButtonKeyDown($event, false)">Google Drive</b-button>
                        <b-button :value="syncFSValue" :variant="(getSyncTargetStatus(syncFSValue)) ? 'primary' :'outline-primary'" class="toggle-button" @click="changeTempSyncTarget(syncFSValue)" @keydown.self="onTargetButtonKeyDown($event, false)" v-t="'appMessage.targetFS'"></b-button>
                    </b-button-group> 
                </div>
            </ModalDlg>
            <a :id="saveProjectLinkId" v-show="showMenu" class="strype-menu-link strype-menu-item" @click="handleSaveMenuClick" v-b-modal="saveLinkModalName">{{$t('appMenu.saveProject')}}<span class="strype-menu-kb-shortcut">{{saveProjectKBShortcut}}</span></a>
            <a v-if="showMenu" :class="{'strype-menu-link strype-menu-item': true, disabled: !isSynced }" v-b-modal.save-strype-project-modal-dlg v-t="'appMenu.saveAsProject'"/>
            <ModalDlg :dlgId="saveProjectModalDlgId" :autoFocusButton="'ok'">
                <label v-t="'appMessage.fileName'" class="load-save-label"/>
                <input :id="saveFileNameInputId" :placeholder="$t('defaultProjName')" type="text" ref="toFocus" autocomplete="off"/>
                <div>
                    <span v-t="'appMessage.saveToTarget'" class="load-save-label"/>
                    <b-button-group :ref="saveProjectTargetButtonGpId" size="sm">
                        <b-button :value="syncGDValue" :variant="(getSyncTargetStatus(syncGDValue)) ? 'primary' :'outline-primary'" class="toggle-button" @click="changeTempSyncTarget(syncGDValue, true)" @keydown.self="onTargetButtonKeyDown($event, true)">Google Drive</b-button>
                        <b-button :value="syncFSValue" :variant="(getSyncTargetStatus(syncFSValue)) ? 'primary' :'outline-primary'" class="toggle-button" @click="changeTempSyncTarget(syncFSValue, true)" @keydown.self="onTargetButtonKeyDown($event, true)" v-t="'appMessage.targetFS'"></b-button>
                    </b-button-group>
                </div>
                <br/>
                <div v-show="showGDSaveLocation">
                    <label v-t="'appMessage.gdriveLocation'" class="load-save-label"/>
                    <span class="load-save-label">{{currentDriveLocation}}</span>
                    <b-button v-t="'buttonLabel.saveDiffLocation'" variant="outline-primary" @click="onSaveDiffLocationClick" size="sm" />
                </div>
            </ModalDlg>
            <div class="menu-separator-div"></div>
            <!-- reset section -->
            <a v-if="showMenu" class="strype-menu-link strype-menu-item" @click="resetProject();showMenu=false;" v-t="'appMenu.resetProject'" :title="$t('appMenu.resetProjectTooltip')"/>
            <div class="menu-separator-div"></div>
            <!-- prefs (localisation) section -->
            <span v-t="'appMenu.prefs'"/>
            <div class="appMenu-prefs-div">
                <div>
                    <label for="appLangSelect" v-t="'appMenu.lang'"/>&nbsp;
                    <select name="lang" id="appLangSelect" v-model="appLang" @change="showMenu=false;" class="strype-menu-item" @click="setCurrentTabIndexFromEltId('appLangSelect')">
                        <option v-for="locale in locales" :value="locale.code" :key="locale.code">{{locale.name}}</option>
                    </select>
                </div> 
            </div>
            <div class="app-menu-footer">
                <a href="https://www.strype.org/history" target="_blank">{{$t('appMenu.version') + '&nbsp;' + getAppVersion}}</a>
                <span class="hidden">{{ getBuildHash }}</span>
            </div>
        </Slide>
        <div>
            <button
                :id="menuUID" 
                href="#" 
                tabindex="0" 
                class="show-menu-btn"
                @click="toggleMenuOnOff"
            >
            &#x2630;
            </button>    
        </div>
        <div>
            <input
                type="file" 
                :accept="acceptedInputFileFormat"
                ref="importFileInput" 
                @change="selectedFile" 
                class="editor-file-input"
            /> 
        </div>
        <div class="menu-icons-div">
            <div class="menu-icon-div">
                <input 
                    type="image" 
                    :src="undoImagePath"
                    :disabled="isUndoDisabled"
                    @click="performUndoRedo(true)"
                    class="menu-icon-entry"
                    :title="$i18n.t('contextMenu.undo')"
                />
            </div>
            <div class="menu-icon-div">   
                <input 
                    type="image" 
                    :src="redoImagePath"
                    :disabled="isRedoDisabled"
                    @click="performUndoRedo(false)"
                    class="menu-icon-entry"
                    :title="$i18n.t('contextMenu.redo')"
                />
            </div>
        </div>
        <div class="menu-separator-div"></div>

        <!-- Profile Section -->
        <div class="menu-icon-div">
            <input
                type="image"
                :src="require('@/assets/images/profile-icon.png')"
                @click="showProfile"
                class="menu-icon-entry"
                :title="$i18n.t('contextMenu.profile')"
            />
            <Profile v-if="isProfileVisible" @close="closeProfile" />
        </div>
        
        <!-- Badge Section -->
        <div class="menu-icon-div">
            <input
                type="image"
                :src="require('@/assets/images/badges-icon.png')"
                @click="showBadges"
                class="menu-icon-entry"
                :title="$i18n.t('contextMenu.profile')"
            />
            <Badges v-if="isBadgesVisible" @close="closeBadges" />
        </div>
        
        <div v-if="errorCount > 0" class="menu-icons-div">
            <i :class="{'fas fa-chevron-up menu-icon-entry menu-icon-centered-entry error-nav-enabled': true, 'error-nav-disabled': (currentErrorNavIndex <= 0 )}" @mousedown.self.stop.prevent="navigateToErrorRequested=true" @click="goToError($event, false)"/>
            <span class="menu-icon-entry menu-icon-centered-entry error-count-span" :title="$t('appMessage.editorErrors')" @mousedown.self.stop.prevent>{{errorCount}}</span>
            <i :class="{'fas fa-chevron-down menu-icon-entry menu-icon-centered-entry error-nav-enabled': true, 'error-nav-disabled': (currentErrorNavIndex >= errorCount - 1)}" @mousedown.self.stop.prevent="navigateToErrorRequested=true" @click="goToError($event, true)"/>
        </div>
    </div>
</template>

<script lang="ts">
//////////////////////
//      Imports     //
//////////////////////
import appPackageJson from "@/../package.json";
import App from "@/App.vue";
import Badges from "@/components/Badges.vue";
import GoogleDrive from "@/components/GoogleDrive.vue";
import ModalDlg from "@/components/ModalDlg.vue";
import Profile from "@/components/Profile.vue";
import { fileNameRegex, isMacOSPlatform, readFileContent, saveContentToFile, strypeFileExtension } from "@/helpers/common";
import { downloadHex, downloadPython } from "@/helpers/download";
import { CustomEventTypes, countEditorCodeErrors, fileImportSupportedFormats, getAppSimpleMsgDlgId, getEditorCodeErrorsHTMLElements, getEditorMenuUID, getFrameHeaderUID, getFrameUID, getGoogleDriveComponentRefId, getLabelSlotUID, getNearestErrorIndex, getSaveAsProjectModalDlg, isElementEditableLabelSlotInput, isElementUIDFrameHeader, isIdAFrameId, parseFrameHeaderUID, parseFrameUID, parseLabelSlotUID, setDocumentSelection } from "@/helpers/editor";
import { canBrowserOpenFilePicker, canBrowserSaveFilePicker, openFile, saveFile } from "@/helpers/filePicker";
import { getAboveFrameCaretPosition } from "@/helpers/storeMethods";
import { useStore } from "@/store/store";
import { AppEvent, CaretPosition, FormattedMessage, FormattedMessageArgKeyValuePlaceholders, Locale, MIMEDesc, MessageDefinitions, PythonExecRunningState, SaveRequestReason, SlotCoreInfos, SlotCursorInfos, SlotType, StrypeSyncTarget } from "@/types/types";
import { watch } from "@vue/composition-api";
import { BvModalEvent } from "bootstrap-vue";
import { cloneDeep } from "lodash";
import { mapStores } from "pinia";
import Vue from "vue";
import { Slide } from "vue-burger-menu";

//////////////////////
//     Component    //
//////////////////////
export default Vue.extend({
    name: "Menu",

    components: {
        Slide,
        GoogleDrive,
        ModalDlg,
        Profile,
        Badges,
    },

    data: function() {
        return {
            isProfileVisible: false,
            isBadgesVisible: false,
            showMenu: false,
            // This flag is used to know if we've added the tabindex value for the closing "button", and get the number of indexes
            retrievedTabindexesCount: -1,
            // The tabindex of the currently focused element of the menu
            currentTabindexValue: 0,
            // The temporary sync target that we use to handle the UI of the target selection
            tempSyncTarget: StrypeSyncTarget.none,
            // The current selection for the sync target (local to this component, not in the store)            
            localSyncTarget: StrypeSyncTarget.gd,
            showGDSaveLocation: false,
            // Flag to know if a request to change with a different folder location for Googe Drive has been requested
            saveAtOtherLocation: false,
            // Indicator of the error index that is currently being looked at (0-based index, and reset when errors are regenerated)
            currentErrorNavIndex: -1,
            // Flag indicating if navigating to an error has been triggered by the user: used to inhibit reactive changes
            navigateToErrorRequested: false,
            // Using the reference ID for knowing on what popup's button group we are on isnt reliable: there may be a delay between
            // the moment the dialog is closed and when we need to use the ID, so we should instead save an ID flag that is set to
            // the right button group value when the dialog is opened, and cleared when the dialog is explicitly closed by the user
            // or when the actions that follow the validation of the dialog (if any) are done.
            currentModalButtonGroupIDInAction: "",
        };
    },

    mounted() {
        // We register the keyboad event handling for the menu here
        window.addEventListener(
            "keydown",
            (event: KeyboardEvent) => {
                //handle the Ctrl/Meta + O for opening a project, and Ctrl/Meta + S command for saving the project
                if((event.key.toLowerCase() === "s" || event.key.toLowerCase() === "o") && (event.metaKey || event.ctrlKey) && (!event.shiftKey)){
                    event.stopImmediatePropagation();
                    event.preventDefault();
                    const linkIdToSimulate = (event.key.toLowerCase() === "s") ? this.saveProjectLinkId : this.loadProjectLinkId;
                    document.getElementById(linkIdToSimulate)?.click();
                }
            }
        );

        // The events from Bootstrap modal are registered to the root app element.
        this.$root.$on("bv::modal::show", this.onStrypeMenuShownModalDlg);
        this.$root.$on("bv::modal::hide", this.onStrypeMenuHideModalDlg);      
        
        // Event listener for saving project action completion
        this.$root.$on(CustomEventTypes.saveStrypeProjectDoneForLoad, this.loadProject);

        // Composition API allows watching an array of "sources" (cf https://vuejs.org/guide/essentials/watchers.html)
        // We need to update the current error Index when: the error count changes, navigation occurs (i.e. editing toggles, caret pos or focus pos changes)
        // but we bypass this when we manually change the error navigation index (i.e. when the user clicks on the navigation icons)
        watch([() => this.errorCount, () => this.appStore.isEditing, () => this.appStore.currentFrame.id, () => this.appStore.currentFrame.caretPosition, () => this.appStore.anchorSlotCursorInfos], () => {
            if(!this.navigateToErrorRequested){
                this.$nextTick(() => {
                    this.currentErrorNavIndex = (this.errorCount > 0) ? getNearestErrorIndex() : -1;
                });
            }
        });
    },

    beforeDestroy(){
        // Just in case, we remove the Bootstrap modal event handler from the root app 
        this.$root.$off("bv::modal::show", this.onStrypeMenuShownModalDlg);
        this.$root.$off("bv::modal::hide", this.onStrypeMenuHideModalDlg);

        // And for the saving project action completion too
        this.$root.$off(CustomEventTypes.saveStrypeProjectDoneForLoad, this.loadProject);
    },

    computed: {
        ...mapStores(useStore),
        
        menuUID(): string {
            return getEditorMenuUID();
        },

        locales(): Locale[] {
            // The locale codes are already parts of the i18n messages at this stage, so they are easy to retrieve.
            // We retrieve the corresponding locale's friendly name from i18n directly.
            // In the unlikely event a locale file does not provide the locale friendly name, we just use the code
            // as the name to avoid empty options in the select HTML tool.
            const locales: Locale[] = [];
            this.$i18n.availableLocales.forEach((i18nLocale) => {
                locales.push({code: i18nLocale, name: this.$i18n.getLocaleMessage(i18nLocale)["localeName"] as string??i18nLocale});
            });
            return locales;
        },

        googleDriveComponentId(): string {
            return getGoogleDriveComponentRefId();
        },

        isSynced(): boolean {
            return this.appStore.syncTarget != StrypeSyncTarget.none;
        },

        syncFSValue(): StrypeSyncTarget {
            return StrypeSyncTarget.fs;
        },

        syncGDValue(): StrypeSyncTarget {
            return StrypeSyncTarget.gd;
        },

        isSyncingToGoogleDrive(): boolean {
            return this.appStore.syncTarget == StrypeSyncTarget.gd;
        },

        currentDriveLocation(): string {
            const currentLocation = this.appStore.strypeProjectLocationAlias??"";
            return (currentLocation.length > 0) ? currentLocation : "Strype";
        },       

        loadProjectLinkId(): string {
            return "loadProjectLink";
        },

        loadProjectKBShortcut(): string {
            return `${(isMacOSPlatform()) ? "⌘" : (this.$t("contextMenu.ctrl")+"+")}O`;
        },
        
        loadProjectModalDlgId(): string {
            return "load-strype-project-modal-dlg";
        },

        loadProjectTargetButtonGpId(): string {
            return "loadProjectProjectSelect";
        },
        
        saveProjectLinkId(): string {
            return "saveStrypeProjLink";
        },

        saveProjectKBShortcut(): string {
            return `${(isMacOSPlatform()) ? "⌘" : (this.$t("contextMenu.ctrl")+"+")}S`;
        },

        saveProjectModalDlgId(): string {
            return getSaveAsProjectModalDlg();
        },

        saveLinkModalName(): string {
            return (!this.isSynced) ? this.saveProjectModalDlgId : "";
        },  

        saveProjectTargetButtonGpId(): string {
            return "saveProjectProjectSelect";
        },
        
        saveFileNameInputId(): string {
            return "saveStrypeFileNameInput";
        },

        changesNotSavedOnLoad(): boolean {
            // For Google Drive, we will attempt saving anyway when loading so we don't need to care.
            return this.appStore.syncTarget != StrypeSyncTarget.gd && (this.appStore.isProjectUnsaved ?? true);
        },

        isUndoDisabled(): boolean {
            return this.appStore.isUndoRedoEmpty("undo") || ((this.appStore.pythonExecRunningState ?? PythonExecRunningState.NotRunning) != PythonExecRunningState.NotRunning);
        },

        isRedoDisabled(): boolean {
            return this.appStore.isUndoRedoEmpty("redo") || ((this.appStore.pythonExecRunningState ?? PythonExecRunningState.NotRunning) != PythonExecRunningState.NotRunning);
        },

        undoImagePath(): string {
            return (this.isUndoDisabled) ? require("@/assets/images/disabledUndo.svg") : require("@/assets/images/undo.svg");
        },

        redoImagePath(): string {
            return (this.isRedoDisabled) ? require("@/assets/images/disabledRedo.svg") : require("@/assets/images/redo.svg");
        },

        errorCount(): number{
            return this.appStore.errorCount ?? countEditorCodeErrors();
        },

        acceptedInputFileFormat(): string {
            //The format needs to be as ".<ext1>, .<ext2>,..., .<extn>"
            return fileImportSupportedFormats.map((extension) => "." + extension).join(", ");
        },

        appLang: {
            get(): string {
                return this.appStore.appLang;
            },
            set(lang: string) {
                this.appStore.setAppLang(lang);
            }, 
        },

        getAppVersion(): string {
            return appPackageJson.version;
        },

        getBuildHash(): string {
            // The hash should exist as it is set when serving or compiling the server..
            // but to keep TS happy
            return process.env.VUE_APP_BUILD_GIT_HASH ?? "Strype-hash-unknown";
        },

        strypeProjMIMEDescArray(): MIMEDesc[]{
            return [
                {
                    description: this.$i18n.t("strypeFileDesc") as string,
                    accept: { "application/strype": ["."+strypeFileExtension] },
                },
            ];
        },

        pythonImportMIMEDescArray(): MIMEDesc[]{
            return [
                {
                    description: this.$i18n.t("pythonFileDesc") as string,
                    accept: { "text/x-python": [".py"] },
                },
            ];
        },
    },

    methods: {
        showProfile() {
            this.isProfileVisible = true;
        },
        closeProfile() {
            this.isProfileVisible = false;
        },

        showBadges() {
            this.isBadgesVisible = true;
        },
        closeBadges() {
            this.isBadgesVisible = false;
        },

        downloadHex() {
            downloadHex();
        },

        downloadPython() {
            downloadPython(); 
        },

        openLoadProjectModal(): void {
            // For a very strange reason, Bootstrap doesn't link the menu link to the dialog any longer 
            // after changing "v-if" to "v-show" on the link (to be able to have the keyboard shortcut working).
            // So we open it manually here...
            this.$root.$emit("bv::show::modal", this.loadProjectModalDlgId);
        },

        handleSaveMenuClick(): void {
            // Some problem, like for the load project menu, happens because of changing v-if to v-show (it works first time, but not second time).
            // So again, we handle things manually for the menu entry click
            if(this.isSynced){
                this.saveCurrentProject();
            }
            else{
                this.$root.$emit("bv::show::modal", this.saveProjectModalDlgId);
            }
        },

        changeTempSyncTarget(target: StrypeSyncTarget, isSaveAction?: boolean) {
            this.tempSyncTarget = target;
            if(isSaveAction){
                this.onSaveTargetChanged();
            }
        },

        getSyncTargetStatus(target: StrypeSyncTarget): boolean {
            // If there is no saved value in the store, the default value is Google Drive.
            // When the UI temporary value is set, it prevails (that's only temporary to allow the switch).
            if(this.tempSyncTarget != StrypeSyncTarget.none){
                return (this.tempSyncTarget == target);
            }

            if(this.appStore.syncTarget == StrypeSyncTarget.none || (this.$refs[this.googleDriveComponentId] as InstanceType<typeof GoogleDrive>)?.saveExistingGDProjectInfos.isCopyFileRequested){
                return target == StrypeSyncTarget.gd; 
            }
            return target == this.appStore.syncTarget;
        },

        getTargetSelectVal(): StrypeSyncTarget {
            // Get the target selected as the selected button from the button group; 
            // In the case we do not use the dialog popup ("Save" action when synced), then we keep current synced destination
            if(this.currentModalButtonGroupIDInAction && this.currentModalButtonGroupIDInAction.length == 0){
                return this.appStore.syncTarget;
            }
            // The new UI (changing combobox to buttons) means we can't directly check the HTML component to get the selection (unless using CSS).
            // Instead, we use the temp flag we've added in this Menu component, or the value for Google Drive (default) is no changed has been made.
            return (this.tempSyncTarget != StrypeSyncTarget.none) ? this.tempSyncTarget : StrypeSyncTarget.gd;
        },

        onSaveTargetChanged(){
            this.showGDSaveLocation = (this.getTargetSelectVal() == this.syncGDValue);
        },

        saveTargetChoice(target: StrypeSyncTarget){
            this.appStore.syncTarget = target;
            this.localSyncTarget = target;
            this.tempSyncTarget = target;
            // In case there is a Google Drive file ID or other Drive related info are handling when we are saving as a file on the FS, we make sure we remove that
            if(target == StrypeSyncTarget.fs){
                this.appStore.currentGoogleDriveSaveFileId = undefined;
                this.appStore.strypeProjectLocationAlias = "";
            }
        },

        saveCurrentProject(){
            // This method is called when sync is activated, and bypass the "save as" dialog we show to change the project name/location.
            // (note that the @click event in the template already checks if we are synced)
            this.onStrypeMenuHideModalDlg({trigger: "ok"} as BvModalEvent, this.saveProjectModalDlgId, this.appStore.projectName);
            this.showMenu = false;
        },

        onStrypeMenuShownModalDlg(event: BvModalEvent, dlgId: string) {
            // This method handles the workflow of the "save file" menu entry related dialog
            this.showMenu = false;
            if(dlgId == this.saveProjectModalDlgId){
                this.saveAtOtherLocation = false;
                // After the above event is emitted, the Strype menu is closed and the focus is given back to the editor.
                // We want to give the focus back to the modal dialog input field and set its value.
                // Maybe because of internal Bootstrap behaviour, can't give focus to the input right now or in next ticks
                // so we wait a bit to generate a focus/click in the input.
                // We also check which target is selected to update target-depend UI in the modal.
                setTimeout(() => {
                    this.onSaveTargetChanged();
                    const saveFileNameInputElement = (document.getElementById(this.saveFileNameInputId) as HTMLInputElement);
                    // If the save as is opened because the user requested to create a copy of a file name, we use the file stored in the save existing file infos
                    // because if there are consecutive attempts with different names (that all already exist) we want to show the last attempted name
                    saveFileNameInputElement.value = ((this.$refs[this.googleDriveComponentId] as InstanceType<typeof GoogleDrive>)?.saveExistingGDProjectInfos.isCopyFileRequested) 
                        ? (this.$refs[this.googleDriveComponentId] as InstanceType<typeof GoogleDrive>).saveExistingGDProjectInfos.existingFileName
                        : this.appStore.projectName;
                    saveFileNameInputElement.focus();
                    saveFileNameInputElement.click();
                }, 500);           
            }
        },

        onStrypeMenuHideModalDlg(event: BvModalEvent, dlgId: string, forcedProjectName?: string) {
            // This method handles the workflow after acting on any modal dialog of the Strype menu entries.
            // For most cases, if there is no confirmation, nothing special happens.
            // Only exception: if the user cancelled or proceeded to save a file copy following an clash with an existing project name on Google Drive,
            // we release the flag to indicate we were doing a file copy, to avoid messing up the targets in future calls of a load/save project
            if(dlgId == this.saveProjectModalDlgId){
                (this.$refs[this.googleDriveComponentId] as InstanceType<typeof GoogleDrive>).saveExistingGDProjectInfos.isCopyFileRequested = false;  
            }
            if(event.trigger == "cancel" || event.trigger == "esc"){
                // Reset the temporary sync file flag
                this.tempSyncTarget = this.appStore.syncTarget;
                this.currentModalButtonGroupIDInAction = "";

            }
            else if(event.trigger == "ok" || event.trigger == "event"){
                // Case of "load file"
                if(dlgId == this.loadProjectModalDlgId){
                    this.currentModalButtonGroupIDInAction = this.loadProjectTargetButtonGpId;
                    // We force saving the current project anyway just in case
                    this.$root.$emit(CustomEventTypes.requestEditorAutoSaveNow, SaveRequestReason.loadProject);
                    // The remaining parts of the loading process will be only done once saving is complete (cf loadProject())                    
                }
                // Case of "save file"
                else if(dlgId == this.saveProjectModalDlgId){
                    this.currentModalButtonGroupIDInAction = this.saveProjectTargetButtonGpId;
                    // User has been given a chance to give the file a specifc name,
                    // we check that the name doesn't contain illegal characters (we are a bit restricive here) for file saving
                    // DO NOT UPDATE THE CURRENT SYNC FLAG IN THE STATE - we only do that IF loading succeed (because it can be still cancelled or impossible to achieve)
                    let saveFileName = forcedProjectName || (document.getElementById(this.saveFileNameInputId) as HTMLInputElement).value.trim();
                    if(saveFileName.length == 0){
                        saveFileName = this.$i18n.t("defaultProjName") as string;
                    }
                    
                    const selectValue = this.getTargetSelectVal();
                    // Reset the temporary sync file flag
                    this.tempSyncTarget = this.appStore.syncTarget;
                    if(selectValue != StrypeSyncTarget.gd){
                        if(!canBrowserSaveFilePicker && saveFileName.trim().match(fileNameRegex) == null){
                            // Show an error message and do nothing special
                            this.appStore.simpleModalDlgMsg = this.$i18n.t("errorMessage.fileNameError") as string;
                            this.$root.$emit("bv::show::modal", getAppSimpleMsgDlgId());
                            this.currentModalButtonGroupIDInAction = "";
                            return;
                        }
                        // Save the JSON file of the state, we try to use the file picker if the browser allows it, otherwise, download to the default download repertory of the browser.
                        if(canBrowserSaveFilePicker){
                            saveFile(saveFileName, this.strypeProjMIMEDescArray, this.appStore.strypeProjectLocation, this.appStore.generateStateJSONStrWithCheckpoint(), (fileHandle: FileSystemFileHandle) => {
                                this.appStore.strypeProjectLocation = fileHandle;
                                this.appStore.projectName = fileHandle.name.substring(0, fileHandle.name.lastIndexOf("."));
                                this.saveTargetChoice(StrypeSyncTarget.fs);
                            });
                        }
                        else{
                            saveContentToFile(this.appStore.generateStateJSONStrWithCheckpoint(), saveFileName + "." + strypeFileExtension);
                            // We cannot retrieve the file name ultimately set by the user or the browser when it's being saved with a click,
                            // however we should still at least update the project name with what the user set in our own save as dialog
                            this.appStore.projectName = saveFileName.trim();
                            this.saveTargetChoice(StrypeSyncTarget.fs);
                        }
                    }
                    else {          
                        // If we were already syncing to Google Drive, we save the current file now.
                        if(this.isSyncingToGoogleDrive){
                            this.$root.$emit(CustomEventTypes.requestEditorAutoSaveNow, SaveRequestReason.autosave);
                        }
                        // When the project name is enforced, user as clicked on "save", so we don't need to trigger the usual saving mechanism to select the location/filename
                        if(forcedProjectName){
                            this.currentModalButtonGroupIDInAction = "";
                            return;
                        }
                        const saveReason = (this.saveAtOtherLocation) ? SaveRequestReason.saveProjectAtOtherLocation : SaveRequestReason.saveProjectAtLocation; 
                        (this.$refs[this.googleDriveComponentId] as InstanceType<typeof GoogleDrive>).saveFileName = saveFileName;
                        (this.$refs[this.googleDriveComponentId] as InstanceType<typeof GoogleDrive>).saveFile(saveReason);
                    }
                    this.currentModalButtonGroupIDInAction = "";
                }
            }
        },

        onSaveDiffLocationClick(){
            // When the button to save at a different location is called, we trigger the hiding of the modal dialog and and set the right flag about saving
            this.saveAtOtherLocation = true;
            this.$root.$emit("bv::hide::modal", this.saveProjectModalDlgId);
        },

        loadProject(){
            // Called once sanity save has been performed
            // If the user chose to sync on Google Drive, we should open the Drive loader. Otherwise, we open default file system.
            // DO NOT UPDATE THE CURRENT SYNC FLAG IN THE STATE - we only do that IF loading succeed (because it can be still cancelled or impossible to achieve)
            const selectValue = this.getTargetSelectVal();
            // Reset the temporary sync file flag
            this.tempSyncTarget = this.appStore.syncTarget;
            if(selectValue == StrypeSyncTarget.gd){
                (this.$refs[this.googleDriveComponentId] as InstanceType<typeof GoogleDrive>).loadFile();
            }
            else{               
                // And let the user choose a file
                if(canBrowserOpenFilePicker){
                    openFile([...this.strypeProjMIMEDescArray, ...this.pythonImportMIMEDescArray], this.appStore.strypeProjectLocation, (fileHandles: FileSystemFileHandle[]) => {
                        // We select 1 file so we can get the first element of the returned array
                        // We need to get the file content (hope for the best) and update the store
                        fileHandles[0].getFile().then((file: File) => {
                            const emitPayload: AppEvent = {requestAttention: true};
                            emitPayload.message = this.$i18n.t("appMessage.editorFileUpload").toString();
                            this.$emit("app-showprogress", emitPayload);
                            const reader = new FileReader();
                            reader.addEventListener("load", () => {
                                // name is not always available so we also check if content starts with a {,
                                // which it will do for spy files:
                                if (file.name.endsWith(".py") || !(reader.result as string).trimStart().startsWith("{")) {
                                    (this.$root.$children[0] as InstanceType<typeof App>).setStateFromPythonFile(reader.result as string, fileHandles[0].name, fileHandles[0]);
                                }
                                else {
                                    this.appStore.setStateFromJSONStr(
                                        {
                                            stateJSONStr: reader.result as string,
                                        }
                                    ).then(() => this.onFileLoaded(fileHandles[0].name, fileHandles[0]), () => {});
                                }
                                emitPayload.requestAttention=false;
                                this.$emit("app-showprogress", emitPayload);  
                            });
                            reader.readAsText(file);
                        });
                    });                        
                }
                else{
                    (this.$refs.importFileInput as HTMLInputElement).click();
                }
            }        
            this.currentModalButtonGroupIDInAction = "";
        },
        
        selectedFile() {
            const files = (this.$refs.importFileInput as HTMLInputElement).files;
            if(files){
                //before reading the file, we check the extension is supported for the import
                if(files[0].name.indexOf(".") > -1 && fileImportSupportedFormats.findIndex((extension) => extension === files[0].name.substring(files[0].name.lastIndexOf(".") + 1)) > -1) {
                    const emitPayload: AppEvent = {requestAttention: true};
                    emitPayload.message = this.$i18n.t("appMessage.editorFileUpload").toString();
                    this.$emit("app-showprogress", emitPayload);
                    // Store the file name in a variable to use it later in the callback, for some reason using files[0].name fails in Pinia, on Safari
                    const fileName = files[0].name;
                    readFileContent(files[0])
                        .then(
                            (content) => {
                                // name is not always available so we also check if content starts with a {,
                                // which it will do for spy files:
                                if (fileName.endsWith(".py") || !content.trimStart().startsWith("{")) {
                                    (this.$root.$children[0] as InstanceType<typeof App>).setStateFromPythonFile(content, fileName);
                                }
                                else {
                                    this.appStore.setStateFromJSONStr(
                                        {
                                            stateJSONStr: content,
                                        }
                                    ).then(() => this.onFileLoaded(fileName), () => {});
                                }
                                emitPayload.requestAttention=false;
                                this.$emit("app-showprogress", emitPayload);
                                
                            }, 
                            (reason) => this.appStore.setStateFromJSONStr( 
                                {
                                    stateJSONStr: "",
                                    errorReason: reason,
                                }
                            )
                        );  
                }
                else {
                    //alert the user this file format isn't supported (in case the file browser filter doesn't work on the browser)
                    const message = cloneDeep(MessageDefinitions.UploadEditorFileNotSupported);
                    const msgObj: FormattedMessage = (message.message as FormattedMessage);
                    msgObj.args[FormattedMessageArgKeyValuePlaceholders.list.key] = msgObj.args.list.replace(FormattedMessageArgKeyValuePlaceholders.list.placeholderName, this.acceptedInputFileFormat);

                    this.appStore.showMessage(message, null);
                }
                
                //reset the input file element value to empty (so further changes can be notified)
                (this.$refs.importFileInput as HTMLInputElement).value = "";
            }
        },

        onFileLoaded(fileName: string, fileLocation?: FileSystemFileHandle):void {
            this.saveTargetChoice(StrypeSyncTarget.fs);

            // Strip the extension from the file, if it was left in. Then we can update the file name and location (if avaiable)
            const noExtFileName = (fileName.includes(".")) ? fileName.substring(0, fileName.lastIndexOf(".")) : fileName;
            this.appStore.projectName = noExtFileName;
            if(fileLocation){
                this.appStore.strypeProjectLocation = fileLocation;
            }
        },

        resetProject(): void {
            //resetting the project means removing the WebStorage saved project and reloading the page
            //we emit an event to the App so that handlers are done properly

            this.$emit("app-reset-project");
            // localStorage.clear();
        },

        handleMenuOpen(){
            // As we are handling the tab indexing and navigation manually, we need also to add the tabindex attribute for the menu elements
            // (the close button and all bits in the menu). The button is treated separately, and all other elements are found based on the CSS class.
            (document.getElementsByClassName("bm-cross-button")[0] as HTMLSpanElement).tabIndex = 0;
            this.retrievedTabindexesCount = 1;
            document.querySelectorAll(".bm-menu .strype-menu-item").forEach((element, index) => {
                element.setAttribute("tabindex", (index + 1).toString());
                this.retrievedTabindexesCount++;
            });
        },

        toggleMenuOnOff(e: Event | null): void {
            const isMenuOpening = (e !== null);
            if(isMenuOpening) {
                //cf online issues about vue-burger-menu https://github.com/mbj36/vue-burger-menu/issues/33
                e.preventDefault();
                e.stopPropagation();
                this.currentTabindexValue = 0;
            }
            else {
                // Bring the focus back to the editor if the menu was opened (because this can be called when "esc" is hit elsewhere (burger menu behaviour))
                if(this.appStore.isAppMenuOpened){
                    document.getElementById(getFrameUID(this.appStore.currentFrame.id))?.focus();
                    this.appStore.ignoreKeyEvent = false;
                }
            }
            
            // We want to show the menu right border only whent the menu is opened (because otherwise it lays on the side of the page)
            // so we change the burger menu style programmatically here accordingly (only the size will change, the rest is in CSS, see .bm-menu)
            (document.querySelector(".bm-menu") as HTMLDivElement).style.borderRightWidth = (isMenuOpening) ? "1px" : "0px";

            this.appStore.isAppMenuOpened = isMenuOpening;
            this.showMenu = isMenuOpening;
        },

        handleKeyEvent(event: KeyboardEvent){
            // The menu must be visible (open) when handle events (we may have focus on the menu for example when click on "undo", but the menu is closed)
            if(this.showMenu){
                this.appStore.ignoreKeyEvent = true;

                if(event.type == "keyup" && event.key == "Enter"){
                // When the enter key is hit, we trigger the action bound to the click for the selected menu element
                // and we cancel the natural key up event so it does not get sent to the editor (otherwise, will add a blank frame)
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    event.stopPropagation();
                    (document.activeElement as HTMLElement).click();
                }


                if(event.type == "keydown" && ["Tab", "ArrowDown", "ArrowUp"].includes(event.key)){
                // When the tab key is hit, we handle the menu entry selection ourselves, because the default behaviour won't do it properly.
                // We loop through the available elements that can have focus. Note the modulo is done here based on this (https://web.archive.org/web/20090717035140if_/javascript.about.com/od/problemsolving/a/modulobug.htm)
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    event.stopPropagation();
                    const newTabindexValue = (this.currentTabindexValue +  ((event.shiftKey || event.key == "ArrowUp") ? -1 : 1));
                    this.currentTabindexValue = ((newTabindexValue % this.retrievedTabindexesCount) + this.retrievedTabindexesCount) % this.retrievedTabindexesCount;
                    (document.querySelector(".bm-menu  [tabindex='" + this.currentTabindexValue + "']") as HTMLElement).focus();
                }
            }
        },

        onTargetButtonKeyDown(event: KeyboardEvent, isSaveAction: boolean) {
            // Handle some basic keyboard logic for the target selection.
            // Space should allow a switch of target.
            if(event.key == " "){
                // We get the list of toggle button for the target (button)'s parent, and look for the next one (first if we're on the last)
                const buttonGroupElement = this.$refs[(isSaveAction) ? this.saveProjectTargetButtonGpId : this.loadProjectTargetButtonGpId];
                if(buttonGroupElement){
                    const switchButtons = (buttonGroupElement as Element).children;
                    if(switchButtons){
                        const currentSwitchPos = [...switchButtons].findIndex((switchEl) => switchEl.classList.contains("btn-primary"));
                        const newSwitchPos = (currentSwitchPos == switchButtons.length - 1) ? 0 : currentSwitchPos + 1;
                        (switchButtons.item(newSwitchPos) as HTMLButtonElement).focus();
                        (switchButtons.item(newSwitchPos) as HTMLButtonElement).click();
                        // Prevent the default behaviour
                        event.stopImmediatePropagation();
                        event.stopPropagation();
                        event.preventDefault();
                    }
                }

            }
        },

        performUndoRedo(isUndo: boolean): void {
            this.appStore.undoRedo(isUndo);
        },

        setCurrentTabIndexFromEltId(elementId: string): void {
            const el = document.getElementById(elementId);
            if(el){
                this.currentTabindexValue = el.tabIndex;
            }
        },
        
        goToError(event: MouseEvent | null, toNext: boolean){
            // Move to the next error (if toNext is true) or the previous error (if toNext is false) when the user clicks on the navigation icon.
            // If the icon is "disabled" we do nothing.
            // Note that a null event is set by a programmatical call of this method.
            if(event == null || !(event.target as HTMLElement).classList.contains("error-nav-disabled")){
                this.$nextTick(() => {
                    // If we are currently in a slot, we need to make sure that that slot gets notified of the caret lost
                    if(this.appStore.focusSlotCursorInfos){
                        document.getElementById(getLabelSlotUID(this.appStore.focusSlotCursorInfos.slotInfos))
                            ?.dispatchEvent(new CustomEvent(CustomEventTypes.editableSlotLostCaret));
                    }
                    
                    // Then we can focus the next error, note that depending on where we are in the editor (between frame with the blue cursor, or in a slot of a frame)
                    // we want to reach the nearest error. Therefore, to be able to navigate the error, we may have a current error index set to a MID WAY value (eg. 1.5 if we are between the 2nd and 3rd errors)
                    // so we check if the index is "full" (i.e. as an integer) or mid way (i.e. as a decimal value) and we move to the next error by incrementing by +/-1 or +/- 0.5 depending on the current index being "full" or not.
                    const isFullIndex = ((this.currentErrorNavIndex % 1) == 0);
                    this.currentErrorNavIndex += (((toNext) ? 1 : -1) / ((isFullIndex) ? 1 : 2));
                    const errorElement = getEditorCodeErrorsHTMLElements()[this.currentErrorNavIndex];
                    // The error can be in a slot or it can be for a whole frame. By convention, the location for a frame error is the caret above it.
                    // For errors in a slot: we focus on the slot of the error -- if the erroneous HTML is a slot, we just give it focus. If the error is at the frame scope
                    // we put the focus in the first slot that is editable.
                    if(isIdAFrameId(errorElement.id)){
                        // Error on a whole frame - the error message will be on the header so we need to focus it to trigger the popup.
                        if(this.appStore.isEditing) {
                            this.appStore.isEditing = false;
                            this.appStore.setSlotTextCursors(undefined, undefined);
                            document.getSelection()?.removeAllRanges(); 
                        }
                        const caretPosAboveFrame = getAboveFrameCaretPosition(parseFrameUID(errorElement.id));
                        this.appStore.setCurrentFrame({id: caretPosAboveFrame.frameId, caretPosition: caretPosAboveFrame.caretPosition as CaretPosition});
                        document.getElementById(getFrameHeaderUID(parseFrameUID(errorElement.id)))?.focus();
                    }
                    else{
                        // Error on a slot
                        const errorSlotInfos: SlotCoreInfos = (isElementEditableLabelSlotInput(errorElement))
                            ? parseLabelSlotUID(errorElement.id)
                            : {frameId: parseFrameHeaderUID(errorElement.id), labelSlotsIndex: 0, slotId: "0", slotType: SlotType.code};
                        const errorSlotCursorInfos: SlotCursorInfos = {slotInfos: errorSlotInfos, cursorPos: 0}; 
                        this.appStore.setSlotTextCursors(errorSlotCursorInfos, errorSlotCursorInfos);
                        setDocumentSelection(errorSlotCursorInfos, errorSlotCursorInfos);  
                        // It's necessary to programmatically click the slot we gave focus to, so we can toggle the edition mode event chain
                        if(isElementUIDFrameHeader(errorElement.id)){
                            document.getElementById(getLabelSlotUID(errorSlotInfos))?.click();
                        }
                        else{
                            errorElement.click();
                        }
                    }
                    this.navigateToErrorRequested = false;
                });
            }     
        },
    },
});
</script>

<style lang="scss">
.menu-icon-div {
    width: 100%;
    height: 24px;
    margin-bottom: 10px;
    margin-top: 15px;
}
.top-left-strype-logo {
    margin-top: 10px !important;
    margin-bottom: 10px !important;
}

.editor-file-input {
    display: none;
} 

.show-menu-btn {
    border: none;
    outline:none;
    background-color: transparent;
    font-size: 200%;
    min-width: 45px;
    color: #6c757d;
    border-radius: 50%;
}

.strype-menu-link {
    margin-left: 5%;
    width: 100%;
    outline: none;
    border: $strype-menu-entry-border;
    position: relative;
}

.strype-menu-link.disabled{
    color: #c5c4c1;
    cursor: default;
}

.strype-menu-kb-shortcut {
    font-size: smaller;
    text-align: right;
    width: 100%;
    position:absolute;
    top: 50%;
    transform: translate(-25px, -50%);
}

.strype-menu-item {
    outline: none;
}

.strype-menu-item:focus {
    border: $strype-menu-entry-focus-border;
}

.menu-separator-div {
    border-top: 1px solid #c5c4c1 !important;
    padding:0px !important;

}

.appMenu-prefs-div {
    margin-left: 5%;
    color: black;
}

.menu-icons-div {
    margin-top: 20px;
}

.menu-icon-entry, .top-left-strype-logo {
    width: 22px;
    height: 22px;
    display: block;
    margin: auto;
    font-size: 14px;
}

.menu-icon-centered-entry {
    text-align: center;
    height: auto;
}

.load-project-lost-span{
    display: block;
}

.load-save-label {
    margin-right: 5px;
}

.error-nav-enabled {
    color: #d66;
    cursor: pointer;
}

.error-nav-disabled {
    color: #6c757d;
    cursor: default;
}

.error-count-span {
    color: white;
    background-color: #d66;
    border-radius: 50%;
}

.toggle-button {
    outline: none;
}


.toggle-button.btn-outline-primary:hover {
    // Overwrite the default Bootstrap scheme
    background-color: #d1e5fb !important;
    color: #007bff !important;
}

.toggle-button.btn-primary:hover {
    // Overwrite the default Bootstrap scheme
    background-color: #007bff !important;
    color: white !important;
}

.toggle-button:focus {
    box-shadow: none !important;
    border: 1px solid black !important;
}

.toggle-button.btn-primary:focus {
    background-color: #007bff !important;   
}

.app-menu-footer {
    bottom: 0px;
    font-size: smaller;
    color: #3467FE;
    position: absolute;
    bottom: 2px;
}

.app-menu-footer:hover {
    color: #2648af;
}

//the following classes are overriding the default CSS for vue-burger-menu
.bm-cross-button {
    outline: none;
    border: $strype-menu-entry-border;
}

.bm-cross-button:focus{
    border: $strype-menu-entry-focus-border;
}

.bm-cross {
    background: #6c757d !important;
    top: 3px;
    left: 9px;
    width: 2px !important; // default is 3px, but to center the crosss in its container, better have this value
}

.bm-menu {
    background-color: #e2e7e0 !important;
    padding-top: 25px !important;
    // The border is partly designed by CSS, the width is dynamically assigned according to the menu state, see toggleMenuOnOff()
    border-right: black 0px solid;   
}

.bm-item-list {
    color: #6d6c6a !important;
    margin-left: 0% !important;
    font-size: inherit !important;
}

.bm-item-list > :not(.menu-separator-div):not(.google-drive-container) {
    display: flex !important;
    text-decoration: none !important;
    padding: $strype-menu-entry-padding !important;
    width: $strype-menu-entry-width;
}

// This essentially acts as the class for the keyboard shortcut spans (for the properties that are ovewritten, other bits are in .strype-menu-kb-shortcut)
.bm-item-list > * > span {
    color: #817e7c !important;
    font-weight: 400 !important;
}

.bm-item-list > hr {
    margin: 0;
    height: 1px !important;
}

/* Sidebar styling */
.sidebar {
    position: fixed;
    top: 0;
    left: 60px; /* Change to left: 0 for a left-side sidebar */
    width: 250px;
    height: 100%;
    background-color: #333;
    color: white;
    padding: 20px;
    z-index: 1000; /* Below the button */
    box-shadow: -2px 0 5px rgba(0, 0, 0, 0.5);
    transform: translateX(0); /* Slide in from the right */
    transition: transform 0.3s ease; /* Smooth transition */
}

/* Sidebar header */
.sidebar h3 {
    margin-bottom: 20px;
}

/* Sidebar list */
.sidebar ul {
    list-style: none;
    padding: 0;
}

/* Sidebar list item */
.sidebar li {
    padding: 10px;
    margin-bottom: 10px;
    background-color: #444;
    border-radius: 5px;
    cursor: pointer;
    text-align: center;
}

.sidebar li:hover {
    background-color: #555;
}

</style>
