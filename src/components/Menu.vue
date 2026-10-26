<template>
    <!-- keep the tabindex attribute, it is necessary to handle focus properly -->
    <div @keydown="handleKeyEvent" @keyup="handleKeyEvent" tabindex="-1" @mousedown.self.stop.prevent>
        <CloudDriveHandler :ref="cloudDriveHandlerComponentId" :openSharedProjectFileId="openSharedProjectId" />
        <div>
            <a href="https://strype.org/" :title="$t('appMenu.homepage')"><img class="top-left-strype-logo" src="@/assets/images/Strype-logo-128-2x.png"></a>
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
            <a :id="newProjectLinkId" v-if="showMenu" :class="'strype-menu-link '+ scssVars.strypeMenuItemClassName" @click="resetProject();showMenu=false;" :title="$t('appMenu.resetProjectTooltip')">{{ $t("appMenu.resetProject") }}</a>
            <!-- open project -->
            <a :id="loadProjectLinkId" v-show="showMenu" :class="'strype-menu-link ' + scssVars.strypeMenuItemClassName" @click="openLoadProjectModal">{{$t('appMenu.loadProject')}}<span class="strype-menu-kb-shortcut">{{loadProjectKBShortcut}}</span></a>
            <ModalDlg :dlgId="loadProjectModalDlgId" showCloseBtn hideDlgBtns>
                <div class="project-target-popup-content-container">
                    <span class="load-save-label">{{ $t("appMessage.loadToTarget") }}</span>
                    <div class="project-targets-container">
                        <div :ref="loadProjectTargetButtonGpId" class="project-target-button-container">
                            <div :id="loadFromFSStrypeButtonId" :class="scssVars.projectTargetButtonClassName + ' load-dlg'" tabindex="0"  @click="changeTempSyncTarget(syncFSValue)" @keydown.self="onTargetButtonKeyDown($event, loadProjectModalDlgId)"
                                @mouseenter="changeTargetFocusOnMouseOver">
                                <img src="@/assets/images/FSicon.png" :alt="$t('appMessage.targetFS')"/> 
                                <span>{{ $t("appMessage.targetFS") }}</span>
                            </div>
                            <div :id="getTargetButtonId(primaryCloudTarget.target)" :class="scssVars.projectTargetButtonClassName + ' load-dlg'" tabindex="0"  @click="changeTempSyncTarget(primaryCloudTarget.target)" @keydown.self="onTargetButtonKeyDown($event, loadProjectModalDlgId)"
                                @mouseenter="changeTargetFocusOnMouseOver">
                                <img :src="primaryCloudTarget.logo" :alt="primaryCloudTarget.label"/>
                                <span>{{ primaryCloudTarget.label }}</span>
                            </div>
                        </div>
                        <div class="secondary-targets-container">
                            <div v-for="cloudTarget in secondaryCloudTargets" :key="cloudTarget.target" :id="getTargetButtonId(cloudTarget.target)" :class="scssVars.projectTargetButtonClassName + ' load-dlg secondary-target'" tabindex="0"  @click="changeTempSyncTarget(cloudTarget.target)" @keydown.self="onTargetButtonKeyDown($event, loadProjectModalDlgId)"
                                @mouseenter="changeTargetFocusOnMouseOver">
                                <img :src="cloudTarget.logo" :alt="cloudTarget.label"/>
                                <span>{{ cloudTarget.label }}</span>
                            </div>
                        </div>
                        <div class="embedded-proj-links-container">
                            <a class="open-menu-embedded-proj-link" tabindex="0" @click="onOpenMenuLinkClick('examples')" @keydown.self="onTargetButtonKeyDown($event, loadProjectModalDlgId)" @mouseenter="changeTargetFocusOnMouseOver">{{$t("appMenu.loadDemoProject")}}</a>
                            <a class="open-menu-embedded-proj-link" tabindex="0" @click="onOpenMenuLinkClick('book')" @keydown.self="onTargetButtonKeyDown($event, loadProjectModalDlgId)" @mouseenter="changeTargetFocusOnMouseOver">{{$t("appMenu.book")}}</a>
                        </div>
                    </div>
                    <div class="recent-states-pane" v-if="showRecentUnsaved && recentLoadableStates && recentLoadableStates.length > 0">
                        <div class="d-flex justify-content-between align-items-baseline">
                            <span class="load-save-label">{{ $t("appMessage.loadRecentState") }}</span>
                            <span class="clear-all-label" @click="clearAllRecent">{{ $t("appMessage.clearAllRecent") }}</span>
                        </div>
                        <div class="load-recent-states-list overflow-y-auto" style="max-height: 20rem;">
                            <div v-for="recent in recentLoadableStates" class="project-target-button recent-state-button load-dlg" @click="selectOldState(recent.data)">
                                <span :class="scssVars.projectRecentStateLabel">{{recent.label}}</span>
                                <span class="recent-state-sublabel">{{recent.sublabel}}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </ModalDlg>
            <!-- save project -->
            <a :id="saveProjectLinkId" v-show="showMenu" :class="'strype-menu-link ' + scssVars.strypeMenuItemClassName" @click="handleSaveMenuClick">{{$t('appMenu.saveProject')}}<span class="strype-menu-kb-shortcut">{{saveProjectKBShortcut}}</span></a>
            <a v-if="showMenu" :class="{['strype-menu-link ' + scssVars.strypeMenuItemClassName]: true, disabled: !canSaveAs }" @click="handleSaveAsMenuClick">{{$t("appMenu.saveAsProject")}}</a>
            <ModalDlg :dlgId="saveProjectModalDlgId" :okCustomTitle="$t((isGitSaveTargetSelected) ? 'buttonLabel.continueSave' : 'buttonLabel.save')" size="lg">
                <div class="save-project-modal-dlg-container">
                    <div class="modal-row">
                        <label class="load-save-label modal-cell">{{$t("appMessage.fileName")}}</label>
                        <input :id="saveFileNameInputId" :placeholder="$t('defaultProjName')" type="text" ref="toFocus" autocomplete="off" class="modal-cell" />
                    </div>
                    <div class="modal-row">
                        <span class="load-save-label modal-cell">{{$t("appMessage.saveToTarget")}}</span>
                        <div class="modal-cell">
                            <div class="project-targets-container">
                                <div :ref="saveProjectTargetButtonGpId" class="project-target-button-container">
                                    <div :id="saveToFSStrypeButtonId" tabindex="0" @click="changeTempSyncTarget(syncFSValue, true)" @keydown.self="onTargetButtonKeyDown($event, saveProjectModalDlgId)"
                                        :class="{[scssVars.projectTargetButtonClassName + ' save-dlg']: true, saveTargetSelected: tempSyncTarget == syncFSValue || tempSyncTarget == noSyncTargetValue}">
                                        <img src="@/assets/images/FSicon.png" :alt="$t('appMessage.targetFS')"/> 
                                        <span>{{ $t("appMessage.targetFS") }}</span>
                                    </div>
                                    <div :id="getTargetButtonId(primaryCloudTarget.target, true)" tabindex="0" @click="changeTempSyncTarget(primaryCloudTarget.target, true)" @keydown.self="onTargetButtonKeyDown($event, saveProjectModalDlgId)"
                                        :class="{[scssVars.projectTargetButtonClassName + ' save-dlg']: true, saveTargetSelected: tempSyncTarget == primaryCloudTarget.target}">
                                        <img :src="primaryCloudTarget.logo" :alt="primaryCloudTarget.label"/>
                                        <span>{{ primaryCloudTarget.label }}</span>
                                    </div>
                                </div>
                                <div class="secondary-targets-container">
                                    <div v-for="cloudTarget in secondaryCloudTargets" :key="cloudTarget.target" :id="getTargetButtonId(cloudTarget.target, true)" tabindex="0" @click="changeTempSyncTarget(cloudTarget.target, true)" @keydown.self="onTargetButtonKeyDown($event, saveProjectModalDlgId)"
                                        :class="{[scssVars.projectTargetButtonClassName + ' save-dlg secondary-target']: true, saveTargetSelected: tempSyncTarget == cloudTarget.target}">
                                        <img :src="cloudTarget.logo" :alt="cloudTarget.label"/>
                                        <span>{{ cloudTarget.label }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-row">
                        <label v-show="showCloudSaveLocation" class="load-save-label modal-cell">{{$t("appMessage.cloudLocation")}}</label>
                        <div v-show="showCloudSaveLocation" class="modal-cell">                        
                            <span class="load-save-label">{{currentDriveLocation}}</span>
                            <BButton variant="outline-primary" @click="onSaveDiffLocationClick" size="sm">{{ $t("buttonLabel.saveDiffLocation") }}</BButton>
                        </div>
                    </div>
                </div>
            </ModalDlg>
            <ModalDlg :dlgId="saveOnLoadModalDlgId" :okCustomTitle="$t('buttonLabel.saveChanges')" :cancelCustomTitle="$t('buttonLabel.discardChanges')" showCloseBtn>
                <div>
                    <span class="load-project-lost-span">{{ $t("appMessage.editorAskSaveChangedCode") }}</span>
                    <br/>
                </div>
            </ModalDlg>            
            <!-- new section -->
            <div class="menu-separator-div"></div>           
            <a v-show="showMenu" :class="'strype-menu-link ' + scssVars.strypeMenuItemClassName" @click="openLoadDemoProjectModal">{{$t('appMenu.loadDemoProject')}}</a>
            <OpenDemoDlg ref="openDemoDlg" :dlg-id="loadDemoProjectModalDlgId"/>
            <a v-show="showMenu" :class="'strype-menu-link ' + scssVars.strypeMenuItemClassName" @click="openBookModal">{{$t('appMenu.book')}}</a>
            <OpenBookDlg ref="openBookDlg" :dlg-id="loadBookProjectModalDlgId"/>
            <!-- #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE -->
            <a v-show="showMenu" :class="'strype-menu-link ' + scssVars.strypeMenuItemClassName" @click="openLibraryDoc">{{$t('appMenu.apiDocumentation')}}</a>
            <!-- #v-endif-->
            <!-- category: export -->
            <!-- share project -->
            <a :id="shareProjectLinkId" v-show="showMenu" :class="{['strype-menu-link ' + scssVars.strypeMenuItemClassName]: true}" @click="onShareProjectClick">{{$t('appMenu.shareProject')}}<span class="strype-menu-kb-shortcut">{{shareProjectKBShortcut}}</span></a>
            <ModalDlg :dlgId="shareProjectChooseMethodDlgId" :dlgTitle="$t('appMessage.createShareProjectLink')" showCloseBtn hideDlgBtns>
                <div>
                    <div class="share-method-container">
                        <div id="shareMethodSnapshotButton" :class="scssVars.projectTargetButtonClassName + ' share-method-dlg'" tabindex="0"  @click="copySnapshotLink()" @keydown.self="onTargetButtonKeyDown($event, shareProjectChooseMethodDlgId)"
                             @mouseenter="changeTargetFocusOnMouseOver">
                            <img src="@/assets/images/snapshotIcon.svg" :alt="$t('appMessage.methodSnapshotLink')"/>
                            <span class="share-method-title">{{ $t("appMessage.methodSnapshotLink") }}</span>
                            <span class="share-method-explanation">{{ $t("appMessage.methodSnapshotLinkExplanation") }}</span>
                            <span class="share-method-warning" v-if="shareContentZippedBase64.length > 2000">{{ $t("appMessage.snapshotLinkTooLarge") }}</span>
                        </div>
                        <div id="shareMethodCloudButton" :class="scssVars.projectTargetButtonClassName + ' share-method-dlg'" tabindex="0"  @click="copyCloudLink()" @keydown.self="onTargetButtonKeyDown($event, shareProjectChooseMethodDlgId)"
                             @mouseenter="changeTargetFocusOnMouseOver">
                            <img src="@/assets/images/logoOneDrive.svg" alt="$t('appMessage.methodCloudLink')"/>
                            <span class="share-method-title">{{ $t("appMessage.methodCloudLink") }}</span>
                            <span class="share-method-explanation">{{ $t("appMessage.methodCloudLinkExplanation") }}</span>
                            <span class="share-method-warning" v-if="!canShareProjectViaCloud">{{ $t("appMessage.cloudShareUnavailable") }}</span>
                            <span class="share-method-warning" v-if="warnCloudModifiedProject">{{ $t("appMessage.cloudShareNotSaved") }}</span>
                        </div>
                    </div>
                </div>
            </ModalDlg>
            <ModalDlg :dlgId="shareProjectModalDlgId" :okCustomTitle="$t('buttonLabel.copyLink')" :okDisabled="isSharingLinkGenerationPending" :useLoadingOK="isSharingLinkGenerationPending" 
                :dlgTitle="$t('appMessage.createShareProjectLink')" :elementToFocusId="shareCloudDriveProjectPublicRadioBtnId">
                        <div>
                            <span class="share-mode-buttons-container-title">{{$t('appMessage.shareProjectModeLabel')}}</span>
                            <div class="share-mode-buttons-container">
                                <div class="share-mode-button-group">
                                    <input type="radio" :id="shareCloudDriveProjectPublicRadioBtnId" name="shareCloudDriveModeRadioGroup"
                                        v-model="shareProjectMode" :value="shareProjectPublicModeValue" />
                                    <div>
                                        <label :for="shareCloudDriveProjectPublicRadioBtnId" >{{$t("appMessage.shareProjectPublicMode")}}</label>
                                        <span>{{$t("appMessage.shareProjectPublicModeDetails") + ((isSharingPublicNotDirectDownload) ? " " + shareProjectPublicCloudDriveNotDirectDownloadLabel : "")}}</span>
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
            <!-- #v-ifdef STRYPE_PLATFORM == VITE_MICROBIT_MODE-->
            <a v-if="showMenu" :class="'strype-menu-link ' + scssVars.strypeMenuItemClassName" @click="downloadHex();showMenu=false;">{{ $t("appMenu.downloadHex") }}</a>
            <!-- #v-endif-->
            <a v-if="showMenu" :class="'strype-menu-link ' + scssVars.strypeMenuItemClassName" @click="downloadPython();showMenu=false;">{{ $t("appMenu.downloadPython") }}</a>
            <!-- BLANK SPACE IN MENU TO FOOTER -->
            <div class="flex-padding" />
            <!-- category: preferences / settings -->
            <!-- Localisation -->
            <table class="appMenu-prefs-div">
                <tbody>
                    <tr>
                        <td><label :for="frameNumbersCheckboxId">{{$t("appMenu.frameNumbers")}}</label></td>
                        <td><input type="checkbox" :id="frameNumbersCheckboxId" v-model="frameNumbersEnabled" @change="showMenu=false;" @click="setCurrentTabIndexFromEltId(frameNumbersCheckboxId)"></td>
                    </tr>
                    <tr>
                        <td><label :for="appLangSelectId">{{$t("appMenu.lang")}}</label></td>
                        <td>
                            <select name="lang" :id="appLangSelectId" v-model="appLang" @change="showMenu=false;" :class="scssVars.strypeMenuItemClassName" @click="setCurrentTabIndexFromEltId(appLangSelectId)">
                                <option v-for="locale in locales" :value="locale.code" :key="locale.code">{{locale.name}}</option>
                            </select>
                        </td>
                    </tr>
                </tbody>
            </table>
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
                :class="{'show-menu-btn': true, disabled: isPythonRunning}"
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
                <!-- mousedown.prevent stops the click from blurring a currently-focused editable
                     slot before the undo/redo below runs -- that blur's own commit path was
                     corrupting the undo stack for an edit still in flight (Ctrl+Z, which doesn't
                     blur, was unaffected). -->
                <input
                    type="image"
                    :src="undoImagePath"
                    :disabled="isUndoDisabled"
                    @mousedown.prevent
                    @click="performUndoRedo(true)"
                    class="menu-icon-entry"
                    :title="$t('contextMenu.undo')"
                />
            </div>
            <div class="menu-icon-div">
                <input
                    type="image"
                    :src="redoImagePath"
                    :disabled="isRedoDisabled"
                    @mousedown.prevent
                    @click="performUndoRedo(false)"
                    class="menu-icon-entry"
                    :title="$t('contextMenu.redo')"
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
import { computed, defineComponent, nextTick, ref, watch } from "vue";
import { useStore, settingsStore } from "@/store/store";
import {saveContentToFile, readFileContent, waitForNextPaint, fileNameRegex, strypeFileExtension, isMacOSPlatform} from "@/helpers/common";
import { AppEvent, CaretPosition, CollapsedState, FormattedMessage, FormattedMessageArgKeyValuePlaceholders, Locale, MessageDefinitions, MIMEDesc, PythonExecRunningState, SaveRequestReason, ShareProjectMode, SlotCoreInfos, SlotCursorInfos, SlotType, StrypeSyncTarget } from "@/types/types";
import {countEditorCodeErrors, CustomEventTypes, fileImportSupportedFormats, getAppLangSelectId, getAppSimpleMsgDlgId, getEditorCodeErrorsHTMLElements, getEditorMenuUID, getFrameHeaderUID, getFrameUID, getCloudDriveHandlerComponentRefId, getLabelSlotUID, getLoadFromFSStrypeButtonId, getLoadProjectLinkId, getNearestErrorIndex, getSaveAsProjectModalDlg, getSaveStrypeProjectToFSButtonId, getStrypeSaveProjectNameInputId, isElementEditableLabelSlotInput, isElementUIDFrameHeader, isIdAFrameId, parseFrameHeaderUID, parseFrameUID, parseLabelSlotUID, setDocumentSelection, sharedStrypeProjectIdKey, sharedStrypeProjectTargetKey, getSaveProjectLinkId, getShareProjectLinkId, getNewProjectLinkId, getImportFileInputId, isFullyInViewport} from "@/helpers/editor";
import { Slide } from "vue3-burger-menu";
import { mapStores } from "pinia";
import CloudDriveHandler from "@/components/CloudDriveHandler.vue";
import { downloadHex, downloadPython } from "@/helpers/download";
import { canBrowserOpenFilePicker, canBrowserSaveFilePicker, openFile, saveFile } from "@/helpers/filePicker";
import { generateSPYFileContent } from "@/helpers/load-save";
import ModalDlg from "@/components/ModalDlg.vue";
import { ceil, cloneDeep } from "lodash";
import appPackageJson from "@/../package.json";
import { checkCodeErrors, getAboveFrameCaretPosition, getFrameSectionIdFromFrameId } from "@/helpers/storeMethods";
import scssVars from "@/assets/style/_export.module.scss";
import OpenDemoDlg from "@/components/OpenDemoDlg.vue";
import { CloudFileSharingStatus, isSyncTargetCloudDrive, isSyncTargetGitProvider } from "@/types/cloud-drive-types";
import {deflateRaw} from "pako";
import {Base64} from "js-base64";
import disabledUndoImgPath from "@/assets/images/disabledUndo.svg";
import disabledRedoImgPath from "@/assets/images/disabledRedo.svg";
import undoImgPath from "@/assets/images/undo.svg";
import redoImgPath from "@/assets/images/redo.svg";
import gdLogoImgPath from "@/assets/images/logoGDrive.png";
import odLogoImgPath from "@/assets/images/logoOneDrive.svg";
import ghLogoImgPath from "@/assets/images/logoGitHub.svg";
import glLogoImgPath from "@/assets/images/logoGitLab.svg";
import { useI18n } from "vue-i18n";
import { BButton, BvTriggerableEvent } from "bootstrap-vue-next";
import { vueComponentsAPIHandler } from "@/helpers/vueComponentAPI";
import { eventBus, getLocaleBuildDate } from "@/helpers/appContext";
import {checkForRecentSaveStates, deleteStates} from "@/store/store-db-storage";
import OpenBookDlg from "@/components/OpenBookDlg.vue";
import {trackUsedBookProject} from "@/store/analytics";
import { useBrowserDetect } from "vue3-detect-browser";

//////////////////////
//     Component    //
//////////////////////
const defaultSharingProjectMode = ShareProjectMode.public;
// The browser doesn't change during a session, so we detect it once here rather than calling
// useBrowserDetect() (which allocates a new reactive object) on every keydown event.
const { isSafari } = useBrowserDetect();
// The cloud targets' buttons of the load/save project dialogs: the first one (Google Drive) is the default primary cloud target,
// the others are the secondary targets, in this order (see primaryCloudTarget and secondaryCloudTargets).
interface ProjectCloudTargetButtonInfos {
    target: StrypeSyncTarget,
    logo: string,
    label: string,
}
const projectCloudTargetButtonsInfos: ProjectCloudTargetButtonInfos[] = [
    {target: StrypeSyncTarget.gd, logo: gdLogoImgPath, label: "Google Drive"},
    {target: StrypeSyncTarget.od, logo: odLogoImgPath, label: "OneDrive"},
    {target: StrypeSyncTarget.gh, logo: ghLogoImgPath, label: "GitHub"},
    {target: StrypeSyncTarget.gl, logo: glLogoImgPath, label: "GitLab"},
];
export default defineComponent({
    name: "Menu",
    
    setup() {
        // Move the Options API style computed properties or data here if we need them in setup:
        // Indicator of the error index that is currently being looked at (0-based index, and reset when errors are regenerated)
        const currentErrorNavIndex = ref(-1);
        const errorCount = computed(() => useStore().errorCount ?? countEditorCodeErrors());
        // Flag indicating if navigating to an error has been triggered by the user: used to inhibit reactive changes
        const navigateToErrorRequested = ref(false);

        // Moved what we had in mounted() before Vue 3 here, as Vue 3, using the composition API natively, now requires having them in setup().
        // Composition API allows watching an array of "sources" (cf https://vuejs.org/guide/essentials/watchers.html)
        // We need to update the current error Index when: the error count changes, navigation occurs (i.e. editing toggles, caret pos or focus pos changes)
        // but we bypass this when we manually change the error navigation index (i.e. when the user clicks on the navigation icons)
        watch([() => errorCount, () => useStore().isEditing, () => useStore().currentFrame.id, () => useStore().currentFrame.caretPosition, () => useStore().anchorSlotCursorInfos], () => {
            if(!navigateToErrorRequested.value){
                nextTick(() => {
                    currentErrorNavIndex.value = (errorCount.value > 0) ? getNearestErrorIndex() : -1;
                });
            }
        });

        return { currentErrorNavIndex, errorCount, navigateToErrorRequested };
    },

    components: {
        OpenDemoDlg,
        Slide,
        CloudDriveHandler,
        ModalDlg,
        BButton,
    },

    created() {
        // Expose this component that other components might need.
        // Vue 3 has deprecated direct access to components.
        // (we don't set it in setup() because we want to have this accessible, and the component created!)
        vueComponentsAPIHandler.menuComponentAPI = {
            onStrypeMenuHideModalDlg: this.onStrypeMenuHideModalDlg,
            toggleMenuOnOff: this.toggleMenuOnOff,
            setCurrentErrorNavIndex: (value: number) => {
                this.currentErrorNavIndex = value;
            },
            goToError: this.goToError,
            getCurrentDriveLocation: () => {
                return this.currentDriveLocation;
            },
            getRequestSaveAs: () => {
                return this.requestSaveAs;
            },
            setRequestSaveAs: (value: boolean) => {
                this.requestSaveAs = value;
            },
            saveTargetChoice: this.saveTargetChoice,
            getRequestOpenProjectLater: () => {
                return this.requestOpenProjectLater;
            },
            setOpenSharedProjectTarget: (value: StrypeSyncTarget) => {
                this.openSharedProjectTarget = value;
            },
            setOpenSharedProjectId: (value: string) => {
                this.openSharedProjectId = value;
            },
            handleSaveMenuClick: this.handleSaveMenuClick,
            onFileLoaded: this.onFileLoaded,
        };
    },
    
    data: function() {
        return {
            scssVars, // just to be able to use in template
            showMenu: false,
            // Handle for the delayed focus/click on the save dialog's filename input (see
            // onStrypeMenuShownModalDlg) -- cleared in onStrypeMenuHideModalDlg if the dialog
            // closes before the delay fires, so it doesn't act on stale/hidden state later:
            saveDialogFocusTimeoutId: undefined as ReturnType<typeof setTimeout> | undefined,
            // This flag is used to know if we've added the tabindex value for the closing "button", and get the number of indexes
            retrievedTabindexesCount: -1,
            // The tabindex of the currently focused element of the menu
            currentTabindexValue: 0,
            // The temporary sync target that we use to handle the UI of the target selection
            tempSyncTarget: StrypeSyncTarget.none,
            // Takes priority over tempSyncTarget in load dialog if non-null
            tempLoadOld: null as string | null,
            // The current selection for the sync target (local to this component, not in the store)            
            localSyncTarget: StrypeSyncTarget.gd,
            showCloudSaveLocation: false,
            // Flag to know if a request to change with a different folder location for Googe Drive has been requested
            saveAtOtherLocation: false,
            // Flag to know if a "save as" request has been made
            requestSaveAs: false,  
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
            afterSaveDialog: null as {dialog: string} | {spy: string; name: string} | null, // What to do after save-before-load; show dialog or load SPY
            shareContentZippedBase64: "",

            // States that could be loaded from the load menu:
            recentLoadableStates: [] as {label: string, sublabel: string, data: string, tabId: string}[],
            // Whether the "recent unsaved projects" pane is revealed in the load dialog (hidden by default, toggled by Ctrl+U while the dialog is open)
            showRecentUnsaved: false,
        };
    },

    mounted() {
        // We register the keyboad event handling for the menu here
        window.addEventListener(
            "keydown",
            (event: KeyboardEvent) => {
                // Loading/saving project shortcuts.
                // The control for the shortcuts is a bit awkward to preserve a tight check on the browsers: for Safari, ⌘+O is interecepted
                // by the browser so we cannot rely on this shortcut to open a Strype project. However, ctrl+O works, but is not trivial for macOS.
                // Therefore for Safari, we use ⌘+⇧+O to open a project (while still supportting ctrl+O), ⌘+S to save a project (but silently supports
                // ⌘+⇧+S too for muscle memory, and ctrl+s which was already supported implictly before).
                // For other browsers: we are restricting to ctrl+O and ctrl+S as expected (explicitly discarding ⇧ to keep not override existing browser shortcuts).
                const lowCaseEventKey = event.key.toLowerCase();
                const isOpeningOrSavingShortcut = ((event.metaKey || event.ctrlKey) && (lowCaseEventKey === "s" || lowCaseEventKey === "o")) 
                    && ((isSafari)
                        ? event.metaKey && (lowCaseEventKey === "s" || (lowCaseEventKey === "o" && event.shiftKey))
                        : !event.shiftKey
                    );
                if(isOpeningOrSavingShortcut){
                    event.stopImmediatePropagation();
                    event.preventDefault();
                    if(this.isPythonRunning){
                        // If the project is running, the menu is disabled and therefore shortcuts are not available.
                        // We only make a notification in the UI that the project is running so users still gets some feedback.
                        document.dispatchEvent(new Event(CustomEventTypes.highlightPythonRunningState));
                    }
                    else{
                        const linkIdToSimulate = (event.key.toLowerCase() === "s") ? this.saveProjectLinkId : this.loadProjectLinkId;
                        document.getElementById(linkIdToSimulate)?.click();
                    }                    
                }
                // Sharing project shorcut
                else if(event.key.toLowerCase() === "l" && (event.metaKey || event.ctrlKey) && event.shiftKey) {
                    if(this.isPythonRunning){
                        // If the project is running, the menu is disabled and therefore shortcuts are not available.
                        // We only make a notification in the UI that the project is running so users still gets some feedback.
                        document.dispatchEvent(new Event(CustomEventTypes.highlightPythonRunningState));
                    }
                    else{
                        document.getElementById(this.shareProjectLinkId)?.click();
                    }
                    // Safari is using this shortcut, so we consume it!
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    event.stopPropagation();
                }
                // Secret shortcut to reveal the "recent unsaved projects" pane in the load dialog.
                // Ctrl+U is normally "view page source" in the browser, so we only intercept it (and
                // therefore only override that browser shortcut) while the load dialog is open.
                else if(lowCaseEventKey === "u" && (event.metaKey || event.ctrlKey) && this.appStore.currentModalDlgId === this.loadProjectModalDlgId) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    event.stopPropagation();
                    this.showRecentUnsaved = !this.showRecentUnsaved;
                }
            }
        );

        // The events from Bootstrap modal are registered on eventBus.
        eventBus.on(CustomEventTypes.strypeModalShow, this.onStrypeMenuShowModalDlg);
        eventBus.on(CustomEventTypes.strypeModalShown, this.onStrypeMenuShownModalDlg);
        eventBus.on(CustomEventTypes.strypeModalHidden, this.onStrypeMenuHideModalDlg);
        
        // Event listener for saving project action completion
        eventBus.on(CustomEventTypes.saveStrypeProjectDoneForLoad, this.openLoadProjectDlgAfterSaved);

        // Event listener for the Cloud Drive component to listen the attempt to open a shared project is done (successfully or not)
        eventBus.on(CustomEventTypes.openSharedFileDone, () => {
            this.openSharedProjectId = "";
            this.openSharedProjectTarget = StrypeSyncTarget.none;
        });        
    },

    beforeUnmount(){
        // Just in case, we remove the Bootstrap modal event handler from eventBus
        eventBus.off(CustomEventTypes.strypeModalShow, this.onStrypeMenuShowModalDlg);
        eventBus.off(CustomEventTypes.strypeModalShown, this.onStrypeMenuShownModalDlg);
        eventBus.off(CustomEventTypes.strypeModalHidden, this.onStrypeMenuHideModalDlg);

        // And for the saving project action completion too
        eventBus.off(CustomEventTypes.saveStrypeProjectDoneForLoad, this.openLoadProjectDlgAfterSaved);
    },

    computed: {
        ...mapStores(useStore, settingsStore),
        
        menuUID(): string {
            return getEditorMenuUID();
        },

        appLangSelectId(): string {
            return getAppLangSelectId();
        },

        frameNumbersCheckboxId(): string {
            return "frameNumbersCheckboxId";
        },

        locales(): Locale[] {
            // The locale codes are already parts of the i18n messages at this stage, so they are easy to retrieve.
            // We retrieve the corresponding locale's friendly name from i18n directly.
            // In the unlikely event a locale file does not provide the locale friendly name, we just use the code
            // as the name to avoid empty options in the select HTML tool.
            const locales: Locale[] = [];
            this.$i18n.availableLocales.forEach((i18nLocale) => {
                locales.push({code: i18nLocale, name: (useI18n().messages.value[i18nLocale].localeName as string)??i18nLocale});
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

        canSaveAs(): boolean {
            // "Save As" is available when "Save" doesn't show the save dialog: when the project is synced,
            // or when it comes from a Python file opened from a Cloud Drive or a Git provider (see saveToSuggestedCloudLocation())
            return this.isSynced || this.appStore.suggestedCloudSaveLocation != undefined;
        },

        noSyncTargetValue(): StrypeSyncTarget {
            return StrypeSyncTarget.none;
        },

        syncFSValue(): StrypeSyncTarget {
            return StrypeSyncTarget.fs;
        },

        primaryCloudTarget(): ProjectCloudTargetButtonInfos {
            // The cloud target shown as a primary target, next to the local file system (Google Drive by default, see settingsStore.promotedCloudTarget)
            return projectCloudTargetButtonsInfos.find((cloudTarget) => cloudTarget.target == this.settingsStore.promotedCloudTarget) ?? projectCloudTargetButtonsInfos[0];
        },

        secondaryCloudTargets(): ProjectCloudTargetButtonInfos[] {
            // The other cloud targets: when a target is promoted as primary target, Google Drive takes its place in the secondary targets
            const defaultPrimaryCloudTarget = projectCloudTargetButtonsInfos[0];
            return projectCloudTargetButtonsInfos.slice(1)
                .map((cloudTarget) => (cloudTarget.target == this.primaryCloudTarget.target) ? defaultPrimaryCloudTarget : cloudTarget);
        },

        isGitSaveTargetSelected(): boolean {
            // For a Git provider, the location is chosen (with the commit message) in a next dialog: the save dialog only "continues" to it
            return isSyncTargetGitProvider(this.tempSyncTarget);
        },

        isSyncingToCloud(): boolean {
            return isSyncTargetCloudDrive(this.appStore.syncTarget);
        },

        currentDriveLocation(): string {
            // The current Drive location (folder of a project) depends on whether we are already
            // "connected" to a Drive: if there is no Drive or if the user selects a target that is
            // NOT the current target, then the default destination is "Strype".
            // When not connected, a project that comes from a Python file opened from the selected Drive is saved in the folder of that file.
            const suggestedLocation = this.appStore.suggestedCloudSaveLocation;
            if(!this.isSynced && suggestedLocation?.alias && suggestedLocation.target == this.tempSyncTarget){
                return suggestedLocation.alias;
            }
            return(this.appStore.strypeProjectLocationAlias && (this.appStore.syncTarget == this.tempSyncTarget))? this.appStore.strypeProjectLocationAlias : "Strype";
        },

        newProjectLinkId(): string {
            return getNewProjectLinkId();
        },

        loadProjectLinkId(): string {
            return getLoadProjectLinkId();
        },

        loadProjectKBShortcut(): string {
            return `${(isMacOSPlatform() ? "⌘" : this.$t("contextMenu.ctrl")+"+")+(isSafari ? "⇧" : "")}O`;
        },
        
        loadProjectModalDlgId(): string {
            return "load-strype-project-modal-dlg";
        },

        loadDemoProjectModalDlgId(): string {
            return "load-strype-demo-project-modal-dlg";
        },

        loadBookProjectModalDlgId(): string {
            return "load-strype-book-project-modal-dlg";
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
            return getShareProjectLinkId();
        },

        shareProjectKBShortcut(): string {
            const isMacos = isMacOSPlatform();
            return `${(isMacos) ? "⌘" : (this.$t("contextMenu.ctrl")+"+")}⇧${isMacos ? "" : "+"}L`;
        },

        shareProjectModalDlgId(): string {
            return "shareProjectModalDlg";
        },

        shareProjectChooseMethodDlgId(): string {
            return "shareProjectChooseMethodDlg";
        },

        shareCloudDriveProjectPublicRadioBtnId(): string {
            return "shareCloudDriveProjectPublicRadioBtnId";
        },

        canShareProjectViaCloud(): boolean {
            return isSyncTargetCloudDrive(this.appStore.syncTarget);
        },

        warnCloudModifiedProject(): boolean {
            return this.canShareProjectViaCloud && this.appStore.isEditorContentModified;
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
                return this.$t("appMessage.shareProjectWithinCloudDriveMode", {drivename: vueComponentsAPIHandler.cloudDriveHandlerComponentAPI?.getDriveName()??""});
            }
            else{
                return "";
            }
        },

        shareProjectWithinCloudDriveModeDetailsLabel(): string {
            if(this.isSyncingToCloud){
                return this.$t("appMessage.shareProjectWithinCloudDriveModeDetails", {drivename: vueComponentsAPIHandler.cloudDriveHandlerComponentAPI?.getDriveName()??""});
            }
            else{
                return "";
            }
        },

        shareProjectPublicCloudDriveNotDirectDownloadLabel(): string {
            if(this.isSyncingToCloud){
                return this.$t("appMessage.shareProjectPublicModeDetailsNoDirectDownload", {drivename:  vueComponentsAPIHandler.cloudDriveHandlerComponentAPI?.getDriveName()??""});
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

        isPythonRunning(): boolean {
            return (this.appStore.pythonExecRunningState ?? PythonExecRunningState.NotRunning) != PythonExecRunningState.NotRunning;
        },

        isUndoDisabled(): boolean {
            return this.appStore.isUndoRedoEmpty("undo") || this.isPythonRunning || this.appStore.isDraggingFrame;
        },

        isRedoDisabled(): boolean {
            return this.appStore.isUndoRedoEmpty("redo") || this.isPythonRunning || this.appStore.isDraggingFrame;
        },

        undoImagePath(): string {
            return (this.isUndoDisabled) ? disabledUndoImgPath : undoImgPath;
        },

        redoImagePath(): string {
            return (this.isRedoDisabled) ? disabledRedoImgPath : redoImgPath;
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

        frameNumbersEnabled: {
            get(): boolean {
                return this.settingsStore.frameNumbersEnabled;
            },
            set(enabled: boolean) {
                this.settingsStore.setFrameNumbersEnabled(enabled);
            },
        },

        getAppVersion(): string {
            // The version is suffixed by "m" for Strype microbit
            let versionPlatform = "";
            // #v-ifdef STRYPE_PLATFORM == VITE_MICROBIT_MODE
            versionPlatform = "m";
            // #v-endif
            return appPackageJson.version+versionPlatform;
        },
        
        getLocaleBuildDate(): string {
            return getLocaleBuildDate();
        },

        getBuildHash(): string {
            // The hash should exist as it is set when serving or compiling the server..
            // but to keep TS happy
            return __BUILD_GIT_HASH__ ?? "Strype-hash-unknown";
        },

        strypeProjMIMEDescArray(): MIMEDesc[]{
            return [
                {
                    description: this.$t("strypeFileDesc"),
                    accept: { "application/strype": ["."+strypeFileExtension] },
                },
            ];
        },

        pythonImportMIMEDescArray(): MIMEDesc[]{
            return [
                {
                    description: this.$t("pythonFileDesc"),
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
            this.appStore.trackMenuAction("api_docs");
            // Open library doc in new tab:
            window.open("https://strype.org/doc/library/", "_blank")?.focus();
            // Note: we use a click handler for this rather than a plain link because
            // we had an issue (seen on Firefox on Windows and Mac) where clicking the Save As
            // could also trigger the Library Docs.  It seemed like the click event might be
            // carrying over as the menu got re-rendered and hidden.  But changing the link
            // to a click handler fixed it, so we'll keep it like that.
        },
        downloadHex() {
            this.appStore.trackMenuAction("download_hex");
            downloadHex();
        },

        downloadPython() {
            this.appStore.trackMenuAction("download_python");
            downloadPython();
        },

        async openLoadProjectModal(): Promise<void> {
            this.appStore.trackMenuAction("load_project");
            // The recent unsaved projects pane is hidden by default each time the dialog is opened; Ctrl+U reveals it.
            this.showRecentUnsaved = false;
            // We prepare the recent states now, even if the user might need to deal with the save dialog in a moment:
            this.recentLoadableStates = (await checkForRecentSaveStates(settingsStore().locale ?? "en", "load_menu"))
                .map((s) => {
                    return {
                        label: `${s.projectName} (${ceil(s.data.length / 1024)} ${this.$t("appMessage.kb")})`,
                        sublabel: `${this.$t("appMessage.modified")} ${s.when}`,
                        data: s.data,
                        tabId: s.tabId,
                    };
                });
            
            // For a very strange reason, Bootstrap doesn't link the menu link to the dialog any longer
            // after changing "v-if" to "v-show" on the link (to be able to have the keyboard shortcut working).
            // So we open it manually here...
            // We might need to check, first that a project has been modified and needs to be saved.
            if(this.appStore.isEditorContentModified){
                // Show a modal dialog to let user save/discard their changes. Saving loop is handled with saving methods.
                // Note that for the File System project we cannot make Strype save the file: that will require the user explicit action.
                this.afterSaveDialog = {dialog: this.loadProjectModalDlgId};
                eventBus.emit(CustomEventTypes.showStrypeModal, this.saveOnLoadModalDlgId);
            }
            else if(this.openSharedProjectId.length == 0) {
                // The normal "open target" dialog
                eventBus.emit(CustomEventTypes.showStrypeModal, this.loadProjectModalDlgId);
            }
            else {
                // The case of opening a shared project: we don't need a target selection, we just try to open the project
                this.loadProject();
            }
        },

        openLoadDemoProjectModal(): void {
            this.appStore.trackMenuAction("load_demo_open");
            vueComponentsAPIHandler.openDemoDlgComponentAPI?.updateAvailableDemos();
            // For a very strange reason, Bootstrap doesn't link the menu link to the dialog any longer 
            // after changing "v-if" to "v-show" on the link (to be able to have the keyboard shortcut working).
            // So we open it manually here...
            eventBus.emit(CustomEventTypes.showStrypeModal, this.loadDemoProjectModalDlgId);
        },

        openBookModal(): void {
            this.appStore.trackMenuAction("book_dlg_open");
            // For a very strange reason, Bootstrap doesn't link the menu link to the dialog any longer 
            // after changing "v-if" to "v-show" on the link (to be able to have the keyboard shortcut working).
            // So we open it manually here...
            eventBus.emit(CustomEventTypes.showStrypeModal, this.loadBookProjectModalDlgId);
        },

        handleSaveMenuClick(event: MouseEvent | undefined, saveReason?: SaveRequestReason): void {
            // event here is only kept to keep TS happy

            // Some problem, like for the load project menu, happens because of changing v-if to v-show (it works first time, but not second time).
            // So again, we handle things manually for the menu entry click
            if(this.isSynced){
                this.saveCurrentProject();
            }
            else{
                // When we are saving a "browser" project (that is, not from FS or GD) we need to be able to trigger the "Open" later, so we set a flag
                this.requestOpenProjectLater = (saveReason == SaveRequestReason.loadProject);
                if(this.appStore.suggestedCloudSaveLocation){
                    this.saveToSuggestedCloudLocation();
                }
                else{
                    eventBus.emit(CustomEventTypes.showStrypeModal, this.saveProjectModalDlgId);
                }
            }
        },

        saveToSuggestedCloudLocation(){
            // A project that comes from a Python file opened from a Cloud Drive or a Git provider isn't synced, but it is saved
            // without the save dialog, in the folder of that file, as a Strype file of the same name ("Save As" shows the dialog).
            // (for a Git provider, the user is still asked for the commit message)
            const suggestedLocation = this.appStore.suggestedCloudSaveLocation;
            if(!suggestedLocation){
                return;
            }
            this.showMenu = false;
            vueComponentsAPIHandler.cloudDriveHandlerComponentAPI?.setSaveFileName(this.appStore.projectName);
            this.appStore.trackStorageLocation(suggestedLocation.target);
            this.appStore.flushAnalyticsQueue("critical");
            vueComponentsAPIHandler.cloudDriveHandlerComponentAPI?.saveFile(suggestedLocation.target, SaveRequestReason.saveProjectAtLocation);
        },

        handleSaveAsMenuClick(){
            // Don't do anything if "save as" is grayed out
            if(this.canSaveAs){
                // This is used to set the "save as" flag, and open the modal; the saving mechanism is handled via the modal.
                this.requestSaveAs = true;
                eventBus.emit(CustomEventTypes.showStrypeModal, this.saveProjectModalDlgId);
            }
        },

        openLoadProjectDlgAfterSaved(): void {
            // Reset the flag to request opening the project later (see flag definition)
            this.requestOpenProjectLater = false;
            if (this.afterSaveDialog && "spy" in this.afterSaveDialog) {
                vueComponentsAPIHandler.appComponentAPI?.setStateFromPythonFile(this.afterSaveDialog.spy, this.afterSaveDialog.name, 0, false, "import")
                    .then(() => this.saveTargetChoice(StrypeSyncTarget.none), () => { /* error message already shown by pasteMixedPython() */ });
            }
            else {
                eventBus.emit(CustomEventTypes.showStrypeModal, (this.afterSaveDialog && "dialog" in this.afterSaveDialog) ? this.afterSaveDialog.dialog : this.loadProjectModalDlgId);
            }
        },
        
        clearAllRecent() : void {
            deleteStates(this.recentLoadableStates.map((s) => s.tabId)).then(() => {
                // No need to refetch from database; we know it should now be empty:
                this.recentLoadableStates = [];
            });
        },

        changeTargetFocusOnMouseOver(event: MouseEvent) {
            // On the "load project dialog", entering a target button should "snap" the focus to it and select it.
            // On the "save project dialog", entering a button just give an indication that the button can be "clicked".
            // For both, we handle those visual aspects by setting the focus on the button -- CSS does the rest.
            // The embedded project links of the "load project dialog" (examples and book) behave the same way.
            (event.target as HTMLElement | null)?.focus();
        },

        changeTempSyncTarget(target: StrypeSyncTarget, isSaveAction?: boolean) {
            this.tempSyncTarget = target;
            if(isSaveAction){
                this.onSaveTargetChanged();
            }
            else {
                // There is no intermediate steps when the target is selected for opening a project
                // (we first close the target selector modal, then validate)
                eventBus.emit(CustomEventTypes.hideStrypeModal, {trigger: "ok", componentId: this.loadProjectModalDlgId});                
            }
        },
        
        selectOldState(data: string) {
            this.tempLoadOld = data;
            // Immediately counts as a selection:
            eventBus.emit(CustomEventTypes.hideStrypeModal, {trigger: "ok", componentId: this.loadProjectModalDlgId});
        },

        getTargetButtonId(target: StrypeSyncTarget, isSaveAction?: boolean): string {
            // The ID of a target's button in the load or save project dialog (the file system's when there is no target yet)
            const prefix = (isSaveAction) ? "saveTo" : "loadFrom";
            switch((target == StrypeSyncTarget.none) ? StrypeSyncTarget.fs : target){
            case StrypeSyncTarget.od:
                return prefix + "ODStrypeButton";
            case StrypeSyncTarget.fs:
                return (isSaveAction) ? this.saveToFSStrypeButtonId : this.loadFromFSStrypeButtonId;
            case StrypeSyncTarget.gh:
                return prefix + "GHStrypeButton";
            case StrypeSyncTarget.gl:
                return prefix + "GLStrypeButton";
            default:
                return prefix + "GDStrypeButton";
            }
        },

        getTargetSelectVal(): StrypeSyncTarget {
            // Get the target selected as the selected button from the button group; 
            // In the case we do not use the dialog popup ("Save" action when synced), then we keep current synced destination
            if(this.currentModalButtonGroupIDInAction && this.currentModalButtonGroupIDInAction.length == 0){
                return this.appStore.syncTarget;
            }
            // The new UI (changing combobox to buttons) means we can't directly check the HTML component to get the selection (unless using CSS).
            // Instead, we use the temp flag we've added in this Menu component, or the file system (default) if no change has been made.
            return (this.tempSyncTarget != StrypeSyncTarget.none) ? this.tempSyncTarget : StrypeSyncTarget.fs;
        },

        onOpenMenuLinkClick(target: "examples" | "book"): void {
            // When a link from the menu is clicked, we need to close the "Open" dialog (as cancelled), 
            // and open the selected link target's dialog.
            eventBus.emit(CustomEventTypes.hideStrypeModal, {trigger: "cancel", componentId: this.loadProjectModalDlgId});
            if(target === "examples"){
                this.openLoadDemoProjectModal();
            }
            else{
                this.openBookModal();
            };
        },

        onSaveTargetChanged(){
            // (a Git provider's location is chosen in a next dialog, see isGitSaveTargetSelected)
            const selectedTarget = this.getTargetSelectVal();
            this.showCloudSaveLocation = isSyncTargetCloudDrive(selectedTarget) && !isSyncTargetGitProvider(selectedTarget);
        },

        saveTargetChoice(target: StrypeSyncTarget){
            this.appStore.syncTarget = target;
            this.localSyncTarget = target;
            this.tempSyncTarget = target;
            // A cloud target that has been used (to load or save) becomes the primary cloud target in the load/save dialogs
            if(isSyncTargetCloudDrive(target) && target != this.settingsStore.promotedCloudTarget){
                this.settingsStore.setPromotedCloudTarget(target);
            }
            // Once the project is linked to a target, the location suggested for its first save (see suggestedCloudSaveLocation) isn't relevant anymore
            if(target != StrypeSyncTarget.none){
                this.appStore.suggestedCloudSaveLocation = undefined;
            }
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
            targetsToRemove.forEach((targetToRemove) =>  eventBus.emit(CustomEventTypes.removeFunctionToEditorProjectSave, targetToRemove));
        },

        saveCurrentProject(saveReason?: SaveRequestReason){
            // This method is called when sync is activated, and bypass the "save as" dialog we show to change the project name/location.
            // (note that the @click event in the template already checks if we are synced)
            this.onStrypeMenuHideModalDlg({trigger: "ok", componentId: this.saveProjectModalDlgId} as BvTriggerableEvent, this.appStore.projectName, saveReason);
            this.showMenu = false;
        },

        onShareProjectClick() {
            // We make the snapshot link before showing the dialog, so that we know if it's a long link:
            
            // Base64 uses A-Za-z0-9+/, but the latter two are meaningful in URLs
            // so we have to replace them (with - and _ respectively).
            // That is specified by the true boolean parameter to the Base64 call:
            this.shareContentZippedBase64 = Base64.fromUint8Array(deflateRaw(generateSPYFileContent()), true);
            eventBus.emit(CustomEventTypes.showStrypeModal, this.shareProjectChooseMethodDlgId);
        },
        
        copySnapshotLink() {
            this.appStore.trackMenuAction("share_snapshot");
            // Since we made the link content when showing the dialog, all we need to do is format it and copy it to the clipboard:
            navigator.clipboard.writeText(`${window.location}?${sharedStrypeProjectIdKey}=spy:${this.shareContentZippedBase64}`);

            eventBus.emit(CustomEventTypes.hideStrypeModal, {trigger: "ok", componentId: this.shareProjectChooseMethodDlgId});
        },

        copyCloudLink() {
            this.appStore.trackMenuAction("share_cloud");
            // We only share a project that is saved on a Cloud Drive. Show the user what mode of sharing to use (see details in shareProjectWithMode())
            if(this.canShareProjectViaCloud){
                this.publicModeProjectSharingLink = "";
                this.shareProjectInitialCall = true;
                // First we retrieve the current Cloud File sharing status, as we may need to restore the sharing status later
                const cloudDriveHandlerComponentAPI = vueComponentsAPIHandler.cloudDriveHandlerComponentAPI;
                cloudDriveHandlerComponentAPI?.getCurrentCloudFileCurrentSharingStatus(this.appStore.syncTarget)
                    .then((prevCloudFileSharingStatus) => {
                        // Save the status and then open the dialog.
                        cloudDriveHandlerComponentAPI?.backupPreviousCloudFileSharingStatus(this.appStore.syncTarget, prevCloudFileSharingStatus).then(() => {
                            eventBus.emit(CustomEventTypes.showStrypeModal, this.shareProjectModalDlgId);                             
                        });                       
                    })
                    .catch((_: any) => {
                        // Something happened, we let the user know
                        const erroMsg = (typeof _ == "string") ? _ : JSON.stringify(_);
                        this.appStore.simpleModalDlgMsg = this.$t("errorMessage.clouldFileRestoreSharingStatus", {drivename: vueComponentsAPIHandler.cloudDriveHandlerComponentAPI?.getDriveName()??"", errordetails: erroMsg});
                        eventBus.emit(CustomEventTypes.showStrypeModal, getAppSimpleMsgDlgId());
                    });

                eventBus.emit(CustomEventTypes.hideStrypeModal, {trigger: "ok", componentId: this.shareProjectChooseMethodDlgId});
            }
        },

        onStrypeMenuShowModalDlg(event: BvTriggerableEvent) {
            // This fires just before the dialog becomes visible/interactable (unlike
            // onStrypeMenuShownModalDlg below, which fires just after). The Examples... and
            // Book... dialogs reset their category/chapter selection to the first entry whenever
            // they're opened -- that reset needs to happen here, before the dialog can be
            // interacted with, rather than in the "shown" handler. Doing it on "shown" left a
            // window where a fast click (or, in CI, Playwright) could select a different
            // category/chapter while the dialog was already interactable but the "shown" event
            // hadn't fired yet, only for that selection to be silently wiped out moments later
            // when the reset ran -- e.g. clicking "Chapter 2" then having the list of projects
            // revert back to Chapter 1's, so a project by name in another chapter was never
            // found (see the regression test for this).
            const dlgId = event.componentId;
            if (dlgId == this.loadDemoProjectModalDlgId) {
                vueComponentsAPIHandler.openDemoDlgComponentAPI?.shown();
            }
            else if (dlgId == this.loadBookProjectModalDlgId) {
                (this.$refs.openBookDlg as InstanceType<typeof OpenBookDlg>).shown();
            }
            else if (dlgId == this.saveProjectModalDlgId && !this.isSynced && this.appStore.suggestedCloudSaveLocation) {
                // A project that comes from a Python file opened from a Cloud Drive or a Git provider is proposed to be saved there
                // (in the folder of that file, see currentDriveLocation)
                this.tempSyncTarget = this.appStore.suggestedCloudSaveLocation.target;
            }
        },

        onStrypeMenuShownModalDlg(event: BvTriggerableEvent) {
            const dlgId = event.componentId;
            // This method handles the workflow of the menu entries' related dialog
            this.showMenu = false;
            if(dlgId == this.saveProjectModalDlgId){
                this.saveAtOtherLocation = false;
                // After the above event is emitted, the Strype menu is closed and the focus is given back to the editor.
                // We want to give the focus back to the modal dialog input field and set its value.
                // Maybe because of internal Bootstrap behaviour, can't give focus to the input right now or in next ticks
                // so we wait a bit to generate a focus/click in the input.
                // We also check which target is selected to update target-depend UI in the modal.
                // If the dialog is closed again before this fires (e.g. a quick save), we must
                // cancel it -- otherwise it fires later regardless, against a stale/hidden input,
                // and the spurious .click() it performs can trigger unrelated UI (e.g. closing
                // whatever menu happens to be open at that moment via the editor's click-outside
                // handler) -- see the matching clearTimeout in onStrypeMenuHideModalDlg:
                this.saveDialogFocusTimeoutId = setTimeout(() => {
                    this.saveDialogFocusTimeoutId = undefined;
                    this.onSaveTargetChanged();
                    const saveFileNameInputElement = (document.getElementById(this.saveFileNameInputId) as HTMLInputElement);
                    // If the save as is opened because the user requested to create a copy of a file name, we use the file stored in the save existing file infos
                    // because if there are consecutive attempts with different names (that all already exist) we want to show the last attempted name
                    const saveExistingCloudProjectInfos = vueComponentsAPIHandler.cloudDriveHandlerComponentAPI?.getSaveExistingCloudProjectInfos();
                    if(saveExistingCloudProjectInfos){
                        saveFileNameInputElement.value = (saveExistingCloudProjectInfos.isCopyFileRequested)
                            ? saveExistingCloudProjectInfos.existingFileName
                            : this.appStore.projectName;
                    }
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
            else if(dlgId == this.shareProjectChooseMethodDlgId){
                // When the share method dialog opens, we focus the first method (snapshot) by default
                setTimeout(() => {
                    (document.querySelector(`#${dlgId} .${scssVars.projectTargetButtonClassName}`) as HTMLDivElement | null)?.focus();
                }, 100);
            }
            else if (dlgId != this.loadDemoProjectModalDlgId && dlgId != this.loadBookProjectModalDlgId) {
                // (The Examples... and Book... dialogs' own "shown" work happens earlier, in
                // onStrypeMenuShowModalDlg -- see its comment for why.)
                // When the load or save project dialogs are opened, we focus the button of the current target (the file system's by default when we don't have information about the source target).
                // The search is scoped to the opened dialog, so it does nothing for dialogs without target buttons.
                setTimeout(() => {
                    (document.querySelector(`#${dlgId} #${this.getTargetButtonId(this.tempSyncTarget, dlgId == this.saveProjectModalDlgId)}`) as HTMLDivElement | null)?.focus();
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
                this.showErrorForShareProjectLink(this.$t("errorMessage.sharingLinkTimedout"));
            }, noShareActionTimeOut);

            // With Cloud Drives, we allow two types of sharing: either sharing the Drive link (after setting the project readonly and totally public in the sharing settings)
            // or just getting a Strype URL with a shared Drive file ID (in that case, users getting the shared link still need to connect to the relevant Drive first.)
            let alertMessage = "";
            if(forShareMode == ShareProjectMode.public){
                // We only generate the link if we don't have it already (from one dialog opening)
                if(this.publicModeProjectSharingLink.length == 0) {
                    // Before generating a link, we change the file setttings on Google Drive to make it accessible at large.
                    const cloudDriveHandlerComponentAPI = vueComponentsAPIHandler.cloudDriveHandlerComponentAPI;
                    let createPermissionSucceeded = false;
                    cloudDriveHandlerComponentAPI?.shareCloudDriveFile(this.appStore.syncTarget)
                        .then((succeeded) => createPermissionSucceeded = succeeded)
                        .catch((errorMsg) => alertMessage = (errorMsg?.status)??errorMsg)
                        .finally(() => {
                            clearTimeout(noShareActionTimeOutHandle);
                            if(createPermissionSucceeded){
                                // We have set the file public on the Drive, now we retrieve the sharing link.
                                cloudDriveHandlerComponentAPI?.getPublicShareLink(this.appStore.syncTarget)
                                    .then(({respStatus, webLink}) => {
                                        // We got the link or not, but we can only make it useful or show an error *if the user is still expecting this sharing mode from the dialog (if not, we just return)
                                        if(this.areShareProjectActionStillValid(forShareMode)){
                                            if(respStatus == 200){
                                                this.publicModeProjectSharingLink = `${window.location}?${sharedStrypeProjectIdKey}=${encodeURIComponent(webLink)}`;                                    
                                            }
                                            else{
                                                // Something happened we couldn't make the link
                                                alertMessage = this.$t("errorMessage.cloudDrivePublicShareFailed", {error: (respStatus?.toString())??"unknown"});
                                            }
                                        }
                                    })
                                    .catch((error: any) => {
                                        // Something happened when we tried to get the public URL of the Google Drive file.
                                        alertMessage = this.$t("errorMessage.cloudDrivePublicShareFailed", {error: (error.status?.toString())??"unknown"});            
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
                                    alertMessage = this.$t("errorMessage.cloudDrivePublicShareFailed", {error: (alertMessage.length > 0) ? alertMessage: "unknow"});
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
            eventBus.emit(CustomEventTypes.hideStrypeModal, {trigger: "cancel", componentId: this.shareProjectModalDlgId});        
            this.appStore.simpleModalDlgMsg = alertMsg;
            eventBus.emit(CustomEventTypes.showStrypeModal, getAppSimpleMsgDlgId());        
        },

        onStrypeMenuHideModalDlg(event: BvTriggerableEvent, forcedProjectName?: string, saveReason ?: SaveRequestReason) {
            // This method handles the workflow after acting on any modal dialog of the Strype menu entries.
            // For most cases, if there is no confirmation, nothing special happens.
            // Only exception: if the user cancelled or proceeded to save a file copy following an clash with an existing project name on Google Drive,
            // we release the flag to indicate we were doing a file copy, to avoid messing up the targets in future calls of a load/save project
            const dlgId = event.componentId;
            if(dlgId == this.shareProjectModalDlgId){
                if(event.trigger == "ok"){
                    // The sharing link creation has succeed and we need to have a user action to allow a copy to the clipboard, which we do here.
                    // If the sharing mode is public, we have already stored the sharing link in a flag. If the sharing mode is "within Google Drive",
                    // we set the link value now.
                    navigator.clipboard.writeText((this.shareProjectMode == ShareProjectMode.public) ? this.publicModeProjectSharingLink : `${window.location}?${sharedStrypeProjectTargetKey}=${this.appStore.syncTarget}&${sharedStrypeProjectIdKey}=${this.appStore.currentCloudSaveFileId}`);
                    // If we have set the sharing to internal (within the Cloud Drive) then we might need to restore the previous sharing state as it was
                    if(this.shareProjectMode == ShareProjectMode.withinCloudDrive){
                        vueComponentsAPIHandler.cloudDriveHandlerComponentAPI?.restoreCloudDriveFileSharingStatus(this.appStore.syncTarget)
                            ?.finally(() => {
                                // Reset the flag we kept during the sharing action
                                vueComponentsAPIHandler.cloudDriveHandlerComponentAPI?.backupPreviousCloudFileSharingStatus(this.appStore.syncTarget, CloudFileSharingStatus.UNKNOWN);
                            });
                    }
                    else{
                        // Reset the flag we kept during the sharing action
                        vueComponentsAPIHandler.cloudDriveHandlerComponentAPI?.backupPreviousCloudFileSharingStatus(this.appStore.syncTarget, CloudFileSharingStatus.UNKNOWN);                         
                    }
                }
                else{
                    // When a sharing is cancelled, we may need to clean after ourselves and restore the sharing status of the file
                    // to what it was before we intefered with the sharing on the Cloud Drive.
                    vueComponentsAPIHandler.cloudDriveHandlerComponentAPI?.restoreCloudDriveFileSharingStatus(this.appStore.syncTarget);
                }
                return;
            }

            if(dlgId == this.saveProjectModalDlgId){
                // Cancel the delayed focus/click from onStrypeMenuShownModalDlg if it hasn't fired
                // yet -- the dialog is closing now, so it must not act later on a stale input:
                if(this.saveDialogFocusTimeoutId !== undefined){
                    clearTimeout(this.saveDialogFocusTimeoutId);
                    this.saveDialogFocusTimeoutId = undefined;
                }
                const saveExistingCloudProjectInfos = vueComponentsAPIHandler.cloudDriveHandlerComponentAPI?.getSaveExistingCloudProjectInfos();
                if(saveExistingCloudProjectInfos){
                    vueComponentsAPIHandler.cloudDriveHandlerComponentAPI?.setSaveExistingCloudProjectInfos({...saveExistingCloudProjectInfos, isCopyFileRequested: false});  
                }
            }

            if(event.trigger == "cancel" || event.trigger == "esc"){
                if(dlgId == this.saveOnLoadModalDlgId){
                    // Case of request to save/discard the file currently opened, before loading a new file:
                    // user chose to discard the file saving: we can trigger the file opening.
                    // Before we throw the current content away, back it up to the internal webstorage
                    // recovery copy (never the real FS/cloud target -- discarding must never silently
                    // write to the user's actual file) so it's still recoverable via the recent-states
                    // banner/Open Recent menu, exactly as if the tab had been closed instead of reused:
                    eventBus.emit(CustomEventTypes.backupEditorProjectBeforeDiscard);
                    if (this.afterSaveDialog && "spy" in this.afterSaveDialog) {
                        vueComponentsAPIHandler.appComponentAPI?.setStateFromPythonFile(this.afterSaveDialog.spy, this.afterSaveDialog.name, 0, false, "import")
                            .then(() => this.saveTargetChoice(StrypeSyncTarget.none), () => { /* error message already shown by pasteMixedPython() */ });
                    }
                    else if (this.afterSaveDialog && "dialog" in this.afterSaveDialog) {
                        eventBus.emit(CustomEventTypes.showStrypeModal, this.afterSaveDialog.dialog);
                    }
                    return;
                }

                // Other cases: reset the temporary sync file flag and the save as flag
                this.tempSyncTarget = this.appStore.syncTarget;
                this.currentModalButtonGroupIDInAction = "";
                this.requestSaveAs = false;
            }
            else if(event.trigger == "ok"){
                // Case of "load file"
                if(dlgId == this.loadProjectModalDlgId){
                    this.currentModalButtonGroupIDInAction = this.loadProjectTargetButtonGpId;
                    this.loadProject();
                }
                // Case of request to save/discard the file currently opened, before loading a new file.
                else if(dlgId == this.saveOnLoadModalDlgId){
                    eventBus.emit(CustomEventTypes.requestEditorProjectSaveNow, SaveRequestReason.loadProject);
                }
                // Case of standard "save file"
                else if(dlgId == this.saveProjectModalDlgId){
                    this.currentModalButtonGroupIDInAction = this.saveProjectTargetButtonGpId;
                    // User has been given a chance to give the file a specifc name,
                    // we check that the name doesn't contain illegal characters (we are a bit restricive here) for file saving
                    // DO NOT UPDATE THE CURRENT SYNC FLAG IN THE STATE - we only do that IF loading succeed (because it can be still cancelled or impossible to achieve)
                    let saveFileName = forcedProjectName || (document.getElementById(this.saveFileNameInputId) as HTMLInputElement).value.trim();
                    if(saveFileName.length == 0){
                        saveFileName = this.$t("defaultProjName");
                    }
                    
                    const selectValue = this.getTargetSelectVal();
                    // Reset the temporary sync file flag
                    this.tempSyncTarget = this.appStore.syncTarget;
                    if(!isSyncTargetCloudDrive(selectValue)){
                        if(!canBrowserSaveFilePicker() && saveFileName.trim().match(fileNameRegex) == null){
                            // Show an error message and do nothing special
                            this.appStore.simpleModalDlgMsg = this.$t("errorMessage.fileNameError");
                            eventBus.emit(CustomEventTypes.showStrypeModal, getAppSimpleMsgDlgId());
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
                                this.appStore.trackStorageLocation(StrypeSyncTarget.fs);
                                this.appStore.flushAnalyticsQueue("critical");
                                if(saveReason == SaveRequestReason.loadProject || this.requestOpenProjectLater) {
                                    eventBus.emit(CustomEventTypes.saveStrypeProjectDoneForLoad);
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
                            this.appStore.trackStorageLocation(StrypeSyncTarget.fs);
                            this.appStore.flushAnalyticsQueue("critical");
                            if(saveReason == SaveRequestReason.loadProject || this.requestOpenProjectLater) {
                                eventBus.emit(CustomEventTypes.saveStrypeProjectDoneForLoad);
                            }
                        }
                    }
                    else {          
                        // If we were already syncing to a Drive, we save the current file now, except if "saving as"
                        if(!this.requestSaveAs && isSyncTargetCloudDrive(this.appStore.syncTarget)){
                            eventBus.emit(CustomEventTypes.requestEditorProjectSaveNow, SaveRequestReason.autosave);
                        }
                        
                        // We postpone saving slight to make sure all autosaving have completed
                        setTimeout(() => {
                            // When the project name is enforced, user as clicked on "save", so we don't need to trigger the usual saving mechanism to select the location/filename
                            if(forcedProjectName){
                                this.currentModalButtonGroupIDInAction = "";
                                return;
                            }
                            const saveReason = (this.saveAtOtherLocation) ? SaveRequestReason.saveProjectAtOtherLocation : SaveRequestReason.saveProjectAtLocation; 
                            vueComponentsAPIHandler.cloudDriveHandlerComponentAPI?.setSaveFileName(saveFileName);
                            this.appStore.trackStorageLocation(selectValue);
                            this.appStore.flushAnalyticsQueue("critical");
                            vueComponentsAPIHandler.cloudDriveHandlerComponentAPI?.saveFile(selectValue, saveReason);
                        }, 2000);
                        
                    }
                    this.currentModalButtonGroupIDInAction = "";
                }
                else if (dlgId == this.loadDemoProjectModalDlgId) {
                    const selectedDemo = vueComponentsAPIHandler.openDemoDlgComponentAPI?.getSelectedDemo();
                    if (selectedDemo) {
                        selectedDemo.demoFile.then((content) => {
                            if (content) {
                                this.appStore.trackUsedDemo(selectedDemo.name ?? "Demo", selectedDemo.source);
                                this.afterSaveDialog = {spy: content, name: selectedDemo.name ?? "Demo"};
                                if (this.appStore.isEditorContentModified) {
                                    eventBus.emit(CustomEventTypes.showStrypeModal, this.saveOnLoadModalDlgId);
                                }
                                else {
                                    this.openLoadProjectDlgAfterSaved();
                                }
                            }
                        });
                    }
                }
                else if (dlgId == this.loadBookProjectModalDlgId) {
                    const selectedProject = (this.$refs.openBookDlg  as InstanceType<typeof OpenBookDlg>).getSelectedProject();
                    if (selectedProject) {
                        // We always show the book menu entry and dialog. However, the projects do not run on the micro:bit version.
                        // Therefore, if we are on the micro:bit version, instead of loading the selected project inside the current editor,
                        // we open a new tab pointing at the standard version with the project as if we shared it.
                        const projectName = selectedProject.name ?? "Book";
                        trackUsedBookProject(projectName, selectedProject.chapter, selectedProject.path);
                        // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
                        selectedProject.projectFile.then((content) => {
                            if (content) {
                                this.afterSaveDialog = {spy: content, name: projectName};
                                if (this.appStore.isEditorContentModified) {
                                    eventBus.emit(CustomEventTypes.showStrypeModal, this.saveOnLoadModalDlgId);
                                }
                                else {
                                    this.openLoadProjectDlgAfterSaved();
                                }
                            }
                        });
                        // #v-else
                        // For micro:bit, we can simply open a shared the project as an exteral resource since it exists in our public repository.
                        // Of course, this rely on how we expose the projects, and that we have the correct project name set.
                        window.open(`https://strype.org/editor/?${sharedStrypeProjectIdKey}=${encodeURI(`https://strype.org/editor/${selectedProject.path}/${projectName}.spy`)}`, "_blank");
                        // #v-endif
                    }
                }
            }
        },

        onSaveDiffLocationClick(){
            // When the button to save at a different location is called, we trigger the hiding of the modal dialog and and set the right flag about saving
            this.saveAtOtherLocation = true;
            eventBus.emit(CustomEventTypes.hideStrypeModal, {trigger: "ok", componentId: this.saveProjectModalDlgId});
        },

        loadProject(){
            // Called once sanity save has been performed
            if (this.tempLoadOld != null) {
                // They selected a recent state to load:
                void this.appStore.setStateFromJSONStr({stateJSONStr: this.tempLoadOld, readCompressed: true});
                return;
            }
            
            // If the user chose to sync on a Cloud Drive, we should open the Drive loader. Otherwise, we open default file system.
            // DO NOT UPDATE THE CURRENT SYNC FLAG IN THE STATE - we only do that IF loading succeed (because it can be still cancelled or impossible to achieve)
            const selectValue = (this.openSharedProjectId.length > 0) ? this.openSharedProjectTarget : this.getTargetSelectVal();
            // Reset the temporary sync file flag
            this.tempSyncTarget = this.appStore.syncTarget;
            if(isSyncTargetCloudDrive(selectValue) || this.openSharedProjectId.length > 0 ){
                vueComponentsAPIHandler.cloudDriveHandlerComponentAPI?.loadFile(selectValue);
            }            
            else{               
                // And let the user choose a file
                if(canBrowserOpenFilePicker()){
                    openFile([...this.strypeProjMIMEDescArray, ...this.pythonImportMIMEDescArray], this.appStore.strypeProjectLocation, (fileHandles: FileSystemFileHandle[]) => {
                        // We select 1 file so we can get the first element of the returned array
                        // We need to get the file content (hope for the best) and update the store
                        fileHandles[0].getFile().then((file: File) => {
                            const emitPayload: AppEvent = {requestAttention: true};
                            emitPayload.message = this.$t("appMessage.loadEditorFile");
                            this.$emit(CustomEventTypes.appShowProgressOverlay, emitPayload);
                            // Make sure the progress bar triggered above has been painted before the (synchronous, and potentially long) parse blocks the main thread:
                            void waitForNextPaint().then(() => {
                                const reader = new FileReader();
                                reader.addEventListener("load", () => {
                                    // name is not always available so we also check if content starts with a {,
                                    // which it will do for old-style spy files:
                                    if (file.name.endsWith(".py") || !(reader.result as string).trimStart().startsWith("{")) {
                                        vueComponentsAPIHandler.appComponentAPI?.setStateFromPythonFile(reader.result as string, fileHandles[0].name, file.lastModified, true, fileHandles[0])?.catch(() => { /* error message already shown by pasteMixedPython() */ });
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
                    emitPayload.message = this.$t("appMessage.loadEditorFile");
                    this.$emit(CustomEventTypes.appShowProgressOverlay, emitPayload);
                    // Store the file name in a variable to use it later in the callback, for some reason using files[0].name fails in Pinia, on Safari
                    const fileName = files[0].name;
                    const lastModified = files[0].lastModified;
                    // Take the File itself now: "files" is live, and the input's value is reset to empty at the end of this method
                    // (which empties it), i.e. before the paint-wait below completes.
                    const file = files[0];
                    // Make sure the progress overlay shown above has been painted before the (synchronous, and potentially long)
                    // parse blocks the main thread:
                    waitForNextPaint()
                        .then(() => readFileContent(file))
                        .then(
                            (content) => {
                                // name is not always available so we also check if content starts with a {,
                                // which it will do for spy files:
                                if (fileName.endsWith(".py") || !content.trimStart().startsWith("{")) {
                                    vueComponentsAPIHandler.appComponentAPI?.setStateFromPythonFile(content, fileName, lastModified, true, "local")?.catch(() => { /* error message already shown by pasteMixedPython() */ });
                                }
                                else {
                                    this.appStore.setStateFromJSONStr(
                                        {
                                            stateJSONStr: content,
                                        }
                                    ).then(() => this.onFileLoaded(fileName, lastModified, "local"), () => {});
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

        onFileLoaded(fileName: string, lastSaveDate: number, fileLocation: FileSystemFileHandle | "local" | "cloud" | "import"):void {
            this.saveTargetChoice(StrypeSyncTarget.fs);
            eventBus.emit(CustomEventTypes.addFunctionToEditorProjectSave, {syncTarget: StrypeSyncTarget.fs, function: (saveReason: SaveRequestReason) => this.saveCurrentProject(saveReason)});

            // Strip the extension from the file, if it was left in. Then we can update the file name and location (if avaiable)
            const noExtFileName = (fileName.includes(".")) ? fileName.substring(0, fileName.lastIndexOf(".")) : fileName;
            this.appStore.projectName = noExtFileName;
            if(typeof fileLocation !== "string"){
                this.appStore.strypeProjectLocation = fileLocation;
            }
            else if (fileLocation === "local" || fileLocation === "import") {
                this.appStore.strypeProjectLocation = undefined;
            }
            this.appStore.projectLastSaveDate = lastSaveDate;
            // Make sure we show the project is unmodified
            this.appStore.isEditorContentModified = false;
        },

        resetProject(): void {
            this.appStore.trackMenuAction("reset_project");
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
            if(e && this.isPythonRunning){
                // When the project runs, we can't open the menu, but we show some "notification" in the PEA
                // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
                document.dispatchEvent(new Event(CustomEventTypes.highlightPythonRunningState));
                // #v-endif
                return;
            }
            
            // Update errors in case they're about to download etc:
            checkCodeErrors();

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

        onTargetButtonKeyDown(event: KeyboardEvent, dlgId : string) {
            // Handle some basic keyboard logic for the target selection.

            // Space, left/right and up/down arrows should trigger a change of target
            const lowCaseEventKey = event.key.toLowerCase();
            if(lowCaseEventKey == " " || lowCaseEventKey == "arrowleft" || lowCaseEventKey == "arrowright" || lowCaseEventKey == "arrowup" || lowCaseEventKey == "arrowdown"){
                // The targets are laid out in rows: the primary targets on the first row, the secondary targets (if any)
                // on the second row, and, for the load dialog, the embedded project links (examples, book) on the last row.
                // Left/right (and space) loop through all of them in DOM order (row by row), up/down switch between the rows.
                const allTargetButtons = [...document.querySelectorAll(`#${dlgId} .${scssVars.projectTargetButtonClassName}`)] as HTMLElement[];
                const rows = [
                    allTargetButtons.filter((target) => !target.classList.contains("secondary-target")),
                    allTargetButtons.filter((target) => target.classList.contains("secondary-target")),
                    (dlgId == this.loadProjectModalDlgId) ? [...document.querySelectorAll(`#${dlgId} .open-menu-embedded-proj-link`)] as HTMLElement[] : [],
                ].filter((row) => row.length > 0);
                const targetButtons = rows.flat();
                const focusedButtonIndex = targetButtons.findIndex((target) => target == event.target);
                if(focusedButtonIndex > -1){
                    let newFocusedButton: HTMLElement | undefined;
                    if(lowCaseEventKey == "arrowup" || lowCaseEventKey == "arrowdown"){
                        // Only relevant if we have several rows (looping like left/right). Going to a row lands on its first target.
                        if(rows.length > 1){
                            const focusedRowIndex = rows.findIndex((row) => row.includes(targetButtons[focusedButtonIndex]));
                            const newRowIndex = (lowCaseEventKey == "arrowup")
                                ? ((focusedRowIndex - 1 >= 0) ? focusedRowIndex - 1 : rows.length - 1)
                                : ((focusedRowIndex + 1 < rows.length) ? focusedRowIndex + 1 : 0);
                            newFocusedButton = rows[newRowIndex][0];
                        }
                    }
                    else{
                        const newFocusedButtonIndex = (lowCaseEventKey == "arrowleft")
                            ? (((focusedButtonIndex - 1) >= 0) ? focusedButtonIndex - 1 : targetButtons.length - 1)
                            : (((focusedButtonIndex + 1) < targetButtons.length) ? focusedButtonIndex + 1 : 0);
                        newFocusedButton = targetButtons[newFocusedButtonIndex];
                    }
                    if(newFocusedButton){
                        newFocusedButton.focus();
                        if(dlgId == this.saveProjectModalDlgId) {
                            // Save immediately clicks (it only selects the target, it doesn't trigger an action):
                            newFocusedButton.click();
                        }
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
                const isEmbeddedProjLink = !!focusedTarget?.classList.contains("open-menu-embedded-proj-link");
                if(focusedTarget && (isEmbeddedProjLink || focusedTarget.classList.contains(scssVars.projectTargetButtonClassName))){
                    (focusedTarget as HTMLElement).click();
                    if(dlgId != this.loadProjectModalDlgId || isEmbeddedProjLink){
                        // On the save and share method dialogs, the action doesn't validate the modal dialog
                        // (and neither do the embedded project links of the load dialog, they open another dialog)
                        event.stopPropagation();
                        event.stopImmediatePropagation();
                        event.preventDefault();
                    }
                }
            }
        },

        performUndoRedo(isUndo: boolean): void {
            this.appStore.trackMenuAction(isUndo ? "undo" : "redo");
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
                    this.appStore.frameObjects[getFrameSectionIdFromFrameId(erroneousFrameId)].collapsedState = CollapsedState.FULLY_VISIBLE;
                     
                    // The error can be in a slot or it can be for a whole frame. By convention, the location for a frame error is the caret above it.
                    // For errors in a slot: we focus on the slot of the error -- if the erroneous HTML is a slot, we just give it focus. If the error is at the frame scope
                    // we put the focus in the first slot that is editable.
                    this.$nextTick(() => {
                        // Scroll error into middle of the view (if not already in view):
                        if (!isFullyInViewport(errorElement)) {
                            errorElement.scrollIntoView({block: "center"});
                        }
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
    color: #1B456F;
    border-radius: 50%;
}

.show-menu-btn.disabled {
    color: #78797c !important;
    cursor: default;
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
    // Override .bm-item-list > * (from vue3-burger-menu's own CSS, and the "flex" rule just
    // below this) forcing every direct child of the menu to display:flex -- that breaks a
    // <table>'s row/cell layout, so this needs to explicitly win it back.
    display: table !important;
    margin-left: 5%;
    color: black;
    border-collapse: collapse;
}

.appMenu-prefs-div td {
    padding: 2px 0;
}

.appMenu-prefs-div td:first-child {
    padding-right: 8px;
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
    background-color: transparent; // this is required for FF (at last from v150) to not apply some custom background
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

// The targets rows (and the embedded project links row) are wrapped in a block that shrinks to fit them, centered
// in the dialog: the primary targets are pushed to its sides, and the secondary targets fill the 3 equal columns
// of a grid spanning its full width, so both rows are aligned on their left and right sides. The embedded project
// links are laid out on the same grid, each spanning 2 columns, so they are centered between 2 secondary targets.
.project-targets-container {
    width: fit-content;
    margin-left: auto;
    margin-right: auto;
}

.secondary-targets-container,
.embedded-proj-links-container {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    column-gap: 10px;
}

.secondary-targets-container {
    margin-top: 15px;
    margin-bottom: 20px;
}

.embedded-proj-links-container {
    margin-bottom: 10px;
}

.embedded-proj-links-container > * {
    grid-row: 1;
    justify-self: center;
}

.embedded-proj-links-container > :nth-child(1) {
    grid-column: 1 / span 2;
}

.embedded-proj-links-container > :nth-child(2) {
    grid-column: 2 / span 2;
}

.secondary-target {
    flex-direction: row !important;
    justify-content: center !important;
    gap: 8px;
    font-size: 90%; // between the primary targets' font size and the embedded project links' (smaller)
    padding: 4px 10px !important;
    width: auto !important;
    border-radius: 6px !important;
}

.secondary-target img {
    width: 24px;
    height: 24px;
}

.clear-all-label {
    font-size: 80%;
    text-decoration: underline;
    color: #33f;
    cursor: pointer;
}

.open-menu-embedded-proj-link {
    font-size: smaller;
    cursor: pointer;
    color: inherit;
    text-decoration: none;
    border: #c5c4c1 2px solid;
    border-radius: 6px;
    padding: 4px 10px;
}

.open-menu-embedded-proj-link:hover,
.open-menu-embedded-proj-link:focus {
    border-color: #007bff;
    box-shadow: 2px 2px 5px rgb(141, 140, 140);
    outline: none;
}

.save-project-modal-dlg-container {
    display: table;
    border-spacing: 10px 10px;
}

.save-project-modal-dlg-container .modal-row {
    display: table-row;
}

.save-project-modal-dlg-container .modal-cell {
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
    justify-content: space-between;
    column-gap: 40px;
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
.#{$strype-classname-project-target-button}.share-method-dlg:focus,
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

// The primary targets grow to share the width of the targets block (set by the secondary targets row) so that
// only the container's column gap separates them, rather than a large empty space in the middle.
.project-target-button-container > .#{$strype-classname-project-target-button} {
    flex: 1 1 0;
    min-width: 150px;
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
    z-index: 503; // higher index than the overlay and PEA, but less than context menus and dialog modals
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

.bm-item-list > :not(.menu-separator-div):not(.appMenu-prefs-div) {
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

.share-method-container {
    display:grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 30px;
}
.share-method-container .project-target-button {
    width: 220px;
    justify-content: initial;
}
.share-method-container img {
    width: 160px;
    height: 140px;
    object-fit: contain;
    margin-top: 20px;
}

.share-method-title {
    font-weight: bold;
    font-size: 110%;
    text-align: center;
    margin-bottom: 15px;
}
.share-method-explanation {
    color: #777;
    font-size: 90%;
    text-align: center;
}
.share-method-warning {
    color: darkorange;
    font-size: 90%;
    text-align: center;
}
.recent-states-pane {
    /* Match bootstrap divider at top and bottom: */
    border-top: var(--bs-modal-header-border-width) solid var(--bs-modal-header-border-color);
    margin-top: 1rem;
    padding-top: 1rem;
}
.recent-state-button.#{$strype-classname-project-target-button} {
    width: 100%;
    align-items: start;
    cursor: pointer;
}
.load-recent-states-list {
    margin-top: 0.5rem;
    overflow-y:auto;
}
.#{$strype-classname-project-recent-state-label} {
    display: block;
    padding-left: 1rem;
}
.recent-state-sublabel {
    display: block;
    color: #aaa;
    padding-left: 3rem;
}
</style>
