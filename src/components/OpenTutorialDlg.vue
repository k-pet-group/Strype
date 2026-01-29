<template>
    <ModalDlg
            :dlgId="dlgId"
            :dlg-title="$t('tutorials.dialogTitle')"
            showCloseBtn
            :autoFocusButton="'ok'"
            css-class="tutorial-dlg"
            :ok-disabled="!(selectedDemoCategoryIndex >= 0 && selectedDemoCategoryIndex < availableDemos.length && selectedDemoItemIndex >= 0 && selectedDemoItemIndex < demosInCurrentCategory.length)" >
        <div class="d-flex" style="height: 400px;">
            <!-- Left Pane: List Group -->
            <b-list-group class="flex-column" style="width: 30% !important;">
                <b-list-group-item
                    v-for="(item, index) in availableDemos"
                    :key="index"
                    :active="selectedDemoCategoryIndex === index && availableDemos.length > 1"
                    @click="changeDemoDialogCategory(index, item.demos)"
                    button
                >
                    <span class="tutorial-dlg-demo-group-type" v-if="item.type">{{item.type}}</span>
                    {{ item.name }}
                </b-list-group-item>
            </b-list-group>

            <!-- Right Pane: Dynamic Grid -->
            <div class="flex-grow-1 p-3 overflow-auto">
                <div class="d-flex flex-column">
                    <button
                        v-for="(item, i) in demosInCurrentCategory"
                        :key="i"
                        :class="{'d-flex': true, 'tutorial-dlg-demo-item': true, 'tutorial-dlg-selected-demo-item': selectedDemoItemIndex === i}"
                        type="button"
                        @click="selectedDemoItemIndex = i"
                        @dblclick="onDblClick"
                        @keydown.space.self="selectedDemoItemIndex = i"
                    >
                        <!-- 1x1 transparent image if image is missing: -->
                        <img :src="item.imgURL || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII='" alt="Preview" class="tutorial-dlg-preview flex-shrink-0"/>
                        <div class="d-flex flex-column flex-fill">
                            <span class="tutorial-dlg-name">{{item.name}}</span>
                            <span class="tutorial-dlg-description" v-html="item.description" />
                        </div>
                    </button>
                </div>
            </div>
        </div>
    </ModalDlg>    
</template>
<script lang="ts">

import Vue from "vue";
import MenuComponent from "@/components/Menu.vue";
import ModalDlg from "@/components/ModalDlg.vue";
import {Demo, DemoGroup, getBuiltinDemos} from "@/helpers/demos";
import { BvModalEvent } from "bootstrap-vue";
import { getMenuLeftPaneUID } from "@/helpers/editor";

export default Vue.extend({
    components: {ModalDlg},
    
    props: {
        dlgId: String,
    },
    
    data: function() {
        return {
            availableDemos: [] as DemoGroup[],
            selectedDemoCategoryIndex: 0, // LHS, always a selection
            selectedDemoItemIndex: 0, // RHS, -1 if no selection
            demosInCurrentCategory: [] as { name: string, description: string | undefined, imgURL: string | undefined, demoFile: () => Promise<string | undefined> }[],
        };
    },
    
    methods: {       
        updateAvailableDemos() {
            // We must update the available demos based on the code.
            // Our built-in demos are always available:
            this.availableDemos = [
                /* IFTRUE_isPython */
                {name: this.$i18n.t("tutorials.builtinGraphics") as string, demos: getBuiltinDemos("graphics")},
                {name: this.$i18n.t("tutorials.builtinTurtle") as string, demos: getBuiltinDemos("turtle")},
                {name: this.$i18n.t("tutorials.builtinConsole") as string, demos: getBuiltinDemos("console")},
                /* FITRUE_isPython */
                /* IFTRUE_isMicrobit */
                // A bit pointless to show "micro:bit" for micro:bit version since there is no other choice,
                // but let's keep the same presentation across the different versions.
                {name: this.$i18n.t("tutorials.builtinMicrobit") as string, demos: getBuiltinDemos("microbit")},
                /* FITRUE_isMicrobit */

            ];
        },

        async changeDemoDialogCategory(index: number, itemPromise: Promise<Demo[]>) {
            this.selectedDemoCategoryIndex = index;
            this.demosInCurrentCategory = [];
            const demos = await itemPromise;
            const r = [];
            // Note async: will run each in background
            for (const demo of demos) {
                let img : Promise<string | undefined>;
                if ("dataURL" in demo.image) {
                    img = demo.image.dataURL;
                }
                else if ("imgURL" in demo.image) {
                    img = Promise.resolve(demo.image.imgURL);
                }
                else {
                    img = Promise.resolve<string | undefined>(undefined);
                }
                const details = {
                    name: demo.name,
                    description: demo.description,
                    imgURL: undefined as (string | undefined),
                    demoFile: demo.demoFile,
                };
                r.push(details);
                img.then((url) => {
                    Vue.set(details, "imgURL", url);
                });
            }
            this.demosInCurrentCategory = r;

        },
        
        // Called by Menu component when we are shown:
        shown() {
            this.changeDemoDialogCategory(0, this.availableDemos.length > 0 ? this.availableDemos[0].demos: Promise.resolve([]));
        },

        getSelectedDemo() : ({ name : string, demoFile: Promise<string | undefined> } | undefined) {
            if (this.selectedDemoItemIndex >= 0 && this.selectedDemoItemIndex < this.demosInCurrentCategory.length) {
                const d = this.demosInCurrentCategory[this.selectedDemoItemIndex];
                return {name: d.name, demoFile: d.demoFile()};
            }
            return undefined;
        },

        onDblClick(){
            // Triggers the modal's OK event to load the selected example. The click event is fired before the double-click event:
            // selectedDemoItemIndex is already set to the right value.
            // We first close the dialog, than simulate a "close with action" in the Menu (since we can't close with "OK" status.)
            this.$root.$emit("bv::hide::modal", this.dlgId);
            (this.$root.$children[0].$refs[getMenuLeftPaneUID()] as InstanceType<typeof MenuComponent>).onStrypeMenuHideModalDlg({trigger: "ok"} as BvModalEvent, this.dlgId);
        },
    },
});
</script>
<style>
.tutorial-dlg > .modal-md {
  width: auto; /* important to let content control size */
  min-width: min(800px, 80vw);
}

.tutorial-dlg-demo-item {
  padding: 10px 20px 10px 20px;
  background-color: white;
  border: 0px;
  text-align: left;
}

.tutorial-dlg-demo-item:hover {
  background-color: #f8f9fa;
}

.tutorial-dlg-selected-demo-item, .tutorial-dlg-selected-demo-item:hover {
    background-color: #007bff;
}

img.tutorial-dlg-preview {
    width: 120px;
    height: 100px;
    object-fit: contain;
    display: block;
    margin-right: 30px;
}

span.tutorial-dlg-name {
    font-weight: bold;
    font-size: 125%;
}

.tutorial-dlg-selected-demo-item span.tutorial-dlg-name {
    color: white;
}

span.tutorial-dlg-description {
    color: #777;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2; /* 2 lines of text at most */
    -webkit-box-orient: vertical;
}

.tutorial-dlg-selected-demo-item span.tutorial-dlg-description {
  color: #eee;
}

.tutorial-dlg-selected-demo-item span.tutorial-dlg-description a {
    color: white;
}

.tutorial-dlg-demo-group-type {
    display: block;
    color: #999;
    font-size: 80%;
}

.tutorial-dlg-add-library-panel {
    margin-top: 50px;
}

.tutorial-dlg-add-library-panel input {
    margin-top: 10px;
    margin-bottom: 10px;
}
</style>
