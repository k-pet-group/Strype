<template>
    <div/>
</template>
<script lang="ts">
import Vue, { PropType } from "vue";
import {useStore, settingsStore} from "@/store/store";
import { mapStores } from "pinia";
import { pythonFileExtension, strypeFileExtension } from "@/helpers/common";
import { CustomEventTypes } from "@/helpers/editor";

// Derived from https://medium.com/timeless/google-picker-with-vue-2a39de7f36e

export default Vue.extend({
    name: "GoogleDriveFilePicker",
    
    props: {
        devKey : String,
        oauthToken : {
            type: [String],
            required: false,
        },
        pickFolderCancelled: {type: Function as PropType<() => void>, required: true},
    },

    computed:{
        ...mapStores(useStore, settingsStore),
    },

    data: function() {
        return {
            isSaveAction: false,
            startingFromFolderId: undefined as string | undefined,
        };
    },
        
    // We don't import the Google scripts in this component because we rely on the parent GoogleDrive component having done it.

    methods: {
        startPicking(isSaveAction: boolean, initialStrypeFolderId?: string) {
            this.isSaveAction = isSaveAction;
            this.startingFromFolderId = initialStrypeFolderId;
            gapi.load("picker", () => {
                this.createPicker();
            });
        },
        
        createPicker() {
            // We create views for the picker:
            const docsViews: google.picker.DocsView[] = [];
            
            // View 1: Strype/current folder view (load only)
            if(!this.isSaveAction && this.startingFromFolderId){
                const inFolderDocsView = new google.picker.DocsView();
                inFolderDocsView.setParent(this.startingFromFolderId);
                inFolderDocsView.setIncludeFolders(true);
                inFolderDocsView.setMode(google.picker.DocsViewMode.LIST);
                // The setLabel function is (no longer?) officially existing on the type DocsView -- we cast to "any" to bypass errors
                (inFolderDocsView as any).setLabel(this.appStore.strypeProjectLocationAlias);
                docsViews.push(inFolderDocsView);
            }

            // View 2: All Strype files (*.spy) view (load only)
            if(!this.isSaveAction) {
                const allStrypeDocsView = new google.picker.DocsView();
                // The setLabel and setQuery functions are (no longer?) officially existing on the type DocsView -- we cast to "any" to bypass errors
                (allStrypeDocsView as any).setQuery("title:*.spy");
                (allStrypeDocsView as any).setLabel((this.$i18n.t("appMessage.gdriveAllStrypeFiles") as string));
                allStrypeDocsView.setIncludeFolders(true);
                allStrypeDocsView.setMode(google.picker.DocsViewMode.LIST);
                docsViews.push(allStrypeDocsView);
            }

            // View 3: Python files (load only)
            if(!this.isSaveAction) {
                const pythonFilesDocsView = new google.picker.DocsView();
                // The setLabel and setQuery functions are (no longer?) officially existing on the type DocsView -- we cast to "any" to bypass errors
                (pythonFilesDocsView as any).setQuery("title:*.py");
                (pythonFilesDocsView as any).setLabel((this.$i18n.t("appMessage.gdriveAllPythonFiles") as string));
                pythonFilesDocsView.setIncludeFolders(true);
                pythonFilesDocsView.setMode(google.picker.DocsViewMode.LIST);
                docsViews.push(pythonFilesDocsView);
            }

            // View 4 or 5: Shared with me view (added to the list of view later with position depending on the action)
            const sharedDocsView = new google.picker.DocsView();
            sharedDocsView.setSelectFolderEnabled(this.isSaveAction);
            if(this.isSaveAction){
                sharedDocsView.setMimeTypes("application/vnd.google-apps.folder");
            }    
            sharedDocsView.setOwnedByMe(false);
            sharedDocsView.setIncludeFolders(true);
            sharedDocsView.setMode(google.picker.DocsViewMode.LIST);
            
            // View 5 or 4: My Drive view (added to the list of view later with position depending on the action)
            // This view is required to allow users to nagivate in their Drive: with View 1, we cannot nagivate outside the given parent folder,
            // so we need a way to allow users getting there.
            const rootDocsView = new google.picker.DocsView();
            rootDocsView.setSelectFolderEnabled(this.isSaveAction);
            rootDocsView.setIncludeFolders(true);
            rootDocsView.setParent("root");
            rootDocsView.setMode(google.picker.DocsViewMode.LIST);

            if(this.isSaveAction){
                rootDocsView.setMimeTypes("application/vnd.google-apps.folder");
            }    
            // The setLabel function is (no longer?) officially existing on the type DocsView -- we cast to "any" to bypass errors
            (rootDocsView as any).setLabel((this.$i18n.t("appMessage.gdriveTab") as string));

            // Add views at 4th and 5th positions depending on the action
            docsViews.push((this.isSaveAction) ? rootDocsView : sharedDocsView);
            docsViews.push((this.isSaveAction) ? sharedDocsView : rootDocsView);

            // Construct the picker
            const pickerBuilder = new google.picker.PickerBuilder()
                .disableFeature(google.picker.Feature.MULTISELECT_ENABLED)
                .disableFeature(google.picker.Feature.NAV_HIDDEN)
                .setLocale(this.settingsStore.locale??"en")
                .setOAuthToken(this.oauthToken)
                .setDeveloperKey(this.devKey)
                .setCallback(this.pickerCallback)
                .setTitle(this.$i18n.t((this.isSaveAction) ? "appMessage.selectFolder" : "appMessage.selectStrypeFile") as string);        
            docsViews.forEach((view) => pickerBuilder.addView(view));  
            pickerBuilder.build().setVisible(true);
        },

        async pickerCallback(data : google.picker.ResponseObject) {
            if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) {
                const fileId = data[google.picker.Response.DOCUMENTS][0][google.picker.Document.ID];
                const fileName = data[google.picker.Response.DOCUMENTS][0][google.picker.Document.NAME];
                const fileParentId = data[google.picker.Response.DOCUMENTS][0][google.picker.Document.PARENT_ID];
                // For a file selection, we check that the file is accepted by Strype
                if(!this.isSaveAction && !fileName.endsWith("." + strypeFileExtension) && !fileName.endsWith("." + pythonFileExtension)){
                    // The file isn't support by Strype: send event to handle what to do
                    this.$emit(CustomEventTypes.unsupportedByStrypeFilePicked);
                    return;
                }
                // Update the location of the Strype project within the Drive
                this.appStore.strypeProjectLocation = (this.isSaveAction) 
                    ? fileId// the folder selected is where we are now in Drive
                    : fileParentId; // the folder selected's parent is where are now in Drive
                // We set the location alias here too (if we are retrieving a folder, that's the folder name, otherwise we need an extra request to get the file parent's name)
                if(this.isSaveAction){
                    this.appStore.strypeProjectLocationAlias = fileName;
                }
                else{
                    // Get the location alias name 
                    gapi.client.request({
                        path: "https://www.googleapis.com/drive/v3/files/" + fileParentId,
                        method: "GET",
                    }).execute((resp) => {
                        this.appStore.strypeProjectLocationAlias = resp["name"];
                    });
                }
                const emitEvent = (this.isSaveAction) ? "picked-folder" : "picked-file";
                this.$emit(emitEvent, fileId, fileName);
            }
            else if(data.action === google.picker.Action.CANCEL && this.isSaveAction){
                // When the picker is closed for selecting a folder, we do need to bubble up that event
                this.pickFolderCancelled();
            }
        },
    },
});
</script>
