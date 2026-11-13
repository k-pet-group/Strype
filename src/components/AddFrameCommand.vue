<template>
    <div :class="{'frame-cmd-container': true, disabled: isPythonExecuting || appStore.isDraggingFrame}" @click="onClick">
        <button :class="{'frame-cmd-btn': true, 'frame-cmd-btn-large': isLargerShorcutSymbol, 'frame-cmd-greyed': greyedOut}" :disabled="isPythonExecuting || appStore.isDraggingFrame">{{ (!isSVGIconSymbol) ? symbol : '' }}
            <SVGIcon v-if="isSVGIconSymbol" :name="symbol" :customClass="{'add-frame-command-symbol-svg-icon': true, disabled: isPythonExecuting || appStore.isDraggingFrame}" />
        </button>
        <span>{{ description }}</span>
    </div>
</template>

<script lang="ts">
//////////////////////
//      Imports     //
//////////////////////
import { defineComponent } from "vue";
import { useStore } from "@/store/store";
import { mapStores } from "pinia";
import { findAddCommandFrameType, hiddenShorthandFrames } from "@/helpers/editor";
import { PythonExecRunningState } from "@/types/types";
import SVGIcon from "@/components/SVGIcon.vue";

//////////////////////
//     Component    //
//////////////////////
export default defineComponent({
    name: "AddFrameCommand",

    components: {
        SVGIcon,
    },

    props: {
        type: String, //Type of the Frame Command
        shortcut: {type: String, required: true}, //the keyboard shortcut to add the frame 
        symbol: {type: String, required: true}, //the displayed shortcut in the UI, it can be a symbolic representation or (if specified) a SVGIcon name
        isSVGIconSymbol: Boolean, // if true, the symbol property is the name of a SVGIcon
        description: String, //the description of the frame
        index: Number, //when more than 1 frame is assigned to a shortcut, the index tells which frame definition should be used
        greyedOut: Boolean, //whether to grey the command out, when the frame commands pane isn't focused yet (see Commands.vue's frame-commands-pane-intro sentence)
    },

    computed: {
        ...mapStores(useStore),

        isLargerShorcutSymbol() {
            return this.symbol.length > 1 && !this.isSVGIconSymbol;
        },

        isPythonExecuting(): boolean {
            return (useStore().pythonExecRunningState ?? PythonExecRunningState.NotRunning) != PythonExecRunningState.NotRunning;
        },
    },

    methods: {
        onClick(event: MouseEvent): void {
            //add the frame in the editor if the panel is not disabled
            if(!this.isPythonExecuting) {
                const addFrameCommandType = findAddCommandFrameType(this.shortcut, this.index);
                if(addFrameCommandType != null){
                    // A command with a hidden shorthand version (a new test function, which is a function named "test_") adds that:
                    const shorthand = hiddenShorthandFrames[this.shortcut];
                    if (shorthand && shorthand.type.type == addFrameCommandType.type && shorthand.testsSectionOnly) {
                        this.appStore.addFrameWithCommand(shorthand.type, shorthand);
                    }
                    else {
                        this.appStore.addFrameWithCommand(addFrameCommandType);
                    }
                    // This same button is reached three different ways: a genuine mouse click, Enter
                    // confirming whichever button the frame commands pane currently has focused
                    // (Commands.vue's keyup handler deliberately blocks the native keydown auto-click --
                    // see its own comment -- and instead calls activeElement.click() itself once the
                    // key's lifecycle is otherwise finished), and the "Insert frame" context-menu item
                    // (CaretContainer.vue), which also ultimately calls .click() on this element
                    // programmatically. Only the first is a real user-generated click -- the other two
                    // are JS-invoked, so the browser marks them event.isTrusted === false -- which is a
                    // reliable, native way to tell them apart without needing to plumb an explicit
                    // origin through two otherwise-unrelated call sites. Both indirect triggers are
                    // reported as "shortcut_key" rather than getting a third category of their own: the
                    // context-menu item is arguably mouse-driven too, but it's a rare path and lumping
                    // it in keeps the split to the two categories that actually matter (deliberately
                    // choosing a frame type vs. organically typing one -- see trackFrameInsert's comment).
                    this.appStore.trackFrameInsert(addFrameCommandType.type, event.isTrusted ? "shortcut_mouse" : "shortcut_key");
                }
            }
        },
    },
});
</script>

<style lang="scss">
.frame-cmd-container {
    margin: 2px 5px;
    cursor: pointer;
}

.frame-cmd-container.disabled {
    cursor: default;
    color: rgb(180, 180, 180);
}

.frame-cmd-btn.frame-cmd-greyed {
    opacity: 0.35;
}

.frame-cmd-container.text-editing-command,
.frame-cmd-container.text-editing-command .frame-cmd-btn {
    cursor: default;
}

.text-editing-command-keys-plus {
    margin-right: 5px;
}

// Unlike the other frame-cmd-btn-large usages (e.g. the "space" symbol for the function call
// shortcut), the code completion shortcut's key boxes aren't crammed into a row with many others,
// so there's no need to condense the font horizontally to save space.
.text-editing-command .frame-cmd-btn-large {
    @include frame-cmd-btn-large-normal-stretch;
}

.frame-cmd-btn {
    margin-right: 5px;
    cursor: pointer;
    width: 24px;
    background-color: #fefefe;
    border-radius: 4px;
    border: 1px solid #d0d0d0;
}

// Same look as .frame-cmd-btn, but deliberately a different class: this is the non-interactive
// "Space" key box shown in Commands.vue's frame-commands-pane-intro sentence, and it must never
// be picked up by the pane's own keyboard-navigation queries (Commands.vue's
// handleFrameCommandsPaneKeyDown looks up ".frame-cmd-btn" elements to cycle between).
// It's a <span> rather than a <button>, so it needs its own horizontal padding to match the
// browser-default padding that gives the real shortcut buttons below some breathing room.
.frame-cmd-prefix-btn {
    @extend .frame-cmd-btn;
    cursor: default;
    padding: 1px 6px;
}

.frame-cmd-btn-large {
    width: auto;
    font-stretch: 50% !important;
    font-family: 'Inconsolata', sans-serif !important;
}

.frame-cmd-btn:disabled {
    cursor: default;
    color: rgb(180, 180, 180);
}

.add-frame-command-symbol-svg-icon {
    color: black;
    width: 10px;
    height: 12px;
}

.add-frame-command-symbol-svg-icon.disabled {
    color: rgb(180, 180, 180);
}
</style>
