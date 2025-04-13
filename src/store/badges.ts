import { useStore } from "@/store/store";

export const initialBadges = {
    "Hello From Python": {
        points: 10,
        message: "Welcome to Strype! 15 points earned!",
        description: "Running First Python program",
        earned: false,
    },
    "Code Hatchling": {
        points: 5,
        message: "Cracked your first code! 10 points earned!",
        description: "Writing first different program",
        earned: false,
    },
    "Beginner Coder": {
        points: 5,
        message: "Beginner! 10 points earned for 10 lines of Code! Keep going!",
        description: "Writing 10 lines of code",
        earned: false,
    },
    "Conditional Novice": {
        points: 10,
        message: "Conditionally awesome! 10 points!",
        description: "First if-elif-else use",
        earned: false,
    },
    "Call Specialist": {
        points: 10,
        message: "Function success! 10 points!",
        description: "First function with call",
        earned: false,
    },
    "Cycle Sprinter": {
        points: 10,
        message: "You’ve taken your first spin through loops! 10 points!",
        description: "First for & while loop",
        earned: false,
    },
    "Apprentice Scripter": {
        points: 25,
        message: "On your way! 50 points for writing 50 lines of code!",
        description: "Writing 50 lines of code.",
        earned: false,
    },
    "Turtle Tamer": {
        points: 15,
        message: "Turtle magic! 15 points!",
        description: "First turtle program",
        earned: false,
    },
    "Module Maestro": {
        points: 2,
        message: "Module success! 2 points!",
        description: "First import used",
        earned: false,
    },
    "Twist Tactician": {
        points: 50,
        message: "Loop Champion! 50 points!",
        description: "3+ programs with for/while loop & 1+ break/continue",
        earned: false,
    },
    "Control Conqueror": {
        points: 20,
        message: "Full control! 100 points!",
        description: "3+ programs with 5+ commands each",
        earned: false,
    },
    "Logic Legend": {
        points: 50,
        message: "Function mastery! 50 points!",
        description: "5+ functions created",
        earned: false,
    },
    "Loopomancer": {
        points: 80,
        message: "Loop Champion! 80 points!",
        description: "5+ programs with for-while loop & 1+ nested loop",
        earned: false,
    },
    "Century Coder": {
        points: 50,
        message: "100 lines! Century achieved! 100 points!",
        description: "100 lines milestone",
        earned: false,
    },
    "Code Marathoner": {
        points: 150,
        message: "150 lines! Keep running!",
        description: "150 lines of code",
        earned: false,
    },
    "Syntax Mastermind": {
        points: 50,
        message: "Command Master! 100 points!",
        description: "10+ programs with 5+ commands each",
        earned: false,
    },
    "Code Explorer": {
        points: 25,
        message: "Code Explorer! 25 points!",
        description: "exploring 5+ libraries",
        earned: false,
    },
    "Exception Expert": {
        points: 8,
        message: "Handled with care! 8 points!",
        description: "First exception handled",
        earned: false,
    },
    "Python Legend": {
        points: 50,
        message: "Legend status! 50 points! Welcome to the hall of fame!",
        description: "Used core Python commands",
        earned: false,
    },
    "Python Master Snake": {
        points: 75,
        message: "You’ve earned 20 points and the Python Master Snake badge! 25 lines of Python power!",
        description: "25+ lines, key commands",
        earned: false,
    },
    "Recursive Ranger": {
        points: 20,
        message: "Recursion mastered! 20 points!",
        description: "First recursive function",
        earned: false,
    },
    "Data Wrangler": {
        points: 15,
        message: "Data tamed! 15 points!",
        description: "Used 5+ data structures",
        earned: false,
    },
    "Data Architect": {
        points: 20,
        message: "Data Alchemist mastery! 20 points!",
        description: "Used 2+ complex data structures",
        earned: false,
    },
    "Operator Overlord": {
        points: 20,
        message: "Operators in your finger tip! 20 points!",
        description: "70% of Operators used",
        earned: false,
    },
    "OOP Wizard": {
        points: 50,
        message: "OOP mastery! 50 points!",
        description: "Mastered OOP concepts",
        earned: false,
    },
    "Debugging Dynamo": {
        points: 25,
        message: "Persistence pays off! You've earned 25 points for fixing bugs 25+ times!",
        description: "Fixed bugs 25+ times",
        earned: false,
    },
    "Python Expert": {
        points: 200,
        message: "Python mastery unlocked! 200 points!",
        description: "All major badges earned",
        earned: false,
    },
    "Python Guru": {
        points: 100,
        message: "Guru status achieved! 100 points!",
        description: "All badges earned",
        earned: false,
    },
    "Coding Streak": {
        points: 25,
        message: "Coding Streak earned! 25 points!",
        description: "Coded for 7 days in a row",
        earned: false,
    },
    "Weekend Coder": {
        points: 30,
        message: "Weekend well used! 30 points!",
        description: "Coded every weekend for a month",
        earned: false,
    },
};

