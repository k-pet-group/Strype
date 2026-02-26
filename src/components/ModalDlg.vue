<!-- this acts as a wrapper around the bootstrap modals, to have centralised control and customisation -->
<template>
    <BModal no-close-on-backdrop :no-header-close="!showCloseBtn" :id="dlgId" :title="dlgTitle" @shown="onShown" @hidden="onHidden"
        :ok-title="okTitle" :cancel-title="cancelTitle" :size="size" :modal-class="cssClass" :focus="elementToFocusId">
        <slot/>
        <!-- When no footer should be shown, we still use an empty div content (but a content nonetheless) to have the right visual rendering:
             the BModal property "no-footer" can be used, but it also removes the divider below the dialog content, making the style weird.
             Moreover, if the template is TOTALLY empty, Vue Bootstrap Next will assign default OK/Cancel buttons. -->
        <template #footer>
            <slot name="modal-footer-content" :ok="onOK" :cancel="onCancel">
                <!-- default content if the slot isn't provided -->
                <div class="strype-modal-footer-content-div">
                    <button v-if="!hideDlgBtns && !okOnly" class="btn btn-secondary" @click="onCancel">{{ cancelTitle }}</button>
                    <!-- distinction between normal OK button and a "useLoadingOK" button -->
                    <button v-if="!hideDlgBtns && !useLoadingOK" :class="{'btn btn-primary': true, disabled: okDisabled}" @click="onOK">{{ okTitle }}</button>
                    <button v-else-if="!hideDlgBtns" :class="{'btn btn-primary': true, disabled: okDisabled}" @click="onOK">
                        <BSpinner label="Spinning" small></BSpinner>
                        <span class="modal-spin-ok-btn-span">{{ okTitle }}</span>
                    </button>
                </div>
            </slot>            
        </template>
    </BModal>
</template>
<script lang="ts">
import { defineComponent, PropType } from "vue";
import { mapStores } from "pinia";
import { useStore } from "@/store/store";
import { BootstrapDlgSize } from "@/types/types";
import { eventBus } from "@/helpers/appContext";
import { CustomEventTypes } from "@/helpers/editor";
import { BModal, BSpinner, BvTriggerableEvent} from "bootstrap-vue-next";
import { useToggle } from "bootstrap-vue-next";

export default defineComponent({
    name: "ModalDlg",

    components: {
        BModal,
        BSpinner,
    },

    props:{
        dlgId: String,
        dlgTitle: String,
        okOnly: Boolean,
        okCustomTitle: String,
        okDisabled: Boolean, // this is meant as a TEMPORARY disable, for example when async methods are called in between
        useLoadingOK: Boolean, // when we want to include a progress inside a OK button. Assumed "Cancel" and "Hide" are used with OK.
        cancelCustomTitle: String,
        hideDlgBtns: Boolean,
        showCloseBtn: Boolean,     
        size:  {
            type: String as PropType<BootstrapDlgSize>,
            required: false,
        },       
        elementToFocusId: String,
        useYesNo: Boolean, // by default, the values of the buttons are OK and Cancel, this flag allows using Yes/No (in combination with okOnly) if needed
        cssClass: String,
    },

    mounted(){
        // The events related to the modal visibility are sent on the eventBus.
        // This component then works out the interaction with the Bootstrap modal mechanism.
        // For a given dialog we need to register a generic listener for the shown even
        eventBus.on(CustomEventTypes.showStrypeModal, this.showModal);
        eventBus.on(CustomEventTypes.hideStrypeModal, this.hideModal);
        window.addEventListener("keydown", this.validateOnEnterKeyDown);

        // Access the show/hide methods exposed by Bootstrap
        const {show, hide} = useToggle(this.dlgId);
        this.modalShowFunction = show;
        this.modalHideFunction = hide;

        // Bootstrap 5 doesn't visually show the focused button anymore (unless using tabbing).
        // So we use styling to simular "focus-visible" to achieve the same.
        if(this.elementToFocusId){
            document.getElementById(this.elementToFocusId)?.classList.add("strype-modal-dlg-focused-btn");
        }
    },

    computed: {
        ...mapStores(useStore),

        okTitle(): string {
            return this.okCustomTitle ?? (this.$t((this.useYesNo) ? "buttonLabel.yes" : "buttonLabel.ok") as string);
        },
        
        cancelTitle(): string {
            return this.cancelCustomTitle ?? (this.$t((this.useYesNo) ? "buttonLabel.no" : "buttonLabel.cancel") as string);
        },
    },

    data: function () {
        return {
            modalShowFunction: () => {
                return new Promise<string | boolean | null>(() => {});
            },
            modalHideFunction: (trigger?: string) => {
                return new Promise<string | boolean | null>(() => {});
            },    
        };
    },

    methods: {
        showModal(dlgId: string){
            if(dlgId == this.dlgId){
                this.modalShowFunction();
            }            
        },

        onShown(event: BvTriggerableEvent){
            eventBus.emit(CustomEventTypes.strypeModalShown, event);
            // For any modal window, notify the editor that a modal is displayed
            this.appStore.isModalDlgShown = true;
            this.appStore.currentModalDlgId = event.componentId as string;            
        },

        hideModal(event: BvTriggerableEvent){
            if(event.componentId == this.dlgId){
                this.modalHideFunction(event.trigger??undefined);
            }            
        },

        onHidden(event: BvTriggerableEvent){
            eventBus.emit(CustomEventTypes.strypeModalHidden, event);
            // For any modal window, notify the editor that a modal is hidden
            this.appStore.isModalDlgShown = false;
            this.appStore.currentModalDlgId = "";
        },

        onCancel(){
            this.modalHideFunction("cancel");
        },

        onOK(){
            this.modalHideFunction("ok");
        },

        validateOnEnterKeyDown(event: KeyboardEvent){
            // Hitting "enter" on the dialog triggers its validation.
            // Only if there is not focus on a button already (then it show leave the action on that button to be performed)
            if((document.activeElement?.tagName.toLocaleLowerCase()??"") != "button" && event.code.toLowerCase() == "enter" && this.appStore.isModalDlgShown && this.dlgId == this.appStore.currentModalDlgId){
                eventBus.emit(CustomEventTypes.hideStrypeModal, {trigger: "ok", componentId: this.dlgId });
            }
        },
    },

    beforeDestroy(){
        // Just in case, we remove event listeners 
        window.removeEventListener("keydown", this.validateOnEnterKeyDown);
    },
});
</script>

<style lang="scss">
.strype-modal-footer-content-div button {
    margin-left: 8px;
}

.modal-spin-ok-btn-span {
    margin-left: 5px;
}

.strype-modal-dlg-focused-btn:focus {
    // We only use this for showing the right focus "visual" indicator
    // when a button is programmatically focused, Bootstrap 5 doesn't
    // do it anymore just by focusing it...
    border-color: var(--bs-btn-hover-border-color);
    outline: 0;
    // Avoid using mixin so we can pass custom focus shadow properly
    box-shadow: var(--bs-btn-focus-box-shadow);   
}
</style>
