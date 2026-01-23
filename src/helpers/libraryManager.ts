// Caches Python files which have been fetched from libraries
type FetchResult = { buffer: ArrayBuffer; mimeType: string | null } | number; // Either the content, or number of HTTP code when we asked
type FilePath = string;
type FetchCache = Map<FilePath, FetchResult>;
type LibraryAddress = string;
// Maps a library address (https: or github: location) to a FetchCache,
// which is itself a map from filepath (e.g. src/foo.py, or assets/image.jpeg) to content or HTTP error code.
type LibraryCache = Map<LibraryAddress, FetchCache>;

// This is (deliberately) only cleared on page reload.  We don't hold it in the store,
// in order to allow this refreshing:
const libraryCache: LibraryCache = new Map();
// Keys are user/repo/branch, maps to a list of file paths that are available in that repo:
const githubCache = new Map<string, string[]>();

// Caches the result and re-uses cache if available
async function getGithubRepoPaths(
    user: string,
    repo: string,
    branch: string,
    token?: string // optional GitHub token
): Promise<string[]> {
    const key = `${user}/${repo}/${branch}`;
    if (githubCache.has(key)) {
        return githubCache.get(key) as string[];
    }
    
    const headers: Record<string, string> = {
        "Accept": "application/vnd.github.v3+json",
    };
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    // Step 1: Get the commit SHA for the branch
    const branchRes = await fetch(
        `https://api.github.com/repos/${user}/${repo}/branches/${branch}`,
        { headers }
    );
    if (!branchRes.ok) {
        throw new Error(`Failed to get branch info: ${branchRes.status}`);
    }
    const branchData = await branchRes.json();
    const treeSha = branchData.commit.commit.tree.sha;

    // Step 2: Fetch the full recursive tree
    const treeRes = await fetch(
        `https://api.github.com/repos/${user}/${repo}/git/trees/${treeSha}?recursive=1`,
        { headers }
    );
    if (!treeRes.ok) {
        throw new Error(`Failed to get tree: ${treeRes.status}`);
    }
    const treeData = await treeRes.json();

    // Step 3: Extract file paths
    const result = treeData.tree
        .filter((entry: any) => entry.type === "blob") // only files
        .map((entry: any) => entry.path);
    githubCache.set(key, result);
    return result;
}

const INDEX_FILE_NAME = "index.txt";

async function attemptFetchFile(address: LibraryAddress, fileName: FilePath) : Promise<FetchResult> {
    let url;
    if (address.startsWith("https:") || address.startsWith("http:")) {
        // We can't look for index.txt by fetching index.txt or we'll recurse forever:
        if (fileName != INDEX_FILE_NAME) {
            const paths = await getAvailableFilesFromLibrary(address);
            if (paths != null && !paths.includes(fileName)) {
                return 404;
            }
        }
        url = new URL(fileName, address + (address.endsWith("/") ? "" : "/"));
    }
    else if (address.startsWith("github:")) {
        const paths = await getAvailableFilesFromLibrary(address);
        // Addresses are either user/repo, or user/repo/branch.
        const components = address.slice("github:".length).split("/");
        if (components.length == 2) {
            components.push("main");
        }
        if (components.length != 3 || (paths != null && !paths.includes(fileName))) {
            return 404;
        }
        
        url = new URL(`${components[0]}/${components[1]}/${components[2]}/${fileName}`, "https://raw.githubusercontent.com/");
    }
    else {
        // Unknown protocol, fail:
        return 400;
    }
    
    try {
        const response = await fetch(url);
        if (response.ok) {
            return {buffer: await response.arrayBuffer(), mimeType: response.headers.get("Content-Type")};
        }
        else {
            return response.status;
        }
    }
    catch {
        return 520;
    }
}

