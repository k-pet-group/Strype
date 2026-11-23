<template>
    <div>
        <div class="cloud-drive-item-picker-header">
            <nav :aria-label="$t('appMessage.cloudDriveItemPickerLocation')">
                <ol class="breadcrumb cloud-drive-item-picker-breadcrumb">
                    <li v-for="(folder, index) in breadcrumbs" :key="folder.id" :class="{'breadcrumb-item': true, active: index == breadcrumbs.length - 1}">
                        <span v-if="index == breadcrumbs.length - 1" aria-current="location">{{folder.name}}</span>
                        <a v-else href="#" @click.prevent="openBreadcrumb(index)">{{folder.name}}</a>
                    </li>
                </ol>
            </nav>
            <button v-if="showRefreshButton" type="button" class="btn btn-sm btn-outline-primary cloud-drive-item-picker-refresh-btn" :disabled="breadcrumbs.length == 0" @click="refreshContent">
                <i class="fas fa-sync-alt"></i><span>{{$t("buttonLabel.refresh")}}</span>
            </button>
        </div>
        <div class="list-group list-group-flush cloud-drive-item-picker-items">
            <!-- (".." is shown while the folder is loading so the user can still go back up) -->
            <button v-if="breadcrumbs.length > 1" type="button" class="list-group-item list-group-item-action" @click="openBreadcrumb(breadcrumbs.length - 2)">{{folderSymbol}} ..</button>
            <div v-if="isLoading" class="list-group-item text-muted">{{$t("appMessage.cloudDriveItemPickerLoadingFolderContent")}}</div>
            <template v-else-if="breadcrumbs.length > 0">
                <button v-for="item in items" :key="item.id" type="button" :class="{'list-group-item list-group-item-action': true, active: item.id == selectedFile?.id}"
                    :disabled="!item.isFolder && !isFilePickable(item)" @click="onItemClick(item)">{{(item.isFolder) ? folderSymbol : fileSymbol}} {{item.name}}</button>
                <div v-if="items.length == 0" class="list-group-item text-muted">
                    {{$t((mode == CloudDriveItemPickerMode.FOLDERS && !showFilesInFoldersMode) ? "appMessage.cloudDriveItemPickerNoFolder" : "appMessage.cloudDriveItemPickerNoFolderOrFile")}}
                </div>
            </template>
        </div>
    </div>
</template>
<script setup lang="ts">
/****
 * A generic picker for Cloud Drives (when a Drive-specific API cannot be used).
 * The picker is a minimal file/folder explorer: like on GitHub, it shows the content of one folder at a time,
 * with a ".." item to go to the parent folder and clickable breadcrumbs to go to any folder above.
 * A folder is opened with a single click. In FOLDERS mode, the picked item is the opened folder (the last one of the breadcrumbs) once loaded;
 * in FILES mode, it is the file the user has clicked in the opened folder (if any). The picked item is given by the event pickedItemChanged.
 * The content of a folder is fetched (with the fetchFolderChildren prop) every time the folder is opened.
 */
import { CloudDriveItemPickerItem, CloudDriveItemPickerMode } from "@/types/cloud-drive-types";
import { computed, ref, watch } from "vue";

const props = withDefaults(defineProps<{
    mode?: CloudDriveItemPickerMode,
    // The extensions of the files listed first, in that order (the other files are listed after them).
    // In FILES mode, only these files can be picked (all files can be picked if empty): the other files are greyed out and not selectable.
    preferredFileExts?: string[],
    // Whether the files are also shown in FOLDERS mode (not by default): they are greyed out and not selectable.
    showFilesInFoldersMode?: boolean,
    // The folder shown first in the picker, it is the first part of the breadcrumbs: when the parent sets another object, the picker starts again from there.
    rootFolder: CloudDriveItemPickerItem | null,
    // The names of the folders (from the root folder) of the folder to open when the picker starts: we stop at the last folder found.
    initialFolderPathParts?: string[],
    // Whether a button to reload the opened folder's content is shown (not by default)
    showRefreshButton?: boolean,
    // Gets the content of a folder. If the promise is rejected, the folder is shown empty.
    fetchFolderChildren: (folderId: string) => Promise<CloudDriveItemPickerItem[]>,
}>(), {
    mode: CloudDriveItemPickerMode.FILES,
    preferredFileExts: () => [],
    initialFolderPathParts: () => [],
});

const emit = defineEmits<{
    pickedItemChanged: [item: CloudDriveItemPickerItem | null],
}>();

