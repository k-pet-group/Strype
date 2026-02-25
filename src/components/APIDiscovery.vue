<template>
    <div class="api-container">
        <div class="api-items-container">
            <div v-for="(apiDescItem) in flatAPIDesc" :key="apiDescItem.name">
                <div 
                    v-if="isItemShowable(apiDescItem)" 
                    class="api-item-container"
                    @click="updateSelectedItem(apiDescItem)"
                    :style="getAPIItemContainerStyle(apiDescItem.level)"
                >
                    <span 
                        :id="apiDescItem.name+'_bullet'" 
                        v-html="getItemBullet(apiDescItem)" 
                        :class="{'api-item-bullet-icon': true, 'api-item-bullet-invisible-icon': apiDescItem.isFinal}"
                    />
                    <b-card :style="getCardStyle(apiDescItem)">
                        <b-card-text>
                            <span>{{apiDescItem.label}}</span>
                            <div v-if="apiDescItem.doc.length > 0 || apiDescItem.codePortion.length > 0" style="display: inline">
                                <i 
                                    :id="apiDescItem.name+'_info'"  
                                    class="fas fa-info-circle api-item-info" 
                                />
                                <b-popover
                                    triggers="hover" 
                                    :target="apiDescItem.name+'_info'" 
                                    variant="info" 
                                    placement="bottomright" 
                                    custom-class="api-popover"
                                    @show="onShowAPIInfo" 
                                    @shown="onShownAPIInfo(apiDescItem.extradoc.length > 0)"
                                >
                                    <span v-html="apiDescItem.doc"/>
                                    <div :style="getCodeExampleDivStyle(apiDescItem.doc.length > 0)" v-if="apiDescItem.isFinal" v-html="getCodeExample(apiDescItem)"/>
                                    <div v-if="apiDescItem.extradoc.length > 0">
                                        <a 
                                            @click="showExtraDoc=!showExtraDoc;" 
                                            size="sm" 
                                            class="show-more-link popover-body" 
                                        >
                                            {{getShowExtraCodeLinkLabel()}}
                                        </a>
                                        <i 
                                            :class="{'show-more-chevron fas': true, 'fa-chevron-up': showExtraDoc, 'fa-chevron-down': !showExtraDoc}"
                                            @click="showExtraDoc=!showExtraDoc;" 
                                        />
                                        <div v-show="showExtraDoc">                                   
                                            <span v-html="apiDescItem.extradoc"/>
                                            <div :style="getCodeExampleDivStyle(true)" v-if="apiDescItem.extraCodePortion" v-html="getCodeExample(apiDescItem, true)"/>
                                        </div>
                                    </div>
                                </b-popover>
                            </div>
                            <span v-if="(apiDescItem.version > 1)" class="api-item-version" :title="$t('apidiscovery.v2InfoMsg')">v{{apiDescItem.version}}</span>
                        </b-card-text>
                        <div class="api-code-container" v-if="apiDescItem.name===selectedAPIItemName  && !isSelectedIntermediateItem()">
                            <!-- FF disabled button still get listeners that mess with focus/blur of inputs, so use div instead -->
                            <div
                                @click="useExampleCode()" 
                                v-html="$t('buttonLabel.addCodeExtract')" 
                                :disabled="disabledAPI()" 
                                :class="{'api-code-button btn btn-secondary': true, 'api-code-button-disabled': disabledAPI()}"
                            />
                        </div>
                    </b-card>
                </div> 
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {AllFrameTypesIdentifier, APIItemTextualDescription, getFrameDefType, PythonExecRunningState, SlotCursorInfos, SlotType} from "@/types/types";
import { useStore } from "@/store/store";
import { getFocusedEditableSlotTextSelectionStartEnd, getFrameLabelSlotsStructureUID, getLabelSlotUID, setDocumentSelection } from "@/helpers/editor";
import { mapStores } from "pinia";
import { getAPIItemTextualDescriptions } from "@/helpers/microbitAPIDiscovery";
import LabelSlotsStructures from "@/components/LabelSlotsStructure.vue";
import { cloneDeep } from "lodash";

