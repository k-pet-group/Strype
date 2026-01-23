<template>
    <div>
        <div class="strype-cloud-drive-item-picker-refresh-btn" tabindex="-1" @click="refreshContent"><i class="fas fa-sync-alt"></i><span>{{$t("buttonLabel.refresh")}}</span></div>
        <CTree ref="ctree" @select="onSelectItemInternally" @click="onSelectItemByClick" @dblclick="onSelectItemByClick" :emptyText="emptyText" class="strype-ctree" titleField="name" />
    </div>
</template>


<script lang="ts">
/****
 * A generic picker for Cloud Drives (when a Drive-specific API cannot be used).
 * The picker is a minimal file/folder explorer, configurable.
 * To make things easier we use a shared item model that each Drive needs to match
 * when providing the Drive's content. 
 * We expect the interaction between the picker navigation and the Drive queries to 
 * be continuous: it's unlikely a Drive query returns ALL elements in one go, so when
 * we need to get a folder content (on expanding the folder) then we need to get receive
 * another data content from the Drive... (it is not ideal, but it avoid waiting for
 * fetching the whole data if the Drive doesn't provide that in one go...)
 * However, we do so only when we have never looked for the content, so if the Drive
 * content has changed in the meantime, it won't be seen.
 */
import { CustomEventTypes } from "@/helpers/editor";
import { CloudDriveItemPickerFolderPathResolutionMode, CloudDriveItemPickerItem, CloudDriveItemPickerMode, CTreeItemPickerItem } from "@/types/cloud-drive-types";
import Vue, { PropType } from "vue";
import CTree from "@wsfe/ctree";
import type { TreeNode } from "@wsfe/ctree/types/src/store";
import AppComponent from "@/App.vue";
import { AppEvent } from "@/types/types";

