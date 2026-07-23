// refs: http://skulpt.org/using.html#html and for the input/event part https://stackoverflow.com/questions/43733896/wait-for-an-event-to-occur-within-a-function-in-javascript-for-skulpt

import { LineAndSlotPositions, PythonExecRunningState } from "@/types/types";
import { useStore } from "@/store/store";
import i18n from "@/i18n";
import { nextTick } from "vue";
import { CustomEventTypes, setPythonExecAreaLayoutButtonPos } from "./editor";

const STRYPE_RUN_ACTION_MSG = "StrypeRunActionCalled";
const STRYPE_INPUT_INTERRUPT_ERR_MSG = "ExternalError: " + STRYPE_RUN_ACTION_MSG;

// Declation of JS objects required for using Skulpt:
// the output HTML object, a text area in our case. Declared globally in the script for ease of usage
// a Sk object that is FROM THE SKULPT LIBRARY, it is the main entry point of Skulpt
let consoleTextArea: HTMLTextAreaElement = {} as HTMLTextAreaElement;
// Used by sInput() below to detect that the user has stopped execution while an input() call is
// still pending, so it can reject the pending promise and remove its console event listeners
// instead of leaving them dangling for the next run (see https://github.com/k-pet-group/Strype/issues/927).
const codeExecStateRunningCheckFn: () => boolean = () => useStore().pythonExecRunningState != PythonExecRunningState.NotRunning;

// The function used for "output" from Skulpt, to be registered against the Skulpt object
function outf(text: string) {
    consoleTextArea.value = consoleTextArea.value + text;
    useStore().trackOutputChars(text.length);
    // Scroll to bottom:
    nextTick(() => {
        consoleTextArea.scrollTop = consoleTextArea.scrollHeight;
    });
}

