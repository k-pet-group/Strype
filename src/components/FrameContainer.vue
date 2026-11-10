<template>
    <div v-show="!isTestsFrameContainer || isShowingTests" class="frame-container" :style="frameStyle" @click.self="onOuterContainerClick" @mouseenter="onFrameContainerHover(true)" @mouseleave="onFrameContainerHover(false)">
        <!-- The Testing container has no heading of its own: it shares the "My code" heading, which switches between the two -->
        <div v-if="!isTestsFrameContainer" class="frame-container-header" @click.self="onOuterContainerClick">
            <button v-if="!isMainCodeFrameContainer && !isDefsFrameContainer" class="frame-container-btn-collapse" @click="toggleCollapse">{{collapseButtonLabel}}</button>
            <!-- In the Python version, the heading of the third section is a pair of tabs: "My code" and "Test code", of which only the selected one is showing below -->
            <div v-if="isMainCodeFrameContainer && testingSectionAvailable" class="frame-container-tabs" role="tablist">
                <span v-for="tab in headingTabs" :key="tab.id" role="tab" :aria-selected="tab.selected" :data-tab="tab.id" :title="tab.tip"
                      :class="{'frame-container-tab': true, 'frame-container-tab-selected': tab.selected, 'frame-container-tab-clickable': !tab.selected && !isPythonExecuting}"
                      @click.stop="selectHeadingTab(tab.showsTests)">{{tab.label}}</span>
            </div>
            <span v-else :class="{[scssVars.frameContainerLabelSpanClassName]: true, 'no-toggle-frame-container-span': isMainCodeFrameContainer || isDefsFrameContainer}" @click.self="toggleCollapse">{{containerLabel}}</span>
            <ChildrenFrameStateToggle v-if="isDefsFrameContainer" :frames="frames" :parentIsFrozen="false"/>
        </div>
        <!-- keep the tabindex attribute, it is necessary to handle focus properly -->
        <hr v-if="isCollapsed && frames.length > 0" class="non-empty-collapsed-frame-container-hr">
        <div :id="frameUID" :style="containerStyle" class="container-frames" @click="onFrameContainerClick" tabindex="-1" ref="containerFrames">
            <CaretContainer
                :frameId="frameId"
                :ref="getCaretContainerRef"
                :caretVisibility="caretVisibility"
                :caretAssignedPosition="caretPosition.body"
            />
            <div class="frame-container-minheight">
                <Frame 
                    v-for="frame in frames" 
                    :ref="setFrameRef(frame.id)"
                    :key="frame.frameType.type + '-id:' + frame.id"
                    :frameId="frame.id"
                    :isDisabled="frame.isDisabled"
                    :frameType="frame.frameType"
                    :isJointFrame="false"
                    :allowChildren="frame.frameType.allowChildren"
                    :caretVisibility="frame.caretVisibility"
                />
            </div>
        </div>
    </div>
</template>

<script lang="ts">
//////////////////////
//      Imports     //
//////////////////////
import { defineComponent } from "vue";
import Frame from "@/components/Frame.vue";
import CaretContainer from "@/components/CaretContainer.vue";
import { useStore } from "@/store/store";
import { CaretPosition, CollapsedState, FrameObject, DefaultFramesDefinition, FramesDefinitions, FrameContainersDefinitions, getFrameDefType, AllFrameTypesIdentifier, PythonExecRunningState } from "@/types/types";
import { mapStores } from "pinia";
import { CustomEventTypes, getCaretContainerRef, getFrameUID} from "@/helpers/editor";
import scssVars from "@/assets/style/_export.module.scss";
import { getFrameSectionIdFromFrameId } from "@/helpers/storeMethods";
import { TestingSectionAvailable } from "@/helpers/appContext";
import { isMacOSPlatform } from "@/helpers/common";
import ChildrenFrameStateToggle from "@/components/ChildrenFrameStateToggle.vue";

