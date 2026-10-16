/**
 * The file picker dialog shared by all Git providers: the user chooses a repository and a branch,
 * then browses that branch's files. The provider-specific queries are given by the parent.
 * The dialog can also be opened to save a project: the user then chooses a folder (by default, the root of the
 * "Strype" repository, which is proposed for creation if it doesn't exist) and gives the commit message.
 */
<template>
    <ModalDlg :dlgId="dlgId" :dlgTitle="(isSaving) ? $t('appMessage.gitSaveTitle', {providername: providerName}) : $t('appMessage.selectStrypeFile')" showCloseBtn size="lg"
        :okCustomTitle="$t((isSaving) ? 'buttonLabel.save' : 'buttonLabel.select')" :okDisabled="isBusy || selectedBranch.length == 0 || pickedItem == null">
        <div class="git-file-picker-selectors">
            <template v-if="isSaving">
                <span>{{$t("appMessage.fileName")}}</span>
                <span class="git-file-picker-file-name">{{saveFileName}}</span>
            </template>
            <label :for="repositorySelectId">{{$t("appMessage.gitRepository")}}</label>
            <select :id="repositorySelectId" class="form-select" v-model="selectedRepository" @change="onRepositorySelected"
                :disabled="isBusy || repositoryOptions.length == 0">
                <option v-for="repository in repositoryOptions" :key="repository.value" :value="repository.value">{{repository.label}}</option>
            </select>
            <label :for="branchSelectId">{{$t("appMessage.gitBranch")}}</label>
            <select :id="branchSelectId" class="form-select" v-model="selectedBranch" @change="loadRootContent"
                :disabled="isBusy || branches.length < 2">
                <option v-for="branch in branches" :key="branch" :value="branch">{{branch}}</option>
            </select>
            <p v-if="errorMsg.length > 0" class="text-danger git-file-picker-full-row">{{errorMsg}}</p>
            <!-- The picker is an input like the others: it is aligned with them, and framed so it stands out. -->
            <span class="git-file-picker-tree-label">{{$t((isSaving) ? "appMessage.gitFolder" : "appMessage.gitFile")}}</span>
            <div class="git-file-picker-tree">
                <CloudDriveItemPicker :mode="(isSaving) ? CloudDriveItemPickerMode.FOLDERS : CloudDriveItemPickerMode.FILES" :fileExtFilter="fileExtensions"
                    :rootFolder="pickerRootFolder" :fetchFolderChildren="fetchFolderChildren" @pickedItemChanged="pickedItem = $event" />
            </div>
            <template v-if="isSaving">
                <label :for="commitMessageInputId">{{$t("appMessage.gitCommitMessage")}}</label>
                <input :id="commitMessageInputId" v-model="commitMessage" :placeholder="defaultCommitMessage" type="text" autocomplete="off" class="form-control" />
            </template>
        </div>
    </ModalDlg>
</template>
<script setup lang="ts">
import ModalDlg from "@/components/ModalDlg.vue";
import CloudDriveItemPicker from "@/components/CloudDriveItemPicker.vue";
import i18n from "@/i18n";
import { eventBus } from "@/helpers/appContext";
import { pythonFileExtension, strypeFileExtension } from "@/helpers/common";
import { CustomEventTypes } from "@/helpers/editor";
import { getDefaultGitCommitMessage } from "@/helpers/gitProvider";
import { CloudDriveItemPickerItem, CloudDriveItemPickerMode } from "@/types/cloud-drive-types";
import { GitContentItem, GitFileIdStruct, GitFilePickerQueries, GitRepository, GitSaveChoice, isStrypeRepository, strypeRepositoryName } from "@/types/git-provider-types";
import { BvTriggerableEvent } from "bootstrap-vue-next";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<{
    dlgId: string,
    providerName: string,
    queries: GitFilePickerQueries,
}>();

const emit = defineEmits<{
    filePicked: [file: GitFileIdStruct],
    unsupportedFilePicked: [],
    saveChosen: [choice: GitSaveChoice],
    saveCancelled: [],
}>();