// Ask the user for input, e.g. because the Python input() function was called.  Note that the prompt is printed
// out separately using the output hook.
export function sInput() : Promise<string> {
    // When we encounter an input call, we make sure the console has focus (i.e. turtle is not shown, for example)
    useStore().trackInputCall();
    return new Promise(function(resolve,reject){
        // make the text area enabled to allow the user to type something (if it was disabled)
        const isConsoleTextAreaLocked = consoleTextArea.disabled;
        if(isConsoleTextAreaLocked){
            consoleTextArea.disabled = false;
            // Send an event to request focus (we will handle it on the Vue side)
            consoleTextArea.dispatchEvent(new Event(CustomEventTypes.pythonConsoleRequestFocus));            
        }

        let initialConsoleTextAreaCaretPos = consoleTextArea.selectionStart;
        let compositionStartSelectStart = -1, compositionStartSelectEnd = -1; // this is used for dealing with composition, cf. below

        function consoleCompositionListener(event: CompositionEvent){
            // Listened to handle the problem with IMEs: when used, they trigger text writing even if the key events prevent default behaviour.
            // So the approach to deal with it is to keep them anywhere, but if they appear in some parts of the console that shouldn't be edited
            // then we just update the flag of the input point of entry (initialConsoleTextAreaCaretPos)
            if(event.type.toLocaleLowerCase() === "compositionstart"){
                // Keep indicators of the selection when the composition occurs, in case there is a full portion of text replaced
                compositionStartSelectStart = consoleTextArea.selectionStart;
                compositionStartSelectEnd = consoleTextArea.selectionEnd;
            }
            else {
                // Compute the new position of the input point of entry when the composition is done, if it was performed within the non editable part
                // of the textarea (it might then overshoot the initial position if users selected, but at this stage we can't do much...)
                if(compositionStartSelectEnd < initialConsoleTextAreaCaretPos){
                    const addedTextFromIME = event.data;
                    initialConsoleTextAreaCaretPos = initialConsoleTextAreaCaretPos - ( compositionStartSelectEnd - compositionStartSelectStart) + addedTextFromIME.length;
                }               
            }
        }

        function consoleKeyListener(event: KeyboardEvent){
            const eventKeyLowerCase = event.key.toLowerCase();
            // monitor a key hit on "enter" to validate input
            if (eventKeyLowerCase == "enter") {
                // remove keyup handler from #console
                consoleTextArea.removeEventListener("keydown", consoleKeyListener);
                consoleTextArea.removeEventListener("compositionstart", consoleCompositionListener);
                consoleTextArea.removeEventListener("compositionend", consoleCompositionListener);
                // resolve the promise with the value of the input field
                const inputText = consoleTextArea.value.substring(initialConsoleTextAreaCaretPos);
                // add a line return to the console after we have retrieved the input text from user
                outf("\n");
                // restore the textare disable status if required
                if(isConsoleTextAreaLocked){
                    consoleTextArea.disabled = true;
                    // We may need to do more action after input is done
                    consoleTextArea.dispatchEvent(new Event(CustomEventTypes.pythonConsoleAfterInput));
                }
                // cancel the event (we are doing a line return ourselves anyway)
                event.stopImmediatePropagation();
                event.preventDefault();
                // now we can return the promise with the input text
                resolve(inputText);   
                // Clear the timer used to check interruptions
                clearTimeout(checkInterruptionHandle);             
                return;
            }
            
            // monitor where the keyboard input is on the output textarea: we cannot edit anything that is not after the prompt
            // so before the prompt we only allow the direction arrow keys and some key combinations
            if(consoleTextArea.selectionStart < initialConsoleTextAreaCaretPos
                && !(eventKeyLowerCase.startsWith("arrow") 
                    || ((event.ctrlKey || event.metaKey) && (["c","z","y"].includes(eventKeyLowerCase))))) {
                // we can't have a caret move further back, we break the event loop
                event.stopImmediatePropagation();
                event.preventDefault();
            }
            else if (eventKeyLowerCase=="backspace" && consoleTextArea.selectionStart == initialConsoleTextAreaCaretPos){
                // forbid delete text with backspace from the input start position
                event.stopImmediatePropagation();
                event.preventDefault();
            }
        }

        consoleTextArea.addEventListener("keydown", consoleKeyListener);
        consoleTextArea.addEventListener("compositionstart", consoleCompositionListener);
        consoleTextArea.addEventListener("compositionend", consoleCompositionListener);

        // When we are waiting for user input, it is possible the user has request the execution of their code to be stopped,
        // therefore, we shouldn't hang on this method and exit as soon as possible. To do so, we need to regularly check if
        // stopping the code execution has been requested: if so, we reject the input and make sure we leave in a clean UI state.
        const checkInterruptionHandle = setInterval(() => {
            if (!codeExecStateRunningCheckFn()) {
                clearTimeout(checkInterruptionHandle);
                if(isConsoleTextAreaLocked){
                    consoleTextArea.disabled = true;
                }
                // remove keyup handler from #console
                consoleTextArea.removeEventListener("keydown", consoleKeyListener);
                consoleTextArea.removeEventListener("compositionstart", consoleCompositionListener);
                consoleTextArea.removeEventListener("compositionend", consoleCompositionListener);
                reject(STRYPE_RUN_ACTION_MSG);
                return;
            }
        }, 1000);

        // We check if the expand/collapse button needs to be repositioned.
        setPythonExecAreaLayoutButtonPos();
    });
}

export function setSInputConsole(aConsoleTextArea: HTMLTextAreaElement) : void {
    consoleTextArea = aConsoleTextArea;
}

