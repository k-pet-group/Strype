
<template>
    <div :id="peaComponentId" :class="{'pea-component': true, [scssVars.expandedPEAClassName]: isExpandedPEA, 'no-43-ratio-collapsed-PEA': !hasDefault43Ratio && !isExpandedPEA}" ref="peaComponent" @mousedown="handlePEAMouseDown">
        <div :id="controlsDivId" :class="{'pea-controls-div': true, 'expanded-PEA-controls': isExpandedPEA}">           
            <b-tabs v-show="isTabsLayout" v-model="peaDisplayTabIndex" no-key-nav>
                <b-tab v-show="isTabsLayout" :button-id="graphicsTabId" :title="'\uD83D\uDC22 '+$t('PEA.TurtleGraphics')" title-link-class="pea-display-tab"></b-tab>
                <b-tab v-show="isTabsLayout" :title="'\u2771\u23BD '+$t('PEA.console')" title-link-class="pea-display-tab" active></b-tab>
            </b-tabs>
            <!-- IMPORTANT: keep this div with "invisible" text for proper layout rendering, it replaces the tabs -->
            <span v-if="!isTabsLayout" :class="scssVars.peaNoTabsPlaceholderSpanClassName">c+g</span>
            <div class="flex-padding"/>            
            <button ref="runButton" @click="runClicked" :title="$t((isPythonExecuting) ? 'PEA.stop' : 'PEA.run') + ' (Ctrl+Enter)'">
                <img v-if="!isPythonExecuting" src="favicon.png" class="pea-play-img">
                <span v-else class="python-running">{{runCodeButtonIconText}}</span>
                <span>{{runCodeButtonLabel}}</span>
            </button>
        </div>
        <div :id="tabContentContainerDivId" :class="{'pea-tab-content-container': true, 'flex-padding': true, 'pea-43-ratio': hasDefault43Ratio}">
            <!-- the SplitPanes is used in all layout configurations: for tabs, we only show 1 of the panes and disable moving the divider, and for stacked window it acts as normal -->
            <Splitpanes :class="{'strype-PEA-split-theme': true, 'with-expanded-PEA': isExpandedPEA, 'tabs-PEA': isTabsLayout}" :horizontal="!isExpandedPEA" @resize="onSplitterPane1Resize">
                <pane :id="graphicsSplitPaneId" key="1" v-show="isGraphicsAreaShowing" :size="(isTabsLayout) ? 100 : currentSplitterPane1Size" min-size="5">
                    <div :id="graphicsContainerDivId" @wheel.stop :class="{'pea-graphics-container': true, hidden: graphicsTemporaryHidden}">
                        <div><!-- this div is a flex wrapper just to get scrolling right, see https://stackoverflow.com/questions/49942002/flex-in-scrollable-div-wrong-height-->
                            <div :id="graphicsDivId" ref="pythonTurtleDiv" class="pea-graphics-div"></div>
                        </div>
                        <span v-if="isGraphicsAreaShowing && !turtleGraphicsImported" class="pea-no-graphics-import-span">{{$t('PEA.importTurtle')}}</span> 
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
                    @click="togglePEALayout(layoutData.mode)" :title="$t('PEA.'+layoutData.iconName)">
                    <SVGIcon :name="layoutData.iconName" customClass="pea-toggle-layout-button" />
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import Vue from "vue";
import { useStore } from "@/store/store";
import Parser from "@/parser/parser";
import { execPythonCode } from "@/helpers/execPythonCode";
import { mapStores } from "pinia";
import { checkEditorCodeErrors, countEditorCodeErrors, CustomEventTypes, debounceComputeAddFrameCommandContainerSize, getEditorCodeErrorsHTMLElements, getFrameUID, getMenuLeftPaneUID, getPEAComponentRefId, getPEAConsoleId, getPEAControlsDivId, getPEAGraphicsContainerDivId, getPEAGraphicsDivId,  getPEATabContentContainerDivId, hasPrecompiledCodeError, setPythonExecAreaLayoutButtonPos, setPythonExecutionAreaTabsContentMaxHeight } from "@/helpers/editor";
import i18n from "@/i18n";
import { PythonExecRunningState, StrypePEALayoutData, StrypePEALayoutMode } from "@/types/types";
import Menu from "@/components/Menu.vue";
import SVGIcon from "@/components/SVGIcon.vue";
import {Splitpanes, Pane} from "splitpanes";
import { debounce } from "lodash";
import scssVars from "@/assets/style/_export.module.scss";

// Helper to keep indexed tabs (for maintenance if we add some tabs etc)
const enum PEATabIndexes {graphics, console}