const folderSymbol = "📁";
const fileSymbol = "📄";
// The opened folder is the last one
const breadcrumbs = ref<CloudDriveItemPickerItem[]>([]);
// The content of the opened folder
const items = ref<CloudDriveItemPickerItem[]>([]);
const selectedFile = ref<CloudDriveItemPickerItem | null>(null);
const isLoading = ref(false);
// Every time the user goes somewhere, this counter is incremented: the folder content we get for a previous count is out of date and is ignored.
// (The user can open another folder while a folder is loading.)
let navigationCount = 0;

// (in FOLDERS mode, nothing is picked while a folder is loading: when the picker starts, we may still be going down to the initial folder)
const pickedItem = computed(() => (props.mode == CloudDriveItemPickerMode.FOLDERS)
    ? ((isLoading.value) ? null : (breadcrumbs.value[breadcrumbs.value.length - 1] ?? null))
    : selectedFile.value);
watch(pickedItem, (item) => emit("pickedItemChanged", item), {immediate: true});

watch(() => props.rootFolder, (rootFolder) => {
    if(rootFolder){
        openPath([rootFolder], props.initialFolderPathParts.filter((pathPart) => pathPart.length > 0));
    }
    else{
        navigationCount++;
        breadcrumbs.value = [];
        items.value = [];
        selectedFile.value = null;
        isLoading.value = false;
    }
}, {immediate: true});

async function getItemsToShow(folderId: string): Promise<CloudDriveItemPickerItem[]> {
    const children = await props.fetchFolderChildren(folderId).catch(() => [] as CloudDriveItemPickerItem[]);
    // Files are only shown in FILES mode, or if requested in FOLDERS mode. We show the folders first, then the files grouped by extension
    // (in the order of the preferred extensions, then all the other files), each group sorted by name.
    const getRank = (item: CloudDriveItemPickerItem) => (item.isFolder) ? -1 : getPreferredFileExtIndex(item);
    return children
        .filter((item) => item.isFolder || props.mode == CloudDriveItemPickerMode.FILES || props.showFilesInFoldersMode)
        .sort((item1, item2) => (getRank(item1) - getRank(item2)) || item1.name.localeCompare(item2.name));
}

// The index of the file's extension in the preferred extensions, or their count if it isn't one of them
function getPreferredFileExtIndex(item: CloudDriveItemPickerItem): number {
    const index = props.preferredFileExts.findIndex((ext) => item.name.endsWith(ext));
    return (index == -1) ? props.preferredFileExts.length : index;
}

// (files can never be picked in FOLDERS mode)
function isFilePickable(item: CloudDriveItemPickerItem): boolean {
    return props.mode == CloudDriveItemPickerMode.FILES && (props.preferredFileExts.length == 0 || getPreferredFileExtIndex(item) < props.preferredFileExts.length);
}

// Opens the last folder of the given path (the new breadcrumbs), then, if folder names are given, follows them down as long as they are found.
async function openPath(path: CloudDriveItemPickerItem[], folderNamesToFollow?: string[]) {
    const navigation = ++navigationCount;
    breadcrumbs.value = path;
    items.value = [];
    selectedFile.value = null;
    isLoading.value = true;
    let folderItems = await getItemsToShow(path[path.length - 1].id);
    for(const folderName of folderNamesToFollow ?? []){
        if(navigation != navigationCount){
            return;
        }
        const folder = folderItems.find((item) => item.isFolder && item.name == folderName);
        if(!folder){
            break;
        }
        breadcrumbs.value = [...breadcrumbs.value, folder];
        folderItems = await getItemsToShow(folder.id);
    }
    if(navigation == navigationCount){
        items.value = folderItems;
        isLoading.value = false;
    }
}

function openBreadcrumb(index: number) {
    openPath(breadcrumbs.value.slice(0, index + 1));
}

function onItemClick(item: CloudDriveItemPickerItem) {
    if(item.isFolder){
        openPath([...breadcrumbs.value, item]);
    }
    else if(isFilePickable(item)){
        selectedFile.value = item;
    }
}

function refreshContent() {
    openPath(breadcrumbs.value);
}
</script>
<style lang="scss">
.cloud-drive-item-picker-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 5px;
}

.cloud-drive-item-picker-breadcrumb {
    flex: 1;
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
}

.cloud-drive-item-picker-refresh-btn {
    flex-shrink: 0;
}

.cloud-drive-item-picker-refresh-btn > i {
    margin-right: 5px;
}

.cloud-drive-item-picker-items {
    max-height: 40vh;
    overflow: auto;
}

.cloud-drive-item-picker-items > .list-group-item {
    padding: 4px 8px;
    overflow-wrap: anywhere;
}

// The entries that can't be picked are greyed out more than with Bootstrap's default disabled colour, so they stand out less
// (we use the opacity rather than the colour so the file symbol, an emoji, is greyed out as well)
.cloud-drive-item-picker-items > .list-group-item:disabled {
    opacity: 0.5;
}
</style>