// Returns [] if there is a problem
export async function getAvailableFilesFromLibrary(address: LibraryAddress) : Promise<string[] | null> {
    if (address.startsWith("github:")) {
        // Addresses are either user/repo, or user/repo/branch.
        const components = address.slice("github:".length).split("/");
        if (components.length == 2) {
            // We assume branch name is main:
            components.push("main");
        }
        if (components.length != 3) {
            return [];
        }
        const paths = await getGithubRepoPaths(components[0], components[1], components[2]);
        return paths;
    }
    else if (address.match(/^https?:/)) {
        const text = await getTextFileFromLibraries([address], INDEX_FILE_NAME);
        if (text != null) {
            // Convert to UTF8 text:
            return text.split(/\r?\n/).map((entry: string) => entry.replace("\n", "")).filter((entry) => entry);
        }
        else {
            return null;
        }
    }
    
    return Promise.resolve([]);
}

export async function getAvailablePyPyiFromLibrary(address: LibraryAddress) : Promise<string[] | null> {
    return getAvailableFilesFromLibrary(address).then((fs) => {
        if (fs == null) {
            return null;
        }
        return fs.filter((entry: string) => entry.match(/\.pyi?$/));
    });
}

export function getLibraryName(libraryAddress: LibraryAddress) : string | undefined  {
    // Convert Github URLs to our Github protocol:
    libraryAddress = libraryAddress.replace(/^https?:\/\/(www\.?)github.com\//, "github:");
    if (libraryAddress.startsWith("https:") || libraryAddress.startsWith("http:")) {
        try {
            const url = new URL(libraryAddress + (libraryAddress.endsWith("/") ? "" : "/"));
            const segments = url.pathname.split("/").filter(Boolean);
            if (segments.length > 0) {
                return segments[segments.length - 1];
            }
        }
        catch {
            // Just return undefined, below
        }
    }
    else if (libraryAddress.startsWith("github:")) {
        // Addresses are either user/repo, or user/repo/branch.
        const components = libraryAddress.slice("github:".length).split("/");
        // Library name is the second
        if (components.length >= 2) {
            return components[1];
        }
    }
    return undefined;
}

// Uses the cache if at all possible.
// All parameters are assumed to be already trimmed.
export async function getRawFileFromLibraries(libraryAddresses: LibraryAddress[], filePath: FilePath): Promise<{ buffer: ArrayBuffer; mimeType: string | null } | null> {
    if (libraryAddresses.length === 0) {
        return null;
    }

    let [currentAddress, ...rest] = libraryAddresses;

    // Convert Github URLs to our Github protocol:
    currentAddress = currentAddress.replace(/^https?:\/\/(www\.?)github.com\//, "github:");
    // Remove leading ./:
    filePath = filePath.replace(/^\.\//, "");

    // Get or create the module cache for the current address
    let moduleCache = libraryCache.get(currentAddress);
    if (!moduleCache) {
        moduleCache = new Map();
        libraryCache.set(currentAddress, moduleCache);
    }

    // Check if result is already cached
    let result : FetchResult;
    if (moduleCache.has(filePath)) {
        // Shouldn't ever be undefined anyway, because we just checked if it was in the map:
        result = moduleCache.get(filePath) ?? 404;
    }
    else {
        // Not cached yet — attempt fetch
        result = await attemptFetchFile(currentAddress, filePath);
        moduleCache.set(filePath, result); // Cache result (even if fails)
    }

    if (typeof result != "number") {
        return result;
    }
    // Otherwise it's not found or had an error.

    // Recurse into the rest of the addresses
    return getRawFileFromLibraries(rest, filePath);
}

export async function getTextFileFromLibraries(libraryAddresses: LibraryAddress[], filePath: FilePath) : Promise<string | undefined> {
    const r = await getRawFileFromLibraries(libraryAddresses, filePath);
    if (r != null) {
        try {
            return new TextDecoder("utf-8").decode(r.buffer);
        }
        catch {
            return undefined;
        }
    }
    return undefined;
}

export function getPossibleImports(filePaths: string[]): string[] {
    const imports: string[] = [];

    for (const path of filePaths) {
        if (!path.endsWith(".py")) {
            continue;
        }

        const segments = path.split("/");
        const fileName = segments.pop();

        if (!fileName || fileName === "__init__.py") {
            continue;
        }

        const moduleName = fileName.replace(/\.py$/, "");
        imports.push([...segments, moduleName].join("."));
    }

    return imports;
}