export const initialTrackingData = {
    userProgress: {
        status: "Python Beginner",
        level:1,
        badgeCount: 0,
        currentBadge: "",
    },
    userCode: "",
    algorithms:{
        nestedLoopCount: 0,
        functionWithCallCount: 0,
        functionsWithCall: new Set<string>(),
        programsWithMultipleCommands: 0,
        modulesImported: new Set<string>(),
        debuggingCount: 0,
        errorEncountered: false,
    },
    dataStructuresUsed: {
        "string":0,
        "list":0,
        "set":0,
        "tuple":0,
        "dictionary":0,
        "array":0,
        "list-inside-dictionary":0,
        "nested-list":0,
        "list-comprehension":0,
    },
    oopProgress: {
        classWithMethod: false,
        initUsed: false,
        objectUsed: false,
        inheritanceUsed: false,
        staticUsed: false,
        methodCallUsed: false,
    },
    codingStreakTracker: {
        longestStreak : 1,
        lastCodingDay : 0,
        continuousDays: 0,
        streakCount: 0,
        weekendsCoded: 0,
        currentMonth: new Date().getMonth(),
        codedWeekends: new Set(),
    },
};

export const trackLinesOfCode = {
    10: {points: 5, coded: 0, badgeName: "Beginner Coder"},
    25: {points: 20, coded: 0, badgeName: ""},
    50: {points: 25, coded: 0, badgeName: "Apprentice Scripter"},
    100: {points: 50, coded: 0, badgeName: "Century Coder"},
    150: {points: 50, coded: 0, badgeName: "Code Marathoner"},
};

export const trackOperators = {
    "=" : {used: false, points: 2},
    "and" : {used: false, points: 2},
    "or" : {used: false, points: 2},
    "not" : {used: false, points: 2},
    "+" : {used: false, points: 1},
    "-" : {used: false, points: 1},
    "*" : {used: false, points: 1},
    "/" : {used: false, points: 1},
    "%" : {used: false, points: 1},
    "==" :{used: false, points: 2},
    "!=" : {used: false, points: 2},
    "<=" : {used: false, points: 2},
    ">=" : {used: false, points: 2},
    "<" : {used: false, points: 2},
    ">" : {used: false, points: 2},
    "in" : {used: false, points: 2},
    "is" : {used: false, points: 2},
};

export const trackCommands = {
    "#" : {count: 0, points: 2},
    "import": {count:0, points: 5},
    "from": {count:0, points: 2},
    "def" : {count: 0, points: 5},
    "return": {count: 0, points: 5},
    "global":{count: 0, points: 2},
    "nonlocal":{count: 0, points: 2},
    "local":{count: 0, points: 2},
    "print" : {count: 0, points: 2},
    "if" : {count: 0, points: 5},
    "elif" : {count: 0, points: 5},
    "else" : {count: 0, points: 10},
    "for" : {count: 0, points: 10},
    "break": {count: 0, points: 2},
    "continue":{count: 0, points: 2},
    "pass" : {count: 0, points: 2},
    "yield" : {count: 0, points: 2},
    "while" : {count: 0, points: 10},
    "try" : {count: 0, points: 10},
    "raise" : {count: 0, points: 5},
    "with" : {count: 0, points: 5},
    "except" : {count: 0, points: 2},
    "class" : {count: 0, points: 2},
    "lambda" : {count: 0, points: 5},
    "zip" : {count: 0, points: 2},
    "enumerate" : {count: 0, points: 2},
    "map" : {count: 0, points: 2},
    "len": {count: 0, points: 5},
    "del" : {count: 0, points: 2},
    "input": {count: 0, points: 5},
    "open" : {count: 0, points: 2},
    "match" : {count: 0, points: 2},
    "case" : {count: 0, points: 2},
    "async" : {count: 0, points: 2},
    "await" : {count: 0, points: 2},
};

