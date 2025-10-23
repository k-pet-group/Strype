<template>
    <!-- keep the tabindex attribute, it is necessary to handle focus properly -->
    <div @keydown="handleKeyEvent" @keyup="handleKeyEvent" tabindex="-1" @mousedown.self.stop.prevent>
        <CloudDriveHandler :ref="cloudDriveHandlerComponentId" :openSharedProjectFileId="openSharedProjectId" />
        <div>
            <a href="https://strype.org/" :title="$i18n.t('appMenu.homepage')"><img class="top-left-strype-logo" :src="require('@/assets/images/Strype-logo-128-2x.png')"></a>
        </div>
        <Slide 
            :isOpen="showMenu"
            :burgerIcon="false"
            @openMenu="handleMenuOpen"
            @closeMenu="toggleMenuOnOff(null)"
            width="195"
        > 
            <!-- category main acions-->
            <!-- new project-->
            <a :id="newProjectLinkId" v-if="showMenu" :class="'strype-menu-link '+ scssVars.strypeMenuItemClassName" @click="resetProject();showMenu=false;" v-t="'appMenu.resetProject'" :title="$t('appMenu.resetProjectTooltip')"/>
            <!-- open project -->
            <a :id="loadProjectLinkId" v-show="showMenu" :class="'strype-menu-link ' + scssVars.strypeMenuItemClassName" @click="openLoadProjectModal">{{$t('appMenu.loadProject')}}<span class="strype-menu-kb-shortcut">{{loadProjectKBShortcut}}</span></a>
            <ModalDlg :dlgId="loadProjectModalDlgId" showCloseBtn hideDlgBtns >
                <div class="project-target-popup-content-container">
                    <span v-t="'appMessage.loadToTarget'" class="load-save-label"/>
                    <div :ref="loadProjectTargetButtonGpId" class="project-target-button-container">
                        <div id="loadFromGDStrypeButton" :class="scssVars.projectTargetButtonClassName + ' load-dlg'" tabindex="0"  @click="changeTempSyncTarget(syncGDValue)" @keydown.self="onTargetButtonKeyDown($event, false)"
                            @mouseenter="changeTargetFocusOnMouseOver">
                            <img :src="require('@/assets/images/logoGDrive.png')" alt="Google Drive"/> 
                            <span>Google Drive</span>
                        </div>
                        <div id="loadFromODStrypeButton" :class="scssVars.projectTargetButtonClassName + ' load-dlg'" tabindex="0"  @click="changeTempSyncTarget(syncODValue)" @keydown.self="onTargetButtonKeyDown($event, false)"
                            @mouseenter="changeTargetFocusOnMouseOver">
                            <img :src="require('@/assets/images/logoOneDrive.svg')" alt="OneDrive"/> 
                            <span>OneDrive</span>
                        </div>
                        <div :id="loadFromFSStrypeButtonId" :class="scssVars.projectTargetButtonClassName + ' load-dlg'" tabindex="0"  @click="changeTempSyncTarget(syncFSValue)" @keydown.self="onTargetButtonKeyDown($event, false)"
                            @mouseenter="changeTargetFocusOnMouseOver">
                            <img :src="require('@/assets/images/FSicon.png')" :alt="$t('appMessage.targetFS')"/> 
                            <span v-t="'appMessage.targetFS'"></span>
                        </div>
                    </div>
                </div>
            </ModalDlg>
            <!-- save project -->
            <a :id="saveProjectLinkId" v-show="showMenu" :class="'strype-menu-link ' + scssVars.strypeMenuItemClassName" @click="handleSaveMenuClick">{{$t('appMenu.saveProject')}}<span class="strype-menu-kb-shortcut">{{saveProjectKBShortcut}}</span></a>
            <a v-if="showMenu" :class="{['strype-menu-link ' + scssVars.strypeMenuItemClassName]: true, disabled: !isSynced }" @click="handleSaveAsMenuClick" v-b-modal.save-strype-project-modal-dlg v-t="'appMenu.saveAsProject'"/>
            <ModalDlg :dlgId="saveProjectModalDlgId" size="lg" :autoFocusButton="'ok'">
                <div class="save-project-modal-dlg-container">
                    <div class="row">
                        <label v-t="'appMessage.fileName'" class="load-save-label cell"/>
                        <input :id="saveFileNameInputId" :placeholder="$t('defaultProjName')" type="text" ref="toFocus" autocomplete="off" class="cell" />
                    </div>
                    <div class="row">
                        <span v-t="'appMessage.saveToTarget'" class="load-save-label cell" />
                        <div class="cell">
                            <div :ref="saveProjectTargetButtonGpId" class="project-target-button-container">
                                <div id="saveToGDStrypeButton" tabindex="0"  @click="changeTempSyncTarget(syncGDValue, true)" @keydown.self="onTargetButtonKeyDown($event, true)"
                                    :class="{[scssVars.projectTargetButtonClassName + ' save-dlg']: true, saveTargetSelected: tempSyncTarget == syncGDValue || tempSyncTarget == noSyncTargetValue}">
                                    <img :src="require('@/assets/images/logoGDrive.png')" alt="Google Drive"/> 
                                    <span>Google Drive</span>
                                </div>
                                <div id="saveToODStrypeButton" tabindex="0"  @click="changeTempSyncTarget(syncODValue, true)" @keydown.self="onTargetButtonKeyDown($event, true)"
                                    :class="{[scssVars.projectTargetButtonClassName + ' save-dlg']: true, saveTargetSelected: tempSyncTarget == syncODValue}">
                                    <img :src="require('@/assets/images/logoOneDrive.svg')" alt="OneDrive"/> 
                                    <span>OneDrive</span>
                                </div>
                                <div :id="saveToFSStrypeButtonId" tabindex="0"  @click="changeTempSyncTarget(syncFSValue, true)" @keydown.self="onTargetButtonKeyDown($event, true)"
                                    :class="{[scssVars.projectTargetButtonClassName + ' save-dlg']: true, saveTargetSelected: tempSyncTarget == syncFSValue}">
                                    <img :src="require('@/assets/images/FSicon.png')" :alt="$t('appMessage.targetFS')"/> 
                                    <span v-t="'appMessage.targetFS'"></span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="row">
                        <label v-show="showCloudSaveLocation" v-t="'appMessage.cloudLocation'" class="load-save-label cell"/>
                        <div v-show="showCloudSaveLocation" class="cell">                        
                            <span class="load-save-label">{{currentDriveLocation}}</span>
                            <b-button v-t="'buttonLabel.saveDiffLocation'" variant="outline-primary" @click="onSaveDiffLocationClick" size="sm" />
                        </div>
                    </div>
                </div>
            </ModalDlg>
            <ModalDlg :dlgId="saveOnLoadModalDlgId" :autoFocusButton="'ok'" :okCustomTitle="$t('buttonLabel.saveChanges')" :cancelCustomTitle="$t('buttonLabel.discardChanges')">
                <div>
                    <span  v-t="'appMessage.editorAskSaveChangedCode'" class="load-project-lost-span"/>
                    <br/>
                </div>
            </ModalDlg>            
            <!-- new section -->
            <div class="menu-separator-div"></div>           
            <a v-show="showMenu" :class="'strype-menu-link ' + scssVars.strypeMenuItemClassName" @click="openLoadDemoProjectModal">{{$t('appMenu.loadDemoProject')}}</a>
            <OpenDemoDlg ref="openDemoDlg" :dlg-id="loadDemoProjectModalDlgId"/>
            /* IFTRUE_isPython
            <a v-show="showMenu" :class="'strype-menu-link ' + scssVars.strypeMenuItemClassName" @click="openLibraryDoc">{{$t('appMenu.apiDocumentation')}}</a>
               FITRUE_isPython */
            <!-- category: export -->
            <!-- share project -->
            <a :id="shareProjectLinkId" v-show="showMenu" :class="{['strype-menu-link ' + scssVars.strypeMenuItemClassName]: true, disabled: !canShareProject}" :title="$t((isSyncingToCloud)?'':'appMenu.needSaveShareProj')" @click="onShareProjectClick">{{$t('appMenu.shareProject')}}<span class="strype-menu-kb-shortcut">{{shareProjectKBShortcut}}</span></a>
            <ModalDlg :dlgId="shareProjectModalDlgId" :okCustomTitle="$t('buttonLabel.copyLink')" :okDisabled="isSharingLinkGenerationPending" :useLoadingOK="isSharingLinkGenerationPending" 
                :dlgTitle="$t('appMessage.createShareProjectLink')" :elementToFocusId="shareCloudDriveProjectPublicRadioBtnId">
                        <div>
                            <span class="share-mode-buttons-container-title">{{$i18n.t('appMessage.shareProjectModeLabel')}}</span>
                            <div class="share-mode-buttons-container">
                                <div class="share-mode-button-group">
                                    <input type="radio" :id="shareCloudDriveProjectPublicRadioBtnId" name="shareCloudDriveModeRadioGroup"
                                        v-model="shareProjectMode" :value="shareProjectPublicModeValue" />
                                    <div>
                                        <label :for="shareCloudDriveProjectPublicRadioBtnId" >{{$i18n.t("appMessage.shareProjectPublicMode")}}</label>
                                        <span>{{$i18n.t("appMessage.shareProjectPublicModeDetails") + ((isSharingPublicNotDirectDownload) ? " " + shareProjectPublicCloudDriveNotDirectDownloadLabel : "")}}</span>
                                    </div>
                                </div>
                                <div class="share-mode-button-group">
                                    <input type="radio" id="shareCloudDriveProjectWithGDRadioBtn" name="shareCloudDriveModeRadioGroup" 
                                        v-model="shareProjectMode" :value="shareProjectWithinCloudDriveModeValue" />
                                    <div>
                                        <label for="shareCloudDriveProjectWithGDRadioBtn">{{shareProjectWithinCloudDriveModeLabel}}</label>
                                        <span>{{shareProjectWithinCloudDriveModeDetailsLabel}}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ModalDlg>
            <!-- download python/hex project -->
            /* IFTRUE_isMicrobit 
            <a v-if="showMenu" :class="'strype-menu-link ' + scssVars.strypeMenuItemClassName" @click="downloadHex();showMenu=false;" v-t="'appMenu.downloadHex'" />
            FITRUE_isMicrobit */
            <a v-if="showMenu" :class="'strype-menu-link ' + scssVars.strypeMenuItemClassName" @click="downloadPython();showMenu=false;" v-t="'appMenu.downloadPython'" />
            <!-- BLANK SPACE IN MENU TO FOOTER -->
            <div class="flex-padding" />
            <!-- category: preferences / settings -->
            <!-- Localisation -->
            <div class="appMenu-prefs-div">
                <div>
                    <label :for="appLangSelectId" v-t="'appMenu.lang'"/>&nbsp;
                    <select name="lang" :id="appLangSelectId" v-model="appLang" @change="showMenu=false;" :class="scssVars.strypeMenuItemClassName" @click="setCurrentTabIndexFromEltId(appLangSelectId)">
                        <option v-for="locale in locales" :value="locale.code" :key="locale.code">{{locale.name}}</option>
                    </select>
                </div> 
            </div>
            <!-- new section -->
            <div class="menu-separator-div"></div>
            <div></div>
            <div class="app-menu-footer">             
                <!-- version indicator-->
                <a href="https://www.strype.org/history" target="_blank">{{$t('appMenu.version') + '&nbsp;' + getAppVersion +' (' + getLocaleBuildDate +')'}}</a>
                <span class="hidden">{{ getBuildHash }}</span>
                <!-- link to privacy policy-->
                <a href="https://www.strype.org/policy/" target="_blank">{{ $t("appMenu.policy") }}</a>
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
                :id="importFileInputId"
                style="display: none;"
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
import Vue from "vue";
import { useStore, settingsStore } from "@/store/store";
import {saveContentToFile, readFileContent, fileNameRegex, strypeFileExtension, isMacOSPlatform} from "@/helpers/common";
import { AppEvent, CaretPosition, FormattedMessage, FormattedMessageArgKeyValuePlaceholders, Locale, MessageDefinitions, MIMEDesc, PythonExecRunningState, SaveRequestReason, ShareProjectMode, SlotCoreInfos, SlotCursorInfos, SlotType, StrypeSyncTarget } from "@/types/types";
import {countEditorCodeErrors, CustomEventTypes, fileImportSupportedFormats, getAppLangSelectId, getAppSimpleMsgDlgId, getEditorCodeErrorsHTMLElements, getEditorMenuUID, getFrameHeaderUID, getFrameUID, getCloudDriveHandlerComponentRefId, getLabelSlotUID, getLoadFromFSStrypeButtonId, getLoadProjectLinkId, getNearestErrorIndex, getSaveAsProjectModalDlg, getSaveStrypeProjectToFSButtonId, getStrypeSaveProjectNameInputId, isElementEditableLabelSlotInput, isElementUIDFrameHeader, isIdAFrameId, parseFrameHeaderUID, parseFrameUID, parseLabelSlotUID, setDocumentSelection, sharedStrypeProjectIdKey, sharedStrypeProjectTargetKey, getSaveProjectLinkId, getNewProjectLinkId, getImportFileInputId} from "@/helpers/editor";
import { Slide } from "vue-burger-menu";
import { mapStores } from "pinia";
import CloudDriveHandler from "@/components/CloudDriveHandler.vue";
import { downloadHex, downloadPython } from "@/helpers/download";
import { canBrowserOpenFilePicker, canBrowserSaveFilePicker, openFile, saveFile } from "@/helpers/filePicker";
import { generateSPYFileContent } from "@/helpers/load-save";
import ModalDlg from "@/components/ModalDlg.vue";
import { BvModalEvent } from "bootstrap-vue";
import { watch } from "@vue/composition-api";
import { cloneDeep } from "lodash";
import App from "@/App.vue";
import appPackageJson from "@/../package.json";
import { getAboveFrameCaretPosition, getFrameSectionIdFromFrameId } from "@/helpers/storeMethods";
import { getLocaleBuildDate } from "@/main";
import scssVars from "@/assets/style/_export.module.scss";
import OpenDemoDlg from "@/components/OpenDemoDlg.vue";
import { CloudFileSharingStatus, isSyncTargetCloudDrive } from "@/types/cloud-drive-types";

