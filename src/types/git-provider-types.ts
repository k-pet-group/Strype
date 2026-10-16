/**
 * These types are used with Git Provider related things.
 * Note that it is an extra specification for Git which 
 * we use similarly as a Cloud drive in our codebase. 
 * So it deals with typing for an extension of 
 * the Cloud Drive component we already have.
 */

import { StrypeSyncTarget } from "./types";

// Small helper function check if a target is specifically a git-based target
export const isSyncTargetGitProvider = (target: StrypeSyncTarget): boolean => {
    return [StrypeSyncTarget.gh, StrypeSyncTarget.gl].includes(target);
};

export interface GitRepository {
   // Identifies the repository on the provider: "owner/repo" on GitHub, "group/subgroup/project" on GitLab
   fullName: string,
   // Empty for an empty repository
   defaultBranch: string,
   // Whether the user can push to the repository (otherwise, we can only load files from it)
   canPush: boolean,
   // Whether the repository belongs to the user themselves (rather than to an organisation/group, or to another user giving them access)
   isOwnedByUser: boolean,
}

// The order in which repositories are shown: those the user can push to first, then alphabetically (case insensitive).
export const compareGitRepositories = (repository1: GitRepository, repository2: GitRepository): number => {
    return (Number(repository2.canPush) - Number(repository1.canPush))
        || repository1.fullName.localeCompare(repository2.fullName, undefined, {sensitivity: "base"});
};

export interface GitContentItem {
   name: string,
   // From the repository's root, without a leading "/"
   path: string,
   isFolder: boolean,
}

// Thrown by a provider's API when the user must connect again (token revoked, or refresh failed).
export class GitAuthExpiredError extends Error {
}

// Thrown by a provider's API when a call fails, with the HTTP status of the response.
export class GitHttpError extends Error {
    constructor(public status: number, providerName: string) {
        super(`${providerName} error (HTTP ${status})`);
    }
}

// What each Git provider must offer for the parts of Strype shared by all Git providers (see useGitProvider()).
// "Auth" is the provider's own connection data. The methods throw GitAuthExpiredError when the connection has expired.
export interface GitProviderAPI<Auth> {
   // Whether the connection is (still) valid
   isConnectionValid(auth: Auth): Promise<boolean>,
   // The repositories the user can access, even read-only (in any order)
   listRepositories(auth: Auth): Promise<GitRepository[]>,
   listBranches(auth: Auth, repoId: string): Promise<string[]>,
   // The files and folders directly inside a folder ("" for the root) of a repository's branch
   listFolderContent(auth: Auth, repoId: string, branch: string, folderPath: string): Promise<GitContentItem[]>,
   // The (UTF-8) text content of a file
   getFileContent(auth: Auth, repoId: string, branch: string, filePath: string): Promise<string>,
   // The date (ISO 8601) of the last commit that changed a file, as Git doesn't keep a modification date for files
   getFileLastCommitDate(auth: Auth, repoId: string, branch: string, filePath: string): Promise<string>,
   canPushToRepository(auth: Auth, repoId: string): Promise<boolean>,
   // Commits (and therefore pushes, as it is done on the provider) a file's (UTF-8) text content to a branch,
   // creating the file if it doesn't exist yet
   commitFile(auth: Auth, repoId: string, branch: string, filePath: string, content: string, commitMessage: string): Promise<void>,
   // Creates a (private, empty) repository owned by the user. Its default branch is empty if the provider doesn't tell it.
   createRepository(auth: Auth, name: string): Promise<GitRepository>,
}

// The name of the repository Strype uses by default (created when the user saves into it if it doesn't exist)
export const strypeRepositoryName = "Strype";

// Whether a repository is the user's "Strype" repository (names are case insensitive, we don't check the owner/group)
export const isStrypeRepository = (repository: GitRepository): boolean => {
    return repository.fullName.split("/").pop()?.toLowerCase() == strypeRepositoryName.toLowerCase();
};

