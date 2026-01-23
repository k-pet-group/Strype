
<template>
    <div :id="peaComponentId" :class="{'pea-component': true, [scssVars.expandedPEAClassName]: isExpandedPEA, 'no-43-ratio-collapsed-PEA': !hasDefault43Ratio && !isExpandedPEA}" ref="peaComponent" @mousedown="handlePEAMouseDown">
        <div :id="controlsDivId" :class="{'pea-controls-div': true, 'expanded-PEA-controls': isExpandedPEA}">           
            <b-tabs v-show="isTabsLayout" v-model="peaDisplayTabIndex" no-key-nav>
                <b-tab v-show="isTabsLayout" :button-id="graphicsTabId" :title="'\uD83D\uDC22 '+$t('PEA.Graphics')" title-link-class="pea-display-tab"></b-tab>
                <b-tab v-show="isTabsLayout" :title="'\u2771\u23BD '+$t('PEA.console')" title-link-class="pea-display-tab" active></b-tab>
            </b-tabs>
            <!-- IMPORTANT: keep this div with "invisible" text for proper layout rendering, it replaces the tabs -->
            <span v-if="!isTabsLayout" :class="scssVars.peaNoTabsPlaceholderSpanClassName">c+g</span>
            <div class="flex-padding"/>            
            <button id="runButton" ref="runButton" @click="runClicked" :title="$t((isPythonExecuting) ? 'PEA.stop' : 'PEA.run') + ' (Ctrl+Enter)'" :class="{highlighted: highlightPythonRunningState}">
                <img v-if="!isPythonExecuting" :src="faviconURL" class="pea-play-img">
                <span v-else class="python-running">{{runCodeButtonIconText}}</span>
                <span>{{runCodeButtonLabel}}</span>
            </button>
        </div>
        <div :id="tabContentContainerDivId" :class="{'pea-tab-content-container': true, 'flex-padding': true, 'pea-43-ratio': hasDefault43Ratio}">
            <!-- the SplitPanes is used in all layout configurations: for tabs, we only show 1 of the panes and disable moving the divider, and for stacked window it acts as normal -->
            <Splitpanes :class="{'strype-PEA-split-theme': true, 'with-expanded-PEA': isExpandedPEA, 'tabs-PEA': isTabsLayout}" :horizontal="!isExpandedPEA" @resize="onSplitterPane1Resize">
                <pane :id="graphicsSplitPaneId" key="1" v-show="isGraphicsAreaShowing" :size="(isTabsLayout) ? 100 : currentSplitterPane1Size" min-size="5">
                    <div :id="graphicsContainerDivId" @wheel.stop :class="{'pea-graphics-container': true, hidden: graphicsTemporaryHidden}" @contextmenu="showContextMenu($event)">
                        <canvas id="pythonGraphicsCanvas" ref="pythonGraphicsCanvas" @mousedown.stop="graphicsCanvasMouseDown" @mouseup.stop="graphicsCanvasMouseUp" @mousemove="graphicsCanvasMouseMove"></canvas>
                        <div><!-- this div is a flex wrapper just to get scrolling right, see https://stackoverflow.com/questions/49942002/flex-in-scrollable-div-wrong-height-->
                            <div :id="graphicsDivId" ref="pythonTurtleDiv" class="pea-graphics-div"></div>
                        </div> 
                    </div>
                </pane>
                <pane key="2" v-show="isConsoleAreaShowing" :size="(isTabsLayout) ? 100 : (100 - currentSplitterPane1Size)" min-size="5">
                    <textarea 
                        :id="pythonConsoleId"
                        ref="pythonConsole"
                        class="pea-console"
                        @focus="onFocus()"
                        @change="onChange"
                        @wheel.stop
                        @keydown.self.stop="handleKeyEvent"
                        @keyup.self="handleKeyEvent"
                        disabled
                        spellcheck="false"
                    >    
                    </textarea>
                </pane>
            </Splitpanes>
            <div :class="{[scssVars.peaToggleLayoutButtonsContainerClassName]: true, hidden: (!isTabContentHovered || isPythonExecuting)}">
                <div v-for="(layoutData, index) in PEALayoutsData" :key="'strype-PEA-Layout-'+index" 
                    @click="togglePEALayout(layoutData.mode, true)" :title="$t('PEA.'+layoutData.iconName)">
                    <SVGIcon :name="layoutData.iconName" :customClass="{'pea-toggle-layout-button': true, 'pea-toggle-layout-button-selected': layoutData.mode === currentPEALayoutMode}"/>
                </div>
            </div>
        </div>
        <vue-context ref="menu" @open="handleContextMenuOpened" @close="handleContextMenuClosed" id="PEAcontextmenu">
            <li><a @click.stop="screenshotGraphicsArea(); closeContextMenu()" @mouseover="handleContextMenuHover">{{$i18n.t("contextMenu.screenshotGraphics")}}</a></li>
        </vue-context>
    </div>
</template>

<script lang="ts">
import Vue from "vue";
import { useStore } from "@/store/store";
import Parser from "@/parser/parser";
import { execPythonCode } from "@/helpers/execPythonCode";
import { mapStores } from "pinia";
import {adjustContextMenuPosition, checkEditorCodeErrors, countEditorCodeErrors, CustomEventTypes, debounceComputeAddFrameCommandContainerSize, getEditorCodeErrorsHTMLElements, getFrameUID, getMenuLeftPaneUID, getPEAComponentRefId, getPEAConsoleId, getPEAControlsDivId, getPEAGraphicsContainerDivId, getPEAGraphicsDivId, getPEATabContentContainerDivId, getStrypeCommandComponentRefId, hasPrecompiledCodeError, setContextMenuEventClientXY, setPythonExecAreaLayoutButtonPos, setPythonExecutionAreaTabsContentMaxHeight} from "@/helpers/editor";
import i18n from "@/i18n";
import {defaultEmptyStrypeLayoutDividerSettings, Position, PythonExecRunningState, StrypePEALayoutData, StrypePEALayoutMode} from "@/types/types";
import { PersistentImage, PersistentImageManager, WORLD_HEIGHT, WORLD_WIDTH } from "@/stryperuntime/image_and_collisions";
import Menu from "@/components/Menu.vue";
import CommandsComponent from "@/components/Commands.vue";
import SVGIcon from "@/components/SVGIcon.vue";
import {Splitpanes, Pane} from "splitpanes";
import { debounce } from "lodash";
import scssVars from "@/assets/style/_export.module.scss";
import {getLibraryName, getRawFileFromLibraries} from "@/helpers/libraryManager";
import VueContext, { VueContextConstructor } from "vue-context";
import {getDateTimeFormatted} from "@/helpers/common";
import audioBufferToWav from "audiobuffer-to-wav";
import { saveAs } from "file-saver";
import {bufferToBase64} from "@/helpers/media";
import turtleImgURL from "@/assets/images/turtle.png" ;

// Helper to keep indexed tabs (for maintenance if we add some tabs etc)
const enum PEATabIndexes {graphics, console}

const persistentImageManager = new PersistentImageManager();
let domContext : CanvasRenderingContext2D | null = null;
let targetContext : OffscreenCanvasRenderingContext2D | null = null;
let targetCanvas : OffscreenCanvas | null = null;
let audioContext : AudioContext | null = null; // Important we don't initialise here, for permission reasons
let mostRecentClickedItems : PersistentImage[] = []; // All the items under the mouse cursor at last click
let mostRecentClickDetails : number[] | null = null; // Array of four numbers: x, y, button, click_count
let mostRecentMouseDetails : [number, number, [boolean, boolean, boolean]] = [0, 0, [false, false, false]]; // X, Y, three button states
const pressedKeys = new Map<string, boolean>();
const keyMapping = new Map<string, string>([["ArrowUp", "up"], ["ArrowDown", "down"], ["ArrowLeft", "left"], ["ArrowRight", "right"]]);
const bufferToSource = new Map<AudioBuffer, AudioBufferSourceNode>(); // Used to stop playing sounds