export default defineComponent({
    name: "APIDiscovery",

    data: function () {
        return {
            selectedAPIItemName: "",
            selectedAPIItemLevel: 0,
            selectedAPIHierarchyNames: [] as string[], //the list containing the names of the selected item's parents, then selected item, and then its immediate children
            itemsToShow: [] as string[], //the list containing the names of the items that need to be shown (displayed) in the UI (cf. isItemShowable() for details)
            codeLevels: 4, //this shouldn't change in the component, but just makes an easy way to adapt the code if more levels in the API are changed some day
            mbAPIExampleCodeParts: [] as string[], //the example code parts generated when using the API discovery tool (each part <==> one API level)
            showExtraDoc: false,
            addedAPICode: false, //a flag indicating if something has been added with the API
        };
    },

    computed:{
        ...mapStores(useStore),
        
        // The api description is retrieved from a stored variabled: we don't want to recompile it every single time
        flatAPIDesc(): APIItemTextualDescription[]{
            return getAPIItemTextualDescriptions(false);
        },

        isEditing(): boolean {
            return this.appStore.isEditing;
        },

        showCodeGeneratorPart(): boolean {
            return this.appStore.canShowAPICodeGenerator;
        },
    },

    methods:{
        isSelectedIntermediateItem(): boolean {
            return (!this.flatAPIDesc.find((item) => item.name === this.selectedAPIItemName)?.isFinal);
        },

        disabledAPI(): boolean{
            return !this.showCodeGeneratorPart || this.isSelectedIntermediateItem() || (this.appStore.pythonExecRunningState == PythonExecRunningState.Running);
        },

        isItemShowable(item: APIItemTextualDescription): boolean {
            //To decide if this API item should be shown, we check these two cases:
            //- if there is no item selected, or if the API needs to be reset*, then all level 1 items are shown
            //- if there is an item selected, we keep all level 1 items, the parents to that item, it's immediate parent siblings, its siblings and its first children
            //(*) reset the API when we added something && we are no longer editing the code
            if(this.selectedAPIItemName.length == 0 || (this.addedAPICode && !this.isEditing)){
                if(this.addedAPICode && !this.isEditing){
                    //we can now relase the flag and reset the API
                    this.addedAPICode = false;
                    this.selectedAPIItemName = "";
                    this.selectedAPIItemLevel = 0;
                    this.selectedAPIHierarchyNames = [];
                }
                return item.level == 1;
            }
            else {
                return this.itemsToShow.includes(item.name);
            }
        },

        getAPIItemContainerStyle(itemLevel: number): Record<string, string> {
            //the left margin is based on the level: level 1 doesn't have any margin, and the deeper the level, the bigger offset
            const marginLeft = ((itemLevel-1)*20)+"px";
            return {"margin-left": marginLeft};
        },

        getLevelColor(level: number): string {
            //the colour palette we use for each levels obtained using the tool https://hihayk.github.io/scale/#1/3/50/80/-51/67/20/14/7064CE/38/192/219/white
            let levelColor = "";
            switch(level){
            case 1: levelColor = "#095256"; break;
            case 2: levelColor = "#087F8C"; break;
            case 3: levelColor = "#5AAA95"; break;
            case 4: levelColor = "#86A873"; break;
            }
            return levelColor;
        },

        getCardStyle(item: APIItemTextualDescription): Record<string, string> {
            //the background of the card changes according to two factors:
            //1) selected/no selected
            //2) the level
            const backgroundColor = (this.selectedAPIHierarchyNames.slice(0, this.selectedAPIHierarchyNames.indexOf(this.selectedAPIItemName) + 1).includes(item.name)) 
                ? this.getLevelColor(item.level) 
                : "";

            //the text colour changes to white when the card is selected to increase the contrast from the background colours
            //(the non selected colour is in line with the commands foreground colour CSS in Commands.vue)
            const foregroundColor =  (this.selectedAPIHierarchyNames.slice(0, this.selectedAPIHierarchyNames.indexOf(this.selectedAPIItemName) + 1).includes(item.name)) ? "white" : "#252323";

            //we can now create the style object, adding the bits that are systematically added to the card (flex grow property, cursor style)            
            return {"background-color": backgroundColor, "color": foregroundColor, "flex-grow": "2", "cursor": "pointer"};
        },

        getItemBullet(item: APIItemTextualDescription): string {
            // Returns the string value for setting the bullet of an item.
            // We follow that logic:
            // - show a (+) bullet for all items when nothing is selected (i.e. all level 1 entries)
            // - show a (-) to parents of an item and the item when one item is selected
            // - show a (+) to a selected item children if they are not final, nothing otherwise
            // - show an *invisible* bullet (-) to keep the same alignment with other levels for final items
            
            if(this.selectedAPIItemName.length == 0){
                return "+";
            }

            if(item.level <= this.selectedAPIItemLevel && this.selectedAPIHierarchyNames.includes(item.name) && !item.isFinal){
                return "&minus;"; // the "-" from the numpad is shorter than "+" and makes the alignment messy, that's why we use this symbol instead 
            }
            
            return "+";
        },

        updateSelectedItem(selectedItem: APIItemTextualDescription) {
            // Change the selected item to the item clicked on if its bullet was "(+)" (i.e. expandable) or a final item,
            // change to its immediate parent (or to none if reached level 1) if it's bullet was "(-)" (i.e. collapsable),
            //find out if the item is currently expandable - the class *should* be set, test undefined for keeping TS happy
            const itemBulletValue = (document.getElementById(selectedItem.name+"_bullet")?.textContent)??"";
            if(itemBulletValue == "+" || (selectedItem.isFinal && (this.selectedAPIItemName != selectedItem.name))){
                //when the item is selected, we add the code portion in the code example only if the selected item is in the same hierarchy than the previously selected
                //otherwise, we reconstruct a new example code from scratch
                if(this.selectedAPIHierarchyNames.includes(selectedItem.name)){
                    this.mbAPIExampleCodeParts[selectedItem.level-1] = selectedItem.codePortion; 
                }
                else{
                    let parentName = selectedItem.name;
                    let hierarchyLevel = selectedItem.level;
                    this.mbAPIExampleCodeParts.splice(0, this.codeLevels);
                    while(hierarchyLevel > 0){
                        const parentItem = this.flatAPIDesc.find((item) => item.name == parentName);
                        this.mbAPIExampleCodeParts[hierarchyLevel-1] =  parentItem?.codePortion??"";
                        parentName = parentItem?.immediateParentName??"";
                        hierarchyLevel--;
                    }
                }   
                this.selectedAPIItemName = selectedItem.name;
                this.selectedAPIItemLevel = selectedItem.level;
            }
            else{
                this.selectedAPIItemName = selectedItem.immediateParentName;
                this.selectedAPIItemLevel = selectedItem.level - 1;
                //as we could have closed any level of the hierarchy, we just rewrite the whole code example from scratch
                let hierarchyLevel = selectedItem.level;
                this.mbAPIExampleCodeParts.splice(0, this.codeLevels);
                let parentName = selectedItem.immediateParentName;
                while(hierarchyLevel > 0){
                    const parentItem = this.flatAPIDesc.find((item) => item.name == parentName);
                    this.mbAPIExampleCodeParts[hierarchyLevel-1] =  parentItem?.codePortion??"";
                    parentName = parentItem?.immediateParentName??"";
                    hierarchyLevel--;
                }
            }

            //update the hierarchy api item names when we change the selection
            if(this.selectedAPIItemName.length > 0) {
                this.selectedAPIHierarchyNames = []; 
                //first add the parents
                let parentName = (this.flatAPIDesc.find((item) => item.name == this.selectedAPIItemName)?.immediateParentName)??"";
                while(parentName.length > 0){
                    this.selectedAPIHierarchyNames.push(parentName);
                    const parentItem = this.flatAPIDesc.find((item) => item.name == parentName);
                    if(parentItem){
                        parentName = parentItem.immediateParentName;
                    }
                }
                //then the selected item itself
                this.selectedAPIHierarchyNames.push(this.selectedAPIItemName);
                //now get the children (level + 1) of the selected item (i.e. all items which have this item as a parent)
                this.selectedAPIHierarchyNames.push(...this.flatAPIDesc.filter((item) => item.immediateParentName == this.selectedAPIItemName).map((item) => item.name));   
            }
            else{
                this.selectedAPIHierarchyNames = [];
            }

            //update the list of items to be shown in the UI, which is based on the selected item:
            //- all items of level 1,  the parents to that selected item, it's immediate parent siblings, its siblings and its first children
            const selectedItemGrandParent = this.flatAPIDesc.find((item) => item.name == selectedItem.immediateParentName)?.immediateParentName??"";
            const selectedItemSiblings = this.flatAPIDesc.filter((item) => item.immediateParentName == selectedItem.immediateParentName && item.name != this.selectedAPIItemName).map((item) => item.name);
            const selectedItemImmediateParentSiblings = this.flatAPIDesc.filter((item) => item.immediateParentName == selectedItemGrandParent).map((item) => item.name);
            const firstLevelItems = this.flatAPIDesc.filter((item) => item.level == 1).map((item) => item.name);
            this.itemsToShow = [...this.selectedAPIHierarchyNames, ...selectedItemSiblings,... selectedItemImmediateParentSiblings,... firstLevelItems];
        },

        // Prepare the code example for the hovered API element.
        getCodeExample(item: APIItemTextualDescription, isExtraCode?: boolean): string{
            let exampleStr = "";
            for(let level = 1; level <= this.codeLevels; level++){
                const isHoveredLevel = (level==item.level);
                if(isHoveredLevel || (this.mbAPIExampleCodeParts[level -1] && this.mbAPIExampleCodeParts[level-1].length > 0)){
                    const codePortion = (isExtraCode??false) ? item.extraCodePortion : item.codePortion;
                    let examplePortion = (isHoveredLevel) ? codePortion : this.mbAPIExampleCodeParts[level-1];
                    examplePortion = examplePortion.replace(/\(.*\)/, function(matchedStr){
                        //trim the parenthesis from the matched expression
                        return "(</span><span class=\"code-example-args\">" + matchedStr.replaceAll(/(\(|\))/g, "") + "</span><span>)";
                    });
                    exampleStr = exampleStr.concat("<span>" + examplePortion + "</span>");
                    if(isHoveredLevel){
                        // if we have reached the hovered element's level, no need to look for more code portions
                        break;
                    }
                }
            }
            return exampleStr;   
        },

        // Actions to take when the generated code is to be sent to the main code:
        // 1) add a new method call frame if we are not editing
        // 2) insert the code in the current frame (if 1) was done, the current frame becomes this newly added frame),
        // 3) reset the API discovery
        // Note: for avoiding repeating a section of the code, 2) is moved to another method
        useExampleCode(): void {
            //if the API is disabled, this action should trigger anything
            if(!this.disabledAPI()){
                const codeToInsert = this.mbAPIExampleCodeParts.join("");
                if(!this.isEditing){
                    // part 1): not editing the code: we create a new method call frame, then add the code in (parts 2 & 3)
                    this.appStore.addFrameWithCommand(getFrameDefType(AllFrameTypesIdentifier.funccall)).then(() => {
                        // We need to delete the extra brackets added as the function call frame template.
                        // We must then wait a bit before doing anything to make sure the deletion has been effective 
                        // and won't interfer with the slot's content manipulation.
                        document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", {key: "Delete"}));
                        setTimeout(() => {
                            // As we added a new frame, we need to get the new current frame
                            this.addExampleCodeInSlot({
                                slotInfos: {
                                    frameId: this.appStore.currentFrame.id,
                                    labelSlotsIndex: 0,
                                    slotId: "0",
                                    slotType: SlotType.code,
                                },
                                cursorPos: codeToInsert.length,
                            },
                            codeToInsert);
                        }, 100);
                    });
                }
                else{
                    // editing mode, just add the code in the existing slot (parts 2 & 3)
                    const currentFocusedSlotCursorInfos = this.appStore.focusSlotCursorInfos;
                    if(currentFocusedSlotCursorInfos){
                        const inputSpanSlotElementId = getLabelSlotUID(currentFocusedSlotCursorInfos.slotInfos);
                        const inputspanSlotContent = document.getElementById(inputSpanSlotElementId)?.textContent??"";
                        const {selectionStart, selectionEnd} = getFocusedEditableSlotTextSelectionStartEnd(inputSpanSlotElementId);
                        this.addExampleCodeInSlot({...currentFocusedSlotCursorInfos, cursorPos: selectionStart + codeToInsert.length}
                            , inputspanSlotContent.substring(0, selectionStart) + codeToInsert + inputspanSlotContent.substring(selectionEnd)); 
                    }                  
                }  
            }          
        },

        // The externalised part to add the code example content in an editable slot (cf useExampleCode() parts 2 & 3) 
        addExampleCodeInSlot(slotcursorInfos: SlotCursorInfos, content: string){
            const {slotInfos} = slotcursorInfos;
            this.addedAPICode = true;
            this.appStore.setFrameEditableSlotContent(
                {
                    ...slotInfos,
                    code: content,
                    initCode: "",
                    isFirstChange: true,
                }
            )
                .then(()=>{
                    //we select the arguments of the added functions (if applies) or move the cursor after the insertion (if no arguments)
                    let needToSelectArgs = content.includes("(");
                    if(needToSelectArgs){
                        // At this stage, we have added a code inside a slot that hasn't yet been refactorised. 
                        // If we set a text selection here, that selection will be lost when the frame slots are refactorised.
                        // So we only keep a reference to the cursor position AFTER THE OPENING BRACKET: when the factorisation has been performed,
                        // we will simply be able to select all slots of that same level (that is, inside the bracket structure where we are at)
                        const argsStartSlotCursorInfos = {...slotcursorInfos};
                        argsStartSlotCursorInfos.cursorPos = content.indexOf("(") + 1;  
                        setDocumentSelection(argsStartSlotCursorInfos, argsStartSlotCursorInfos);
                        // Update the store too
                        this.appStore.setSlotTextCursors(argsStartSlotCursorInfos, argsStartSlotCursorInfos);
                    }
                    else {
                        setDocumentSelection(slotcursorInfos, slotcursorInfos);
                        // Update the store too
                        this.appStore.setSlotTextCursors(slotcursorInfos, slotcursorInfos);
                    }

                    //Refactor the slots, we call the refactorisation on the LabelSlotsStructure
                    const stateBeforeChanges = cloneDeep(this.appStore.$state);
                    (this.slotsStructComponentsRegistry[getFrameLabelSlotsStructureUID(slotInfos.frameId, slotInfos.labelSlotsIndex)] as InstanceType<typeof LabelSlotsStructures>).checkSlotRefactoring(getLabelSlotUID(slotInfos), stateBeforeChanges);
                    if(needToSelectArgs){
                        // We have waited slots to be refactorised, we can do the args selection: from the current cursor position to the last of the same level slot
                        setTimeout(() => {
                            document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", {key: "End", shiftKey: true}));
                        }, 100);
                    }
                });
        },

        onShowAPIInfo(){
            // When the popop is opened, we first set the flag to show the extra doc to "true" in order to prepare the popup size correctly
            this.showExtraDoc=true;
        },

        onShownAPIInfo(needMinWidth: boolean){
            // When the popup is shown, we assign the right min width if the popup contains extra doc,
            // so that when the extra doc is show, the popup doesn't resize and make the popup disappear.
            // Moreover, we make the popup explicitely visible here - we need to keep it hidden to avoid the flicker
            // when resetting the flag to false (as initially, the extra doc isn't shown)
            const infoPopupElement = document.getElementsByClassName("api-popover")[0];
            if(infoPopupElement){
                if(needMinWidth){
                    (infoPopupElement as HTMLDivElement).style.minWidth=  (infoPopupElement as HTMLDivElement).offsetWidth+"px";
                }
                this.showExtraDoc = false;
                (infoPopupElement as HTMLDivElement).style.visibility = "visible";
            }            
        },

        getShowExtraCodeLinkLabel(): string{
            return this.$t((this.showExtraDoc) ? "buttonLabel.showLess":"buttonLabel.showMore") as string;
        },

        getCodeExampleDivStyle(needTopMargin: boolean){
            // Gets the style for the code example div. Only the margin top is actually dynamic 
            // (if there is no documentation to show, then we don't want a margin)
            const marginTop = (needTopMargin) ? "10px" : "0px";
            return {"margin-top": marginTop, display: "table", "background-color": "rgba(255,255,255,.6)", color: "black", "font-style": "italic", "border-top": "3px solid #B4B4B4", "padding": "5px"};
        },
    },
});
</script>

