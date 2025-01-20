<template>
    <div>
        <!-- Command Button -->
        <div :class="{'frame-cmd-container': true, disabled: isPythonExecuting}" @click="onClick" :title=tooltip>
            <button class="frame-cmd-btn" :disabled=isPythonExecuting>{{ symbol }}</button>
            <span>{{ description }}</span>
        </div>

        <!-- Popup Set Modal -->
        <div v-if="isSetModalVisible" class="modal-overlay" @keydown="preventKeydown">
            <div class="modal-content" @click.stop> <!-- Add @click.stop here -->
                <h3>Popup Modal</h3>
                <p>This is the modal triggered by the shortcut "s".</p>
                <form>
                    <div class="mb-4">
                        <label for="name" 
                               class="block text-gray-700
                                      font-bold mb-2">Name:</label>
                        <input type="name" id="name" v-model="formData.name"
                               name="name"
                               class="w-full border border-gray-300
                                      rounded px-3 py-2">
                    </div>
                    <div class="mb-4">
                        <label for="list" 
                               class="block text-gray-700
                                      font-bold mb-2">List:</label>
                        <input type="name" id="list" v-model="formData.list"
                               name="list"
                               class="w-full border border-gray-300
                                      rounded px-3 py-2">
                    </div>
                    <button type="submit" @click="submitForm"
                        class="bg-green-500 hover:bg-green-600
                               text-white font-bold py-2 px-4
                               rounded transition duration-300
                               ease-in-out">Submit</button>
                    <button type="button" @click="closeModal"
                        class="bg-red-500 hover:bg-red-600
                               text-white font-bold py-2 px-4 
                               rounded transition duration-300
                               ease-in-out ml-4">Close</button>
                </form>
            </div>
        </div>

        <!-- Popup Set Modal -->
        <div v-if="isListModalVisible" class="modal-overlay" @keydown="preventKeydown">
            <div class="modal-content" @click.stop> <!-- Add @click.stop here -->
                <h3>Popup Modal</h3>
                <p>This is the modal triggered by the shortcut "s".</p>
                <form>
                    <div class="mb-4">
                        <label for="name" 
                               class="block text-gray-700
                                      font-bold mb-2">Name:</label>
                        <input type="name" id="name" v-model="formData.name"
                               name="name"
                               class="w-full border border-gray-300
                                      rounded px-3 py-2">
                    </div>
                    <div class="mb-4">
                        <label for="list" 
                               class="block text-gray-700
                                      font-bold mb-2">List:</label>
                        <input type="name" id="list" v-model="formData.list"
                               name="list"
                               class="w-full border border-gray-300
                                      rounded px-3 py-2">
                    </div>
                    <button type="submit" @click="submitForm"
                        class="bg-green-500 hover:bg-green-600
                               text-white font-bold py-2 px-4
                               rounded transition duration-300
                               ease-in-out">Submit</button>
                    <button type="button" @click="closeModal"
                        class="bg-red-500 hover:bg-red-600
                               text-white font-bold py-2 px-4 
                               rounded transition duration-300
                               ease-in-out ml-4">Close</button>
                </form>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
//////////////////////
//      Imports     //
//////////////////////
import Vue from "vue";
import { useStore } from "@/store/store";
import { mapStores } from "pinia";
import { findAddCommandFrameType } from "@/helpers/editor";
import { PythonExecRunningState, FrameObject } from "@/types/types";

//////////////////////
//     Component    //
//////////////////////
export default Vue.extend({
    name: "AddFrameCommand",

    props: {
        type: String,
        shortcut: String,
        symbol: String,
        description: String,
        tooltip: String,
        index: Number,
    },

    data() {
        return {
            isSetModalVisible: false, // Controls modal visibility
            isListModalVisible: false,
            formData: {
                name: "",
                list: "",
            },
        };
    },

    computed: {
        ...mapStores(useStore),

        isPythonExecuting(): boolean {
            return (useStore().pythonExecRunningState ?? PythonExecRunningState.NotRunning) != PythonExecRunningState.NotRunning;
        },

        getFrame(): FrameObject {
            return this.appStore.frameObjects[this.appStore.currentFrame.id];
        },
    },

    methods: {
        onClick(): void {
            if (!this.isPythonExecuting) {
                if (this.shortcut === "s") {
                    this.isSetModalVisible = true; // Open the modal
                }
                else if(this.shortcut === "q"){
                    this.isListModalVisible = true;
                }
                else {
                    const addFrameCommandType = findAddCommandFrameType(this.shortcut, this.index);
                    if(addFrameCommandType != null){
                        this.appStore.addFrameWithCommand(addFrameCommandType);
                    }
                }
            }
        },

        closeModal(): void {
            this.isSetModalVisible = false; // Close the modal
            this.isListModalVisible = false;
        },

        preventKeydown(event: KeyboardEvent): void {
            // Stop the keydown event from propagating when the modal is open
            event.stopPropagation();
        },

        submitForm() : void {
            const { name, list } = this.formData;
            if (!this.isPythonExecuting){
                const addFrameCommandType = findAddCommandFrameType(this.shortcut, this.index);
                if(addFrameCommandType != null){
                    this.appStore.addFrameWithCommand(addFrameCommandType);
                    const c = this.getFrame;
                    c.labelSlotsDict = {
                        0: {
                            slotStructures:{
                                fields: [{code: name}],
                                operators:[],
                            },
                        },
                        1: {
                            slotStructures:{
                                fields: [{code: list}],
                                operators:[],
                            },
                        },
                    };
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


.frame-cmd-btn {
    margin-right: 5px;
    cursor: pointer;
    width: 24px;
    background-color: #fefefe;
    border-radius: 4px;
    border: 1px solid #d0d0d0;
}

.frame-cmd-btn:disabled {
    cursor: default;
}

.modal-overlay {
    position: fixed;
    top: 0;         
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5); /* Semi-transparent background */
    z-index: 1000; /* Ensure it's above other elements */
    pointer-events: auto;
}

.modal-content {
    background: #fff;
    padding: 20px;
    border-radius: 8px;
    max-width: 500px;
}
</style>