//////////////////////
//     Component    //
//////////////////////
export default defineComponent({
    name: "FrameContainer",

    components: {
        ChildrenFrameStateToggle,
        Frame,
        CaretContainer,
    },


    props: {
        frameId: {type: Number, required: true},
        caretVisibility: String,
        containerLabel: String,
        frameType: {
            type: Object,
            default: () => DefaultFramesDefinition,
        }, //Type of the Frame  
    },

    data: function(){
        return {
            isHovered: false,
            currentDragAndDropHoverTimeoutHandle: -1,
        };
    },

    computed: {
        testingSectionAvailable(): boolean {
            return TestingSectionAvailable;
        },

        ...mapStores(useStore),

        scssVars() {
            // just to be able to use in template
            return scssVars;
        },

        frameUID(): string{
            return getFrameUID(this.frameId);
        },

        getCaretContainerRef(): string {
            return getCaretContainerRef();
        },

        isMainCodeFrameContainer(): boolean {
            return this.frameId == this.appStore.getMainCodeFrameContainerId;
        },

        isDefsFrameContainer(): boolean {
            return this.frameId == this.appStore.getDefsFrameContainerId;
        },

        isTestsFrameContainer(): boolean {
            return this.frameId == this.appStore.getTestsFrameContainerId;
        },

        isPythonExecuting(): boolean {
            return (this.appStore.pythonExecRunningState ?? PythonExecRunningState.NotRunning) != PythonExecRunningState.NotRunning;
        },

        // Whether the third section of the editor is currently showing the testing code rather than the main code
        isShowingTests(): boolean {
            return this.appStore.mainSectionShowsTests;
        },

        // The tabs of the heading of the third section: one for the main code and one for the testing code, labelled with the
        // containers' headings (those end in a colon, which a tab doesn't need)
        // The tab that isn't selected has a tooltip with the keyboard shortcut to switch to it (see Commands.vue)
        headingTabs(): {id: string, label: string, selected: boolean, showsTests: boolean, tip?: string}[] {
            const tabLabel = (label: string) => label.replace(/\s*[:\uFF1A]\s*$/, "");
            const shortcut = isMacOSPlatform() ? "Option+T" : "Alt+T";
            const tabs = [
                {id: "main", label: tabLabel(this.containerLabel ?? ""), selected: !this.isShowingTests, showsTests: false},
                {id: "tests", label: tabLabel(this.$t("appMessage.testsContainer")), selected: this.isShowingTests, showsTests: true},
            ];
            return tabs.map((tab) => ({...tab, tip: tab.selected ? undefined : this.$t("appMessage.switchToSectionTip", {section: tab.label, shortcut})}));
        },

        // Of the main code and the testing code, only one is shown at a time
        isHiddenByMode(): boolean {
            return (this.isMainCodeFrameContainer && this.isShowingTests) || (this.isTestsFrameContainer && !this.isShowingTests);
        },
        
        frames: {
            get(): FrameObject[] {
                // gets the frames objects which are nested in here (i.e. have this frameID as parent)
                return this.appStore.getFramesForParentId(this.frameId);
            },
            set() {
                return;
            },    
        },
        
        // Needed in order to use the `CaretPosition` type in the v-show
        caretPosition(): typeof CaretPosition {
            return CaretPosition;
        },

        isEditing(): boolean {
            return this.appStore.isEditing;
        },

        frameStyle(): Record<string, string> {
            const defaultStyle : Record<string, string> = {
                "background-color": `${
                    (this.frameType as FramesDefinitions).colour
                } !important`,
            };
            // For the main code, add 200px at the bottom so you can scroll down to put the last bit of code
            // above the bottom of the window.
            // The same goes for the testing code, which takes the place of the main code when it is showing.
            if ((this.isMainCodeFrameContainer && !this.isShowingTests) || (this.isTestsFrameContainer && this.isShowingTests)) {
                defaultStyle["padding-bottom"] = "200px";
            }
            // While the testing code is showing, "My code" is just the heading above it: no space below, so the
            // testing code sits right under the heading exactly as the main code does.
            else if (this.isMainCodeFrameContainer && this.isShowingTests) {
                defaultStyle["padding-bottom"] = "0px";
            }
            return defaultStyle;
        },

        id(): string {
            return "frameContainerId_" + this.frameId;
        },

        isCollapsed: {
            get(): boolean {
                // Ignore the value for "My code" or Defs container for compatibility with saved project having collapsable "My code" container.
                // The Testing container is never collapsed either (it is shown in place of "My code").
                return (this.isMainCodeFrameContainer || this.isDefsFrameContainer || this.isTestsFrameContainer) ? false : this.appStore.isContainerCollapsed(this.frameId);
            },
            set(value: boolean){
                this.appStore.setCollapseStatuses({[this.frameId]: value ? CollapsedState.ONLY_HEADER_VISIBLE : CollapsedState.FULLY_VISIBLE});
            },
        },

        collapseButtonLabel(): string {
            return (this.isCollapsed) ? "\u25B6" : "\u25BC";
        },

        containerStyle(): Record<string, string> {
            return {
                "display": (this.isCollapsed || this.isHiddenByMode) ? "none" : "block",
                "backgroundColor": `${(this.frameType.type === FrameContainersDefinitions.ImportsContainerDefinition.type || this.frameType.type == FrameContainersDefinitions.DefsContainerDefinition.type)
                    ? getFrameDefType(AllFrameTypesIdentifier.import).colour
                    : getFrameDefType(AllFrameTypesIdentifier.return).colour}`,
            };
        },

    },

    methods: {
        setFrameRef(frameId: number) {
            return getFrameUID(frameId);
        },
        
        // Clicking the tab of the section that isn't showing switches to it. The frame cursor goes to the start of the section
        // shown. (Not while a program is running: the store ignores it then, and the tab isn't styled as clickable.)
        selectHeadingTab(showTests: boolean): void {
            if (this.isMainCodeFrameContainer && !this.isPythonExecuting) {
                this.appStore.setMainSectionShowsTests(showTests);
            }
        },

        toggleCollapse(): void {
            // Only collapse Imports and Definitions frame containers.
            if(!this.isMainCodeFrameContainer){
                this.isCollapsed = !this.isCollapsed;
                
                // Also move the frame cursor to the next uncollapsed frame container
                // if we were inside the frame container being collapsed
                if(this.isCollapsed && getFrameSectionIdFromFrameId(this.appStore.currentFrame.id) == this.frameId) {
                    const nextFrameContainerIndex = this.appStore.frameObjects[this.appStore.getRootFrameContainerId].childrenIds.indexOf(this.frameId) + 1;
                    const nextFrameContainerId = this.appStore.frameObjects[this.appStore.getRootFrameContainerId].childrenIds.at(nextFrameContainerIndex);
                    // As we have only 3 sections, if the next section is collapsed we automatically get to "My code", as this one is never collapsed.
                    const targetFrameContainerId = (nextFrameContainerId && this.appStore.frameObjects[nextFrameContainerId].collapsedState == CollapsedState.FULLY_VISIBLE)
                        ? nextFrameContainerId
                        : this.appStore.getMainCodeFrameContainerId;
                    this.appStore.setCurrentFrame({id: targetFrameContainerId, caretPosition: CaretPosition.body});
                }
            }
        },

        onFrameContainerClick(event: any): void {
            // If there are no frames in this container, a click should toggle the caret of this container
            if (this.frames.length == 0) {
                this.appStore.toggleCaret({id: this.frameId, caretPosition: CaretPosition.body});
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
            }
        },
        
        onOuterContainerClick(event : any): void {
            const containerFramesBounds = (this.$refs.containerFrames as HTMLElement).getBoundingClientRect();
            
            // Was the click beneath the bottom of the frame container?
            if (event.clientY > containerFramesBounds.bottom) {
                // Select the lowest frame cursor position:
                if (this.frames.length == 0) {
                    this.appStore.toggleCaret({id: this.frameId, caretPosition: CaretPosition.body});
                }
                else {
                    this.appStore.toggleCaret({
                        id: this.frames[this.frames.length - 1].id,
                        caretPosition: CaretPosition.below,
                    });
                }
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
            }
            else if (event.clientY < containerFramesBounds.top) {
                // Select the highest frame cursor position:
                this.appStore.toggleCaret({id: this.frameId, caretPosition: CaretPosition.body});
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
            }

            // Make sure the container is expanded.
            this.appStore.frameObjects[this.frameId].collapsedState = CollapsedState.FULLY_VISIBLE;
        },

        onFrameContainerHover(isHovered: boolean): void {
            this.isHovered = isHovered;
            
            // Stop the timeout if one was set
            if(!isHovered && this.currentDragAndDropHoverTimeoutHandle > -1){
                window.clearTimeout(this.currentDragAndDropHoverTimeoutHandle);
                this.currentDragAndDropHoverTimeoutHandle = -1;
            }

            // During a drag and drop, if the frame container is collapsed and we've waited long enough, 
            // we can expand the frame (and we trigger an event to allow the drag and drop mechanism to 
            // take the new situation into account.)
            const timeout = 1000;
            if(isHovered && this.appStore.isDraggingFrame && !this.isMainCodeFrameContainer && this.isCollapsed){
                this.currentDragAndDropHoverTimeoutHandle = window.setTimeout(() => {
                    // Check if we are still hovering and dragging                
                    if(this.isHovered && this.appStore.isDraggingFrame){
                        this.appStore.frameObjects[this.frameId].collapsedState = CollapsedState.FULLY_VISIBLE;
                        document.dispatchEvent(new CustomEvent(CustomEventTypes.dropFramePositionsUpdated));
                    }
                }, timeout);
            }

        },
        

    },
});