export default Vue.extend({
    name: "PythonExecutionArea",

    components: {
        Splitpanes,
        Pane,
        SVGIcon,
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
            stopTurtleUIEventListeners: undefined as ((keepShowingTurtleUI: boolean)=>void) | undefined, // registered callback method to clear the Turtle listeners mentioned above
            PEALayoutsData: [
                {iconName: "PEA-layout-tabs-collapsed", mode: StrypePEALayoutMode.tabsCollapsed},
                {iconName: "PEA-layout-tabs-expanded", mode: StrypePEALayoutMode.tabsExpanded},
                {iconName: "PEA-layout-split-collapsed", mode: StrypePEALayoutMode.splitCollapsed},
                {iconName: "PEA-layout-split-expanded", mode: StrypePEALayoutMode.splitExpanded},
            ] as StrypePEALayoutData[],
        };
    },

    mounted(){
        // Just to prevent any inconsistency with a uncompatible state, set a state value here and we'll know we won't get in some error
        useStore().pythonExecRunningState = PythonExecRunningState.NotRunning;
        
        // Register an event listen on the tab content container on hover (in/out) to handle some styling
        (document.getElementById(getPEATabContentContainerDivId()))?.addEventListener("mouseenter", () => this.isTabContentHovered = true);
        (document.getElementById(getPEATabContentContainerDivId()))?.addEventListener("mouseleave", () => this.isTabContentHovered = false);

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
                // We don't need to change the canvas size for EVERY canvases added by Skulpt, we only do it on the first one added.
                if(document.querySelectorAll("#" + getPEAGraphicsDivId() + " canvas").length == 1){
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
            const debouncePEASizeChangedCallback = debounce(() => {
                // If Strype is shown in its default view (PEA has 4:3 ratio, we need to update the splitter so the PEA stay visible)
                let waitSplitterToAdaptTimeout = 0;
                if(this.hasDefault43Ratio) {
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
                        debounceComputeAddFrameCommandContainerSize(this.isExpandedPEA);
                        setPythonExecAreaLayoutButtonPos();
                    }, 100);
                }, waitSplitterToAdaptTimeout);
            }, 100);
            
            tabContentContainerDiv.addEventListener(CustomEventTypes.pythonExecAreaSizeChanged, debouncePEASizeChangedCallback);

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
                graphicTaBElement.innerHTML = graphicTaBElement.innerHTML.replace("\uD83D\uDC22", `<img src="${require("@/assets/images/turtle.png")}" alt="${this.$i18n.t("PEA.TurtleGraphics")}" class="pea-turtle-img" />`);
            }
        });
       
        // Once everything is ready, we can notify the application (via events) that the PEA is ready
        // Note that because of all the timeouts used throught the rendering we give ourselves some lease time.
        setTimeout(() => {
            this.$emit(CustomEventTypes.pythonExecAreaMounted);
        }, 500);
    },

    computed:{
        ...mapStores(useStore),

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
            return this.appStore.peaSplitViewSplitterPane1Size ?? parseFloat(scssVars.peaSplitViewSplitterPane1SizePercentValue);
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
                this.appStore.peaSplitViewSplitterPane1Size = event[0].size;
            }

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
                // Trigger the actual Python code execution launch
                execPythonCode(pythonConsole, this.$refs.pythonTurtleDiv as HTMLDivElement, userCode, parser.getFramePositionMap(),() => useStore().pythonExecRunningState != PythonExecRunningState.RunningAwaitingStop, (finishedWithError: boolean, isTurtleListeningKeyEvents: boolean, isTurtleListeningMouseEvents: boolean, isTurtleListeningTimerEvents: boolean, stopTurtleListeners: VoidFunction | undefined) => {
                    // After Skulpt has executed the user code, we need to check if a keyboard listener is still pending from that user code.
                    this.isTurtleListeningKeyEvents = !!isTurtleListeningKeyEvents; 
                    this.isTurtleListeningMouseEvents = !!isTurtleListeningMouseEvents; 
                    this.isTurtleListeningTimerEvents = !!isTurtleListeningTimerEvents;
                    this.stopTurtleUIEventListeners = stopTurtleListeners;
                    if (finishedWithError) {
                        this.updateTurtleListeningEvents();
                    }
                    if(!this.isTurtleListeningEvents) {
                        useStore().pythonExecRunningState = PythonExecRunningState.NotRunning;
                    }
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

        togglePEALayout(layoutMode: StrypePEALayoutMode){
            // Save the layout mode with the project
            this.appStore.peaLayoutMode  = layoutMode;
              
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
            // The Turtle div keeps a 5px margin around the Turtle canvases, so we need to take it into account when computing the scaling.
            const preCheckTurtleCanvasWScaleRatio =  ((tabContentW - 10.0) / canvasW);
            const preCheckTurtleCanvasHSCaleRatio = ((tabContentH - 10.0) / canvasH);
            const turtleCanvasScaleRatio = Math.min(preCheckTurtleCanvasWScaleRatio, preCheckTurtleCanvasHSCaleRatio);
            (turtlePlaceholderDiv as HTMLDivElement).style.scale = ""+turtleCanvasScaleRatio;
   
            // We can now set the dimension of the flex div (containing the Turtle div) to fit to the scaled content new dimensions: 
            // the rule is: check what is each dimension of the scaled canvas and use the max between that scaled dimension and the tab content dimension
            // (to make sure we don't fit to a smaller size than the tab content itself!)
            (turtlePlaceholderDiv.parentElement as HTMLDivElement).style.width = Math.max((canvasW * turtleCanvasScaleRatio + 10), tabContentW) +"px";
            (turtlePlaceholderDiv.parentElement as HTMLDivElement).style.height = Math.max((canvasH * turtleCanvasScaleRatio + 10), tabContentH) +"px";

            // Restore the Graphics container visibility
            this.graphicsTemporaryHidden = false;
        },

        reachFirstError(): void {
            this.$nextTick(() => {
                // We should get only the run time error here, or at least 1 precompiled error
                // but for sanity check, we make sure it's still there
                const errors = getEditorCodeErrorsHTMLElements();
                if(errors && errors.length > 0){
                    // The Strype Menu handles already navigation of errors, so we use it to navigate to the first error...
                    (this.$root.$children[0].$refs[getMenuLeftPaneUID()] as InstanceType<typeof Menu>).currentErrorNavIndex = -1; 
                    (this.$root.$children[0].$refs[getMenuLeftPaneUID()] as InstanceType<typeof Menu>).goToError(null, true);
                }
            });
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
        margin:5px;
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
</style>
