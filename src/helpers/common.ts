import {ObjectPropertyDiff} from "@/types/types";
import hash from "object-hash";

//Function to get the difference between two states (properties) of an object.
//It takes the two objects as arguments and returns a list of differences. 
//Each entry of the result contains :
//  propertyPath --> the path of the object properties (. separated)
//  value        --> the value of the difference (null if deletion, actual value if addition or update)
const checkArrayIsEmpty = (array: []): boolean => {
    return array.findIndex((val) => val !== undefined) == -1;
};

const findDiffDeep = (obj1: {[id: string]: any}, obj2: {[id: string]: any}, result: ObjectPropertyDiff[], path: string) => {
    const pathSeparator = (path.length > 0) ? "." : "";
    
    for(const obj1property in obj1) {
        const obj1value = obj1[obj1property];
     
        //We first check if the property is defined in obj2
        //--> if yes, we check if there is a difference in the value,
        //--> if no, we notify a deletion in obj2.

        if(obj2[obj1property] !== undefined){
            //To check the difference of value, we need to distinguish the case when the value is:
            // - an object or an array --> then we look for sub values recursively
            // - something else (i.e. string, boolean etc) --> we compare both values from obj1 and obj2
            if(obj1value !== null && typeof obj1value === "object"){
                findDiffDeep(obj1value, obj2[obj1property], result, path + pathSeparator + obj1property + "_" + Array.isArray(obj1value));
                //note: for arrays, delete doesn't change the size of the array, but put "undefined" in the index
                //and that is good for use because in array, indexing MUST be preserved. For example, after this recursion, the array can
                //be [undefined, undefined, x, y] and we want to see x still at the 3rd position and y at the 4th. 
                //That is why we don't check the array has a 0 length to delete, but that it doesn't contain some values != undefined.
                if((Array.isArray(obj1value) && checkArrayIsEmpty(obj2[obj1property])) || Object.entries(obj2[obj1property]).length === 0){
                    //if inside obj2[property] there is no extra property/entry, we delete it
                    delete obj2[obj1property];
                }
            }
            else {
                if(obj2[obj1property] !== obj1value){
                    result.push({propertyPathWithArrayFlag: (path + pathSeparator + obj1property), value: obj2[obj1property]});
                }
                delete obj2[obj1property];
            }

        }
        //else it's a deletion from obj1, put "null" value in the result
        else{
            result.push({propertyPathWithArrayFlag: (path + pathSeparator + obj1property), value: null });
        }
    }
}; 

//After using findDiffDeep(), the obj2 may have remaining non empty values.
//These values are changes added in obj2 and need to be saved too.
const checkAddedValues = (obj: {[id: string]: any}, result: ObjectPropertyDiff[], path: string) => {
    const pathSeparator = (path.length > 0) ? "." : "";
    
    for(const objProperty in obj){
        const objValue = obj[objProperty];
        
        if(objValue != null && typeof objValue === "object") {
            //if we have an empty array/object we save it directly,
            //otherwise, we check deeper recursively
            if(Object.entries(objValue).length == 0){
                result.push({propertyPathWithArrayFlag: path + pathSeparator + objProperty, value: objValue});
            } 
            else {
                checkAddedValues(objValue, result, path + pathSeparator + objProperty + "_" + (Array.isArray(objValue)));
            }
        }
        else{
            result.push({propertyPathWithArrayFlag: path + pathSeparator + objProperty, value: objValue});
        }
    }
};

//Entry point for checking the difference between two objects.
//The differnence between obj1 and obj2 is saved as an array of ObjectPropertyDiff objects.
//Note: this is not a bidrectional difference checker: it only checks the difference in obj2 compared with obj1, not keep trace of what is in obj1.
export const getObjectPropertiesDifferences = (obj1: {[id: string]: any}, obj2: {[id: string]: any}): ObjectPropertyDiff[]  => {
    const result = [] as ObjectPropertyDiff[];
    
    //To find the differences, we'll remove objects from obj2 ---> so we use a copy
    const obj2copy = JSON.parse(JSON.stringify(obj2));

    //we then parse through all properties to find a difference
    //if there is a difference, we add it in the result and remove the property from obj2copy (to keep only additions)
    findDiffDeep(obj1, obj2copy, result, "");

    //at this stage, what is left on obj2copy are the additions that we put this in the result too.
    //note that any property without value isn't an addition (it can be the remaining of the deletion done in the loop above)
    checkAddedValues(obj2copy,result, "");
  
    return result;
};

export const saveContentToFile = (content: string, fileName: string) : void => {
    // from https://blog.logrocket.com/programmatic-file-downloads-in-the-browser-9a5186298d5c/

    const url = URL.createObjectURL(new Blob([content], {type: "text/plain"}));

    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;

    const clickHandler = () => {
        setTimeout(() => {
            URL.revokeObjectURL(url);
            a.removeEventListener("click", clickHandler);
        }, 150);
    };
    a.addEventListener("click", clickHandler, false);

    a.click();
};

