<template>
    <ModalDlg
            :dlgId="dlgId"
            :dlg-title="$t('demos.dialogTitle')"
            showCloseBtn
            :autoFocusButton="'ok'"
            css-class="open-demo-dlg"
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
                    <span class="open-demo-dlg-demo-group-type" v-if="item.type">{{item.type}}</span>
                    {{ item.name }}
                </b-list-group-item>
                
                <div class="open-demo-dlg-add-library-panel">
                    <span>{{$t('demos.addLibrary')}}</span>
                    <input ref="newLibraryAddress" :placeholder="$t('demos.libraryAddrPlaceholder')" type="text" autocomplete="off" class="cell" />
                    <b-button @click="addSpecifiedLibrary">{{ $t('demos.add') }}</b-button>
                </div>
            </b-list-group>

            <!-- Right Pane: Dynamic Grid -->
            <div class="flex-grow-1 p-3 overflow-auto">
                <div class="d-flex flex-column">
                    <button
                        v-for="(item, i) in demosInCurrentCategory"
                        :key="i"
                        :class="{'d-flex': true, 'open-demo-dlg-demo-item': true, 'open-demo-dlg-selected-demo-item': selectedDemoItemIndex === i}"
                        type="button"
                        @click="selectedDemoItemIndex = i"
                        @dblclick="onDblClick"
                        @keydown.space.self="selectedDemoItemIndex = i"
                    >
                        <!-- 1x1 transparent image if image is missing: -->
                        <img :src="item.imgURL || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII='" alt="Preview" class="open-demo-dlg-preview flex-shrink-0"/>
                        <div class="d-flex flex-column flex-fill">
                            <span class="open-demo-dlg-name">{{item.name}}</span>
                            <span class="open-demo-dlg-description" v-html="item.description" />
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
import {Demo, DemoGroup, getBuiltinDemos, getThirdPartyLibraryDemos} from "@/helpers/demos";
import Parser from "@/parser/parser";
import {AppSPYPrefix} from "@/main";
import {escapeRegExp} from "lodash";
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
                // #v-ifdef MODE == VITE_STANDARD_PYTHON_MODE
                {name: this.$i18n.t("demos.builtinGraphics") as string, demos: getBuiltinDemos("graphics")},
                {name: this.$i18n.t("demos.builtinTurtle") as string, demos: getBuiltinDemos("turtle")},
                {name: this.$i18n.t("demos.builtinConsole") as string, demos: getBuiltinDemos("console")},
                // #v-else
                // A bit pointless to show "micro:bit" for micro:bit version since there is no other choice,
                // but let's keep the same presentation across the different versions.
                {name: this.$i18n.t("demos.builtinMicrobit") as string, demos: getBuiltinDemos("microbit")},
                // #v-endif

            ];
            // To get library demos, we first get the libraries:
            const p = new Parser();
            // We only need to parse the imports container:
            p.parseJustImports();
            // Then we can get the libraries and look for demos:
            // Don't show mediacomp-strype in the micro:bit verison, nor when testing mode because it can get us temporarily banned by Github:
            let extraLibraries = [];            
            // #v-ifdef MODE == VITE_STANDARD_PYTHON_MODE
            extraLibraries = (window.Cypress || (window as any).Playwright) ? [] :["github:k-pet-group/mediacomp-strype"];
            // #v-endif
            for (const library of [...new Set([...extraLibraries, ...p.getLibraries()])]) {
                this.availableDemos.push(getThirdPartyLibraryDemos(library));
            }
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

        addSpecifiedLibrary() {
            let address = (this.$refs.newLibraryAddress as HTMLInputElement).value;
            address = address.trim();
            if (address) {
                // We want to be quite permissive here.  We accept the following syntaxes:
                // #(=> Library:protocol:addr
                // protocol:addr
                // addr <-- Guess protocol
                const mLib = address.match(new RegExp("^#\\s*" + escapeRegExp(AppSPYPrefix) + "\\s*Library:(.*)$"));
                if (mLib) {
                    address = mLib[1];
                    // We do the rest of the code anyway, in case some bits are incomplete:
                }
                if (!(address.startsWith("http:") || address.startsWith("https:") || address.startsWith("github:"))) {
                    // Need to guess the protocol.  Github usernames can't have dots, so a simple rule is this:
                    // If the first part before the first slash has a dot, it's a web URL.
                    // Special case: if it's "localhost" we also assume web URL.
                    // If it has two or three slashes we guess Github
                    // But otherwise we fall back to web URL again
                    // So let's assume web and just see if matches Github:
                    let protocol = "https://";
                    
                    // Does it have content before the first slash?
                    const mSlash = address.match(/^([^/]+)\//);
                    if (mSlash) {
                        if (!mSlash[1].includes(".") && !mSlash[1].toLowerCase().startsWith("localhost")) {
                            const components = address.split("/").length;
                            if (components == 2 || components == 3) {
                                protocol = "github:";
                            }
                        }
                    }
                    address = protocol + address;
                }
                this.availableDemos.push(getThirdPartyLibraryDemos(address));
            }
        },
    },
});
</script>
<style>
.open-demo-dlg > .modal-md {
  width: auto; /* important to let content control size */
  min-width: min(800px, 80vw);
}

.open-demo-dlg-demo-item {
  padding: 10px 20px 10px 20px;
  background-color: white;
  border: 0px;
  text-align: left;
}

.open-demo-dlg-demo-item:hover {
  background-color: #f8f9fa;
}

.open-demo-dlg-selected-demo-item, .open-demo-dlg-selected-demo-item:hover {
    background-color: #007bff;
}

img.open-demo-dlg-preview {
    width: 120px;
    height: 100px;
    object-fit: contain;
    display: block;
    margin-right: 30px;
}

span.open-demo-dlg-name {
    font-weight: bold;
    font-size: 125%;
}

.open-demo-dlg-selected-demo-item span.open-demo-dlg-name {
    color: white;
}

span.open-demo-dlg-description {
    color: #777;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2; /* 2 lines of text at most */
    -webkit-box-orient: vertical;
}

.open-demo-dlg-selected-demo-item span.open-demo-dlg-description {
  color: #eee;
}

.open-demo-dlg-selected-demo-item span.open-demo-dlg-description a {
    color: white;
}

.open-demo-dlg-demo-group-type {
    display: block;
    color: #999;
    font-size: 80%;
}

.open-demo-dlg-add-library-panel {
    margin-top: 50px;
}

.open-demo-dlg-add-library-panel input {
    margin-top: 10px;
    margin-bottom: 10px;
}
</style>
