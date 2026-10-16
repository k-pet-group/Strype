/**
 * The file picker dialog shared by all Git providers: the user chooses a repository and a branch,
 * then browses that branch's files. The provider-specific queries are given by the parent.
 */
<template>
    <ModalDlg :dlgId="dlgId" :dlgTitle="$t('appMessage.selectStrypeFile')" showCloseBtn size="lg"
        :okCustomTitle="$t('buttonLabel.select')" :okDisabled="isBusy || selectedBranch.length == 0">
        <div class="git-file-picker-selectors">
            <label :for="repositorySelectId">{{$t("appMessage.gitRepository")}}</label>
            <select :id="repositorySelectId" class="form-select" v-model="selectedRepository" @change="onRepositorySelected"
                :disabled="isBusy || repositories.length == 0">
                <option v-for="repository in repositories" :key="repository.fullName" :value="repository.fullName">{{repository.fullName}}</option>
            </select>
            <label :for="branchSelectId">{{$t("appMessage.gitBranch")}}</label>
            <select :id="branchSelectId" class="form-select" v-model="selectedBranch" @change="loadRootContent"
                :disabled="isBusy || branches.length == 0">
                <option v-for="branch in branches" :key="branch" :value="branch">{{branch}}</option>
            </select>
        </div>
        <p v-if="errorMsg.length > 0" class="text-danger">{{errorMsg}}</p>
        <CloudDriveItemPicker ref="itemPicker" :mode="CloudDriveItemPickerMode.FILES" :fileExtFilter="fileExtensions"
            :rawRootData="rootItems" :emptyText="$t('appMessage.emptyCloudDrivePicker', {drivename: providerName})"
            @[CustomEventTypes.requestedCloudDriveItemChildren]="fetchFolderChildren"
            @[CustomEventTypes.exposedCloudDrivePickerPickedItem]="onPickedItem"
            @[CustomEventTypes.requestedCloudDrivePickerRefresh]="loadRootContent" />
    </ModalDlg>
</template>
<script setup lang="ts">
import ModalDlg from "@/components/ModalDlg.vue";
import CloudDriveItemPicker from "@/components/CloudDriveItemPicker.vue";
import i18n from "@/i18n";
import { eventBus } from "@/helpers/appContext";
import { pythonFileExtension, strypeFileExtension } from "@/helpers/common";
import { CustomEventTypes } from "@/helpers/editor";
import { CloudDriveItemPickerItem, CloudDriveItemPickerMode } from "@/types/cloud-drive-types";
import { GitContentItem, GitFileIdStruct, GitFilePickerQueries, GitRepository } from "@/types/git-provider-types";
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
}>();

const fileExtensions = ["." + strypeFileExtension, "." + pythonFileExtension];
const repositorySelectId = props.dlgId + "-repository";
const branchSelectId = props.dlgId + "-branch";
const itemPicker = ref<InstanceType<typeof CloudDriveItemPicker> | null>(null);
const repositories = ref<GitRepository[]>([]);
const branches = ref<string[]>([]);
const selectedRepository = ref("");
const selectedBranch = ref("");
const rootItems = ref<CloudDriveItemPickerItem[]>([]);
const errorMsg = ref("");
const pendingQueriesCount = ref(0);
const isBusy = computed(() => pendingQueriesCount.value > 0);
// The picker also answers requests from other drives' dialogs (they are sent on the document), so we only
// consider a picked item when we asked for it.
let isExpectingPickedItem = false;

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
    // In a given repository and branch, the path of an item identifies it.
    return gitItems.map((item) => ({id: item.path, name: item.name, isFolder: item.isFolder, parentId: parentPath}));
}

async function loadRepositories(startingRepository: string | undefined) {
    const loadedRepositories = await runQuery(() => props.queries.listRepositories());
    if(loadedRepositories == null){
        return;
    }
    repositories.value = loadedRepositories;
    // We show the starting repository if given, or else the one used last time, or else the first one (if they're available)
    const repositoryToSelect = [startingRepository, selectedRepository.value]
        .find((fullName) => fullName && loadedRepositories.some((repository) => repository.fullName == fullName))
        ?? loadedRepositories[0]?.fullName ?? "";
    // (we keep the branch used last time if we stay on the same repository)
    const isSameRepository = (repositoryToSelect == selectedRepository.value);
    selectedRepository.value = repositoryToSelect;
    await onRepositorySelected(isSameRepository);
}

async function onRepositorySelected(keepSelectedBranch?: boolean | Event) {
    // (when called by the select's change event, we get that event as argument: we don't keep the branch then)
    const repositoryFullName = selectedRepository.value;
    rootItems.value = [];
    if(repositoryFullName.length == 0){
        branches.value = [];
        selectedBranch.value = "";
        return;
    }
    const loadedBranches = await runQuery(() => props.queries.listBranches(repositoryFullName));
    if(loadedBranches == null || selectedRepository.value != repositoryFullName){
        // Failed, or the user has selected another repository in the meantime
        return;
    }
    branches.value = loadedBranches;
    if(!(keepSelectedBranch === true && loadedBranches.includes(selectedBranch.value))){
        const defaultBranch = repositories.value.find((repository) => repository.fullName == repositoryFullName)?.defaultBranch ?? "";
        selectedBranch.value = (loadedBranches.includes(defaultBranch)) ? defaultBranch : (loadedBranches[0] ?? "");
    }
    await loadRootContent();
}

async function loadRootContent() {
    const repositoryFullName = selectedRepository.value, branch = selectedBranch.value;
    if(repositoryFullName.length == 0 || branch.length == 0){
        rootItems.value = [];
        return;
    }
    errorMsg.value = "";
    const items = await runQuery(() => props.queries.listFolderContent(repositoryFullName, branch, ""));
    if(selectedRepository.value == repositoryFullName && selectedBranch.value == branch){
        rootItems.value = toPickerItems(items ?? [], "");
    }
}

async function fetchFolderChildren(folderPath: string) {
    const items = await runQuery(() => props.queries.listFolderContent(selectedRepository.value, selectedBranch.value, folderPath));
    // We give the children to our picker directly rather than dispatching the event on the document (as other drives do),
    // so the pickers of other drives don't receive them. (On failure we still give an empty list so the picker stops waiting.)
    itemPicker.value?.gotChildrenForFolder(new CustomEvent(CustomEventTypes.exposedCloudDriveItemChidren, {detail: toPickerItems(items ?? [], folderPath)}));
}

function onDlgHidden(event: BvTriggerableEvent) {
    if(event.componentId == props.dlgId && event.trigger == "ok"){
        isExpectingPickedItem = true;
        itemPicker.value?.exposePickedItem();
    }
}

function onPickedItem(pickedItem: CloudDriveItemPickerItem | null) {
    if(!isExpectingPickedItem){
        return;
    }
    isExpectingPickedItem = false;
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

// Shows the dialog, starting from the given repository if any, or else from the one used last.
function open(startingRepository: string | undefined): Promise<void> {
    errorMsg.value = "";
    eventBus.emit(CustomEventTypes.showStrypeModal, props.dlgId);
    return loadRepositories(startingRepository);
}

// Selects a repository and a branch for the next time the dialog is opened (e.g. those of a file loaded by other means).
function rememberSelection(repository: string, branch: string) {
    selectedRepository.value = repository;
    selectedBranch.value = branch;
}

defineExpose({open, rememberSelection});
</script>
<style lang="scss">
.git-file-picker-selectors {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 5px 10px;
    margin-bottom: 10px;
}
</style>