// We draw our actual graphics canvas (for strype.graphics) at the size it is on the page,
// given the 4:3 aspect ratio.  But we also have a logical size that is constant, which is 800x600.
// This means that if you draw an image say 400x300 pixels it will always take up a quarter of the canvas
// (well, a half of the canvas in each dimension) no matter what size the user's window is or whether they've
// expanded the canvas
const graphicsCanvasLogicalWidth = WORLD_WIDTH;
const graphicsCanvasLogicalHeight = WORLD_HEIGHT;

async function getAssetFileFromLibrary(fullLibraryAddress: string, fileName: string) {
    // First, try filename as-is:
    const asIs = await getRawFileFromLibraries([fullLibraryAddress], fileName);
    if (asIs) {
        return asIs;
    }
    // If that doesn't exist, try within the assets directory:
    return  await getRawFileFromLibraries([fullLibraryAddress], "assets/" + fileName);
}

export default Vue.extend({
    name: "PythonExecutionArea",

    components: {
        Splitpanes,
        Pane,
        SVGIcon,
        VueContext,
    },

    props:{
        hasDefault43Ratio: Boolean,
    },

    data: function() {
        return {
            scssVars, // just to be able to use in template
            isExpandedPEA: false,
            isTabsLayout: true, // flag to indicate the PEA's layout - tabs by default
            graphicsTemporaryHidden: false, //flag to use when we need to temporary hide the graphics for UI reasons (like before a layout of the PEA is performed, so we can compute things right)
            turtleGraphicsImported: false, // by default, Turtle isn't imported - this flag is updated when we detect the import (see event registration in mounted())
            peaDisplayTabIndex: PEATabIndexes.console, // the index of the PEA tab (graphics/console), we use it equally as a flag to indicate if we are on one or other tab
            interruptedTurtle: false,
            isTabContentHovered: false,
            isTurtleListeningKeyEvents: false, // flag to indicate whether an execution of Turtle resulted in listen for key events on Turtle
            isTurtleListeningMouseEvents: false, // flag to indicate whether an execution of Turtle resulted in listen for mouse events on Turtle
            isTurtleListeningTimerEvents: false, // flag to indicate whether an execution of Turtle resulted in listen for timer events on Turtle
            isRunningStrypeGraphics : false,
            scaleToFit: 1,
            libraries: [] as string[],
            stopTurtleUIEventListeners: undefined as ((keepShowingTurtleUI: boolean)=>void) | undefined, // registered callback method to clear the Turtle listeners mentioned above
            PEALayoutsData: [
                {iconName: "PEA-layout-tabs-collapsed", mode: StrypePEALayoutMode.tabsCollapsed},
                {iconName: "PEA-layout-tabs-expanded", mode: StrypePEALayoutMode.tabsExpanded},
                {iconName: "PEA-layout-split-collapsed", mode: StrypePEALayoutMode.splitCollapsed},
                {iconName: "PEA-layout-split-expanded", mode: StrypePEALayoutMode.splitExpanded},
            ] as StrypePEALayoutData[],
            highlightPythonRunningState: false, // a flag used to trigger a CSS highlight of the PEA running state
        };
    },
    
    mounted(){
        // Just to prevent any inconsistency with a uncompatible state, set a state value here and we'll know we won't get in some error
        useStore().pythonExecRunningState = PythonExecRunningState.NotRunning;
        
        // Register an event listener on the tab content container on hover (in/out) to handle some styling
        (document.getElementById(getPEATabContentContainerDivId()))?.addEventListener("mouseenter", () => this.isTabContentHovered = true);
        (document.getElementById(getPEATabContentContainerDivId()))?.addEventListener("mouseleave", () => this.isTabContentHovered = false);

        // Register an event listener on "running highlight notification" request
        document.addEventListener(CustomEventTypes.highlightPythonRunningState, this.doHighlightPythonRunningState);

        // Have to use nextTick because Bootstrap won't have created the actual HTML parts until then:
        this.$nextTick(() => document.querySelectorAll("#" + getPEAControlsDivId() + " .nav-item a").forEach((el) => {
            // When a tab header is clicked, lose focus, because we want focus back to the editor:
            el.addEventListener("click", (e) => {
                (el as HTMLElement).blur();
            });
        }));

        const pythonConsole = document.getElementById(getPEAConsoleId());
        const turtlePlaceholderDiv = document.getElementById(getPEAGraphicsDivId());
        const tabContentContainerDiv = document.getElementById(getPEATabContentContainerDivId());
        const graphicsSplitPaneDiv = document.getElementById(this.graphicsSplitPaneId);

        if(pythonConsole != undefined && turtlePlaceholderDiv != undefined && tabContentContainerDiv != undefined && graphicsSplitPaneDiv != undefined){
            // Register an event listener on the textarea for the request focus event
            pythonConsole.addEventListener(CustomEventTypes.pythonConsoleRequestFocus, this.handleConsoleFocusRequest);

            // Register an event listener on the textarea for handling post-input
            pythonConsole.addEventListener(CustomEventTypes.pythonConsoleAfterInput, this.handlePostInputConsole);

            // Register an event listener on this component for the notification of the turtle library import usage
            (this.$refs.peaComponent as HTMLDivElement).addEventListener(CustomEventTypes.notifyTurtleUsage, (event) => {
                this.turtleGraphicsImported = (event as CustomEvent).detail;
                const pythonTurtleDiv = document.getElementById(getPEAGraphicsDivId());
                if(!this.turtleGraphicsImported && pythonTurtleDiv != undefined) {
                    // If we don't import turtle anymore, we "clear" any potential graphics to have the "import Turtle" message clearly showing.
                    document.querySelectorAll("#" + getPEAGraphicsDivId() + " canvas").forEach((canvasEl) => pythonTurtleDiv.removeChild(canvasEl));                    
                }
            });    

            // Register a mutation observer on the Turtle div placeholder to know when canvases are added/removed,
            // so we can, in turn, set a resize observer on these canvases to compute how to scale them.
            // (Note: that is very important because every time the user code is run, Skulpt regenerates the canvases)
            const turtleDivPlaceholderObserver = new MutationObserver(() => {
                if(document.querySelectorAll("#" + getPEAGraphicsDivId() + " canvas").length >= 1){
                    // Adding graphics in the split view may mess up with our styling (scroll bars are added) so before running 
                    // we hide the graphics container, it will be shown again later when scalling is called
                    this.graphicsTemporaryHidden = true;
                    setTimeout(() => {
                        this.scaleTurtleCanvas(tabContentContainerDiv, graphicsSplitPaneDiv, turtlePlaceholderDiv);
                    }, 100);

                    // When a canvas has been added we can select the Graphics tab
                    this.peaDisplayTabIndex = PEATabIndexes.graphics;
                }
            });
            turtleDivPlaceholderObserver.observe(turtlePlaceholderDiv, {childList: true});   
            
            // Register an observer when the tab content dimension changes: we need to reflect this on the canvas scaling (cf. above)
            // DO NOT use ResizeObserver to do so: it gets messy with the events loop ("ResizeObserver loop completed with undelivered notifications.")
            const debouncePEASizeChangedCallback = debounce((onlyResizePEA?: boolean) => {
                // If Strype is shown in its default view (PEA has 4:3 ratio, we need to update the splitter so the PEA stay visible)
                let waitSplitterToAdaptTimeout = 0;
                if(this.hasDefault43Ratio && !onlyResizePEA) {
                    waitSplitterToAdaptTimeout = 200;
                    this.$emit(CustomEventTypes.pythonExecAreaMounted);
                }

                setTimeout(() => {
                    // We should only scale the canvas if there is at least a canvas to scale! (i.e. we show turtle graphics...)
                    const graphicsCanvasSelector = "#" + getPEAGraphicsDivId() + " canvas";
                    if (document.querySelectorAll(graphicsCanvasSelector).length > 0) {
                        this.graphicsTemporaryHidden = true;
                        setTimeout(() => {
                            if(document.querySelectorAll(graphicsCanvasSelector).length > 0){
                                this.scaleTurtleCanvas(tabContentContainerDiv,graphicsSplitPaneDiv, turtlePlaceholderDiv);
                            }
                        }, 100);                    
                    }
                
                    setTimeout(() => {
                        if(!onlyResizePEA){
                            debounceComputeAddFrameCommandContainerSize(this.isExpandedPEA);
                        }
                        setPythonExecAreaLayoutButtonPos();
                    }, 100);
                }, waitSplitterToAdaptTimeout);
            }, 100);
            
            tabContentContainerDiv.addEventListener(CustomEventTypes.pythonExecAreaSizeChanged, ((event) => debouncePEASizeChangedCallback((event as CustomEvent<boolean|undefined>).detail)));

            // Register to the window event listener for Skulpt Turtle mouse and timer events listening off notification
            window.addEventListener(CustomEventTypes.skulptMouseEventListenerOff, () => {
                this.isTurtleListeningMouseEvents=false; 
                this.updateTurtleListeningEvents();
            });
            window.addEventListener(CustomEventTypes.skulptTimerEventListenerOff, () => {
                this.isTurtleListeningTimerEvents=false; 
                this.updateTurtleListeningEvents();
            });
        }

        // One last thing we want to do is update the Turtle emoji to something consistent across machines/browsers
        this.$nextTick(() => {
            const graphicTaBElement = document.getElementById(this.graphicsTabId);
            if(graphicTaBElement){
                graphicTaBElement.innerHTML = graphicTaBElement.innerHTML.replace("\uD83D\uDC22", `<img src="${turtleImgURL}" alt="${this.$i18n.t("PEA.Graphics")}" class="pea-turtle-img" />`);
            }
        });
       
        
        // Setup Canvas:
        const domCanvas = this.$refs.pythonGraphicsCanvas as HTMLCanvasElement;
        domContext = domCanvas.getContext("2d", {alpha: true}) as CanvasRenderingContext2D | null;
        // Need to resize off-screen canvas to match, if the on-screen canvas changes size: 
        let adjustCanvasSize = function() {
            // This confused me at first: the <canvas> has a width and height property.  These are initially set
            // to 300 and 150 if you don't specify them.  They stay at these defaults even if the HTML <canvas> element
            // changes its on-screen size, but it will then scale up the displayed image from 300 x 150 to whatever its
            // in-page size is.  Which looks horrible if the sizes are different.  So we need to explicitly set the <canvas>
            // width and height to be the on-page width and height to avoid this:
            const realWidth = domCanvas.getBoundingClientRect().width;
            const realHeight = domCanvas.getBoundingClientRect().height;
            // Sometimes it can be zero while adjusting size of cheat sheet;
            // don't set that on the canvas.  The real value will follow soon after.
            if (realWidth > 0 && realHeight > 0) {
                domCanvas.width = realWidth;
                domCanvas.height = realHeight;
            }
            // It's possible for the on-screen canvas to be the wrong aspect ratio, which we do not prevent.
            // But we make the off-screen canvas the right aspect ratio:
            const maxHeight = Math.min(realHeight, (3 / 4) * realWidth);
            const maxWidth = (4 / 3) * maxHeight;
            targetCanvas = new OffscreenCanvas(maxWidth, maxHeight);
            targetContext = targetCanvas?.getContext("2d", {alpha: true}) as OffscreenCanvasRenderingContext2D;
        };
        // Listen to size changes, and call now:
        new ResizeObserver(adjustCanvasSize).observe(domCanvas);
        adjustCanvasSize();
        // Once everything is ready, we can notify the application (via events) that the PEA is ready
        // Note that because of all the timeouts used throught the rendering we give ourselves some lease time.
        setTimeout(() => {
            this.$emit(CustomEventTypes.pythonExecAreaMounted);
        }, 500);
    },

    computed:{
        ...mapStores(useStore),

        faviconURL(): string {
            // We use a computed library to reference the favicon.png to avoid Vite getting confused with paths.
            return "favicon.png";
        },

        peaComponentId(): string {
            return getPEAComponentRefId();
        },

        controlsDivId(): string {
            return getPEAControlsDivId();
        },

        graphicsTabId(): string {
            return "graphicsPEATab";
        },

        tabContentContainerDivId(): string {
            return getPEATabContentContainerDivId();
        },

        graphicsContainerDivId(): string {
            return getPEAGraphicsContainerDivId();
        },

        graphicsDivId(): string {
            return getPEAGraphicsDivId();
        },

        graphicsSplitPaneId(): string {
            return "peaGraphicsSplitPane";
        },

        pythonConsoleId(): string {
            return getPEAConsoleId();
        },

        isConsoleAreaShowing(): boolean {
            return !this.isTabsLayout || (this.isTabsLayout && this.peaDisplayTabIndex == PEATabIndexes.console);
        },

        isGraphicsAreaShowing(): boolean {
            return !this.isTabsLayout || (this.isTabsLayout && this.peaDisplayTabIndex == PEATabIndexes.graphics);
        },

        isPythonExecuting(): boolean {
            return useStore().pythonExecRunningState != PythonExecRunningState.NotRunning;
        },

        currentSplitterPane1Size(): number {
            // The current size (in %) of the splitter's pane 1, we keep this as a variable not directly affected to the splitter's 
            // pane size to maintain visual aspects when layout switches (the actual size may be explicitly changed to 0 or 100
            // depending on the layout mode).
            return (this.appStore.peaSplitViewSplitterPane1Size != undefined && this.appStore.peaLayoutMode != undefined && this.appStore.peaSplitViewSplitterPane1Size[this.appStore.peaLayoutMode] != undefined)
                ? this.appStore.peaSplitViewSplitterPane1Size[this.appStore.peaLayoutMode] as number
                : parseFloat(scssVars.peaSplitViewSplitterPane1SizePercentValue);
        },

        runCodeButtonIconText(): string {
            switch (useStore().pythonExecRunningState) {
            case PythonExecRunningState.Running:
                return "◼";
            case PythonExecRunningState.RunningAwaitingStop:
                return "";
            default: return "";
            }
        },
        
        runCodeButtonLabel(): string {
            switch (useStore().pythonExecRunningState) {
            case PythonExecRunningState.NotRunning:
                return " " + i18n.t("PEA.run");
            case PythonExecRunningState.Running:
                return " " + i18n.t("PEA.stop");
            case PythonExecRunningState.RunningAwaitingStop:
                return i18n.t("PEA.stopping") as string;
            default: return "";
            }
        },

        isTurtleListeningEvents(): boolean {
            return this.isTurtleListeningKeyEvents || this.isTurtleListeningMouseEvents || this.isTurtleListeningTimerEvents;
        },

        currentPEALayoutMode() : StrypePEALayoutMode | undefined {
            return this.appStore.peaLayoutMode ?? StrypePEALayoutMode.tabsCollapsed;
        },
    },

    watch: {
        peaDisplayTabIndex(){
            // When we change tab, we also check the position of the expand/collapse button
            setPythonExecAreaLayoutButtonPos();
        },
    },

    methods: {
        handlePEAMouseDown() {
            // Force the Strype menu to close in case it was opened
            (this.$root.$children[0].$refs[getMenuLeftPaneUID()] as InstanceType<typeof Menu>).toggleMenuOnOff(null);
        },

        onSplitterPane1Resize(event: any) {
            // Only update the panel size when we are in stacked layout
            if(!this.isTabsLayout){
                // Save the PEA splitter's pane 1 size with the project (it will update currentSplitterPane1Size by reactivity)
                if(this.appStore.peaSplitViewSplitterPane1Size != undefined){
                    this.appStore.peaSplitViewSplitterPane1Size[this.appStore.peaLayoutMode??StrypePEALayoutMode.tabsCollapsed] = event[0].size;
                }
                else {
                    // The tricky case of when the state property has never been set
                    this.appStore.peaSplitViewSplitterPane1Size = {...defaultEmptyStrypeLayoutDividerSettings, [this.appStore.peaLayoutMode??StrypePEALayoutMode.tabsCollapsed]: event[0].size};
                }
            }

            // A change of divider position triggers a modification notification
            this.appStore.isEditorContentModified = true;            

            // Notify a resize of the PEA happened
            document.getElementById(getPEATabContentContainerDivId())?.dispatchEvent(new CustomEvent(CustomEventTypes.pythonExecAreaSizeChanged));
        },

        runClicked() {
            // The Python code execution has a 3-ways states:
            // - not running when nothing happens, click will trigger "running"
            // - running when some code is running, click will trigger "running awaiting stop"
            // - running awaiting stop will do nothing
            switch (useStore().pythonExecRunningState) {
            case PythonExecRunningState.NotRunning:
                useStore().pythonExecRunningState = PythonExecRunningState.Running;
                // Important to call this when responding to a click, because browser won't allow
                // sound to start unless we create it in response to a user action:
                audioContext = new AudioContext();
                this.execPythonCode();
                return;
            case PythonExecRunningState.Running:
                // There are 2 possible scenarios, which depends on the user code:
                // 1) the code contains some "event" listening functions but is written in a way that Turtle execution ends (Skulpt) and still listens:
                // 2) there is no "event" listening function in the code, or the code is written in a way that Turtle execution keeps pending (Skulpt)

                // Case 1): we know we are in this case when we have registered a function to call to "manually" stop the listeners,
                // that is all that needs to be done, Skulpt has already effectively terminated, we can just call the function and change the state.
                if(this.stopTurtleUIEventListeners){
                    this.isTurtleListeningKeyEvents = false;
                    this.isTurtleListeningMouseEvents = false;
                    this.isTurtleListeningTimerEvents = false;
                    this.updateTurtleListeningEvents();
                    return;
                }

                // Case 2): Skulpt checks this property regularly while running, via a callback,
                // so just setting the variable is enough to "request" a stop 
                useStore().pythonExecRunningState = PythonExecRunningState.RunningAwaitingStop;
                return;
            case PythonExecRunningState.RunningAwaitingStop:
                // Else, nothing more we can do at the moment, just waiting for Skulpt to see it
                return;
            }
        },
        
        updateTurtleListeningEvents(): void {
            // We should check if we are still in need to maintain the running state as "Running" (just for listening the events)
            // but if the state is already stopped (which can have been naturally from Skulpt then we don't need to do anything)
            if((useStore().pythonExecRunningState == PythonExecRunningState.Running || useStore().pythonExecRunningState == PythonExecRunningState.RunningAwaitingStop) && this.stopTurtleUIEventListeners){
                this.stopTurtleUIEventListeners(true);
                this.stopTurtleUIEventListeners = undefined;
                useStore().pythonExecRunningState = PythonExecRunningState.NotRunning;
            }
        },
        
        execPythonCode() {
            const pythonConsole = this.$refs.pythonConsole as HTMLTextAreaElement;
            pythonConsole.value = "";
            setPythonExecAreaLayoutButtonPos();
            
            // Make sure the text area is disabled when we run the code
            pythonConsole.disabled = true;
            this.appStore.wasLastRuntimeErrorFrameId = undefined;
            // Make sure there is no document selection for our editor
            this.appStore.setSlotTextCursors(undefined, undefined);
                
            // Before doing anything, we make sure there are no errors found in the code
            // We DELAY the action to make sure every other UI actions has been done, notably the error checking from LabelSlotsStructure.
            setTimeout(() => {
                // In case the error happens in the current frame (empty body) we have to give the UI time to update to be able to notify changes
                if(hasPrecompiledCodeError()) {
                    this.$nextTick().then(() => {
                        this.reachFirstError();   
                        // If we have an error, the code didn't actually run so we need to reflect this properly in the running state
                        useStore().pythonExecRunningState = PythonExecRunningState.NotRunning;            
                    }); 
                    return;
                }

                const parser = new Parser();
                const userCode = parser.getFullCode();
                parser.getErrorsFormatted(userCode);
                // Clear the graphics area:
                if (targetCanvas != null) {
                    targetContext?.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
                }
                persistentImageManager.clear();
                // Clear input:
                mostRecentClickedItems = [];
                mostRecentClickDetails = null;
                mostRecentMouseDetails = [0, 0, [false, false, false]];
                pressedKeys.clear();
                window.addEventListener("keydown", this.graphicsCanvasKeyDown);
                window.addEventListener("keyup", this.graphicsCanvasKeyUp);
                // Start the redraw loop:
                // eslint-disable-next-line @typescript-eslint/no-this-alias
                const t = this;
                function redraw() {
                    t.redrawCanvasIfNeeded();
                    if (useStore().pythonExecRunningState != PythonExecRunningState.RunningAwaitingStop) {
                        requestAnimationFrame(redraw);
                    }
                }
                requestAnimationFrame(redraw);
                
                this.libraries = parser.getLibraries();
                
                // Trigger the actual Python code execution launch
                execPythonCode(pythonConsole, this.$refs.pythonTurtleDiv as HTMLDivElement, userCode, parser.getFramePositionMap(),parser.getLibraries(), () => useStore().pythonExecRunningState != PythonExecRunningState.RunningAwaitingStop, (finishedWithError: boolean, isTurtleListeningKeyEvents: boolean, isTurtleListeningMouseEvents: boolean, isTurtleListeningTimerEvents: boolean, stopTurtleListeners: VoidFunction | undefined) => {
                    // After Skulpt has executed the user code, we need to check if a keyboard listener is still pending from that user code.
                    this.isTurtleListeningKeyEvents = !!isTurtleListeningKeyEvents; 
                    this.isTurtleListeningMouseEvents = !!isTurtleListeningMouseEvents; 
                    this.isTurtleListeningTimerEvents = !!isTurtleListeningTimerEvents;
                    this.stopTurtleUIEventListeners = stopTurtleListeners;
                    if (finishedWithError) {
                        this.updateTurtleListeningEvents();
                        // Don't draw last state if we finished with an error because we may be in an inconsistent state:
                        persistentImageManager.resetDirty();
                        for (let persistentImage of persistentImageManager.getPersistentImages()) {
                            persistentImage.dirty = false;
                        }
                    }
                    if(!this.isTurtleListeningEvents) {
                        useStore().pythonExecRunningState = PythonExecRunningState.NotRunning;
                    }
                    window.removeEventListener("keydown", this.graphicsCanvasKeyDown);
                    window.removeEventListener("keyup", this.graphicsCanvasKeyUp);
                    this.isRunningStrypeGraphics = false;
                    setPythonExecAreaLayoutButtonPos();
                    // A runtime error may happen whenever the user code failed, therefore we should check if an error
                    // when Skulpt indicates the code execution has finished.
                    this.checkNonePrecompiledErrors();
                });
                // We make sure the number of errors shown in the interface is in line with the current state of the code
                // Note that a run time error can still occur later.                
                this.checkNonePrecompiledErrors();
            }, 1000);           
        },

        checkNonePrecompiledErrors(){
            // As the UI should update first, we do it in the next tick. 
            this.$nextTick().then(() => {
                checkEditorCodeErrors();
                this.appStore.errorCount = countEditorCodeErrors();
                // If there is an error, we reach it and, if Turtle is active, we make sure we show the Python console
                if(this.appStore.errorCount > 0){
                    this.reachFirstError();
                    this.peaDisplayTabIndex = PEATabIndexes.console;
                }
            });
        },

        onFocus(): void {
            this.appStore.isEditing = false;
            this.peaDisplayTabIndex = PEATabIndexes.console;
        },

        handleConsoleFocusRequest(): void {
            // This method is responsible for handling when a focus on the console (textarea) is requrested programmatically
            // (typically when the Python input() function is encountered)
            
            //First we switch between Graphics and the console shall the Turtle be showing at the moment
            if(this.peaDisplayTabIndex == PEATabIndexes.graphics){
                this.interruptedTurtle = true;
                this.peaDisplayTabIndex = PEATabIndexes.console;
            }

            //In any case, then we focus the console (keep setTimeout rather than nextTick to have enough time to be effective)
            setTimeout(() => document.getElementById(getPEAConsoleId())?.focus(), 200);
        },

        handlePostInputConsole(): void {
            // This method is responsible for handling what to do after the console input (Python) has been invoked.
            // If there was a Turtle being shown, we get back to it. If not, we just stay on the console.
            if(this.turtleGraphicsImported && this.interruptedTurtle){
                this.interruptedTurtle = false;
                this.peaDisplayTabIndex = PEATabIndexes.graphics;
            }
        },

        onChange(): void {
            const consoleTextarea = this.$refs.pythonConsole as HTMLTextAreaElement;
            consoleTextarea.scrollTop = consoleTextarea.scrollHeight;
        },

        handleKeyEvent(event: KeyboardEvent) {
            // Key events are captured by the UI to navigate the blue cursor and add frames -- for the console, we don't want to propagate the event
            // but we have to propagate at least for key up because otherwise we can't get the input validation of the console working well.
            if(event.type == "keyup" || event.type == "keydown"){
                this.appStore.ignoreKeyEvent = true;
            }
            if(event.key.toLowerCase() == "enter" && event.type == "keyup"){
                // With Safari, we don't get the focus back to the editor, so we need to explicitly give it to the right element.
                document.getElementById(getFrameUID(this.appStore.currentFrame.id))?.focus(); 
            }

            // As typing may result in the scrollbar appearing, we can check the position of the expand/collapse button here
            setPythonExecAreaLayoutButtonPos();
        },

        togglePEALayout(layoutMode: StrypePEALayoutMode, userTriggeredAction?: boolean){           
            // Save the layout mode with the project
            this.appStore.peaLayoutMode = layoutMode;
              
            const newTabsLayout = (layoutMode == StrypePEALayoutMode.tabsCollapsed || layoutMode == StrypePEALayoutMode.tabsExpanded);
            const newExpandLayout = (layoutMode == StrypePEALayoutMode.tabsExpanded || layoutMode == StrypePEALayoutMode.splitExpanded);
            const tabsLayoutChanged  = (newTabsLayout != this.isTabsLayout);
            const expandLayoutChanged = (newExpandLayout != this.isExpandedPEA);
            // Only do something if a new layout is requested...
            if(tabsLayoutChanged || expandLayoutChanged ){                
                this.isTabsLayout = newTabsLayout;
                this.isExpandedPEA = newExpandLayout;

                // We handle the styling for the Python Execution Area (PEA)'s tab content sizing here.
                if(!this.isExpandedPEA){
                    // We can now reset the dimension of the flex div (containing the Turtle div) to set it to default size
                    const turtlePlaceholderContainer = document.getElementById(getPEAGraphicsContainerDivId()) as HTMLDivElement;
                    (turtlePlaceholderContainer.children[0] as HTMLDivElement).style.width = "";
                    (turtlePlaceholderContainer.children[0] as HTMLDivElement).style.height = "";
                    (document.getElementById(getPEATabContentContainerDivId()) as HTMLDivElement).style.maxHeight = "";                                     
                }
                else{
                    // When the PEA is maximized, we set the max height via styling: this rules over CSS.
                    setPythonExecutionAreaTabsContentMaxHeight();
                }

                // As now the dividers positions are saved by PEA layout modes, we need to set 
                // the right position of the divider between the commands and the PEA (in collapsed layouts)
                if((layoutMode == StrypePEALayoutMode.tabsCollapsed || layoutMode == StrypePEALayoutMode.splitCollapsed)
                    && this.appStore.peaCommandsSplitterPane2Size && this.appStore.peaCommandsSplitterPane2Size[layoutMode] != undefined){
                    (this.$root.$children[0].$refs[getStrypeCommandComponentRefId()] as InstanceType<typeof CommandsComponent>).commandsSplitterPane2Size
                         = this.appStore.peaCommandsSplitterPane2Size[layoutMode] as number;
                }

                // If we are switching to the split view (or between split views) and graphics exists, it can add scrolling bars which then mess up the rendering.
                // So before the reactive the splitter, we make the Graphics area hidden to make sure no scroll bar will be involved.
                // Further calls to events will resize the Graphics are as it should.
                if((tabsLayoutChanged || (expandLayoutChanged && !tabsLayoutChanged && !this.isTabsLayout)) && !newTabsLayout && document.querySelectorAll("#" + getPEAGraphicsDivId() + " canvas").length > 0){
                    this.graphicsTemporaryHidden = true;
                }

                // A delay can occur when we swap between the tabs / split layout or between split directions,
                // so we need a delay to make sure the splitter has operated properly (we do it in any case)
                const refreshUITimeout = 100;
                if(expandLayoutChanged){
                    // Other parts of the UI need to be updated when the PEA default size is changed, so we emit an event
                    // (in case we rely on the current changes, we do it a bit later)
                    setTimeout(() => document.dispatchEvent(new CustomEvent(CustomEventTypes.pythonExecAreaExpandCollapseChanged, {detail: this.isExpandedPEA})),
                        refreshUITimeout);
                }                
                setTimeout(() => {
                    document.getElementById(getPEATabContentContainerDivId())?.dispatchEvent(new CustomEvent(CustomEventTypes.pythonExecAreaSizeChanged));
                }, refreshUITimeout + 100);

                // A change of layout triggers a modification notification only when the user actively changed it (flagged by "userTriggeredAction")
                if(userTriggeredAction){
                    this.appStore.isEditorContentModified = true;
                }
            }
        },

        scaleTurtleCanvas(tabContentContainerDiv: HTMLElement, graphicsSplitterPaneDiv: HTMLElement, turtlePlaceholderDiv: HTMLElement){
            // Resize and scale the Python Exec Area (PEA) Turtle container accordingly to the Turtle canvas:
            // - scale the placeholder to fit the viewport (the tab content) and preserve the canvas ratio, no scroll bar should appear
            // - set the placeholder container (the flex div) to the correct dimension to make sure the positioning (centered) is preserved
            //    -- SCALING WITH CSS DOES NOT MAKES THE DOM "SEEING" NEW DIMENSIONS
            // Note that when we are in split layout view, we need to work with the split pane.
            const turtleCanvas = document.querySelector("#" + getPEAGraphicsDivId() + " canvas") as HTMLCanvasElement;
            const canvasW = turtleCanvas.width;
            const canvasH = turtleCanvas.height;
            const tabContentElementBoundingClientRect = (this.isTabsLayout) ? tabContentContainerDiv.getBoundingClientRect() : graphicsSplitterPaneDiv.getBoundingClientRect();
            let {width: tabContentW, height: tabContentH} = tabContentElementBoundingClientRect;
            

            // Scale to fit: we scale to fit whichever dimension will be scaled-limited by the viewport.
            const preCheckTurtleCanvasWScaleRatio =  (tabContentW / canvasW);
            const preCheckTurtleCanvasHSCaleRatio = (tabContentH / canvasH);
            const turtleCanvasScaleRatio = Math.min(preCheckTurtleCanvasWScaleRatio, preCheckTurtleCanvasHSCaleRatio);
            (turtlePlaceholderDiv as HTMLDivElement).style.scale = ""+turtleCanvasScaleRatio;
   
            // We can now set the dimension of the flex div (containing the Turtle div) to fit to the scaled content new dimensions: 
            // the rule is: check what is each dimension of the scaled canvas and use the max between that scaled dimension and the tab content dimension
            // (to make sure we don't fit to a smaller size than the tab content itself!)
            (turtlePlaceholderDiv.parentElement as HTMLDivElement).style.width = Math.max((canvasW * turtleCanvasScaleRatio), tabContentW) +"px";
            (turtlePlaceholderDiv.parentElement as HTMLDivElement).style.height = Math.max((canvasH * turtleCanvasScaleRatio), tabContentH) +"px";

            // Restore the Graphics container visibility
            this.graphicsTemporaryHidden = false;
        },

        reachFirstError(): void {
            setTimeout(() => {
                // We should get only the run time error here, or at least 1 precompiled error
                // but for sanity check, we make sure it's still there
                const errors = getEditorCodeErrorsHTMLElements();
                if(errors && errors.length > 0){
                    // The Strype Menu handles already navigation of errors, so we use it to navigate to the first error...
                    (this.$root.$children[0].$refs[getMenuLeftPaneUID()] as InstanceType<typeof Menu>).currentErrorNavIndex = -1; 
                    (this.$root.$children[0].$refs[getMenuLeftPaneUID()] as InstanceType<typeof Menu>).goToError(null, true);
                }
            }, 200);
        },

        clear(): void {
            // This method clears the UI elements and flags related to Python code execution.
            (document.getElementById(getPEAConsoleId()) as HTMLTextAreaElement).value = "";
            const pythonTurtleDiv = document.getElementById(getPEAGraphicsDivId());
            if(pythonTurtleDiv != undefined) {
                document.querySelectorAll("#" + getPEAGraphicsDivId() + " canvas").forEach((canvasEl) => pythonTurtleDiv.removeChild(canvasEl));                    
            }
            this.isTurtleListeningKeyEvents = false; 
            this.isTurtleListeningMouseEvents = false;
            this.isTurtleListeningTimerEvents = false;
            this.stopTurtleUIEventListeners = undefined;

            if(useStore().pythonExecRunningState) {
                useStore().pythonExecRunningState = PythonExecRunningState.RunningAwaitingStop;              
            }
            this.isRunningStrypeGraphics = false;
            pressedKeys.clear();
            // Important not to use the accessor here as that will switch to the tab:
            persistentImageManager.clear();
            this.redrawCanvas();
        },
        
        // Note: this is called from our graphics API in strype_graphics_input_internal.js
        getPersistentImageManager() : PersistentImageManager {
            this.isRunningStrypeGraphics = true;
            this.peaDisplayTabIndex = PEATabIndexes.graphics;
            return persistentImageManager;
        },

        // Note: this is called from our graphics API in strype_graphics_input_internal.js
        // Returns a data: base64 URL with the content if found, or undefined if not
        loadLibraryAsset(libraryShortName: string, fileName: string) : Promise<string | undefined> {
            const fullLibraryAddress = this.libraries.find((lib) => getLibraryName(lib) === libraryShortName);
            if (fullLibraryAddress) {
                // Only search that library for the file:
                return getAssetFileFromLibrary(fullLibraryAddress, fileName).then(async (result) => {
                    if (result) {
                        const base64 = await bufferToBase64(result.buffer);
                        const type = result.mimeType ?? "application/octet-stream"; // fallback if MIME is unknown
                        return `data:${type};base64,${base64}`;
                    }
                    else {
                        return undefined;
                    }
                });
            }
            return Promise.resolve(undefined);
        },
        
        getAudioContext() : AudioContext {
            if (audioContext == null) {
                throw new Error("Problem initialising audio");
            }
            return audioContext;
        },
        
        downloadWAV(src: AudioBuffer, filenameStem: string) : void {
            const wavArrayBuffer = audioBufferToWav(src);
            const blob = new Blob([wavArrayBuffer], { type: "audio/wav" });
            saveAs(blob, `${filenameStem}_${getDateTimeFormatted(new Date(Date.now()))}.png`);
        },
        
        redrawCanvasIfNeeded() : void {
            // Draws canvas if anything has changed:
            if (persistentImageManager.isDirty()) {
                this.redrawCanvas();
            }
        },
        redrawCanvas() : void {
            const domCanvas = this.$refs.pythonGraphicsCanvas as HTMLCanvasElement;
            const c = targetCanvas;
            if (c == null) {
                // We can't redraw if there's no canvas
                return;
            }
            // We clear the full canvas size including the bit which might not be drawn on
            // because of the canvas aspect ratio meaning the whole image is not used:
            targetContext?.clearRect(0, 0, c.width, c.height);
            
            // The HTML canvas has 0,0 in the top left and 800, 600 in the bottom right (i.e. positive Y downward)
            // Our actors have positions where 0,0 is in the middle, and positive Y upward
            // with a bounds from -399, -299 to 400, 300.  0,0 in actor coordinates is actually 399, 300 in the canvas
            // because of this translation.
            // We can't do this by using translate etc on targetContent because to flip the Y axis we'd need to
            // use scale() which would flip the Y axis and thus mirror all the images vertically.  So we need to
            // translate ourselves.  All the examples here assume a width of 800 but we don't hardcode it.
            const mapX = function(x : number) : number {
                // Maps e.g. -50 to 349, 0 to 399, 50 to 449,
                return x + graphicsCanvasLogicalWidth / 2 - 1;
            };
            const mapY = function(y : number) : number {
                // Maps e.g. -50 to 450, 0 to 400, 50 to 350,
                return graphicsCanvasLogicalHeight / 2 - y;
            };
            // Also: we must scale the canvas from the logical 800x600 to its actual on-screen size.  This
            // we can do with a scale transformation.  We find which dimension must shrink most (smallest scale value)
            // then use that for both scale dimensions so we preserve the aspect ratio:
            const scaleToFitX = c.width / graphicsCanvasLogicalWidth;
            const scaleToFitY = c.height / graphicsCanvasLogicalHeight;
            this.scaleToFit = Math.min(scaleToFitX, scaleToFitY);
            targetContext?.save();
            targetContext?.scale(this.scaleToFit, this.scaleToFit);
            domCanvas.setAttribute("data-scale", this.scaleToFit.toString());
            
            for (let obj of persistentImageManager.getPersistentImages()) {
                if (obj.rotation != 0) {
                    // These translations are in terms of the 0,0 top left system, but we call mapX/mapY
                    // on the coords we pass in, so it works out:
                    targetContext?.save();
                    targetContext?.translate(mapX(obj.x), mapY(obj.y));
                    targetContext?.rotate(-obj.rotation * Math.PI / 180);
                    targetContext?.scale(obj.scale, obj.scale);
                    targetContext?.drawImage(obj.img, -0.5 * obj.img.width, -0.5 * obj.img.height);
                    targetContext?.restore();
                } 
                else {
                    // Simpler case; no rotation means we can use single call:
                    let dwidth = obj.scale * obj.img.width;
                    let dheight = obj.scale * obj.img.height;
                    targetContext?.drawImage(obj.img, mapX(obj.x) - dwidth*0.5, mapY(obj.y)-dheight*0.5, dwidth, dheight);
                }
                obj.dirty = false;
            }
            persistentImageManager.resetDirty();
            // Restore the scale:
            targetContext?.restore();
            
            // Actually copy the resulting off-screen image to the DOM canvas:
            // When the graphics tab has never been selected, the off-screen image can be empty
            // which gives an error:
            if (c.width > 0 && c.height > 0) {
                // Important on Safari to clear the canvas first, otherwise the new frame
                // gets blended on top.  Firefox and Chrome don't do this by default (different alpha blending mode?):
                domContext?.clearRect(0, 0, domCanvas.width, domCanvas.height);
                // The target canvas can be smaller than the real one, and we want to centre it:
                domContext?.drawImage(c, (domCanvas.width - (targetCanvas?.width ?? 0)) / 2, (domCanvas.height - (targetCanvas?.height ?? 0)) / 2);
            }
        },

        playAudioBuffer(audioBuffer : AudioBuffer) : Promise<void> | null {
            if (audioContext) {
                const source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioContext.destination);
                return new Promise(function (resolve, reject) {
                    source.onended = (ev) => {
                        bufferToSource.delete(audioBuffer);
                        resolve();
                    };
                    bufferToSource.set(audioBuffer, source);
                    source.start();
                });
            }
            else {
                return null;
            }
        },
        stopAudioBuffer(audioBuffer: AudioBuffer) : void {
            const source = bufferToSource.get(audioBuffer);
            if (source) {
                source.stop();
            }
            // It's not an error if source is null, it either means the sound hasn't been playing, or it already finished
        },
        getLogicalMouseCoords(event: PointerEvent) {
            const domCanvas = this.$refs.pythonGraphicsCanvas as HTMLCanvasElement;
            // We use the centres to align real bounding box and scaled:
            const scaledWidth = graphicsCanvasLogicalWidth * this.scaleToFit;
            const scaledHeight = graphicsCanvasLogicalHeight * this.scaleToFit;
            let b = domCanvas.getBoundingClientRect();

            // Offsets relative to centre of item, from -0.5 to +0.5
            const offsetX = event.offsetX - b.width / 2;
            // We have to invert the Y axis because positive is up there, hence * -1 on the end:
            const offsetY = (event.offsetY - b.height / 2) * -1;

            const adjustedX = (offsetX / scaledWidth) * graphicsCanvasLogicalWidth;
            const adjustedY = (offsetY / scaledHeight) * graphicsCanvasLogicalHeight;
            return {adjustedX, adjustedY};
        },
        graphicsCanvasMouseDown(event: PointerEvent) {
            const {adjustedX, adjustedY} = this.getLogicalMouseCoords(event);

            if (adjustedX >= -graphicsCanvasLogicalWidth / 2 && adjustedX <= graphicsCanvasLogicalWidth / 2 - 1 &&
                adjustedY >= -graphicsCanvasLogicalHeight / 2 && adjustedY <= graphicsCanvasLogicalHeight / 2 - 1) {
                mostRecentClickedItems = this.getPersistentImageManager().calculateAllOverlappingAtPos(adjustedX, adjustedY);
                mostRecentClickDetails = [adjustedX, adjustedY, event.button, event.detail];
                mostRecentMouseDetails[2][event.button] = true;
            }
            
            // If we're running, don't propagate it into a right-click menu, for example:
            if (this.isPythonExecuting) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
            }
        },
        graphicsCanvasMouseMove(event: PointerEvent) {
            const {adjustedX, adjustedY} = this.getLogicalMouseCoords(event);
            if (adjustedX >= -graphicsCanvasLogicalWidth / 2 && adjustedX <= graphicsCanvasLogicalWidth / 2 - 1 &&
                adjustedY >= -graphicsCanvasLogicalHeight / 2 && adjustedY <= graphicsCanvasLogicalHeight / 2 - 1) {
                mostRecentMouseDetails[0] = adjustedX;
                mostRecentMouseDetails[1] = adjustedY;
            }
        },
        graphicsCanvasMouseUp(event: PointerEvent) {
            mostRecentMouseDetails[2][event.button] = false;
        },
        consumeLastClickedItems() : PersistentImage[] {
            const r = mostRecentClickedItems;
            mostRecentClickedItems = [];
            return r;
        },
        consumeLastClickDetails() : number[] | null {
            const d = mostRecentClickDetails;
            mostRecentClickDetails = null;
            return d;
        },
        getMouseDetails(): [number, number, [boolean, boolean, boolean]] {
            return mostRecentMouseDetails;
        },
        graphicsCanvasKeyDown(event: KeyboardEvent) {
            pressedKeys.set(keyMapping.get(event.key) ?? event.key.toLowerCase(), true);
        },
        graphicsCanvasKeyUp(event: KeyboardEvent) {
            pressedKeys.set(keyMapping.get(event.key) ?? event.key.toLowerCase(), false);
        },
        getPressedKeys() {
            return pressedKeys;
        },

        handleContextMenuOpened() {
            document.dispatchEvent(new CustomEvent(CustomEventTypes.requestAppNotOnTop, {detail: true}));
        },

        handleContextMenuClosed(){
            this.appStore.isContextMenuKeyboardShortcutUsed=false;
            document.dispatchEvent(new CustomEvent(CustomEventTypes.requestAppNotOnTop, {detail: false}));
        },

        closeContextMenu() {
            // The context menu doesn't close because we need to stop the click event propagation (cf. template), we do it here
            ((this.$refs.menu as unknown) as VueContextConstructor).close();
        },

        showContextMenu (event: MouseEvent, positionForMenu?: Position): void {
            // Do not show any menu if the user's code is being executed
            if(this.isPythonExecuting){
                return;
            }
            
            event.stopPropagation();
            event.stopImmediatePropagation();
            event.preventDefault();            

            this.appStore.contextMenuShownId = "PEAcontextmenu";
            
            // Overwrite readonly properties clientX and clientY (to position the menu if needed)
            setContextMenuEventClientXY(event, positionForMenu);
            ((this.$refs.menu as unknown) as VueContextConstructor).open(event);

            this.$nextTick(() => {
                const contextMenu = document.getElementById("PEAcontextmenu");
                if(contextMenu){
                    // We make sure the menu can be shown completely. 
                    adjustContextMenuPosition(event, contextMenu, positionForMenu);
                }
            });
        },

        handleContextMenuHover(event: MouseEvent) {
            this.$root.$emit(CustomEventTypes.contextMenuHovered, event.target as HTMLElement);
        },

        async screenshotGraphicsArea() {
            // The screenshot Graphics area can take two paths depending on the context:
            // if we are using Strype Graphics (Media API), then we convert the offscreen canvas "directly",
            // if we are using Turtle, it's a bit less straight forward because Turtle is handled by Skulpt 
            // which makes the canvases for us.            
            // We detect the Turtle case if canvases exist in #peaGraphicsDiv
            const peaGraphicsDiv = document.getElementById(getPEAGraphicsDivId());
            const turtleCanvases =  Array.from(peaGraphicsDiv?.children??[]);
            const forTurtle = turtleCanvases.some((el)=>el.tagName.toLowerCase() == "canvas");

            if (!targetCanvas && !forTurtle) {
                return;
            }

            let canvasW = 0, canvasH = 0;
            if(forTurtle && peaGraphicsDiv){
                const peaGraphicsDivRect = peaGraphicsDiv.getClientRects();
                const peaGraphicsDivScale = peaGraphicsDiv.style.scale ? peaGraphicsDiv.style.scale : "1";
                canvasW = peaGraphicsDivRect[0].width / parseFloat(peaGraphicsDivScale);
                canvasH = peaGraphicsDivRect[0].height / parseFloat(peaGraphicsDivScale);                
            }

            let offScreenCanvasToUse = (forTurtle) ? new OffscreenCanvas(canvasW, canvasH) : targetCanvas;
            // Prepare the canvas content for Turtle if required
            if(forTurtle && peaGraphicsDiv && offScreenCanvasToUse){
                const ctx = offScreenCanvasToUse.getContext("2d") as OffscreenCanvasRenderingContext2D;
                // Turtle's background is white by default
                const turtleBackgroundColor = getComputedStyle(peaGraphicsDiv).backgroundColor;
                ctx.fillStyle =turtleBackgroundColor;            
                ctx.fillRect(0, 0, canvasW, canvasH),
                turtleCanvases.forEach((el) => {
                    ctx?.drawImage(el as HTMLCanvasElement, 0, 0);
                });                
            }

            const blob : Blob = await (offScreenCanvasToUse as any).convertToBlob({ type: "image/png" });

            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `strype-${getDateTimeFormatted(new Date(Date.now()))}.png`;

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            // Clean up
            URL.revokeObjectURL(url); 
            if(forTurtle){
                offScreenCanvasToUse = null;
            }
        },
        
        doHighlightPythonRunningState(){
            // This method is called when we want to draw attention on the "running state" of the Strype project.
            // This is achieved using CSS only, so we just use a flag to trigger a CSS change, and reset it after a decent amount of time.
            this.highlightPythonRunningState = true;
            setTimeout(() => this.highlightPythonRunningState = false, 3000);
        },
    },
});
</script>

