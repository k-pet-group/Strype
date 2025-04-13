
<template>
    <div id="peaComponent" :class="{'expanded-PEA': isExpandedPEA}" ref="peaComponent">
        <div id="peaControlsDiv">           
            <b-tabs v-model="peaDisplayTabIndex" no-key-nav>
                <b-tab :title="'\u2771\u23BD '+$t('PEA.console')" title-link-class="pea-display-tab" active></b-tab>
                <b-tab :title="'\uD83D\uDC22 '+$t('PEA.TurtleGraphics')" title-link-class="pea-display-tab"></b-tab>
            </b-tabs>
            <div class="flex-padding"/>
            <button ref="runButton" @click="runClicked" :title="$t((isPythonExecuting) ? 'PEA.stop' : 'PEA.run') + ' (Ctrl+Enter)'">
                <img v-if="!isPythonExecuting" src="favicon.png" class="pea-play-img">
                <span v-else class="python-running">{{runCodeButtonIconText}}</span>
                <span>{{runCodeButtonLabel}}</span>
            </button>
        </div>
        <div id="tabContentContainerDiv">
            <textarea 
                id="pythonConsole"
                ref="pythonConsole"
                v-show="peaDisplayTabIndex==0"
                @focus="onFocus()"
                @change="onChange"
                @wheel.stop
                @keydown.self.stop="handleKeyEvent"
                @keyup.self="handleKeyEvent"
                disabled
                spellcheck="false"
            >    
            </textarea>
            <div v-show="peaDisplayTabIndex==1" id="pythonTurtleContainerDiv" @wheel.stop>
                <div><!-- this div is a flex wrapper just to get scrolling right, see https://stackoverflow.com/questions/49942002/flex-in-scrollable-div-wrong-height-->
                    <div id="pythonTurtleDiv" ref="pythonTurtleDiv"></div>
                </div>
            </div>
            <div @click="toggleExpandCollapse" :class="{'pea-toggle-size-button': true,'dark-mode': (peaDisplayTabIndex==0),'hidden': !isTabContentHovered}">
                <span :class="{'fas': true, 'fa-expand': !isExpandedPEA, 'fa-compress': isExpandedPEA}" :title="$t((isExpandedPEA)?'PEA.collapse':'PEA.expand')"></span>
            </div>
            <span id="noTurtleSpan" v-if="peaDisplayTabIndex==1 && !turtleGraphicsImported">{{$t('PEA.importTurtle')}}</span> 
        </div>
    </div>
</template>

<script lang="ts">
import Menu from "@/components/Menu.vue";
import { checkEditorCodeErrors, computeAddFrameCommandContainerHeight, countEditorCodeErrors, CustomEventTypes, getEditorCodeErrorsHTMLElements, getFrameUID, getMenuLeftPaneUID, hasPrecompiledCodeError, resetAddFrameCommandContainerHeight, setPythonExecAreaExpandButtonPos, setPythonExecutionAreaTabsContentMaxHeight } from "@/helpers/editor";
import { execPythonCode } from "@/helpers/execPythonCode";
import i18n from "@/i18n";
import Parser from "@/parser/parser";
import { useStore } from "@/store/store";
import { PythonExecRunningState } from "@/types/types";
import { mapStores } from "pinia";
import Vue from "vue";

