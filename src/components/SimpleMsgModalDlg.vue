<template>
    <ModalDlg :dlgId="dlgId" :dlgTitle="dlgTitle" :okOnly="true">
        <span v-html="dlgMsg"/>
    </ModalDlg>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import ModalDlg from "@/components/ModalDlg.vue";
import { useStore } from "@/store/store";
import { mapStores } from "pinia";
import { BvTriggerableEvent } from "bootstrap-vue-next";
import { eventBus } from "@/helpers/appContext";
import { CustomEventTypes } from "@/helpers/editor";

export default defineComponent({
    name: "SimpleMsgModalDlg",

    components:{
        ModalDlg,
    },

    props:{
        dlgId: String,
        dlgTitle: String,
        hideActionListener:{type: Function},
    },

    created() {        
        // Register the event listener for the dialog here
        eventBus.on(CustomEventTypes.strypeModalHidden, this.onHideModalDlg);  
    },

    beforeDestroy(){
        // Remove the event listener for the dialog here, just in case...
        eventBus.off(CustomEventTypes.strypeModalHidden, this.onHideModalDlg);
    },

    computed:{
        ...mapStores(useStore),
        
        dlgMsg(): string{
            return this.appStore.simpleModalDlgMsg; 
        },
    },

    methods:{
        onHideModalDlg(event: BvTriggerableEvent){
            if(event.componentId == this.dlgId && this.hideActionListener != undefined){
                this.hideActionListener();
            }
        },
    },
});
</script>

<style lang="scss">
</style>