// eslint-disable-next-line @typescript-eslint/no-var-requires
require("cypress-terminal-report/src/installLogsCollector")();
// eslint-disable-next-line @typescript-eslint/no-var-requires
import {PNG} from "pngjs";
import pixelmatch from "pixelmatch";
import failOnConsoleError from "cypress-fail-on-console-error";
failOnConsoleError();

// Must clear all local storage between tests to reset the state:
beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit("/",  {onBeforeLoad: (win) => {
        win.localStorage.clear();
        win.sessionStorage.clear();
    }});
});

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
Cypress.Commands.add("paste",
    {prevSubject : true},
    ($element, data) => {
        const clipboardData = new DataTransfer();
        clipboardData.setData("text", data);
        const pasteEvent = new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData,
        });

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        cy.get($element).then(() => {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            $element[0].dispatchEvent(pasteEvent);
        });
    });

function focusEditorPasteAndClear(): void {
    // Not totally sure why this hack is necessary, I think it's to give focus into the webpage via an initial click:
    // (on the main code container frame -- would be better to retrieve it properly but the file won't compile if we use Apps.ts and/or the store)
    cy.get("#frame_id_-3").focus();
    // Delete existing content (bit of a hack):
    cy.get("body").type("{uparrow}{uparrow}{uparrow}{del}{downarrow}{downarrow}{downarrow}{downarrow}{backspace}{backspace}");
}

enum ImageComparison {
    COMPARE_TO_EXISTING,
    // If we want to set a new expected image after a change in the code, you can pass
    // this value but you should not commit this because it effectively stops the test
    // from ever being able to fail.  So if you see a committed use of this as a parameter,
    // reject the commit!
    WRITE_NEW_EXPECTED_DO_NOT_COMMIT_USE_OF_THIS
}

// This code uses an image capture of the graphics canvas to check that the Python code
// produces the same output as before, to check for us breaking something. 
//
// There are some cypress plugins which do roughly the same thing.  The problem is that they
// use generic browser screenshotting to capture the content.  It turns out that, at least on Mac,
// browser screenshotting can transform color spaces.  This means that the screenshot taken on Mac
// can be noticeably different than on Linux, which is a problem if (like me) you write a test on Mac
// then try to run again on Linux and compare the output to the Mac output.  For example, rendering
// #ff0000 squares on Mac once screenshotted can become e.g. #ff2300, which is a high enough difference
// to fail the test.
//
// So we write our own which reads the pixel data direct from the graphics canvas, avoiding any
// transformation.  Unfortunately this means we also have to write our own code to save the images etc
function checkImageMatch(expectedImageFileName: string, actual : PNG, comparison: ImageComparison) {
    if (comparison == ImageComparison.COMPARE_TO_EXISTING) {
        cy.readFile(`tests/cypress/expected-screenshots/baseline/${expectedImageFileName}.png`, "base64").then((expectedData) => {
            // load both pictures
            const expected = PNG.sync.read(Buffer.from(expectedData, "base64"));
            cy.writeFile(`tests/cypress/expected-screenshots/comparison/${expectedImageFileName}.png`, PNG.sync.write(actual));

            const {width, height} = expected;
            const diff = new PNG({width, height});

            // calling pixelmatch return how many pixels are different
            const numDiffPixels = pixelmatch(expected.data, actual.data, diff.data, width, height, {threshold: 0.05});

            cy.writeFile(`tests/cypress/expected-screenshots/diff/${expectedImageFileName}.png`, PNG.sync.write(diff));

            // calculating a percent diff
            const diffPercent = (numDiffPixels / (width * height) * 100);

            expect(diffPercent).to.be.below(10);
        });
    }
    else {
        // Just save to expected:
        cy.writeFile(`tests/cypress/expected-screenshots/baseline/${expectedImageFileName}.png`, PNG.sync.write(actual));
    }
}

// but it's not very long:
function checkGraphicsCanvasContent(expectedImageFileName : string, comparison = ImageComparison.COMPARE_TO_EXISTING) {
    cy.get("#pythonGraphicsCanvas").then((canvas) => {
        return (canvas[0] as HTMLCanvasElement).toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
    }).then((actualImageBase64) => {
        const actual = PNG.sync.read(Buffer.from(actualImageBase64, "base64"));
        checkImageMatch(expectedImageFileName, actual, comparison);
    });
}