// The "Strype" repository to use by default among the given ones (that also pass the filter if given): as the user may have access
// to other users' or organisations' "Strype" repositories, we take the user's own one if any, or else the first one.
// (it must be one the user can push to, as it is where projects are saved by default)
export const findStrypeRepository = (repositories: GitRepository[], filter?: (repository: GitRepository) => boolean): GitRepository | undefined => {
    const strypeRepositories = repositories.filter((repository) => isStrypeRepository(repository) && repository.canPush && (filter?.(repository) ?? true));
    return strypeRepositories.find((repository) => repository.isOwnedByUser) ?? strypeRepositories[0];
};

// What the file picker dialog needs to browse a provider (the connection is already given by the caller).
export interface GitFilePickerQueries {
   listRepositories(): Promise<GitRepository[]>,
   listBranches(repoId: string): Promise<string[]>,
   listFolderContent(repoId: string, branch: string, folderPath: string): Promise<GitContentItem[]>,
}

// What the user chose in the file picker dialog opened to save a project
export interface GitSaveChoice {
   location: GitLocationStruct,
   commitMessage: string,
   // When set, the "Strype" repository doesn't exist yet: it must be created first (location.repoId is then meaningless)
   createStrypeRepository: boolean,
}

export interface GitFileIdStruct {
   repoId: string,
   branchId: string,
   path: string,
   fileName: string
}

// The Cloud Drive handler (and the state) only deal with string file IDs: a Git file ID is the JSON of its GitFileIdStruct.
export const toGitFileId = (gitFileIdStruct: GitFileIdStruct): string => {
    return JSON.stringify(gitFileIdStruct);
};

// Returns null if the ID isn't a Git file ID (for example, an ID from another Cloud Drive).
export const parseGitFileId = (fileId: string): GitFileIdStruct | null => {
    try{
        const parsed = JSON.parse(fileId);
        return (typeof parsed?.repoId == "string" && typeof parsed.branchId == "string" && typeof parsed.path == "string" && typeof parsed.fileName == "string")
            ? parsed
            : null;
    }
    catch{
        return null;
    }
};

// The equivalent of a Drive's folder for a Git provider: a folder of a repository's branch.
export interface GitLocationStruct {
   repoId: string,
   branchId: string,
   // From the repository's root, without leading or trailing "/" ("" for the root)
   folderPath: string,
}

// As for files, the state only deals with string location IDs: a Git location ID is the JSON of its GitLocationStruct.
export const toGitLocationId = (gitLocationStruct: GitLocationStruct): string => {
    return JSON.stringify(gitLocationStruct);
};

// Returns null if the ID isn't a Git location ID (for example, a folder ID from another Cloud Drive).
export const parseGitLocationId = (locationId: string): GitLocationStruct | null => {
    try{
        const parsed = JSON.parse(locationId);
        return (typeof parsed?.repoId == "string" && typeof parsed.branchId == "string" && typeof parsed.folderPath == "string")
            ? parsed
            : null;
    }
    catch{
        return null;
    }
};

// The location of a file is the folder containing it.
export const getGitFileLocation = (gitFileId: GitFileIdStruct): GitLocationStruct => {
    const lastSlashIndex = gitFileId.path.lastIndexOf("/");
    return {repoId: gitFileId.repoId, branchId: gitFileId.branchId, folderPath: (lastSlashIndex > -1) ? gitFileId.path.substring(0, lastSlashIndex) : ""};
};

// How a location is shown to users, for example "owner/repo/some/folder (main)"
export const getGitLocationLabel = (gitLocation: GitLocationStruct): string => {
    return `${gitLocation.repoId}${(gitLocation.folderPath.length > 0) ? "/" + gitLocation.folderPath : ""} (${gitLocation.branchId})`;
};

export interface GitProviderComponent {
    // Props
    
    // Data

    // Computed Properties    
    
    // Methods
    // Asks the user where to save the project (file name with its extension) and the commit message: the Git equivalent
    // of CloudDriveComponent.pickFolderForSave(), which then calls the onFolderToSaveFilePicked prop with the commit message.
    pickSaveLocation: (fullFileName: string) => void,
}