export default Vue.extend({
    name: "PythonExecutionArea",

    data: function() {
        return {
            isExpandedPEA: false,
            turtleGraphicsImported: false, // by default, Turtle isn't imported - this flag is updated when we detect the import (see event registration in mounted())
            peaDisplayTabIndex: 0, // the index of the PEA tab (console/turtle), we use it equally as a flag to indicate if we are on Turtle
            interruptedTurtle: false,
            isTabContentHovered: false,
            isTurtleListeningKeyEvents: false, // flag to indicate whether an execution of Turtle resulted in listen for key events on Turtle
            isTurtleListeningMouseEvents: false, // flag to indicate whether an execution of Turtle resulted in listen for mouse events on Turtle
            isTurtleListeningTimerEvents: false, // flag to indicate whether an execution of Turtle resulted in listen for timer events on Turtle
            stopTurtleUIEventListeners: undefined as ((keepShowingTurtleUI: boolean)=>void) | undefined, // registered callback method to clear the Turtle listeners mentioned above
        };
    },

    mounted(){
        // Just to prevent any inconsistency with a uncompatible state, set a state value here and we'll know we won't get in some error
        useStore().pythonExecRunningState = PythonExecRunningState.NotRunning;
        
        // Register an event listen on the tab content container on hover (in/out) to handle some styling
        (document.getElementById("tabContentContainerDiv"))?.addEventListener("mouseenter", () => this.isTabContentHovered = true);
        (document.getElementById("tabContentContainerDiv"))?.addEventListener("mouseleave", () => this.isTabContentHovered = false);

        // Have to use nextTick because Bootstrap won't have created the actual HTML parts until then:
        this.$nextTick(() => document.querySelectorAll("#peaControlsDiv .nav-item a").forEach((el) => {
            // When a tab header is clicked, lose focus, because we want focus back to the editor:
            el.addEventListener("click", (e) => {
                (el as HTMLElement).blur();
            });
        }));

        const pythonConsole = document.getElementById("pythonConsole");
        const turtlePlaceholderDiv = document.getElementById("pythonTurtleDiv");
        const tabContentContainerDiv = document.getElementById("tabContentContainerDiv");
        if(pythonConsole != undefined && turtlePlaceholderDiv != undefined && tabContentContainerDiv != undefined){
            // Register an event listener on the textarea for the request focus event
            pythonConsole.addEventListener(CustomEventTypes.pythonConsoleRequestFocus, this.handleConsoleFocusRequest);

            // Register an event listener on the textarea for handling post-input
            pythonConsole.addEventListener(CustomEventTypes.pythonConsoleAfterInput, this.handlePostInputConsole);

            // Register an event listener on this component for the notification of the turtle library import usage
            (this.$refs.peaComponent as HTMLDivElement).addEventListener(CustomEventTypes.notifyTurtleUsage, (event) => {
                this.turtleGraphicsImported = (event as CustomEvent).detail;
                const pythonTurtleDiv = document.getElementById("pythonTurtleDiv");
                if(!this.turtleGraphicsImported && pythonTurtleDiv != undefined) {
                    // If we don't import turtle anymore, we "clear" any potential graphics to have the "import Turtle" message clearly showing.
                    document.querySelectorAll("#pythonTurtleDiv canvas").forEach((canvasEl) => pythonTurtleDiv.removeChild(canvasEl));                    
                }
            });    

            // Register a mutation observer on the Turtle div placeholder to know when canvases are added/removed,
            // so we can, in turn, set a resize observer on these canvases to compute how to scale them.
            // (Note: that is very important because every time the user code is run, Skulpt regenerates the canvases)
            const turtleDivPlaceholderObserver = new MutationObserver(() => {
                // We don't need to change the canvas size for EVERY canvases added by Skulpt, we only do it on the first one added.
                if(document.querySelectorAll("#pythonTurtleDiv canvas").length == 1){
                    this.scaleTurtleCanvas(tabContentContainerDiv, turtlePlaceholderDiv);
                    // When a canvas has been added we can select the TUrtle tab
                    this.peaDisplayTabIndex = 1;
                }
            });
            turtleDivPlaceholderObserver.observe(turtlePlaceholderDiv, {childList: true});   
            
            // Register an observer when the tab content dimension changes: we need to reflect this on the canvas scaling (cf. above)
            // DO NOT use ResizeObserver to do so: it gets messy with the events loop ("ResizeObserver loop completed with undelivered notifications.")
            tabContentContainerDiv.addEventListener(CustomEventTypes.pythonExecAreaSizeChanged, () => {
                resetAddFrameCommandContainerHeight();

                // We should only scale the canvas if there is at least a canvas to scale! (i.e. we show turtle graphics...)
                if (document.querySelectorAll("#pythonTurtleDiv canvas").length > 0) {
                    setTimeout(() => {
                        if(document.querySelectorAll("#pythonTurtleDiv canvas").length > 0){
                            this.scaleTurtleCanvas(tabContentContainerDiv, turtlePlaceholderDiv);
                        }
                    }, 100);                    
                }

                setTimeout(() => computeAddFrameCommandContainerHeight(), 100);
            });

            // First time the PEA is mounted, we need to resize the "Add Frame" commands area if needed
            setTimeout(() => computeAddFrameCommandContainerHeight(), 500);

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
    },

    computed:{
        ...mapStores(useStore),
        // ...mapStores(persistentStore),

        isPythonExecuting(): boolean {
            return useStore().pythonExecRunningState != PythonExecRunningState.NotRunning;
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
            setPythonExecAreaExpandButtonPos();
        },
    },

    methods: {
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
            setPythonExecAreaExpandButtonPos();
            
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
                        this.appStore.trackingData.errorEncountered = true;
                    }
                    else{
                        // Award badges based on the code and progress
                        this.appStore.checkForBadges(userCode);
                    }
                    
                    if(!this.isTurtleListeningEvents) {
                        useStore().pythonExecRunningState = PythonExecRunningState.NotRunning;
                    }

                    setPythonExecAreaExpandButtonPos();
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
                    this.peaDisplayTabIndex = 0;
                }
            });
        },

        onFocus(): void {
            this.appStore.isEditing = false;
            this.peaDisplayTabIndex = 0;
        },

        handleConsoleFocusRequest(): void {
            // This method is responsible for handling when a focus on the console (textarea) is requrested programmatically
            // (typically when the Python input() function is encountered)
            
            //First we switch between Turtle and the console shall the Turtle be showing at the moment
            if(this.peaDisplayTabIndex == 1){
                this.interruptedTurtle = true;
                this.peaDisplayTabIndex = 0;
            }

            //In any case, then we focus the console (keep setTimeout rather than nextTick to have enough time to be effective)
            setTimeout(() => document.getElementById("pythonConsole")?.focus(), 200);
        },

        handlePostInputConsole(): void {
            // This method is responsible for handling what to do after the console input (Python) has been invoked.
            // If there was a Turtle being shown, we get back to it. If not, we just stay on the console.
            if(this.turtleGraphicsImported && this.interruptedTurtle){
                this.interruptedTurtle = false;
                this.peaDisplayTabIndex = 1;
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
            setPythonExecAreaExpandButtonPos();
        },

        toggleExpandCollapse(){
            this.isExpandedPEA = !this.isExpandedPEA;
            // We handle the styling for the Python Execution Area (PEA)'s tab content sizing here.
            if(!this.isExpandedPEA){
                // When the PEA is minimized, we remove any max height styling that had been added when enlarging the PEA: defined CSS will be used.
                const tabContentDiv = (document.getElementById("tabContentContainerDiv") as HTMLDivElement);
                tabContentDiv.style.maxHeight = "";
                tabContentDiv.style.height = "";
                // We can now reset the dimension of the flex div (containing the Turtle div) to set it to default size
                const turtlePlaceholderContainer = document.getElementById("pythonTurtleContainerDiv") as HTMLDivElement;
                (turtlePlaceholderContainer.children[0] as HTMLDivElement).style.width = "";
                (turtlePlaceholderContainer.children[0] as HTMLDivElement).style.height = "";
            }
            else{
                // When the PEA is maximized, we set the max height via styling: this rules over CSS.
                setPythonExecutionAreaTabsContentMaxHeight();
            }
            document.getElementById("tabContentContainerDiv")?.dispatchEvent(new CustomEvent(CustomEventTypes.pythonExecAreaSizeChanged));

            setPythonExecAreaExpandButtonPos();
            
            // Other parts of the UI need to be updated when the PEA default size is changed, so we emit an event
            // (in case we rely on the current changes, we do it a bit later)
            this.$nextTick(() => document.dispatchEvent(new CustomEvent(CustomEventTypes.pythonExecAreaExpandCollapseChanged, {detail: this.isExpandedPEA})));
        },

        scaleTurtleCanvas(tabContentContainerDiv: HTMLElement, turtlePlaceholderDiv: HTMLElement){
            // Resize and scale the Python Exec Area (PEA) Turtle container accordingly to the Turtle canvas:
            // - scale the placeholder to fit the viewport (the tab content) and preserve the canvas ratio, no scroll bar should appear
            // - set the placeholder container (the flex div) to the correct dimension to make sure the positioning (centered) is preserved
            //    -- SCALING WITH CSS DOES NOT MAKES THE DOM "SEEING" NEW DIMENSIONS
            const turtleCanvas = document.querySelector("#pythonTurtleDiv canvas") as HTMLCanvasElement;
            const canvasW = turtleCanvas.width;
            const canvasH = turtleCanvas.height;
            const tabContentElementBoundingClientRect = tabContentContainerDiv.getBoundingClientRect();
            let {width: tabContentW, height: tabContentH} = tabContentElementBoundingClientRect;

            // If we are minimising the PEA, we make sure we don't expand the tab container more than the default 4:3 ratio.
            // (larger canvas will expand the PEA, but we want to keep it at a consistent size all the time.)
            if(!this.isExpandedPEA){
                tabContentH = tabContentW * 0.75;
                tabContentContainerDiv.style.height = tabContentH+"px";
            }

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
            (document.getElementById("pythonConsole") as HTMLTextAreaElement).value = "";
            const pythonTurtleDiv = document.getElementById("pythonTurtleDiv");
            if(pythonTurtleDiv != undefined) {
                document.querySelectorAll("#pythonTurtleDiv canvas").forEach((canvasEl) => pythonTurtleDiv.removeChild(canvasEl));                    
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
    .expanded-PEA {
        width: 100vw;
        top:50vh;
        bottom:0px;
        left:0px;
        position:fixed;
        margin: 0px !important;
    }

    #peaControlsDiv {
        display: flex;
        column-gap: 5px;        
        width:100%;
        background-color: rgb(240,240,240);
    }

    #peaControlsDiv button {
        z-index: 10;
        border-radius: 10px;
        border: 1px solid transparent;
        outline: none;
    }

    #peaControlsDiv button:hover {
        border-color: lightgray !important;
    }

    .python-running {
        color: red;
    }

    .pea-toggle-size-button {
        position: absolute;
        bottom: $strype-python-exec-area-expand-button-pos-offset;
        right: $strype-python-exec-area-expand-button-pos-offset;
        color: black;
        cursor: pointer;
        padding: 8px;
    }

    .pea-toggle-size-button.dark-mode {        
        color: white !important;
    }

    .pea-toggle-size-button:hover {        
        background: rgb(151, 151, 151) !important;
        border-radius: 50px;
    }

    .pea-toggle-size-button.dark-mode:hover {        
        background: rgb(69, 68, 68) !important;
    }

    .pea-toggle-size-button span{        
        display: block; // to ensure the containing div wraps the span tight
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

    .pea-play-img {
        width: 16px;
        vertical-align: sub;
    }

    #tabContentContainerDiv {
        flex-grow: 2;
        width: 100%;
        max-height: 60vh;
        position: relative;
        aspect-ratio: 4/3;
    }

    textarea {
        -webkit-box-sizing: border-box; /* Safari/Chrome, other WebKit */
        -moz-box-sizing: border-box;    /* Firefox, other Gecko */
        box-sizing: border-box;         /* Opera/IE 8+ */
        resize: none !important;
    }
    
    #pythonConsole {
        width:100%;
        height: 100%;
        background-color: #333;
        color: white;
        font-size: 15px;
        tab-size: 8;
        font-family: monospace;
    }

    #pythonConsole:disabled {
        -webkit-text-fill-color: #ffffff; // Required for Safari
        color: white;
    }

    // Mac Safari: always show scrollbar (when content is large enough to require one), and make it light
    #pythonConsole::-webkit-scrollbar {
        width: 8px;
    }    
    #pythonConsole::-webkit-scrollbar-track {
        background: #333;
    }
    #pythonConsole::-webkit-scrollbar-thumb {
        background: #888;
        border-radius: 5px;
    }

    #pythonTurtleContainerDiv {
        width:100%;
        height: 100%;
        background-color: grey;
        overflow:auto;
    }

    #pythonTurtleContainerDiv > div {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    #pythonTurtleDiv {
        background-color: white;
        margin:5px;
        outline: none;
    }
    
    #noTurtleSpan {
        position: absolute;
        top: 10px;
        left: 10px;
    }    
</style>