// Entry point function for running Python code with Skulpt - the UI is responsible for calling it,
export function handleErrorTrace(errorType : string, traceback: { filename: string, lineno: number }[] | undefined, handleExecutionFinished: (finishedWithError: boolean) => void, lineFrameMapping: LineAndSlotPositions) : void {
    // We can use the mechanism in place in the Parser for the TigerPython errors mapping to find 
    // what line of code maps with what frame in case of an execution error.
    // We need to extract the line from the error message sent by Skulpt.
    if (errorType.startsWith("SystemExit")) {
        // SystemExit is an error, but not one we print out because it is a deliberate
        // exit from the program (e.g. from strype.graphics.stop()).  So we just silently stop for that one:
        handleExecutionFinished(false);
        return;
    }
    if (!traceback || traceback.length == 0) {
        // Sometimes, e.g. for SyntaxError, the filename and line number is in the message:
        const r = / *\(my_program\.py, line (\d+)\)/;
        const m = errorType.match( r);
        if (m) {
            // If it is, turn it into a traceback and remove it from the message:
            traceback = [{filename: "my_program.py", lineno: Number(m[1])}];
            errorType = errorType.replace(r, "");
        }
    }    
    
    let moreInfo = "";
    let errorLine = -1;
    if (traceback) {
        let lastmodule = "";
        console.log("Traceback", Array.from(traceback.entries()).map((e) => e[1].filename + "@" + e[1].lineno));
        // Note that Pyodide has a traceback with the innermost call last (Skulpt had the opposite),
        // so we must reverse it for the loop:
        for (const [index, entry] of traceback.reverse().entries()) {
            const filename = entry.filename as string;
            if (filename == "<stdin>.py" || filename == "/home/pyodide/my_program.py"  || filename == "my_program.py") {
                errorLine = entry.lineno;
                break;
            }
            else if (filename.endsWith(".py")) {
                // Turn the filename into a module name:
                const modulename = filename.replace(".py", "").replace("./", "").replace("/", ".");
                if (index == 0) {
                    moreInfo += "\n  Error raised in module " + modulename + " (line " + entry.lineno + ")";
                }
                else if (modulename != lastmodule) {
                    // Only tell them the module if it's different to adjacent item in the traceback:
                    moreInfo += "\n  From a call from module " + modulename;
                }
                lastmodule = modulename;
            }
        }
        if (errorLine == -1) {
            // This should never happen; their code should always be at the root,
            // but we should probably point this out:
            moreInfo = "\nWe did not find a call from your code; this may be a bug with Strype itself.  Report this to team@strype.org with details of your code." + moreInfo;
        }
        else {
            moreInfo += "\n  From the highlighted call in your code";
        }
    }
    else {
        const errLineMatchArray = errorType.match(/( on line )(\d+)/);
        if (errLineMatchArray !== null) {
            errorLine = parseInt(errLineMatchArray[2]);
        }
    }


    let frameId = -1;
    if (errorLine > 0) {
        // Skulpt starts indexing at 1, we use 0 for TigerPython, so we need to offset the line number
        const locatableError = lineFrameMapping[errorLine - 1] !== undefined;

        // We assume that if we cannot find a frame assiocated with an error, it must be a Python line that shows as extra 
        // when the user code generates non well formated code --> e.g. adding an empty method call frame within an if frame
        // that doesn't contain any other children and is at the bottom of the code. The code generated in Python will be as an EOF error.
        // We then show the error on the last frame available in the list (that is, before the EOF, 2 lines ahead)
        frameId = (locatableError) ? lineFrameMapping[errorLine - 1].frameId : lineFrameMapping[errorLine - 3].frameId;

        const noLineSkulptErrStr = (locatableError) ? errorType.replaceAll(/ on line \d+/g, "") : i18n.global.t("errorMessage.EOFError") as string;
        // In order to show the Skulpt error in the editor, we set an error on all the frames. That approach is the best compromise between
        // our current error related code implementation and clarity for the user.
        // Exception: if we have a "running action" message, we don't show anything (no message and no error).
        if (!errorType.startsWith(STRYPE_INPUT_INTERRUPT_ERR_MSG)) {
            consoleTextArea.value += ("< " + noLineSkulptErrStr + " >" + moreInfo);
            // Set the error on the frame header -- do not use editable slots here as we can't give a detailed error location
            useStore().frameObjects[frameId].runTimeError = noLineSkulptErrStr;
            useStore().wasLastRuntimeErrorFrameId = frameId;
            // We now need to force expand that frame and all its ancestors so that it shows up:
            useStore().forceExpand(frameId);
        }
    }
    else {
        // In case we couldn't get the line and the frame correctly, we just display a simple message,
        // EXCEPT if we have a "running action" message, which doesn't need to be displayed as the UI already gives cues.
        if (errorType.localeCompare(STRYPE_RUN_ACTION_MSG) != 0) {
            consoleTextArea.value += ("< " + errorType + " >" + moreInfo);
        }
    }
    handleExecutionFinished(true);
    // We will have added text either way, now scroll to bottom:
    nextTick(() => {
        consoleTextArea.scrollTop = consoleTextArea.scrollHeight;
    });
}