const fileExtensions = ["." + strypeFileExtension, "." + pythonFileExtension];
// In a given repository and branch, the path of an item identifies it: the root's path is empty.
const rootFolderId = "";
// When saving and there is no "Strype" repository, we propose it anyway: it is created if the user saves into it.
// (Full names from the providers never start with "/", so this value can't be confused with a repository's.)
const newStrypeRepositoryValue = "/" + strypeRepositoryName;
// (a new repository is empty, so it has no branch yet: its first commit creates this one)
const newRepositoryBranch = "main";
const repositorySelectId = props.dlgId + "-repository";
const branchSelectId = props.dlgId + "-branch";
const commitMessageInputId = props.dlgId + "-commitMessage";
const isSaving = ref(false);
const saveFileName = ref("");
const commitMessage = ref("");
const defaultCommitMessage = ref("");
const repositories = ref<GitRepository[]>([]);
const branches = ref<string[]>([]);
const selectedRepository = ref("");
const selectedBranch = ref("");
// The picker starts again from the root every time we set a new object here
const pickerRootFolder = ref<CloudDriveItemPickerItem | null>(null);
// When saving, the folder opened in the picker; otherwise, the file selected in the picker
const pickedItem = ref<CloudDriveItemPickerItem | null>(null);
const errorMsg = ref("");
const pendingQueriesCount = ref(0);
const isBusy = computed(() => pendingQueriesCount.value > 0);
const isNewStrypeRepositorySelected = computed(() => selectedRepository.value == newStrypeRepositoryValue);
const repositoryOptions = computed(() => {
    const options = repositories.value.map((repository) => ({value: repository.fullName, label: repository.fullName}));
    if(isSaving.value && !repositories.value.some(isStrypeRepository)){
        options.unshift({value: newStrypeRepositoryValue, label: i18n.global.t("appMessage.gitNewRepository", {name: strypeRepositoryName})});
    }
    return options;
});
onMounted(() => {
    eventBus.on(CustomEventTypes.strypeModalHidden, onDlgHidden);
});

onBeforeUnmount(() => {
    eventBus.off(CustomEventTypes.strypeModalHidden, onDlgHidden);
});

// Runs a query to the provider: the picker shows it is busy meanwhile, and shows an error message if the query fails (we then get null).
async function runQuery<T>(query: () => Promise<T>): Promise<T | null> {
    pendingQueriesCount.value++;
    try{
        return await query();
    }
    catch(error){
        errorMsg.value = i18n.global.t("appMessage.gitLoadingError", {providername: props.providerName, error: (error as Error).message});
        return null;
    }
    finally{
        pendingQueriesCount.value--;
    }
}

function toPickerItems(gitItems: GitContentItem[], parentPath: string): CloudDriveItemPickerItem[] {
    return gitItems.map((item) => ({id: item.path, name: item.name, isFolder: item.isFolder, parentId: parentPath}));
}

async function loadRepositories() {
    const loadedRepositories = await runQuery(() => props.queries.listRepositories());
    if(loadedRepositories == null){
        return;
    }
    repositories.value = loadedRepositories;
    // When saving, we show the "Strype" repository (that may need to be created).
    // Otherwise, we show the repository selected last time if it's available, or else the first one.
    const repositoryToSelect = (isSaving.value)
        ? (loadedRepositories.find(isStrypeRepository)?.fullName ?? newStrypeRepositoryValue)
        : ((loadedRepositories.some((repository) => repository.fullName == selectedRepository.value))
            ? selectedRepository.value
            : (loadedRepositories[0]?.fullName ?? ""));
    // (we keep the branch selected last time if we stay on the same repository, except when saving: we use the default branch)
    const isSameRepository = (repositoryToSelect == selectedRepository.value);
    selectedRepository.value = repositoryToSelect;
    await onRepositorySelected(isSameRepository && !isSaving.value);
}

async function onRepositorySelected(keepSelectedBranch?: boolean | Event) {
    // (when called by the select's change event, we get that event as argument: we don't keep the branch then)
    const repositoryFullName = selectedRepository.value;
    pickerRootFolder.value = null;
    if(repositoryFullName.length == 0){
        branches.value = [];
        selectedBranch.value = "";
        return;
    }
    if(isNewStrypeRepositorySelected.value){
        branches.value = [newRepositoryBranch];
        selectedBranch.value = newRepositoryBranch;
        await loadRootContent();
        return;
    }
    const loadedBranches = await runQuery(() => props.queries.listBranches(repositoryFullName));
    if(loadedBranches == null || selectedRepository.value != repositoryFullName){
        // Failed, or the user has selected another repository in the meantime
        return;
    }
    const defaultBranch = repositories.value.find((repository) => repository.fullName == repositoryFullName)?.defaultBranch ?? "";
    // An empty repository has no branch yet, but we can still save in it: the first commit creates the branch.
    // (GitLab doesn't give a default branch for an empty project: we then use the usual one.)
    branches.value = (loadedBranches.length == 0 && isSaving.value) ? [defaultBranch || newRepositoryBranch] : loadedBranches;
    if(!(keepSelectedBranch === true && branches.value.includes(selectedBranch.value))){
        selectedBranch.value = (branches.value.includes(defaultBranch)) ? defaultBranch : (branches.value[0] ?? "");
    }
    await loadRootContent();
}

