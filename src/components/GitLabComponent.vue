/**
 * The CloudDriveComponent implementation for GitLab (gitlab.com, or a self-managed instance).
 * Even if GitLab isn't a cloud as such, we use the same common handler.
 * Most of it is shared by all Git providers (see useGitProvider()): what is specific to GitLab is the signing in,
 * which starts with the choice of the GitLab instance.
 */
<template>
    <!-- The connection popup is opened when this dialog is validated -->
    <ModalDlg :dlgId="instanceDlgId" :dlgTitle="$t('appMessage.gitLabConnectTitle')" :okCustomTitle="$t('buttonLabel.connect')"
        :okDisabled="!isInstanceChoiceValid" :elementToFocusId="gitLabComRadioBtnId" showCloseBtn>
        <div class="gitlab-instance-dlg-container">
            <span class="gitlab-instance-title">{{$t("appMessage.gitLabInstanceLabel")}}</span>
            <div class="gitlab-instance-option">
                <input type="radio" :id="gitLabComRadioBtnId" name="gitLabInstanceRadioGroup" v-model="instanceChoice.useGitLabCom" :value="true" />
                <div>
                    <label :for="gitLabComRadioBtnId">GitLab.com</label>
                    <span class="gitlab-instance-details">{{$t("appMessage.gitLabComDetails")}}</span>
                </div>
            </div>
            <div class="gitlab-instance-option">
                <input type="radio" :id="gitLabSelfManagedRadioBtnId" name="gitLabInstanceRadioGroup" v-model="instanceChoice.useGitLabCom" :value="false" />
                <div>
                    <label :for="gitLabSelfManagedRadioBtnId">{{$t("appMessage.gitLabSelfManaged")}}</label>
                    <span class="gitlab-instance-details">{{$t("appMessage.gitLabSelfManagedDetails")}}</span>
                    <!-- Typing in these fields selects the "self-managed" option -->
                    <input type="text" class="form-control form-control-sm" autocomplete="url" spellcheck="false"
                        v-model="instanceChoice.selfManagedUrl" @focus="instanceChoice.useGitLabCom = false"
                        placeholder="https://gitlab.example.org" :aria-label="$t('appMessage.gitLabInstanceUrl')" />
                    <input type="text" class="form-control form-control-sm" autocomplete="off" spellcheck="false"
                        v-model="instanceChoice.selfManagedClientId" @focus="instanceChoice.useGitLabCom = false"
                        :placeholder="$t('appMessage.gitLabClientId')" :aria-label="$t('appMessage.gitLabClientId')" />
                </div>
            </div>
        </div>
    </ModalDlg>
    <GitFilePickerDlg ref="filePicker" dlgId="gitLabFilePickerDlg" :providerName="driveName" :queries="gitProvider.filePickerQueries"
        @filePicked="gitProvider.onFilePicked" @unsupportedFilePicked="props.onUnsupportedByStrypeFilePicked"
        @saveChosen="gitProvider.onSaveChosen" @saveCancelled="props.onFolderToSavePickCancelled" />
</template>
<script setup lang="ts">
import ModalDlg from "@/components/ModalDlg.vue";
import GitFilePickerDlg from "@/components/GitFilePickerDlg.vue";
import { eventBus } from "@/helpers/appContext";
import { CustomEventTypes } from "@/helpers/editor";
import { connectToGitLab, getGitLabInstance, GitLabAuth, gitLabAPI, loadGitLabInstanceChoice, saveGitLabInstanceChoice } from "@/helpers/gitlabAuth";
import { GitProviderComponentProps, useGitProvider } from "@/helpers/gitProvider";
import { StrypeSyncTarget } from "@/types/types";
import { BvTriggerableEvent } from "bootstrap-vue-next";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<GitProviderComponentProps>();

const driveName = "GitLab";
const filePicker = ref<InstanceType<typeof GitFilePickerDlg> | null>(null);
// (the connection data also holds the instance it was obtained from, with Strype's application ID on it)
const gitProvider = useGitProvider<GitLabAuth>({target: StrypeSyncTarget.gl, driveName, driveAPIName: "GitLab REST API", api: gitLabAPI, props, filePicker});

// Instance choice (gitlab.com or self-managed), remembered between sessions
const instanceDlgId = "gitLabInstanceDlg";
const gitLabComRadioBtnId = "gitLabComRadioBtn";
const gitLabSelfManagedRadioBtnId = "gitLabSelfManagedRadioBtn";
const instanceChoice = ref(loadGitLabInstanceChoice());
const isInstanceChoiceValid = computed(() => getGitLabInstance(instanceChoice.value) !== undefined);
// The callback given to signIn(), called once connected (null when no sign-in is in progress)
let pendingSignInCallback: ((cloudTarget: StrypeSyncTarget) => void) | null = null;

onMounted(() => {
    eventBus.on(CustomEventTypes.strypeModalHidden, onInstanceDlgHidden);
});

onBeforeUnmount(() => {
    eventBus.off(CustomEventTypes.strypeModalHidden, onInstanceDlgHidden);
});

function signIn(callback: (cloudTarget: StrypeSyncTarget) => void) {
    // We first ask which GitLab to connect to (prefilled with the previous choice): the connection is done when that dialog is validated.
    pendingSignInCallback = callback;
    instanceChoice.value = loadGitLabInstanceChoice();
    eventBus.emit(CustomEventTypes.showStrypeModal, instanceDlgId);
}

function onInstanceDlgHidden(event: BvTriggerableEvent) {
    if(event.componentId != instanceDlgId){
        return;
    }
    if(event.trigger != "ok"){
        // The user gave up signing in
        pendingSignInCallback = null;
        return;
    }
    // The dialog was validated, so the connection popup is opened from the user's action.
    const instance = getGitLabInstance(instanceChoice.value);
    if(!instance){
        // The dialog can be validated with the Enter key even when its OK button is disabled: show it again
        eventBus.emit(CustomEventTypes.showStrypeModal, instanceDlgId);
        return;
    }
    saveGitLabInstanceChoice(instanceChoice.value);
    const callback = pendingSignInCallback;
    pendingSignInCallback = null;
    if(callback){
        gitProvider.completeSignIn(connectToGitLab(instance), callback);
    }
}

defineExpose(gitProvider.toExposed(signIn));
</script>
<style lang="scss">
.gitlab-instance-title {
    font-weight: 600;
}

.gitlab-instance-option {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 10px 0 0 20px;
}

.gitlab-instance-option input[type="radio"] {
    margin-top: 5px;
}

.gitlab-instance-option > div {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.gitlab-instance-details {
    font-size: 90%;
}
</style>