//////////////////////
//     Component    //
//////////////////////
const defaultSharingProjectMode = ShareProjectMode.public;
export default Vue.extend({
    name: "Menu",

    components: {
        OpenDemoDlg,
        Slide,
        CloudDriveHandler,
        ModalDlg,
    },

    data: function() {
        return {
            scssVars, // just to be able to use in template
            showMenu: false,
            // This flag is used to know if we've added the tabindex value for the closing "button", and get the number of indexes
            retrievedTabindexesCount: -1,
            // The tabindex of the currently focused element of the menu
            currentTabindexValue: 0,
            // The temporary sync target that we use to handle the UI of the target selection
            tempSyncTarget: StrypeSyncTarget.none,
            // The current selection for the sync target (local to this component, not in the store)            
            localSyncTarget: StrypeSyncTarget.gd,
            showCloudSaveLocation: false,
            // Flag to know if a request to change with a different folder location for Googe Drive has been requested
            saveAtOtherLocation: false,
            // Flag to know if a "save as" request has been made
            requestSaveAs: false,
            // Indicator of the error index that is currently being looked at (0-based index, and reset when errors are regenerated)
            currentErrorNavIndex: -1,
            // Flag indicating if navigating to an error has been triggered by the user: used to inhibit reactive changes
            navigateToErrorRequested: false,
            // Using the reference ID for knowing on what popup's button group we are on isnt reliable: there may be a delay between
            // the moment the dialog is closed and when we need to use the ID, so we should instead save an ID flag that is set to
            // the right button group value when the dialog is opened, and cleared when the dialog is explicitly closed by the user
            // or when the actions that follow the validation of the dialog (if any) are done.
            currentModalButtonGroupIDInAction: "",
            // Request opening a project flag we need to use when a user wanted to open another project from a modified project
            // that wasn't initially a FS or GD project (because at this stage we can't know what the target will be...)
            requestOpenProjectLater: false,
            shareProjectMode: defaultSharingProjectMode, // flag for the sharing mode
            publicModeProjectSharingLink: "", // the project sharing link (for the public mode) to copy to the clipboard, only valid when the share modal is active!
            shareProjectInitialCall: true, // this flag is essential to allow a delay on the first link generation when the popup is opened (see getSharingLink())
            // Flags for opening a shared project: the ID (main flag) and the target (for the moment it's only Google Drive...)
            openSharedProjectId: "",
            openSharedProjectTarget: StrypeSyncTarget.none,
            showDialogAfterSave: "", // The ID of the dialog to show after save-before-load
        };
    },

    mounted() {
        // We register the keyboad event handling for the menu here
        window.addEventListener(
            "keydown",
            (event: KeyboardEvent) => {
                // Loading/saving project shortcuts
                if((event.key.toLowerCase() === "s" || event.key.toLowerCase() === "o") && (event.metaKey || event.ctrlKey) && (!event.shiftKey)){
                    event.stopImmediatePropagation();
                    event.preventDefault();
                    const linkIdToSimulate = (event.key.toLowerCase() === "s") ? this.saveProjectLinkId : this.loadProjectLinkId;
                    document.getElementById(linkIdToSimulate)?.click();
                }
                // Sharing project shorcut
                else if(event.key.toLowerCase() === "l" && (event.metaKey || event.ctrlKey) && event.shiftKey) {
                    document.getElementById(this.shareProjectLinkId)?.click();
                    // Safari is using this shortcut, so we consume it!
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    event.stopPropagation();
                }
            }
        );

        // The events from Bootstrap modal are registered to the root app element.
        this.$root.$on("bv::modal::show", this.onStrypeMenuShownModalDlg);
        this.$root.$on("bv::modal::hide", this.onStrypeMenuHideModalDlg);      
        
        // Event listener for saving project action completion
        this.$root.$on(CustomEventTypes.saveStrypeProjectDoneForLoad, this.openLoadProjectDlgAfterSaved);

        // Event listener for the Cloud Drive component to listen the attempt to open a shared project is done (successfully or not)
        (this.$refs[this.cloudDriveHandlerComponentId] as InstanceType<typeof CloudDriveHandler>).$on(CustomEventTypes.openSharedFileDone, () => {
            this.openSharedProjectId = "";
            this.openSharedProjectTarget = StrypeSyncTarget.none;
        });

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
        this.$root.$off(CustomEventTypes.saveStrypeProjectDoneForLoad, this.openLoadProjectDlgAfterSaved);
    },

    computed: {
        ...mapStores(useStore, settingsStore),
        
        menuUID(): string {
            return getEditorMenuUID();
        },

        appLangSelectId(): string {
            return getAppLangSelectId();
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

        loadFromFSStrypeButtonId(): string {
            return getLoadFromFSStrypeButtonId();
        },

        cloudDriveHandlerComponentId(): string {
            return getCloudDriveHandlerComponentRefId();
        },

        isSynced(): boolean {
            return this.appStore.syncTarget != StrypeSyncTarget.none;
        },

        noSyncTargetValue(): StrypeSyncTarget {
            return StrypeSyncTarget.none;
        },

        syncFSValue(): StrypeSyncTarget {
            return StrypeSyncTarget.fs;
        },

        syncGDValue(): StrypeSyncTarget {
            return StrypeSyncTarget.gd;
        },

        syncODValue(): StrypeSyncTarget {
            return StrypeSyncTarget.od;
        },

        isSyncingToCloud(): boolean {
            return isSyncTargetCloudDrive(this.appStore.syncTarget);
        },

        currentDriveLocation(): string {
            // The current Drive location (folder of a project) depends on whether we are already
            // "connected" to a Drive: if there is no Drive or if the user selects a target that is
            // NOT the current target, then the default destination is "Strype". 
            return(this.appStore.strypeProjectLocationAlias && (this.appStore.syncTarget == this.tempSyncTarget))? this.appStore.strypeProjectLocationAlias : "Strype";
        },

        newProjectLinkId(): string {
            return getNewProjectLinkId();
        },

        loadProjectLinkId(): string {
            return getLoadProjectLinkId();
        },

        loadProjectKBShortcut(): string {
            return `${(isMacOSPlatform()) ? "⌘" : (this.$t("contextMenu.ctrl")+"+")}O`;
        },
        
        loadProjectModalDlgId(): string {
            return "load-strype-project-modal-dlg";
        },

        loadDemoProjectModalDlgId(): string {
            return "load-strype-demo-project-modal-dlg";
        },

        loadProjectTargetButtonGpId(): string {
            return "loadProjectProjectSelect";
        },

        saveOnLoadModalDlgId(): string {
            return "save-on-load-project-modal-dlg";
        },
        
        saveProjectLinkId(): string {
            return getSaveProjectLinkId();
        },
        
        importFileInputId(): string {
            return getImportFileInputId();
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

        saveToFSStrypeButtonId(): string {
            return getSaveStrypeProjectToFSButtonId();
        },
        
        saveFileNameInputId(): string {
            return getStrypeSaveProjectNameInputId();
        },

        shareProjectLinkId(): string {
            return "shareStrypeProjLink";
        },

        shareProjectKBShortcut(): string {
            return `${(isMacOSPlatform()) ? "⌘" : (this.$t("contextMenu.ctrl")+"+")}⇧+L`;
        },

        shareProjectModalDlgId(): string {
            return "shareProjectModalDlg";
        },

        shareCloudDriveProjectPublicRadioBtnId(): string {
            return "shareCloudDriveProjectPublicRadioBtnId";
        },

        canShareProject(): boolean {
            return isSyncTargetCloudDrive(this.appStore.syncTarget) && !this.appStore.isEditorContentModified;
        },

        isSharingPublicNotDirectDownload(): boolean {
            return this.appStore.syncTarget == StrypeSyncTarget.od;
        },

        shareProjectPublicModeValue() {
            return ShareProjectMode.public;
        },

        shareProjectWithinCloudDriveModeValue() {
            return ShareProjectMode.withinCloudDrive;
        }, 
        
        shareProjectWithinCloudDriveModeLabel(): string {
            if(this.isSyncingToCloud){
                return this.$i18n.t("appMessage.shareProjectWithinCloudDriveMode", {drivename: (this.$refs[this.cloudDriveHandlerComponentId] as InstanceType<typeof CloudDriveHandler>).getDriveName()}) as string;
            }
            else{
                return "";
            }
        },

        shareProjectWithinCloudDriveModeDetailsLabel(): string {
            if(this.isSyncingToCloud){
                return this.$i18n.t("appMessage.shareProjectWithinCloudDriveModeDetails", {drivename: (this.$refs[this.cloudDriveHandlerComponentId] as InstanceType<typeof CloudDriveHandler>).getDriveName()}) as string;
            }
            else{
                return "";
            }
        },

        shareProjectPublicCloudDriveNotDirectDownloadLabel(): string {
            if(this.isSyncingToCloud){
                return this.$i18n.t("appMessage.shareProjectPublicModeDetailsNoDirectDownload", {drivename: (this.$refs[this.cloudDriveHandlerComponentId] as InstanceType<typeof CloudDriveHandler>).getDriveName()}) as string;
            }
            else{
                return "";
            }
        },
        
        isSharingLinkGenerationPending(): boolean {
            // The link generation is pending (i.e. the link is retrieved) when we are in public mode and there is no link..
            // When we are in "within Cloud Drive" mode, the link is instantly ready.
            return (this.publicModeProjectSharingLink.length == 0 && this.shareProjectMode == ShareProjectMode.public);
        },

        isUndoDisabled(): boolean {
            return this.appStore.isUndoRedoEmpty("undo") || ((this.appStore.pythonExecRunningState ?? PythonExecRunningState.NotRunning) != PythonExecRunningState.NotRunning) || this.appStore.isDraggingFrame;
        },

        isRedoDisabled(): boolean {
            return this.appStore.isUndoRedoEmpty("redo") || ((this.appStore.pythonExecRunningState ?? PythonExecRunningState.NotRunning) != PythonExecRunningState.NotRunning) || this.appStore.isDraggingFrame;
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
                return this.settingsStore.locale??"en";
            },
            set(lang: string) {                                
                this.settingsStore.setAppLang(lang);
            }, 
        },

        getAppVersion(): string {
            return appPackageJson.version;
        },
        
        getLocaleBuildDate(): string {
            return getLocaleBuildDate();
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

    watch: {
        shareProjectMode(){
            // Whenever the sharing mode changes, we make sure we trigger a new link generation mechanism that will:
            // 1) reset the shared link, and 2) reset the timer associated with the generation.
            this.shareProjectInitialCall = false;
            this.getSharingLink(this.shareProjectMode);
        },
    },

    methods: {
        openLibraryDoc() {
            // Open library doc in new tab:
            window.open("https://strype.org/doc/library/", "_blank")?.focus();
            // Note: we use a click handler for this rather than a plain link because
            // we had an issue (seen on Firefox on Windows and Mac) where clicking the Save As
            // could also trigger the Library Docs.  It seemed like the click event might be
            // carrying over as the menu got re-rendered and hidden.  But changing the link
            // to a click handler fixed it, so we'll keep it like that.
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
            // We might need to check, first that a project has been modified and needs to be saved.
            if(this.appStore.isEditorContentModified){
                // Show a modal dialog to let user save/discard their changes. Saving loop is handled with saving methods.
                // Note that for the File System project we cannot make Strype save the file: that will require the user explicit action.
                this.showDialogAfterSave = this.loadProjectModalDlgId;
                this.$root.$emit("bv::show::modal", this.saveOnLoadModalDlgId);
            }
            else if(this.openSharedProjectId.length == 0) {
                // The normal "open target" dialog
                this.$root.$emit("bv::show::modal", this.loadProjectModalDlgId);
            }
            else {
                // The case of opening a shared project: we don't need a target selection, we just try to open the project
                this.loadProject();
            }
        },

        openLoadDemoProjectModal(): void {
            (this.$refs.openDemoDlg as InstanceType<typeof OpenDemoDlg>).updateAvailableDemos();
            // For a very strange reason, Bootstrap doesn't link the menu link to the dialog any longer 
            // after changing "v-if" to "v-show" on the link (to be able to have the keyboard shortcut working).
            // So we open it manually here...
            // We might need to check, first that a project has been modified and needs to be saved.
            if(this.appStore.isEditorContentModified){
                // Show a modal dialog to let user save/discard their changes. Saving loop is handled with saving methods.
                // Note that for the File System project we cannot make Strype save the file: that will require the user explicit action.
                this.showDialogAfterSave = this.loadDemoProjectModalDlgId;
                this.$root.$emit("bv::show::modal", this.saveOnLoadModalDlgId);
            }
            else {
                this.$root.$emit("bv::show::modal", this.loadDemoProjectModalDlgId);
            }
        },

        handleSaveMenuClick(saveReason?: SaveRequestReason): void {
            // Some problem, like for the load project menu, happens because of changing v-if to v-show (it works first time, but not second time).
            // So again, we handle things manually for the menu entry click
            if(this.isSynced){
                this.saveCurrentProject();
            }
            else{
                this.$root.$emit("bv::show::modal", this.saveProjectModalDlgId);
                // When we are saving a "browser" project (that is, not from FS or GD) we need to be able to trigger the "Open" later, so we set a flag
                this.requestOpenProjectLater = (saveReason == SaveRequestReason.loadProject);
            }
        },

        handleSaveAsMenuClick(){
            // This is only used to set the "save as" flag, saving mechanism is handled via the modal.
            this.requestSaveAs = true;
        },

        openLoadProjectDlgAfterSaved(): void {
            // Reset the flag to request opening the project later (see flag definition)
            this.requestOpenProjectLater = false;
            this.$root.$emit("bv::show::modal", (this.showDialogAfterSave.length > 0) ? this.showDialogAfterSave : this.loadProjectModalDlgId);            
        },

        changeTargetFocusOnMouseOver(event: MouseEvent) {
            // On the "load project dialog", entering a target button should "snap" the focus to it and select it.
            // On the "save project dialog", entering a button just give an indication that the button can "clicked".
            // For both, we handle those visual aspects by setting the focus on the button -- CSS does the rest.
            if(event.target){
                (event.target as HTMLDivElement).focus();
            }
        },

        changeTempSyncTarget(target: StrypeSyncTarget, isSaveAction?: boolean) {
            this.tempSyncTarget = target;
            if(isSaveAction){
                this.onSaveTargetChanged();
            }
            else {
                // There is no intermediate steps when the target is selected for opening a project
                // (we first close the target selector modal, then validate)
                this.$root.$emit("bv::hide::modal", this.loadProjectModalDlgId);
                this.onStrypeMenuHideModalDlg({trigger: "ok"} as BvModalEvent, this.loadProjectModalDlgId);
            }
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
            this.showCloudSaveLocation = isSyncTargetCloudDrive(this.getTargetSelectVal());
        },

        saveTargetChoice(target: StrypeSyncTarget){
            this.appStore.syncTarget = target;
            this.localSyncTarget = target;
            this.tempSyncTarget = target;
            // In case there is a Cloud Drive file ID or other Drive related info are handling when we are saving as a file on the FS, we make sure we remove that
            if(target == StrypeSyncTarget.fs || target == StrypeSyncTarget.none){
                this.appStore.currentCloudSaveFileId = undefined;
                this.appStore.strypeProjectLocationAlias = "";
                this.appStore.strypeProjectLocationPath = "";
            }
            // If we have swapped target, we should remove the other targets in the list of saving functions.
            // (It doesn't really matter if there is one or not, the remove method will take care of that,
            // and if None is added inside the targets to remove, it will just don't do anything as it's never used 
            // for a saving function - so it makes the code below simpler.)
            const targetsToRemove = Object.values(StrypeSyncTarget)
                .filter((t) => typeof t === "number") // filter out string keys from enum
                .filter((t) => t !== target && t !== StrypeSyncTarget.ws); // Discard every other sync targets but "target" and WS
            targetsToRemove.forEach((targetToRemove) =>  this.$root.$emit(CustomEventTypes.removeFunctionToEditorProjectSave, targetToRemove));
        },

        saveCurrentProject(saveReason?: SaveRequestReason){
            // This method is called when sync is activated, and bypass the "save as" dialog we show to change the project name/location.
            // (note that the @click event in the template already checks if we are synced)
            this.onStrypeMenuHideModalDlg({trigger: "ok"} as BvModalEvent, this.saveProjectModalDlgId, this.appStore.projectName, saveReason);
            this.showMenu = false;
        },

        onShareProjectClick(){
            // We only share a project that is saved on a Cloud Drive. Show the user what mode of sharing to use (see details in shareProjectWithMode())
            if(this.canShareProject){
                this.publicModeProjectSharingLink = "";
                this.shareProjectInitialCall = true;
                // First we retrieve the current Cloud File sharing status, as we may need to restore the sharing status later
                const cloudDriveHandlerComponent = (this.$refs[this.cloudDriveHandlerComponentId] as InstanceType<typeof CloudDriveHandler>);
                cloudDriveHandlerComponent.getCurrentCloudFileCurrentSharingStatus(this.appStore.syncTarget)
                    .then((prevCloudFileSharingStatus: CloudFileSharingStatus) => {
                        // Save the status and then open the dialog.
                        cloudDriveHandlerComponent.backupPreviousCloudFileSharingStatus(this.appStore.syncTarget, prevCloudFileSharingStatus).then(() => {
                            this.$root.$emit("bv::show::modal", this.shareProjectModalDlgId);                             
                        });                       
                    })
                    .catch((_) => {
                        // Something happened, we let the user know
                        const erroMsg = (typeof _ == "string") ? _ : JSON.stringify(_);
                        this.appStore.simpleModalDlgMsg = this.$i18n.t("errorMessage.clouldFileRestoreSharingStatus", {drivename: cloudDriveHandlerComponent.getDriveName(), errordetails: erroMsg}) as string;
                        this.$root.$emit("bv::show::modal", getAppSimpleMsgDlgId());
                    });                
            }
        },

        onStrypeMenuShownModalDlg(event: BvModalEvent, dlgId: string) {
            // This method handles the workflow of the menu entries' related dialog
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
                    saveFileNameInputElement.value = ((this.$refs[this.cloudDriveHandlerComponentId] as InstanceType<typeof CloudDriveHandler>)?.saveExistingCloudProjectInfos.isCopyFileRequested) 
                        ? (this.$refs[this.cloudDriveHandlerComponentId] as InstanceType<typeof CloudDriveHandler>).saveExistingCloudProjectInfos.existingFileName
                        : this.appStore.projectName;
                    saveFileNameInputElement.focus();
                    saveFileNameInputElement.click();
                }, 500);           
            }
            else if(dlgId == this.shareProjectModalDlgId){
                // When the popup opens, we try to generate the link to share for the default (public) sharing mode
                setTimeout(() => {
                    // In case retrieving the link is quite fast (working or not) and the user hasn't yet made their choice as to how to share, 
                    // we should allow some time before getting in their face with a result!
                    this.getSharingLink(defaultSharingProjectMode, true);
                }, 2000);
            }
            else if (dlgId == this.loadDemoProjectModalDlgId) {
                (this.$refs.openDemoDlg as InstanceType<typeof OpenDemoDlg>).shown();
            }
            else {
                // When the load or save project dialogs are opened, we focus the Google Drive selector by default when we don't have information about the source target
                setTimeout(() => {
                    const targetToFocusButton =[...document.querySelectorAll(`#${dlgId} .${scssVars.projectTargetButtonClassName}`)].find((targetButton) => {
                        // As the moment we only have 2 possible source targets, we can simply check whether "Google" is in the button or not...
                        if(this.tempSyncTarget == this.noSyncTargetValue || this.tempSyncTarget == this.syncGDValue) {
                            return targetButton.querySelector("span")?.textContent?.includes("Google");
                        }
                        else {
                            return !targetButton.querySelector("span")?.textContent?.includes("Google");
                        }
                    });
                    if(targetToFocusButton){
                        (targetToFocusButton as HTMLDivElement).focus();
                    }
                }, 100);
            } 
        },

        areShareProjectActionStillValid(sharingMode: ShareProjectMode): boolean {
            // There are 2 conditions for an action about sharing a project (i.e. allowing the sharing link to be copied or show an error) to be valid:
            // the dialog is still showing (the user didn't cancel or the timeout for getting the link hasn't happened).
            // In theory there could be a third condition: that the actions are actually for the time the user wanted to share.
            // That last option is unlikely to happen.
            return (this.appStore.currentModalDlgId == this.shareProjectModalDlgId) && (sharingMode == this.shareProjectMode);
        },

        getSharingLink(forShareMode: ShareProjectMode, initialCall?: boolean){
            // If this method is called for the popup opening (initial call), then the user might have already changed the sharing mode option in the popup.
            // In that case, we ignore the call as it was delayed an no longer making sense
            if(initialCall && !this.shareProjectInitialCall){
                return;
            }

            // This method gets the sharing link and update the sharing link flag if the sharing mode still matches the method call (i.e. the user is still asking for that same mode).
            // Once a sharing link is generated and can be used, the flag update will validate the OK button of the dialog.
            // Note that for every call, we always also generate a timeout to make sure we never end up in "pending" situation -- that timeout is really generous to avoid unwanted behaviour for the user.
            const noShareActionTimeOut = 10*1000; 
            const noShareActionTimeOutHandle = setTimeout(()=>{
                this.showErrorForShareProjectLink(this.$i18n.t("errorMessage.sharingLinkTimedout") as string);
            }, noShareActionTimeOut);

            // With Cloud Drives, we allow two types of sharing: either sharing the Drive link (after setting the project readonly and totally public in the sharing settings)
            // or just getting a Strype URL with a shared Drive file ID (in that case, users getting the shared link still need to connect to the relevant Drive first.)
            let alertMessage = "";
            if(forShareMode == ShareProjectMode.public){
                // We only generate the link if we don't have it already (from one dialog opening)
                if(this.publicModeProjectSharingLink.length == 0) {
                    // Before generating a link, we change the file setttings on Google Drive to make it accessible at large.
                    const cloudDriveHandlerComponent = (this.$refs[getCloudDriveHandlerComponentRefId()] as InstanceType<typeof CloudDriveHandler>);
                    let createPermissionSucceeded = false;
                    cloudDriveHandlerComponent.shareCloudDriveFile(this.appStore.syncTarget)
                        .then((succeeded) => createPermissionSucceeded = succeeded)
                        .catch((errorMsg) => alertMessage = (errorMsg?.status)??errorMsg)
                        .finally(() => {
                            clearTimeout(noShareActionTimeOutHandle);
                            if(createPermissionSucceeded){
                                // We have set the file public on the Drive, now we retrieve the sharing link.
                                cloudDriveHandlerComponent.getPublicShareLink(this.appStore.syncTarget)
                                    .then(({respStatus, webLink}) => {
                                        // We got the link or not, but we can only make it useful or show an error *if the user is still expecting this sharing mode from the dialog (if not, we just return)
                                        if(this.areShareProjectActionStillValid(forShareMode)){
                                            if(respStatus == 200){
                                                this.publicModeProjectSharingLink = `${window.location}?${sharedStrypeProjectIdKey}=${encodeURIComponent(webLink)}`;                                    
                                            }
                                            else{
                                                // Something happened we couldn't make the link
                                                alertMessage = this.$i18n.t("errorMessage.cloudDrivePublicShareFailed", {error: (respStatus?.toString())??"unknown"}) as string;
                                            }
                                        }
                                    })
                                    .catch((error: any) => {
                                        // Something happened when we tried to get the public URL of the Google Drive file.
                                        alertMessage = this.$i18n.t("errorMessage.cloudDrivePublicShareFailed", {error: (error.status?.toString())??"unknown"}) as string;            
                                    })
                                    .finally(() => {
                                        if((alertMessage.length > 0) && this.areShareProjectActionStillValid(forShareMode)){
                                            this.showErrorForShareProjectLink(alertMessage);
                                        }
                                    });
                            }
                            else{
                                // The project could not be made public on the Cloud Drive for some reason.
                                if(this.areShareProjectActionStillValid(forShareMode)){
                                    alertMessage = this.$i18n.t("errorMessage.cloudDrivePublicShareFailed", {error: (alertMessage.length > 0) ? alertMessage: "unknow"}) as string;
                                    this.showErrorForShareProjectLink(alertMessage);
                                }
                            }
                        });            
                }
                else{
                    clearTimeout(noShareActionTimeOutHandle);
                }
            }
            else{
                clearTimeout(noShareActionTimeOutHandle);
                // We will create the link when the "Copy link" button is hit.
            }
        },		
		
        showErrorForShareProjectLink(alertMsg: string){
            // An error occur during the creation of the sharing link: we close the sharing mode selection popup and show an alert
            this.$root.$emit("bv::hide::modal", this.shareProjectModalDlgId);        
            this.appStore.simpleModalDlgMsg = alertMsg;
            this.$root.$emit("bv::show::modal", getAppSimpleMsgDlgId());        
        },

        onStrypeMenuHideModalDlg(event: BvModalEvent, dlgId: string, forcedProjectName?: string, saveReason ?: SaveRequestReason) {
            // This method handles the workflow after acting on any modal dialog of the Strype menu entries.
            // For most cases, if there is no confirmation, nothing special happens.
            // Only exception: if the user cancelled or proceeded to save a file copy following an clash with an existing project name on Google Drive,
            // we release the flag to indicate we were doing a file copy, to avoid messing up the targets in future calls of a load/save project
            if(dlgId == this.shareProjectModalDlgId){
                if(event.trigger == "ok"){
                    // The sharing link creation has succeed and we need to have a user action to allow a copy to the clipboard, which we do here.
                    // If the sharing mode is public, we have already stored the sharing link in a flag. If the sharing mode is "within Google Drive",
                    // we set the link value now.
                    navigator.clipboard.writeText((this.shareProjectMode == ShareProjectMode.public) ? this.publicModeProjectSharingLink : `${window.location}?${sharedStrypeProjectTargetKey}=${this.appStore.syncTarget}&${sharedStrypeProjectIdKey}=${this.appStore.currentCloudSaveFileId}`);
                    // If we have set the sharing to internal (within the Cloud Drive) then we might need to restore the previous sharing state as it was
                    if(this.shareProjectMode == ShareProjectMode.withinCloudDrive){
                        (this.$refs[this.cloudDriveHandlerComponentId] as InstanceType<typeof CloudDriveHandler>)
                            .restoreCloudDriveFileSharingStatus(this.appStore.syncTarget)
                            ?.finally(() => {
                                // Reset the flag we kept during the sharing action
                                (this.$refs[this.cloudDriveHandlerComponentId] as InstanceType<typeof CloudDriveHandler>)?.backupPreviousCloudFileSharingStatus(this.appStore.syncTarget, CloudFileSharingStatus.UNKNOWN);
                            });
                    }
                    else{
                        // Reset the flag we kept during the sharing action
                        (this.$refs[this.cloudDriveHandlerComponentId] as InstanceType<typeof CloudDriveHandler>)?.backupPreviousCloudFileSharingStatus(this.appStore.syncTarget, CloudFileSharingStatus.UNKNOWN);                         
                    }
                }
                else{
                    // When a sharing is cancelled, we may need to clean after ourselves and restore the sharing status of the file
                    // to what it was before we intefered with the sharing on the Cloud Drive.
                    (this.$refs[this.cloudDriveHandlerComponentId] as InstanceType<typeof CloudDriveHandler>).restoreCloudDriveFileSharingStatus(this.appStore.syncTarget);
                }
                return;
            }

            if(dlgId == this.saveProjectModalDlgId){
                (this.$refs[this.cloudDriveHandlerComponentId] as InstanceType<typeof CloudDriveHandler>).saveExistingCloudProjectInfos.isCopyFileRequested = false;  
            }

            if(event.trigger == "cancel" || event.trigger == "esc"){
                if(dlgId == this.saveOnLoadModalDlgId){
                    // Case of request to save/discard the file currently opened, before loading a new file:
                    // user chose to discard the file saving: we can trigger the file opening.
                    this.$root.$emit("bv::show::modal", this.showDialogAfterSave);
                    return;
                }

                // Other cases: reset the temporary sync file flag and the save as flag
                this.tempSyncTarget = this.appStore.syncTarget;
                this.currentModalButtonGroupIDInAction = "";
                this.requestSaveAs = false;
            }
            else if(event.trigger == "ok" || event.trigger == "event"){
                // Case of "load file"
                if(dlgId == this.loadProjectModalDlgId){
                    // We do not do anything if the modal is closed by a "hide" event.
                    if(event.trigger == "event" && event.type == "hide"){
                        return;
                    }
                    this.currentModalButtonGroupIDInAction = this.loadProjectTargetButtonGpId;
                    this.loadProject();
                }
                // Case of request to save/discard the file currently opened, before loading a new file.
                else if(dlgId == this.saveOnLoadModalDlgId){
                    this.$root.$emit(CustomEventTypes.requestEditorProjectSaveNow, SaveRequestReason.loadProject);
                }
                // Case of standard "save file"
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
                    if(!isSyncTargetCloudDrive(selectValue)){
                        if(!canBrowserSaveFilePicker() && saveFileName.trim().match(fileNameRegex) == null){
                            // Show an error message and do nothing special
                            this.appStore.simpleModalDlgMsg = this.$i18n.t("errorMessage.fileNameError") as string;
                            this.$root.$emit("bv::show::modal", getAppSimpleMsgDlgId());
                            this.currentModalButtonGroupIDInAction = "";
                            return;
                        }
                        // Save the .spy file of the state, we try to use the file picker if the browser allows it, otherwise, download to the default download repertory of the browser.
                        const saveContent = generateSPYFileContent();
                        if(canBrowserSaveFilePicker()){
                            saveFile(saveFileName, this.strypeProjMIMEDescArray, this.appStore.strypeProjectLocation, saveContent, (fileHandle: FileSystemFileHandle) => {
                                this.appStore.strypeProjectLocation = fileHandle;
                                this.appStore.projectName = fileHandle.name.substring(0, fileHandle.name.lastIndexOf("."));
                                this.appStore.projectLastSaveDate = Date.now();
                                this.appStore.isEditorContentModified = false;
                                this.saveTargetChoice(StrypeSyncTarget.fs);
                                if(saveReason == SaveRequestReason.loadProject || this.requestOpenProjectLater) {
                                    this.$root.$emit(CustomEventTypes.saveStrypeProjectDoneForLoad);
                                }
                            });
                        }
                        else{
                            saveContentToFile(saveContent, saveFileName + "." + strypeFileExtension);
                            // We cannot retrieve the file name ultimately set by the user or the browser when it's being saved with a click,
                            // however we should still at least update the project name with what the user set in our own save as dialog
                            this.appStore.projectName = saveFileName.trim();
                            this.appStore.projectLastSaveDate = Date.now();
                            this.appStore.isEditorContentModified = false;
                            this.saveTargetChoice(StrypeSyncTarget.fs);
                            if(saveReason == SaveRequestReason.loadProject || this.requestOpenProjectLater) {
                                this.$root.$emit(CustomEventTypes.saveStrypeProjectDoneForLoad);
                            }
                        }
                    }
                    else {          
                        // If we were already syncing to a Drive, we save the current file now, except if "saving as"
                        if(!this.requestSaveAs && isSyncTargetCloudDrive(this.appStore.syncTarget)){
                            this.$root.$emit(CustomEventTypes.requestEditorProjectSaveNow, SaveRequestReason.autosave);
                        }
                        
                        // We postpone saving slight to make sure all autosaving have completed
                        setTimeout(() => {
                            // When the project name is enforced, user as clicked on "save", so we don't need to trigger the usual saving mechanism to select the location/filename
                            if(forcedProjectName){
                                this.currentModalButtonGroupIDInAction = "";
                                return;
                            }
                            const saveReason = (this.saveAtOtherLocation) ? SaveRequestReason.saveProjectAtOtherLocation : SaveRequestReason.saveProjectAtLocation; 
                            (this.$refs[this.cloudDriveHandlerComponentId] as InstanceType<typeof CloudDriveHandler>).saveFileName = saveFileName;
                            (this.$refs[this.cloudDriveHandlerComponentId] as InstanceType<typeof CloudDriveHandler>).saveFile(selectValue,saveReason);
                        }, 2000);
                        
                    }
                    this.currentModalButtonGroupIDInAction = "";
                }
                else if (dlgId == this.loadDemoProjectModalDlgId) {
                    // We do not do anything if the modal is closed by a "hide" event.
                    if(event.trigger == "event" && event.type == "hide"){
                        return;
                    }
                    const selectedDemo = (this.$refs.openDemoDlg as InstanceType<typeof OpenDemoDlg>).getSelectedDemo();
                    if (selectedDemo) {
                        selectedDemo.demoFile.then((content) => {
                            if (content) {
                                (this.$root.$children[0] as InstanceType<typeof App>).setStateFromPythonFile(content, selectedDemo.name ?? "Demo", 0, false)
                                    .then(() => this.saveTargetChoice(StrypeSyncTarget.none));
                            }
                        });
                    }
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
            // If the user chose to sync on a Cloud Drive, we should open the Drive loader. Otherwise, we open default file system.
            // DO NOT UPDATE THE CURRENT SYNC FLAG IN THE STATE - we only do that IF loading succeed (because it can be still cancelled or impossible to achieve)
            const selectValue = (this.openSharedProjectId.length > 0) ? this.openSharedProjectTarget : this.getTargetSelectVal();
            // Reset the temporary sync file flag
            this.tempSyncTarget = this.appStore.syncTarget;
            if(isSyncTargetCloudDrive(selectValue) || this.openSharedProjectId.length > 0 ){
                (this.$refs[this.cloudDriveHandlerComponentId] as InstanceType<typeof CloudDriveHandler>).loadFile(selectValue);
            }            
            else{               
                // And let the user choose a file
                if(canBrowserOpenFilePicker()){
                    openFile([...this.strypeProjMIMEDescArray, ...this.pythonImportMIMEDescArray], this.appStore.strypeProjectLocation, (fileHandles: FileSystemFileHandle[]) => {
                        // We select 1 file so we can get the first element of the returned array
                        // We need to get the file content (hope for the best) and update the store
                        fileHandles[0].getFile().then((file: File) => {
                            const emitPayload: AppEvent = {requestAttention: true};
                            emitPayload.message = this.$i18n.t("appMessage.editorFileUpload").toString();
                            this.$emit(CustomEventTypes.appShowProgressOverlay, emitPayload);
                            const reader = new FileReader();
                            reader.addEventListener("load", () => {
                                // name is not always available so we also check if content starts with a {,
                                // which it will do for spy files:
                                if (file.name.endsWith(".py") || !(reader.result as string).trimStart().startsWith("{")) {
                                    (this.$root.$children[0] as InstanceType<typeof App>).setStateFromPythonFile(reader.result as string, fileHandles[0].name, file.lastModified, true, fileHandles[0]);
                                }
                                else {
                                    this.appStore.setStateFromJSONStr(
                                        {
                                            stateJSONStr: reader.result as string,
                                        }
                                    ).then(() => fileHandles[0].getFile().then((file)=> this.onFileLoaded(fileHandles[0].name, file.lastModified, fileHandles[0])), () => {});
                                }
                                emitPayload.requestAttention=false;
                                this.$emit(CustomEventTypes.appShowProgressOverlay, emitPayload);  
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
                    this.$emit(CustomEventTypes.appShowProgressOverlay, emitPayload);
                    // Store the file name in a variable to use it later in the callback, for some reason using files[0].name fails in Pinia, on Safari
                    const fileName = files[0].name;
                    const lastModified = files[0].lastModified;
                    readFileContent(files[0])
                        .then(
                            (content) => {
                                // name is not always available so we also check if content starts with a {,
                                // which it will do for spy files:
                                if (fileName.endsWith(".py") || !content.trimStart().startsWith("{")) {
                                    (this.$root.$children[0] as InstanceType<typeof App>).setStateFromPythonFile(content, fileName, lastModified, true);
                                }
                                else {
                                    this.appStore.setStateFromJSONStr(
                                        {
                                            stateJSONStr: content,
                                        }
                                    ).then(() => this.onFileLoaded(fileName, lastModified), () => {});
                                }
                                emitPayload.requestAttention=false;
                                this.$emit(CustomEventTypes.appShowProgressOverlay, emitPayload);
                                
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

        onFileLoaded(fileName: string, lastSaveDate: number, fileLocation?: FileSystemFileHandle):void {
            this.saveTargetChoice(StrypeSyncTarget.fs);
            this.$root.$emit(CustomEventTypes.addFunctionToEditorProjectSave, {syncTarget: StrypeSyncTarget.fs, function: (saveReason: SaveRequestReason) => this.saveCurrentProject(saveReason)});

            // Strip the extension from the file, if it was left in. Then we can update the file name and location (if avaiable)
            const noExtFileName = (fileName.includes(".")) ? fileName.substring(0, fileName.lastIndexOf(".")) : fileName;
            this.appStore.projectName = noExtFileName;
            if(fileLocation){
                this.appStore.strypeProjectLocation = fileLocation;
            }
            this.appStore.projectLastSaveDate = lastSaveDate;
        },

        resetProject(): void {
            //resetting the project means removing the WebStorage saved project and reloading the page
            //we emit an event to the App so that handlers are done properly
            this.$emit(CustomEventTypes.appResetProject);
        },

        handleMenuOpen(){
            // As we are handling the tab indexing and navigation manually, we need also to add the tabindex attribute for the menu elements
            // (the close button and all bits in the menu). The button is treated separately, and all other elements are found based on the CSS class.
            (document.getElementsByClassName("bm-cross-button")[0] as HTMLSpanElement).tabIndex = 0;
            this.retrievedTabindexesCount = 1;
            document.querySelectorAll(".bm-menu ." + scssVars.strypeMenuItemClassName).forEach((element, index) => {
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

            // Space, left/right arrows should trigger a change of target
            if(event.key.toLowerCase() == " " || event.key.toLowerCase() == "arrowleft" || event.key.toLowerCase() == "arrowright"){
                const currentFocusedElementID = document.activeElement?.id??"";
                const targetButtons = [...document.querySelectorAll(`#${(isSaveAction) ? this.saveProjectModalDlgId : this.loadProjectModalDlgId} .${scssVars.projectTargetButtonClassName}`)];
                const focusedButtonIndex = targetButtons.findIndex((target) => {
                    return target.id == currentFocusedElementID;
                });
                if(focusedButtonIndex > -1){
                    const newFocousedButtonIndex = (event.key.toLowerCase() == "arrowleft") 
                        ? (((focusedButtonIndex - 1) >= 0) ? focusedButtonIndex - 1 : targetButtons.length - 1)
                        : (((focusedButtonIndex + 1) < targetButtons.length) ? focusedButtonIndex + 1 : 0); 
                    (targetButtons[newFocousedButtonIndex] as HTMLDivElement).focus();
                    if(isSaveAction) {
                        (targetButtons[newFocousedButtonIndex] as HTMLDivElement).click();
                    }                    
                }
                event.stopImmediatePropagation();
                event.stopPropagation();
                event.preventDefault();
                return;
            }

            // Enter should act as a button validation, if one of the target is focused.
            if(event.key.toLowerCase() == "enter"){
                const focusedTarget = document.activeElement;
                if(focusedTarget && focusedTarget.classList.contains(scssVars.projectTargetButtonClassName)){
                    (focusedTarget as HTMLDivElement).click();
                    if(isSaveAction){
                        // On the save dialog, the action doesn't validate the modal dialog
                        event.stopPropagation();
                        event.stopImmediatePropagation();
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
                    if (errorElement == null) {
                        // If there's no longer an error, don't do anything:
                        return;
                    }
                    // Make sure that getting to an error will result opening the container frame container (section) if it was collapsed
                    const isErrorOnFrame = isIdAFrameId(errorElement.id);
                    const erroneousFrameId = (isErrorOnFrame) 
                        ? parseFrameUID(errorElement.id) 
                        : ((isElementEditableLabelSlotInput(errorElement)) 
                            ? parseLabelSlotUID(errorElement.id).frameId
                            : parseFrameHeaderUID(errorElement.id));
                    this.appStore.frameObjects[getFrameSectionIdFromFrameId(erroneousFrameId)].isCollapsed = false;
                     
                    // The error can be in a slot or it can be for a whole frame. By convention, the location for a frame error is the caret above it.
                    // For errors in a slot: we focus on the slot of the error -- if the erroneous HTML is a slot, we just give it focus. If the error is at the frame scope
                    // we put the focus in the first slot that is editable.
                    this.$nextTick(() => {
                        if(isErrorOnFrame){
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
}

.top-left-strype-logo {
    margin-top: 10px !important;
    margin-bottom: 10px !important;
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
    color: black;
    cursor: pointer;
}

.strype-menu-link:hover {
    color: black;
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

.#{$strype-classname-strype-menu-item} {
    outline: none;
}

.#{$strype-classname-strype-menu-item}:focus {
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

.save-project-modal-dlg-container {
    display: table;
    border-spacing: 10px 10px;
}

.save-project-modal-dlg-container .row {
    display: table-row;
}

.save-project-modal-dlg-container .cell {
    display: table-cell;
}

.share-mode-buttons-container-title {
    font-weight: 600;
}

.share-mode-buttons-container {
    display: table;
    margin-left: 30px;
    margin-top: 10px;
}

.share-mode-button-group {
    display: table-row;
}

.share-mode-buttons-container input,
.share-mode-buttons-container > div > div {
    display: table-cell;
    font-size: 95%;
}

.share-mode-buttons-container > div > div {
    padding-left: 5px;
}

.share-mode-buttons-container span {
    font-size: 90%;
    display: block;
}

.share-mode-buttons-container > .share-mode-button-group:first-child span {
    margin-bottom: 20px;
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

.project-target-popup-content-container {
    display: flex;
    flex-direction: column;
    gap:5px;
}

.project-target-button-container {
    display: flex;
    flex-wrap: nowrap;
    gap: 20px;
    justify-content: space-between;
    align-items: center;
}

.#{$strype-classname-project-target-button} {
    border-radius: 8px;
    border: #c5c4c1 2px solid;
    display: flex;
    flex-direction: column;
    flex-wrap: nowrap;
    padding: 5px;
    align-items: center;
    justify-content: space-between;
    width: 150px;
}

.#{$strype-classname-project-target-button}.load-dlg:focus,
.#{$strype-classname-project-target-button}.saveTargetSelected
 {
    border-color: #007bff;
    cursor: pointer;
    box-shadow: 2px 2px 5px rgb(141, 140, 140);
    outline: none;
}

.#{$strype-classname-project-target-button}.save-dlg:focus {
    border-color: black !important;
}


.#{$strype-classname-project-target-button}.save-dlg:hover {
    box-shadow: 2px 2px 5px rgb(141, 140, 140);
}

.project-target-button-container img {
    width: 64px;
    height: 64px;
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
    font-size: smaller;
    color: #3467FE;
    display: flex;
    flex-direction: column;
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
    // To allow some padding divs inside the menu
    display: flex !important;
    flex-direction: column;
    height: 100%;
}

.bm-item-list > :not(.menu-separator-div) {
      display: flex !important;
      text-decoration: none !important;
      padding: 2px !important;
      margin-left: 2px !important;
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
</style>