function loadRootContent() {
    if(selectedRepository.value.length == 0 || selectedBranch.value.length == 0){
        pickerRootFolder.value = null;
        return;
    }
    errorMsg.value = "";
    // The picker shows the repository's root first (with a generic name in the breadcrumbs), and gets the folders' content with fetchFolderChildren().
    // When saving, we save in the folder opened in the picker: by default, the repository's root.
    // (A new object is needed even if it's the same root again, so the picker starts again from the root for that repository and branch.)
    pickerRootFolder.value = {id: rootFolderId, name: i18n.global.t("appMessage.gitRepositoryRootBreadcrumb"), isFolder: true};
}

async function fetchFolderChildren(folderId: string): Promise<CloudDriveItemPickerItem[]> {
    // (a repository that doesn't exist yet has no content)
    if(isNewStrypeRepositorySelected.value){
        return [];
    }
    // (on failure, runQuery() shows the error and the folder is shown empty)
    const items = await runQuery(() => props.queries.listFolderContent(selectedRepository.value, selectedBranch.value, folderId));
    return toPickerItems(items ?? [], folderId);
}

function onDlgHidden(event: BvTriggerableEvent) {
    if(event.componentId != props.dlgId){
        return;
    }
    if(event.trigger == "ok" && selectedBranch.value.length > 0){
        onPickedItem(pickedItem.value);
    }
    else if(isSaving.value){
        // (the dialog can be validated with the Enter key even when its OK button is disabled: that's a cancellation too)
        emit("saveCancelled");
    }
}

function onPickedItem(pickedItem: CloudDriveItemPickerItem | null) {
    if(isSaving.value){
        // (the picker only shows folders here; with nothing picked, we use the root)
        const folderPath = pickedItem?.id ?? rootFolderId;
        // (Git doesn't allow an empty message: we use the default one then)
        const trimmedCommitMessage = commitMessage.value.trim();
        emit("saveChosen", {
            location: {repoId: selectedRepository.value, branchId: selectedBranch.value, folderPath},
            commitMessage: (trimmedCommitMessage.length > 0) ? trimmedCommitMessage : defaultCommitMessage.value,
            createStrypeRepository: isNewStrypeRepositorySelected.value,
        });
        return;
    }
    // A folder isn't something we can load
    if(pickedItem && !pickedItem.isFolder){
        // The picker already filters the files, but we have a mechanism for unsupported files anyway, so let's double check for safety
        if(!fileExtensions.some((fileExtension) => pickedItem.name.endsWith(fileExtension))){
            emit("unsupportedFilePicked");
            return;
        }
        emit("filePicked", {repoId: selectedRepository.value, branchId: selectedBranch.value, path: pickedItem.id, fileName: pickedItem.name});
    }
}

function show(saving: boolean): Promise<void> {
    errorMsg.value = "";
    isSaving.value = saving;
    pickerRootFolder.value = null;
    eventBus.emit(CustomEventTypes.showStrypeModal, props.dlgId);
    return loadRepositories();
}

// Shows the dialog to pick a file to load, starting from the given repository and branch if any, or else from the ones used last.
function open(startingSelection?: {repoId: string, branchId: string}): Promise<void> {
    if(startingSelection){
        rememberSelection(startingSelection.repoId, startingSelection.branchId);
    }
    return show(false);
}

// Shows the dialog to choose where to save a project (with the given file name, including the extension) and the commit message.
function openForSave(fileName: string): Promise<void> {
    saveFileName.value = fileName;
    defaultCommitMessage.value = getDefaultGitCommitMessage();
    commitMessage.value = defaultCommitMessage.value;
    return show(true);
}

// Selects a repository and a branch for the next time the dialog is opened (e.g. those of a file loaded by other means).
function rememberSelection(repository: string, branch: string) {
    selectedRepository.value = repository;
    selectedBranch.value = branch;
}

defineExpose({open, openForSave, rememberSelection});
</script>
<style lang="scss">
.git-file-picker-selectors {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 5px 10px;
    margin-bottom: 10px;
}

.git-file-picker-file-name {
    font-weight: 600;
}

.git-file-picker-full-row {
    grid-column: 1 / -1;
    margin: 0;
}

// (the label is aligned with the first line of the tree, not its middle)
.git-file-picker-tree-label {
    align-self: start;
    padding-top: 6px;
}

// Framed like the other inputs (Bootstrap's form controls)
.git-file-picker-tree {
    min-width: 0;
    border: var(--bs-border-width, 1px) solid var(--bs-border-color, #dee2e6);
    border-radius: var(--bs-border-radius, 0.375rem);
    padding: 6px 12px;
}
</style>