export function detectNestedLoops(code: string): boolean {
    const lines = code.split("\n");
    const loopStack: { indent: number; type: "for" | "while" }[] = [];
    const indentRegex = /^(\s*)/;
    
    for (const line of lines) {
        const trimmed = line.trim();
        const indentMatch = line.match(indentRegex);
        const indent = indentMatch ? indentMatch[1].length : 0;
    
        // Clean stack: remove loops that are no longer in scope
        while (loopStack.length && indent <= loopStack[loopStack.length - 1].indent) {
            loopStack.pop();
        }
        // Check for a loop statement
        if (trimmed.startsWith("for ") || trimmed.startsWith("while ")) {
            // If there's already a loop on the stack, it's a nested loop
            if (loopStack.length > 0) {
                return true;
            }
            // Add this loop to the stack
            loopStack.push({
                indent,
                type: trimmed.startsWith("for ") ? "for" : "while",
            });
        }
    }
    return false;
}

export function detectFunctionWithCalls(code: string): boolean {
    const lines = code.split("\n");
    let functionName = "";
    let insideFunction = false;
    const indentRegex = /^\s+/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Detect function definition
        const match = line.match(/^def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
        if (match) {
            functionName = match[1];
            insideFunction = true;
            continue;
        }
        // If we're inside the function, check for function body
        if (insideFunction) {
            const rawLine = lines[i];
            // Stop scanning if the indentation level drops (i.e., function ends)
            const indent = rawLine.match(indentRegex);
            if (!indent) {
                insideFunction = false;
            }
            continue;
        }
        // If we're outside the function, check if the function is called
        if (line.includes(functionName + "(")) {
            const store = useStore();
            if (!(store.trackingData.algorithms.functionsWithCall instanceof Set)) {
                store.trackingData.algorithms.functionsWithCall = new Set<string>();
            }
            store.trackingData.algorithms.functionsWithCall.add(functionName);
            return true;
        }
    }
    return false;
}

export function detectRecursion(code: string): boolean {
    const lines = code.split("\n");
    let functionName = "";
    let insideFunction = false;
    const indentRegex = /^\s+/;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
    
        // Detect function definition
        const match = line.match(/^def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
        if (match) {
            functionName = match[1];
            insideFunction = true;
            continue;
        }
        // If we're inside the function, check for recursive call
        if (insideFunction) {
            const rawLine = lines[i];
            if (rawLine.includes(functionName + "(")) {
                const indent = rawLine.match(indentRegex);
                if (indent) {
                    return true;
                }
            }
            // Stop scanning if the indentation level drops i.e., function ends
            if (!rawLine.match(indentRegex)) {
                insideFunction = false;
            }
        }
    }
    return false;
}

export function detectModules(code: string): number {
    const lines = code.split("\n");
    const importRegex = /^\s*(import|from)\s+([a-zA-Z0-9_]+)/;
    const store = useStore();
    for (const line of lines) {
        const match = line.match(importRegex);
        if (match) {
            const moduleName = match[2];
            if (!(store.trackingData.algorithms.modulesImported instanceof Set)) {
                store.trackingData.algorithms.modulesImported = new Set<string>();
            }
            store.trackingData.algorithms.modulesImported.add(moduleName);
        }
    }
    return store.trackingData.algorithms.modulesImported.size;
}