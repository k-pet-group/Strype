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
}

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
   // The repositories the user can access, and push to
   listRepositories(auth: Auth): Promise<GitRepository[]>,
   listBranches(auth: Auth, repoId: string): Promise<string[]>,
   // The files and folders directly inside a folder ("" for the root) of a repository's branch
   listFolderContent(auth: Auth, repoId: string, branch: string, folderPath: string): Promise<GitContentItem[]>,
   // The (UTF-8) text content of a file
   getFileContent(auth: Auth, repoId: string, branch: string, filePath: string): Promise<string>,
   // The date (ISO 8601) of the last commit that changed a file, as Git doesn't keep a modification date for files
   getFileLastCommitDate(auth: Auth, repoId: string, branch: string, filePath: string): Promise<string>,
   canPushToRepository(auth: Auth, repoId: string): Promise<boolean>,
}

// What the file picker dialog needs to browse a provider (the connection is already given by the caller).
export interface GitFilePickerQueries {
   listRepositories(): Promise<GitRepository[]>,
   listBranches(repoId: string): Promise<string[]>,
   listFolderContent(repoId: string, branch: string, folderPath: string): Promise<GitContentItem[]>,
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

export interface GitProviderComponent {
    // Props
    
    // Data

    // Computed Properties    
    
    // Methods
   
}