export default Vue.extend({
    name: "CloudDriveItemPicker",

    components: {
        CTree,
    },

    props: {
        mode: {
            type: Number as PropType<CloudDriveItemPickerMode>,
            default: CloudDriveItemPickerMode.FILES,
        },

        fileExtFilter: {
            type: Array as PropType<string[]|string>,
            default:  function () {
                // By default there is no filter
                return [];
            }, 
        },

        pathResolutionMode: {
            type: Number as PropType<CloudDriveItemPickerFolderPathResolutionMode>,
            default: CloudDriveItemPickerFolderPathResolutionMode.BY_ID,
        },
        
        initialFolderToSelectPathParts: {
            type: Array as PropType<string[]>,
            default: function () {
                return [];
            },
        },

        rawRootData: {
            type: Array as PropType<CloudDriveItemPickerItem[]>,
            required: true,
        },

        emptyText: String, // this is passed as a prop so the Cloud Drive component can customise it with its name
    },

    computed: {
        folderSymbol(): string{
            return "📁";
        },

        fileSymbol(): string{
            return "📄";
        },

        internalChildrenRetrievedNotificationEvent(){
            return "retrievedChildrenEvent";
        },
    },

    data: function () {
        return {
            pickedItem: null as CTreeItemPickerItem | null, // the item picked (changes when anything else is selected)
            isWaitingForChildrenLookup: false, // a flag we used when waiting for getting a folder content (used for a progress indicator)
        };
    },

    watch:{
        rawRootData: {
            handler(newData: CloudDriveItemPickerItem[]) {
                // We transform the new data array to a tree understood by CTree, and set it to the latter.
                // (For large data, they recommand using setData() rather than a prop.)
                const cTreeRootData = this.prepareItemsToShowInTree(newData);
                this.$nextTick(() => {
                    // We need to wait for the tree to be available.
                    const cTreeComponent = (this.$refs.ctree as InstanceType<typeof CTree>);
                    if(cTreeComponent){
                        cTreeComponent.setData(cTreeRootData);
                        // Select the initial folder to select if provided
                        if(this.initialFolderToSelectPathParts.length > 0){
                            this.selectInitialFolderLocation();
                        }
                        else if(cTreeRootData.length > 0){
                            // Select the first node (if any) otherwise
                            cTreeComponent.setSelected(cTreeRootData[0].id, true);
                        }
                    }
                }); 
            },
            deep: true,
            immediate: true,
        },

        isWaitingForChildrenLookup(newValue: boolean) {
            // Trigger or stop the app progress bar.
            const emitPayload: AppEvent = {requestAttention: newValue};
            emitPayload.message = this.$i18n.t("appMessage.cloudDriveItemPickerLoadingFolderContent").toString();
            (this.$root.$children[0] as InstanceType<typeof AppComponent>).applyShowAppProgress(emitPayload);
            // And block or release the overlay
            document.dispatchEvent(new CustomEvent(CustomEventTypes.requestAppNotOnTop, {detail: newValue}));
        },        
    },

    mounted() {
        // Register a listener to a request for the picked item
        document.addEventListener(CustomEventTypes.requestedCloudDrivePickerPickedItem, this.exposePickedItem);       

        // Register a listener to an folder item children being exposed
        document.addEventListener(CustomEventTypes.exposedCloudDriveItemChidren, this.gotChildrenForFolder);       
    },

    destroyed() {
        // Remove all listeners
        document.removeEventListener(CustomEventTypes.requestedCloudDrivePickerPickedItem, this.exposePickedItem);
        document.removeEventListener(CustomEventTypes.exposedCloudDriveItemChidren, this.gotChildrenForFolder);  
    },
    
    methods: {
        // Small helper to show an icon before the folder/file name and set the whole as name
        getItemNameWithIcon(name: string, isFolderItem: boolean): string {
            return `${(isFolderItem) ? this.folderSymbol : this.fileSymbol} ${name}`;
        },

        prepareItemsToShowInTree(cloudDriveItems: CloudDriveItemPickerItem[]): CTreeItemPickerItem[]{
            // First transform to the data type for the tree
            const cTreeData = cloudDriveItems
                .map((cloudDriveItem) => ({...cloudDriveItem, name: this.getItemNameWithIcon(cloudDriveItem.name, cloudDriveItem.isFolder), children: []}) as CTreeItemPickerItem);
            
            // Then filter out the items that don't align with the mode/filter criteria
            const filterByFolder = (this.mode == CloudDriveItemPickerMode.FOLDERS);
            let filterByFileRegexExtensionsParttern = "";
            if(typeof this.fileExtFilter == "string"){
                filterByFileRegexExtensionsParttern = this.fileExtFilter.replaceAll(".", "\\.");
            }
            else{
                (this.fileExtFilter as string[]).forEach((ext) => {
                    filterByFileRegexExtensionsParttern = `${filterByFileRegexExtensionsParttern}${(filterByFileRegexExtensionsParttern.length > 0) ? "|" : ""}${ext.replaceAll(".", "\\.")}`;
                });
            }
            const filterByFileRegex = new RegExp(`.*(${filterByFileRegexExtensionsParttern})$`); 
            return cTreeData.filter((rootItem) => {
                return ((filterByFolder && rootItem.isFolder) || (!filterByFolder && filterByFileRegex.test(rootItem.name)));
            });
        },

        exposePickedItem(){
            // We return the picked item, making sure we strip off the icon we added within the name.
            this.$emit(CustomEventTypes.exposedCloudDrivePickerPickedItem, (this.pickedItem) ? {...this.pickedItem, name: this.pickedItem.name.substring(2)} : this.pickedItem);            
        },

        onSelectItemInternally(pickerItem: CTreeItemPickerItem){
            this.pickedItem = {...pickerItem, isFolder: pickerItem.name.startsWith(this.folderSymbol)};
        },

        onSelectItemByClick(pickerItem: CTreeItemPickerItem){
            this.onSelectItemInternally(pickerItem);
            (this.$refs.ctree as InstanceType<typeof CTree>).setSelected(pickerItem.id, true);

            // A click/double click event on a folder will collapse/expand it:
            // the first time the event occurs, we need to know if that folder contains children as they would not have been provided.
            // We only request children if the item is a folder AND it has not been visited before.
            if(pickerItem.isFolder && !pickerItem.hasVisitedFolder){
                // Notify we are waiting for getting the children
                this.isWaitingForChildrenLookup = true;

                // And ask for them
                this.$emit(CustomEventTypes.requestedCloudDriveItemChildren, pickerItem.id);
            }
        },

        gotChildrenForFolder(event: Event){         
            // This method is called when the children are provided by the Cloud Drive component using this picker.
            // It adds them in the picker.
            // When done, it calls another internal event sending a boolean value for whichever other need (for example by selectInitialFolderLocation()).
            if(this.pickedItem){
                const pickedItemId = this.pickedItem.id;
                const treeComponent = (this.$refs.ctree as InstanceType<typeof CTree>);
                // We got the children of a folder: we can now consider our current folder has been visited
                treeComponent.$set(treeComponent.getNode(pickedItemId) as TreeNode, "hasVisitedFolder", true);                

                // Then we append the children to the folder
                const childrenForTree = this.prepareItemsToShowInTree((event as CustomEvent<CloudDriveItemPickerItem[]>).detail);
                childrenForTree.forEach((child) => treeComponent.append(child, pickedItemId));
               
                // And we expand that folder since it would have not been opened by CTree as it was empty by then...
                this.$nextTick(() => {                  
                    treeComponent.setExpand(pickedItemId, true);
                    
                    // And we notify the children lookup is done
                    this.isWaitingForChildrenLookup = false;
                    this.$el.dispatchEvent(new CustomEvent(this.internalChildrenRetrievedNotificationEvent, {detail: true}));
                });
            }
            else{
                // This situation shouldn't happen, but we still notify the children lookup is done
                this.isWaitingForChildrenLookup = false;
                // And emits the event with false as value.
                this.$el.dispatchEvent(new CustomEvent(this.internalChildrenRetrievedNotificationEvent, {detail: false}));
            }
        },

        async selectInitialFolderLocation(){
            // This method attempt to select the initial folder as defined by the property initialFolderToSelectPathParts which contains its path parts.
            // The path may contain either the ids or the names of the folder making this path, this depends on the property pathResolutionMode.
            // Because the tree is constructed by starting with the root content and getting the children on demand, we will need to programmatically
            // request the inner folders of the path -- if at some point a folder isn't found we just do nothing.
            const cTreeComponent = this.$refs.ctree as InstanceType<typeof CTree>;
            if(cTreeComponent){
                let cTreeRootFlatData = (this.pathResolutionMode == CloudDriveItemPickerFolderPathResolutionMode.BY_NAME) ? cTreeComponent.getFlatData() : null;
                
                let currentNodeAtLevel = null as CTreeItemPickerItem | null;
                let parentNode = null as CTreeItemPickerItem | null;
                const cleanup = () => {
                    // If we didn't find a part of the path, no need to continue, but we select the first element of the tree (if any) to show a clean state
                    const treeData = cTreeComponent.getTreeData();
                    if(treeData.length > 0){
                        cTreeComponent.setSelected(treeData[0].id, true); 
                    }
                };

                for(const [index, pathPart] of this.initialFolderToSelectPathParts.entries()){
                    const parentNodeId = parentNode?.id ?? ""; // keep TS happy
                    // If we are not in the root level or the current level folder hasn't been visited (i.e. its children retrieved) we need to first
                    if(index > 0 && !(cTreeComponent.getNode(parentNode?.id??"") as CTreeItemPickerItem|null)?.hasVisitedFolder){
                        let gotChildren = false;
                        await new Promise<void>((resolve) => {
                            this.$el.addEventListener(this.internalChildrenRetrievedNotificationEvent, (event) => {
                                gotChildren = (event as CustomEvent<boolean>).detail;
                                resolve();
                            }, {once: true});
                            this.$emit(CustomEventTypes.requestedCloudDriveItemChildren, parentNodeId);
                        });
                        if(!gotChildren){
                            // It's unlikely to happen but shall we not receive the children we just stop.
                            cleanup();
                            return;
                        }
                    }
                    // get the children before looking for it
                    if(this.pathResolutionMode == CloudDriveItemPickerFolderPathResolutionMode.BY_ID){
                        currentNodeAtLevel = cTreeComponent.getNode(pathPart) as CTreeItemPickerItem | null;
                    }
                    else{
                        // We need to look up the folder by name.                        
                        currentNodeAtLevel = (((index > 0) ? (parentNode as CTreeItemPickerItem).children : (cTreeRootFlatData as CTreeItemPickerItem[] | null))?.find((node) => {
                            return node.name == this.getItemNameWithIcon(pathPart as string, true);
                        })??null) as CTreeItemPickerItem | null;
                    }
                    if(!currentNodeAtLevel){
                        cleanup();
                        return;
                    }
                    else{
                        parentNode = currentNodeAtLevel;   
                        // Important: we need to select the parent to allow gotChildrenForFolder() to work properly      
                        // and also, when we are checking the very last element of the path, it will be selected here...
                        cTreeComponent.setSelected(parentNode.id, true);
                    }                   
                }
                
                // If we have reached this part, then we have found and selected the folder we wanted to show: we scroll to it
                // a bit later as the tree may not yet be rendered.
                setTimeout(() => {
                    cTreeComponent.scrollTo(parentNode?.id as string);
                }, 0);
            }
        },

        refreshContent(){
            // The request is sent to the caller...
            this.$emit(CustomEventTypes.requestedCloudDrivePickerRefresh);
        },
    },
});
</script>

<style lang="scss">
// The CTree component holds an iframe that we don't need, 
// but because it's in the way, we just hide it.
.strype-ctree > iframe {
    display: none; 
}

/* Overwrite the existing classes of CTreet to meet our own styling */
.ctree-tree-node__indent-wrapper {
    cursor: pointer;
}

.ctree-tree-node__title_selected {
    font-weight: 600;
}

.ctree-tree__scroll-area {
    max-width: 80vw;
    max-height: 75vh;    
    overflow: auto;
    clear: both;
}

.strype-cloud-drive-item-picker-refresh-btn {
    margin-bottom: 5px;
    cursor: pointer;
    border: 1px grey solid;
    border-radius: 5px;
    padding: 2px 5px;
    color: #007bff;
    float: right;
}

.strype-cloud-drive-item-picker-refresh-btn > i {
    margin-right: 5px;
}
</style>
