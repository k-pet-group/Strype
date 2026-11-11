// Names that mark functions in the Test code section as special. They are in a module of their own, with no imports, because
// they are used when other modules are first loaded (see hiddenShorthandFrames in editor.ts), which is before storeMethods.ts
// has finished loading, as those two import each other.

// Name prefix that marks a function definition in the Testing section as a test (pytest's convention).
export const testFunctionNamePrefix = "test_";

// Name of the function in the Testing section that is run before each test (see isTestSetupFrame() in storeMethods.ts).
export const testSetupFunctionName = "setup";
