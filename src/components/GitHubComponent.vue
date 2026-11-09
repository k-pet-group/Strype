/**
 * The CloudDriveComponent implementation for GitHub.
 * Even if GitHub isn't a cloud as such, we use the same common handler.
 * Most of it is shared by all Git providers (see useGitProvider()): what is specific to GitHub is the signing in.
 */
<template>
    <GitFilePickerDlg ref="filePicker" dlgId="gitHubFilePickerDlg" :providerName="driveName" :queries="gitProvider.filePickerQueries"
        @filePicked="gitProvider.onFilePicked" @unsupportedFilePicked="props.onUnsupportedByStrypeFilePicked"
        @saveChosen="gitProvider.onSaveChosen" @saveCancelled="props.onFolderToSavePickCancelled" />
</template>
<script setup lang="ts">
import GitFilePickerDlg from "@/components/GitFilePickerDlg.vue";
import { connectToGitHub, GitHubAuth, gitHubAPI } from "@/helpers/githubAuth";
import { GitProviderComponentProps, useGitProvider } from "@/helpers/gitProvider";
import { StrypeSyncTarget } from "@/types/types";
import { ref } from "vue";

const props = defineProps<GitProviderComponentProps>();

const driveName = "GitHub";
const filePicker = ref<InstanceType<typeof GitFilePickerDlg> | null>(null);
const gitProvider = useGitProvider<GitHubAuth>({target: StrypeSyncTarget.gh, driveName, driveAPIName: "GitHub REST API", api: gitHubAPI, props, filePicker});

function signIn(callback: (cloudTarget: StrypeSyncTarget) => void) {
    gitProvider.completeSignIn(connectToGitHub()
        .then(async (connection) => {
            // If Strype isn't installed yet on the user's GitHub, wait for the user to finish on the installation page
            // (if it still isn't installed after that, no repository is accessible: we don't consider the user signed in)
            return (connection.installed || await connection.installation) ? connection.auth : null;
        }), callback);
}

defineExpose(gitProvider.toExposed(signIn));
</script>