// This is basically replicating getDateTimeFormatted, in order to test it: 
function formatDate(timestamp: number) {
    const date = new Date(timestamp);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-based
    const day = String(date.getDate()).padStart(2, "0");

    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

function checkImageViaDownload(functions: string, main: string, downloadStem: string, imageFileStem: string, comparison = ImageComparison.COMPARE_TO_EXISTING) {
    focusEditorPasteAndClear();
    // The timestamp should be between before and after:
    const before = Date.now();
    enterAndExecuteCode(functions, main);

    const foundFiles : string[] = [];
    (cy.task("downloads") as Cypress.Chainable<string[]>).then((allFiles: string[]) => {
        // We need the after to be in here because all the prior calls just queue things up like promises,
        // the code will not actually have executed.  But inside a .then(), the code will have
        // executed:
        const after = Date.now();
        expect(allFiles.length).to.be.above(0);

        // Search for the filename one second at a time:
        for (let d = before; d <= after; d += 1000) {
            const filename = `${downloadStem}_${formatDate(d)}.png`;
            if (allFiles.includes(filename)) {
                foundFiles.push(filename);
            }
        }
        
        // Assert that exactly one file was found
        expect(foundFiles.length).to.equal(1);
        return foundFiles[0];
    }).then((downloadFilename) => {
        // Read the downloaded file and compare as image with the expected file:
        cy.readFile("tests/cypress/downloads/" + downloadFilename, "base64")
            .then((actualImageBase64) => {
                const actual = PNG.sync.read(Buffer.from(actualImageBase64, "base64"));
                checkImageMatch(imageFileStem, actual, comparison);
            });
    });
}

function enterAndExecuteCode(functions: string, main: string, timeToWaitMillis = 5000) {
    cy.get("body").type("{uparrow}{uparrow}");
    (cy.get("body") as any).paste("from strype.graphics import *\nfrom time import sleep\nimport math\n");
    cy.wait(2000);
    cy.get("body").type("{downarrow}");
    (cy.get("body") as any).paste(functions);
    cy.wait(3000);
    cy.get("body").type("{downarrow}");
    (cy.get("body") as any).paste(main);
    cy.wait(3000);
    cy.contains("a", "\uD83D\uDC22 Graphics").click();
    cy.get("#runButton").contains("Run");
    cy.get("#runButton").click();
    // Wait for it to finish:
    cy.wait(timeToWaitMillis);
    // Assert it has finished, by looking at the run button:
    cy.get("#runButton").contains("Run");
}

function runCodeAndCheckImage(functions: string, main: string, expectedImageFileName : string, comparison = ImageComparison.COMPARE_TO_EXISTING) : void {
    focusEditorPasteAndClear();
    enterAndExecuteCode(functions, main);
    // Check the image matches expected:
    checkGraphicsCanvasContent(expectedImageFileName, comparison);
}

describe("Basic operation", () => {
    if (Cypress.env("mode") == "microbit") {
        // Graphics tests can't run in microbit
        return;
    }
    it("Blank canvas", () => {
        runCodeAndCheckImage("", "print('Hello')\n", "graphics-blank", ImageComparison.WRITE_NEW_EXPECTED_DO_NOT_COMMIT_USE_OF_THIS);
    });
    it("Basic cat", () => {
        runCodeAndCheckImage("", "Actor('cat-test.jpg')\nsleep(1)\n", "graphics-just-cat");
    });
    it("Basic cat rotated +45", () => {
        runCodeAndCheckImage("", "cat = Actor('cat-test.jpg')\ncat.set_rotation(45)\nsleep(1)\n", "graphics-just-cat-rotated-45");
    });
    it("Basic cat rotated -60", () => {
        runCodeAndCheckImage("", "cat = Actor('cat-test.jpg')\ncat.set_rotation(-60)\nsleep(1)\n", "graphics-just-cat-rotated-minus-60");
    });
    it("BlueJ icon fetched via full URL", () => {
        runCodeAndCheckImage("", `
            white_rect = EditableImage(800, 600)
            white_rect.set_fill("white")
            white_rect.fill()
            white = Actor(white_rect)
            bluej = Actor('https://bluej.org/bluej-icon-256-2x.png')
            sleep(1)
            `, "graphics-bluej-full-url");
    });
    it("BlueJ icon fetched via unqualified URL", () => {
        runCodeAndCheckImage("", `
            white_rect = EditableImage(800, 600)
            white_rect.set_fill("white")
            white_rect.fill()
            white = Actor(white_rect)
            bluej = Actor('bluej.org/bluej-icon-256-2x.png')
            sleep(1)
            `, "graphics-bluej-unqual-url");
    });
    it("Non-existent image address", () => {
        runCodeAndCheckImage("", `
            try:
                non_exist = Actor('https://bluej.org/does-not-exist.png')
            except Exception as e:
                print(e)
                cat = Actor('cat-test.jpg')
                cat.set_rotation(180)
            sleep(1)
            `, "graphics-no-such-image-load-cat-instead");
    });
    it("Stops", () => {
        // Add image, stop then move; we should not see the move:
        runCodeAndCheckImage("", `
            a = Actor("cat-test.jpg")
            a.turn(90)
            stop()
            a.move(100)
        `, "stops");
    });
});

describe("Collision detection", () => {
    if (Cypress.env("mode") == "microbit") {
        // Graphics tests can't run in microbit
        return;
    }
    it("Collisions with cat rotated +60", () => {
        // We make a grid of white squares every 50 pixels that are 20x20
        // Then we find all the colliding ones and colour them red
        runCodeAndCheckImage("", `
            cat = Actor('cat-test.jpg')
            cat.set_rotation(60)
            white_square = EditableImage(20, 20)
            white_square.set_fill("white")
            white_square.fill()
            squares = []
            spacing = 50
            for y in range(-300//spacing, 300//spacing):
                for x in range(-400//spacing, 400//spacing):
                    squares.append(Actor(white_square.make_copy(), x*spacing, y*spacing))
            for sq in cat.get_all_touching():
                sq.edit_image().set_fill("red")
                sq.edit_image().fill()
            `, "graphics-colliding-squares-cat-60");
    });
    it("Collisions with cat rotated -75 after turning collisions off and on", () => {
        // We make a grid of white squares every 50 pixels that are 20x20
        // We turn off collisions on everything, turn it back on but only on every other square
        // Then we find all the colliding ones and colour them red
        runCodeAndCheckImage("", `
            cat = Actor('cat-test.jpg')
            cat.set_rotation(-75)
            cat.set_can_touch(False)
            white_square = EditableImage(20, 20)
            white_square.set_fill("white")
            white_square.fill()
            squares = []
            spacing = 50
            for y in range(-300//spacing, 300//spacing):
                for x in range(-400//spacing, 400//spacing):
                    squares.append(Actor(white_square.make_copy(), x*spacing, y*spacing))
            for sq in squares:
                sq.set_can_touch(False)
            # Now turn collisions back on on cat, and every other square:
            cat.set_can_touch(True)
            for sq in squares[::2]:
                sq.set_can_touch(True)
            for sq in cat.get_all_touching():
                sq.edit_image().set_fill("red")
                sq.edit_image().fill()
            `, "graphics-colliding-every-other-square-cat-minus-75");
    });
});

describe("Image download", () => {
    if (Cypress.env("mode") == "microbit") {
        // Graphics tests can't run in microbit
        return;
    }
    
    it("Downloads plain cat", () => {
        checkImageViaDownload("", `
            cat = Actor('cat-test.jpg')
            cat.edit_image().download()`, "strype-image", "download-plain-cat");
    });

    it("Downloads cat with coloured cross", () => {
        checkImageViaDownload("", `
            cat = load_image('cat-test.jpg')
            cat.set_stroke("red")
            cat.line(0, 0, cat.get_width(), cat.get_height())
            cat.set_stroke("blue")
            cat.line(cat.get_width(), 0, 0, cat.get_height())
            cat.download("cat-crossed")`, "cat-crossed", "download-cat-crossed");
    });
    
    it("Rate limits downloads to one every two seconds", () => {
        // To test this, we write code which tries to download a lot of images very quickly
        // but the timestamps on them should always be at least one second apart:
        focusEditorPasteAndClear();
        // The timestamp should be between before and after:
        const before = Date.now();
        enterAndExecuteCode("", `
            # Make small images to make saving very fast:
            a = EditableImage(10, 10)
            b = EditableImage(10, 10)
            c = EditableImage(10, 10)
            a.download()
            a.download()
            a.download()
            b.download()
            c.download()
            a.download()
            b.download()
            c.download()
            c.download()
        `, 9 * 2000 + 5000);
        (cy.task("downloads") as Cypress.Chainable<string[]>).then((allFiles: string[]) => {
            // We need the after to be in here because all the prior calls just queue things up like promises,
            // the code will not actually have executed.  But inside a .then(), the code will have
            // executed:
            const after = Date.now();
            expect(allFiles.length).to.be.at.least(9);
            // Must have taken at least this long given it was rate limited:
            expect(after - before).to.be.above(9 * 2000);
            
            // If there is a file for a particular timestamp, there should not be another one 
            // one second later:
            let inRangeCount = 0;
            // Search for the filenames one second at a time:
            for (let d = before; d <= after; d += 1000) {
                const filename = `strype-image_${formatDate(d)}.png`;
                if (allFiles.includes(filename)) {
                    inRangeCount += 1;
                    // Shouldn't contain an image saved one second later:
                    expect(allFiles).not.contains(`strype-image_${formatDate(d + 1000)}.png`);
                }
            }
            
            // Check they were all found in the time range:
            expect(inRangeCount).to.equal(9);
        });
    });
});

describe("World bounds", () => {
    if (Cypress.env("mode") == "microbit") {
        // Graphics tests can't run in microbit
        return;
    }
    it("Cannot set location or move outside corners", () => {
        runCodeAndCheckImage("", `
            white_rect = EditableImage(100, 100)
            white_rect.set_fill("white")
            white_rect.fill()
            top_left = Actor(white_rect)
            top_left.set_location(-500, 500)
            red_rect = EditableImage(100, 100)
            red_rect.set_fill("red")
            red_rect.fill()
            top_right = Actor(red_rect)
            top_right.set_location(1000, 500)
            blue_rect = EditableImage(100, 100)
            blue_rect.set_fill("blue")
            blue_rect.fill()
            bottom_right = Actor(blue_rect)
            bottom_right.set_location(800, -600)
            green_rect = EditableImage(100, 100)
            green_rect.set_fill("green")
            green_rect.fill()
            bottom_left = Actor(green_rect)
            bottom_left.set_location(-1500, -1500)
            yellow_rect = EditableImage(50, 50)
            yellow_rect.set_fill("yellow")
            yellow_rect.fill()
            mover = Actor(yellow_rect)
            # We scale so that the diagonal will be 50 in total:
            mover.set_scale(1/math.sqrt(2))
            mover.set_rotation(45)
            # We want to move to 325, 325
            # It should complete the X move (and thus touch red: 325 + 25 either side) but be constrained in Y dimension: 
            mover.move(325 * math.sqrt(2))
            sleep(1)
            `, "bounds-corners");
    });
});

describe("World background", () => {
    if (Cypress.env("mode") == "microbit") {
        // Graphics tests can't run in microbit
        return;
    }
    it("Tiles smaller backgrounds 1", () => {
        runCodeAndCheckImage("", `
            set_background("cat-test.jpg")
            Actor("mouse-test.jpg")
            sleep(1)
        `, "background-tiled-1");
    });
    it("Tiles smaller backgrounds 2", () => {
        runCodeAndCheckImage("", `
            set_background(load_image("mouse-test.jpg"))
            Actor("cat-test.jpg")
            sleep(1)
        `, "background-tiled-2");
    });
    it("Accepts colour background", () => {
        runCodeAndCheckImage("", `
            set_background("red")
            Actor("cat-test.jpg")
            sleep(1)
        `, "background-colour");
    });
});
