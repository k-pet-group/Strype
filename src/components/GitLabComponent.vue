/**
 * The CloudDriveComponent implementation for GitLab (gitlab.com, or a self-managed instance).
 * Even if GitLab isn't a cloud as such, we use the same common handler.
 * Most of it is shared by all Git providers (see useGitProvider()): what is specific to GitLab is the signing in,
 * which starts with the choice of the GitLab instance.
 */
<template>
    <!-- The connection popup is opened when this dialog is validated -->
    <ModalDlg :dlgId="instanceDlgId" :dlgTitle="$t('appMessage.gitLabConnectTitle')" :okCustomTitle="$t('buttonLabel.connect')"
        :okDisabled="!chosenInstance" :elementToFocusId="instanceSelectId" showCloseBtn>
        <div class="gitlab-instance-dlg-container">
            <label :for="instanceSelectId" class="gitlab-instance-title">{{$t("appMessage.gitLabInstanceLabel")}}</label>
            <select :id="instanceSelectId" class="form-select" v-model="selectedOption">
                <option :value="GITLAB_COM_URL">GitLab.com</option>
                <option v-for="instance in instancesHistory.selfManagedInstances" :key="instance.url" :value="instance.url">{{getInstanceDisplayName(instance.url)}}</option>
                <option :value="newInstanceOption">{{$t("appMessage.gitLabSelfManaged")}}</option>
            </select>
            <span v-if="selectedOption == GITLAB_COM_URL" class="gitlab-instance-details">{{$t("appMessage.gitLabComDetails")}}</span>
            <template v-else-if="selectedOption == newInstanceOption">
                <span class="gitlab-instance-details">{{$t("appMessage.gitLabSelfManagedDetails")}}</span>
                <input type="text" class="form-control form-control-sm" autocomplete="url" spellcheck="false"
                    v-model="newInstanceUrl" placeholder="https://gitlab.example.org" :aria-label="$t('appMessage.gitLabInstanceUrl')" />
                <input type="text" class="form-control form-control-sm" autocomplete="off" spellcheck="false"
                    v-model="newInstanceClientId" :placeholder="$t('appMessage.gitLabClientId')" :aria-label="$t('appMessage.gitLabClientId')" />
            </template>
            <button v-else type="button" class="btn btn-link btn-sm gitlab-instance-forget-btn" @click="forgetSelectedInstance">{{$t("appMessage.gitLabForgetInstance")}}</button>
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
import { connectToGitLab, forgetGitLabInstance, getGitLabComInstance, getSelfManagedGitLabInstance, GITLAB_COM_URL, GitLabAuth, gitLabAPI, GitLabInstance, loadGitLabInstancesHistory, rememberGitLabInstance } from "@/helpers/gitlabAuth";
import { GitProviderComponentProps, useGitProvider } from "@/helpers/gitProvider";
import { StrypeSyncTarget } from "@/types/types";
import { BvTriggerableEvent } from "bootstrap-vue-next";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<GitProviderComponentProps>();

const driveName = "GitLab";
const filePicker = ref<InstanceType<typeof GitFilePickerDlg> | null>(null);
// (the connection data also holds the instance it was obtained from, with Strype's application ID on it)
const gitProvider = useGitProvider<GitLabAuth>({target: StrypeSyncTarget.gl, driveName, driveAPIName: "GitLab REST API", api: gitLabAPI, props, filePicker});

// Instance choice: gitlab.com, one of the self-managed instances connected to before (remembered between sessions), or a new one.
// The selected option's value is the instance's URL, or newInstanceOption (that can't be a URL) for a new one.
const instanceDlgId = "gitLabInstanceDlg";
const instanceSelectId = "gitLabInstanceSelect";
const newInstanceOption = "new";
const instancesHistory = ref(loadGitLabInstancesHistory());
const selectedOption = ref(instancesHistory.value.lastUsedUrl);
// (the details typed for a new instance are kept while Strype is open, in case the connection failed and the user tries again)
const newInstanceUrl = ref("");
const newInstanceClientId = ref("");
// The instance to connect to, or undefined if the details of a new one are incomplete or invalid
const chosenInstance = computed((): GitLabInstance | undefined => {
    if(selectedOption.value == GITLAB_COM_URL){
        return getGitLabComInstance();
    }
    if(selectedOption.value == newInstanceOption){
        return getSelfManagedGitLabInstance(newInstanceUrl.value, newInstanceClientId.value);
    }
    return instancesHistory.value.selfManagedInstances.find((instance) => instance.url == selectedOption.value);
});
// The callback given to signIn(), called once connected (null when no sign-in is in progress)
let pendingSignInCallback: ((cloudTarget: StrypeSyncTarget) => void) | null = null;

onMounted(() => {
    eventBus.on(CustomEventTypes.strypeModalHidden, onInstanceDlgHidden);
});

onBeforeUnmount(() => {
    eventBus.off(CustomEventTypes.strypeModalHidden, onInstanceDlgHidden);
});

function signIn(callback: (cloudTarget: StrypeSyncTarget) => void) {
    // We first ask which GitLab to connect to (preselecting the one last connected to): the connection is done when that dialog is validated.
    pendingSignInCallback = callback;
    instancesHistory.value = loadGitLabInstancesHistory();
    selectedOption.value = instancesHistory.value.lastUsedUrl;
    eventBus.emit(CustomEventTypes.showStrypeModal, instanceDlgId);
}

// Shows an instance by its address, without the (usual) "https://"
function getInstanceDisplayName(url: string): string {
    return url.replace(/^https:\/\//, "");
}

function forgetSelectedInstance() {
    forgetGitLabInstance(selectedOption.value);
    instancesHistory.value = loadGitLabInstancesHistory();
    selectedOption.value = GITLAB_COM_URL;
    document.getElementById(instanceSelectId)?.focus();
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
    const instance = chosenInstance.value;
    if(!instance){
        // The dialog can be validated with the Enter key even when its OK button is disabled: show it again
        eventBus.emit(CustomEventTypes.showStrypeModal, instanceDlgId);
        return;
    }
    const callback = pendingSignInCallback;
    pendingSignInCallback = null;
    if(callback){
        // The instance is only remembered once connected to, so a mistyped one doesn't end up in the list
        gitProvider.completeSignIn(connectToGitLab(instance).then((auth) => {
            rememberGitLabInstance(instance);
            if(selectedOption.value == newInstanceOption){
                newInstanceUrl.value = "";
                newInstanceClientId.value = "";
            }
            return auth;
        }), callback);
    }
}

defineExpose(gitProvider.toExposed(signIn));
</script>
<style lang="scss">
.gitlab-instance-title {
    font-weight: 600;
}

.gitlab-instance-dlg-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.gitlab-instance-details {
    font-size: 90%;
}

.gitlab-instance-forget-btn {
    align-self: flex-start;
    padding: 0;
}
</style>