export function readFileAsync(file: Blob): Promise<BufferSource>  {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onloadend = () => {
            resolve(reader.result as BufferSource);
        };

        reader.onerror = reject;

        reader.readAsArrayBuffer(file);
    });
}

export function readFileAsyncAsData(file: File): Promise<string>  {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onloadend = () => {
            resolve(reader.result as string);
        };

        reader.onerror = reject;

        reader.readAsDataURL(file);
    });
}

export function readImageSizeFromDataURI(dataURI: string): Promise<{ dataURI: string, width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
            resolve({ dataURI: dataURI, width: img.naturalWidth, height: img.naturalHeight });
        };

        img.onerror = (error) => {
            reject(new Error("Failed to load image from data URI"));
        };

        img.src = dataURI;
    });
}

export const readFileContent = async (file: File): Promise<string>  => {
    // from https://stackoverflow.com/questions/17068610/read-a-file-synchronously-in-javascript
    const result = await new Promise<string>((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.onload =  (evt) => {
            const text = evt.target?.result;
            if(typeof text === "string"){
                resolve(text);
            }
            else {
                reject("the file content cannot be interpreted as a text file");
            }
        };
        fileReader.readAsText(file, "UTF-8");
    });

    return result;    
};

export const getSHA1HashForObject = async (obj: {[id: string]: any}, useOldLibrary: boolean): Promise<string> => {
    if(useOldLibrary){
        const res = hash(obj);
        return res;
    }
    else{
        // This method has been updated after v1.2.0 by using the browser's native library "crypto",
        // rather than an external package as we did before, because object-hash wasn't handling the
        // hashing of a code containing some emojis/characters outside the Basic Multilingual Plane.
        // Note that the Web Crypto API is supported by browsers' versions now quite old, so use is reliable.
        const encoder = new TextEncoder();
        const data = encoder.encode(JSON.stringify(obj)); // UTF-8 encoding
        const hashBuffer = await crypto.subtle.digest("SHA-1",data);
        return Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    }
};

export function isMacOSPlatform(): boolean {
    // Best approach to evaluate if we are on macOS
    return (navigator.platform.indexOf("Mac") > -1);
}

export const strypeFileExtension = "spy";
export const pythonFileExtension = "py";
// For file names allow only A–Z a–z 0–9 _ - () spaces and unicode characters
export const fileNameRegex = /^[\d\p{L} \-_()]+$/u;

export function getDateTimeFormatted(dt: Date): string {
    // Returned "YYYY-MM-DD_HH-mm-ss" format string representation of a date
    const rawMonthOneIndexedVal = dt.getMonth() + 1;
    const rawDayVal = dt.getDate();
    const rawHoursVal = dt.getHours();
    const rawMinsVal = dt.getMinutes();
    const rawSecsVal = dt.getSeconds();
    return `${dt.getFullYear()}-${((rawMonthOneIndexedVal) < 10) ? "0" + rawMonthOneIndexedVal : rawMonthOneIndexedVal }-${(rawDayVal < 10) ? "0" + rawDayVal : rawDayVal}_${(rawHoursVal < 10) ? "0" + rawHoursVal : rawHoursVal}-${(rawMinsVal < 10) ? "0" + rawMinsVal : rawMinsVal}-${(rawSecsVal < 10) ? "0" + rawSecsVal : rawSecsVal}`;
}

// Given a regex, splits the string into:
//   [part before first match,
//    full text of first match,
//    part between first and second/final match,
//    part after final match]
// For any number of matches.  If no matches, returns a singleton array with the full string.  Never returns empty array.
export function splitByRegexMatches(input: string, regex: RegExp): string[] {
    // Make a global version:
    regex = new RegExp(regex, "g");
    const matches = [...input.matchAll(regex)];

    const result: string[] = [];
    let lastIndex = 0;

    for (const match of matches) {
        // Not sure this can happen, but keep Typescript happy:
        if (match.index === undefined) {
            continue;
        }

        // Add part before the match
        result.push(input.slice(lastIndex, match.index));

        // Add the matched part itself
        result.push(match[0]);

        lastIndex = match.index + match[0].length;
    }

    // Add the remaining part after the last match
    result.push(input.slice(lastIndex));

    return result;
}

// Removes all elements from the array (in-place, i.e. without making a copy of the array) where the given function returns true
export function removeIf<T>(arr: T[], predicate: (item: T, index: number, array: T[]) => boolean): void {
    let i = arr.length;
    while (i--) {
        if (predicate(arr[i], i, arr)) {
            arr.splice(i, 1);
        }
    }
}