<style lang="scss">
    .pea-component.#{$strype-classname-expanded-pea} {
        width: 100vw;
        top: #{$pea-expanded-overlay-splitter-pane2-size-value}vh;
        bottom: 0px;
        left: 0px;
        position: fixed;
        margin: 0px !important;
        z-index: 501;
    }

    .no-43-ratio-collapsed-PEA {
        height: calc(100% - $strype-python-exec-area-margin);
    }

    .pea-controls-div {
        display: flex;
        column-gap: 5px;        
        width:100%;
        background-color: $pea-outer-background-color;
        align-items: center;
    }

    .pea-controls-div button {
        z-index: 10;
        border-radius: 10px;
        border: 1px solid transparent;
        outline: none;
        background-color: transparent;
    }

    .pea-controls-div button:hover {
        border-color: lightgray !important;
    }

    .#{$strype-classname-pea-no-tabs-placeholder-span} {
        color: transparent;
        padding: 9px 0 8px 0px;
    }
    
    .expanded-PEA-controls {
        border-top: black 1px solid;
    }

    .python-running {
        color: red;
    }
    
    @keyframes pulse {
        0%   { box-shadow: 0 0 5px gold; }
        50%  { box-shadow: 0 0 20px gold; }
        100% { box-shadow: 0 0 5px gold; }
    }

    #runButton.highlighted {
        animation: pulse 1s ease infinite;
    }

    .#{$strype-classname-pea-toggle-layout-buttons-container} {
        position: absolute;
        bottom: $strype-python-exec-area-layout-buttons-pos-offset;
        right: $strype-python-exec-area-layout-buttons-pos-offset;
        display: flex;
        column-gap: 5px;
        padding: 3px 3px;
        border-radius: 5px;
        background: rgba(69, 68, 68, 0.8) !important;
    }

    .#{$strype-classname-pea-toggle-layout-buttons-container} > div {
        line-height: 0px; // Thanks copilot! needs to be 0 for making sure the divs are same heights as content
    }

    .pea-toggle-layout-button {
        color: white;
        cursor: pointer;
        width: 20px;
        height: 20px;
    }
    .pea-toggle-layout-button:hover {
        color: #ddd;
    }

    .pea-toggle-layout-button.pea-toggle-layout-button-selected {
        color: yellow;
    }
    
    .show-error-icon {
        padding: 0px 2px; 
        border: 2px solid #d66;
    }

    .pea-display-tab {
        color: black;
    }

    .pea-display-tab:hover {
        color: black;
        background-color: lightgray !important;
    }

    .pea-turtle-img {
        width: 1.3em;
    }

    .pea-layout-img-button {
        width: 16px;
        height: 16px;
        cursor: pointer;
        vertical-align: middle;

    }

    .pea-play-img {
        width: 16px;
        vertical-align: sub;
    }

    .pea-tab-content-container {
        width: 100%;
        position: relative;
    }

    .pea-tab-content-container.pea-43-ratio {
        aspect-ratio: 4/3;
    }

    textarea {
        -webkit-box-sizing: border-box; /* Safari/Chrome, other WebKit */
        -moz-box-sizing: border-box;    /* Firefox, other Gecko */
        box-sizing: border-box;         /* Opera/IE 8+ */
        resize: none !important;
    }
    
    .pea-console {
        width:100%;
        height: 100%;
        background-color: #333;
        color: white;
        font-size: 15px;
        tab-size: 8;
        font-family: monospace;
    }

    .pea-console:disabled {
        -webkit-text-fill-color: #ffffff; // Required for Safari
        color: white;
    }

    // Mac Safari: always show scrollbar (when content is large enough to require one), and make it light
    .pea-console::-webkit-scrollbar {
        width: 8px;
    }

    .pea-console::-webkit-scrollbar-track {
        background: #333;
    }

    .pea-console::-webkit-scrollbar-thumb {
        background: #888;
        border-radius: 5px;
    }

    .pea-graphics-container {
        width:100%;
        height: 100%;
        background-color: grey;
        overflow:auto;
        position: relative;
    }


    .pea-graphics-container > div {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .pea-graphics-div {
        background-color: white;
        outline: none;
    }
    
    .pea-no-graphics-import-span {
        position: absolute;
        top: 10px;
        left: 10px;
    }

    /**
     * The following CSS classes are for the Splitter component in use here
     */
    .splitpanes.strype-PEA-split-theme.with-expanded-PEA {
        background-color: $pea-outer-background-color;
    }
    
    .strype-PEA-split-theme.splitpanes--horizontal>.splitpanes__splitter,
    .strype-PEA-split-theme .splitpanes--horizontal>.splitpanes__splitter {
        height: 8px !important;
    }

    .strype-PEA-split-theme.tabs-PEA.splitpanes--horizontal>.splitpanes__splitter,
    .strype-PEA-split-theme.tabs-PEA .splitpanes--horizontal>.splitpanes__splitter {
        display: none;
    }

    .strype-PEA-split-theme.tabs-PEA.splitpanes--vertical>.splitpanes__splitter,
    .strype-PEA-split-theme.tabs-PEA .splitpanes--vertical>.splitpanes__splitter {
        display: none;
    }

    .strype-PEA-split-theme.splitpanes--vertical > .splitpanes__splitter:before,
    .strype-PEA-split-theme > .splitpanes--vertical > .splitpanes__splitter:before {
        content: "";
        position: absolute;
        height: 100% !important;
        width: 8px !important;
        transform: none !important;
    }   
    
    #pythonGraphicsContainer {
        position: relative;
    }

    #pythonGraphicsContainer > * {
        top: 0;
        left: 0;
        position: absolute;
        width: 100%;
        height: 100%;
    }
    #pythonGraphicsCanvas {
        top: 0;
        left: 0;
        position: absolute;
        width: 100%;
        height: 100%;
    }
</style>