</script>

<style lang="scss">
.frame-container {
    padding-bottom: 15px;
    margin-bottom: 0px;
    margin-left:0px;
}

.frame-container-btn-collapse {
    border-color: transparent;
    background-color: transparent;
    outline:none;
    padding-inline: 2px; // Not only for us to custom style, but because otherwise browsers set different values
}

.frame-container-btn-collapse:focus {
    outline: none;
}

.#{$strype-classname-frame-container-label-span} {       
    margin-left: 5px;
    cursor:default;
    color: #274D19;
    font-weight: 600;
}

.no-toggle-frame-container-span {
  margin-left: 4px; // 2px in place of the button border + 2px in place of the button inline padding 
}

.container-frames, .non-empty-collapsed-frame-container-hr {
    margin-left: 10px; // 1px less than for the right margin to make the rendering neat
    margin-right: 11px;
}

.container-frames {
    border-radius: 8px;
    border: 1px solid #B4B4B4;
    outline: none;
}

.frame-container-minheight {
    min-height: $frame-container-min-height;
}
// The tabs of the heading of the third section, like those of the Python execution area (rounded at the top, the selected one
// raised and the others flat) but tinted green to go with the editor. The selected one takes the colour of the code box under it.
.frame-container-tabs {
    display: flex;
    align-items: flex-end;
    margin-left: 10px; // To line up with the box of code below
    gap: 2px;
}

.frame-container-tab {
    padding: 0.15rem 0.75rem;
    border-radius: 0.4rem 0.4rem 0 0;
    border: 1px solid transparent;
    border-bottom: none;
    color: #274D19;
    background-color: rgba(60, 110, 40, 0.16);
    cursor: default;
}

.frame-container-tab-selected {
    font-weight: 600;
    background-color: $strype-main-code-container-background;
    border-color: #B4B4B4;
    // Sits over the top border of the box of code so that the two look joined:
    position: relative;
    margin-bottom: -1px;
    padding-bottom: calc(0.15rem + 1px);
}

.frame-container-tab-clickable {
    cursor: pointer;

    &:hover {
        background-color: rgba(60, 110, 40, 0.3);
    }
}

.frame-container-header {
    display: flex;
    padding-right: 5px;
}
.frame-container-header > .frame-container-btn-collapse, .frame-container-header > span:not(.no-toggle-frame-container-span) {
    cursor: pointer;
}
</style>