<style lang="scss">
.api-container{
    background-color:transparent;
}

.api-items-container{
    max-height: 85vh; //% won't work here. use vh and adapt if the presentation changes...
    overflow-y: auto;
}

.api-item-container {
    display:flex;
    align-items: center;
}

.api-item-bullet-icon{
    margin-left:2px;
    margin-right:3px;
    cursor: pointer;
    font-weight: 600;
}

.api-item-bullet-invisible-icon {
    color: transparent;
    cursor: default;
}

.api-item-version{
    margin-left:5px;
    color: white;
    background-color: #bbc6b6;
    border-radius: 5px;
    padding:0px 2px;
    float:right;
}

.api-item-info{
    margin-left: 5px;
    color: #bbc6b6;
}

.code-example-args{
    color:#0e84b5;
}

.show-more-link{
    margin-top:10px !important;
    display:inline-block;
    color: green;
    padding:0px !important;
    text-decoration: underline;
    cursor: pointer;
}

.show-more-chevron{
    margin-left: 2px;
    font-size:10px;
    cursor: pointer;
}

.api-code-container{
    display: flex;
    align-items: baseline; 
    margin-top: 10px;
}

.api-code-button {
    padding: 1px 6px 1px 6px !important;
    white-space:nowrap;
    margin-right: 5px;
    cursor: pointer;
}

.api-code-button-disabled{
    cursor: default !important;
    opacity: 0.65 !important;
}

//the following ovewrites the bootstrap card class
.card-body{
    padding: 5px !important;
}

//the following overwrites the bootstrap tooltip class
.api-popover {
    max-width: 500px !important;
    visibility: hidden; //in order to avoid flickering when preparing the extra doc popups
}


</style>
