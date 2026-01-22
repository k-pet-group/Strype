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
    cy.get("#frame_id_-3", {timeout: 15 * 1000}).focus();
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
    enterAndExecuteCode(functions, main, 5000);

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

function enterAndExecuteCode(functions: string, main: string, timeToWaitMillis = 2000) {
    cy.get("body").type("{uparrow}{uparrow}");
    (cy.get("body") as any).paste("from strype.graphics import *\nfrom time import sleep\nimport math\n");
    cy.wait(1000);
    cy.get("body").type("{downarrow}");
    (cy.get("body") as any).paste(functions);
    cy.wait(1000);
    cy.get("body").type("{downarrow}");
    (cy.get("body") as any).paste(main);
    cy.wait(1000);
    cy.contains("a", "Graphics").click();
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
        runCodeAndCheckImage("", "print('Hello')\n", "graphics-blank");
    });
    it("Basic cat", () => {
        runCodeAndCheckImage("", "Actor('cat-test.jpg')\nsleep(1)\n", "graphics-just-cat");
    });
    it("Basic cat rotated +45", () => {
        runCodeAndCheckImage("", "cat = Actor('cat-test.jpg')\ncat.set_rotation(45)\nsleep(1)\n", "graphics-just-cat-rotated-45");
    });
    it("Basic cat rotated +45 and moved forward", () => {
        runCodeAndCheckImage("", "cat = Actor('cat-test.jpg')\ncat.turn(45)\ncat.move(100)\nsleep(1)\n", "graphics-cat-turn-45-and-move");
    });
    it("Basic cat rotated -60", () => {
        runCodeAndCheckImage("", "cat = Actor('cat-test.jpg')\ncat.set_rotation(-60)\nsleep(1)\n", "graphics-just-cat-rotated-minus-60");
    });
    it("BlueJ icon fetched via full URL", () => {
        runCodeAndCheckImage("", `
            white_rect = Image(800, 600)
            white_rect.set_fill("white")
            white_rect.fill()
            white = Actor(white_rect)
            bluej = Actor('https://bluej.org/bluej-icon-256-2x.png')
            sleep(1)
            `, "graphics-bluej-full-url");
    });
    it("BlueJ icon fetched via unqualified URL", () => {
        runCodeAndCheckImage("", `
            white_rect = Image(800, 600)
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

describe("Image manipulation", () => {
    if (Cypress.env("mode") == "microbit") {
        // Graphics tests can't run in microbit
        return;
    }
    it("Setting pixels using string colors", () => {
        runCodeAndCheckImage("", `
            img = Image(100, 100)
            img.set_fill("white")
            img.fill()
            for x in range(100):
                for y in range(100):
                    if x + y < 50:
                        img.set_pixel(x, y, "red")
                    elif x + y < 100:
                        img.set_pixel(x, y, "#fFffFF80")
                    elif x + y < 150:
                        img.set_pixel(x, y, "#0080FF")
                    else:
                        img.set_pixel(x, y, "YELLOW")
            a = Actor(img.clone(6))
        `, "image-set-pixel-string-colors");
    });
    it("Draws circles", () => {
        runCodeAndCheckImage("", `
            img = Image(800, 600)
            img.set_fill("white")
            img.set_stroke("red")
            img.draw_circle(200,200,150)
            img.set_fill(None)
            img.set_stroke("#ff00ff")
            img.draw_circle(300, 500, 300)
            img.set_fill("LIMEGREEN")
            img.set_stroke(None)
            img.draw_circle(600, 200, 100)
            
            Actor(img)
        `, "image-draw-circles");
    });

    it("Draws polygons", () => {
        runCodeAndCheckImage("", `
            img = Image(800, 600)
            img.set_fill("white")
            img.set_stroke("red")
            img.draw_polygon([(100, 100), (400, 300), (100, 300)])
            img.set_stroke(None)
            img.set_fill("#ffff00")
            points = []
            for p in range(5):
                points = points + [(500 + 200*math.cos(math.radians(p * 360 / 5)), 300 + 200*math.sin(math.radians(p * 360 / 5)))] 
            img.draw_polygon(points)
            
            Actor(img)
        `, "image-draw-polygons");
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
            white_square = Image(20, 20)
            white_square.set_fill("white")
            white_square.fill()
            squares = []
            spacing = 50
            for y in range(-300//spacing, 300//spacing):
                for x in range(-400//spacing, 400//spacing):
                    squares.append(Actor(white_square.clone(), x*spacing, y*spacing))
            for sq in cat.get_all_touching():
                sq.get_image().set_fill("red")
                sq.get_image().fill()
            `, "graphics-colliding-squares-cat-60");
    });
    it("Collisions with cat rotated +60, and saying squares", () => {
        // We make a grid of white squares every 50 pixels that are 20x20
        // Then we find all the colliding ones and colour them red
        // We make them all do a say, to make sure that doesn't cause issues
        runCodeAndCheckImage("", `
            cat = Actor('cat-test.jpg')
            cat.set_rotation(60)
            white_square = Image(20, 20)
            white_square.set_fill("white")
            white_square.fill()
            squares = []
            spacing = 50
            for y in range(-300//spacing, 300//spacing):
                for x in range(-400//spacing, 400//spacing):
                    sq = Actor(white_square.clone(), x*spacing, y*spacing, "square")
                    sq.say(str(x) + ", " + str(y), 12)
                    squares.append(sq)
            cat.say("Look out!", 10)
            for sq in cat.get_all_touching("square"):
                sq.get_image().set_fill("red")
                sq.get_image().fill()
            `, "graphics-colliding-squares-cat-60-saying");
    });
    it("Collisions with cat rotated -75 based on tag", () => {
        // We make a grid of white squares every 50 pixels that are 20x20
        // We turn off collisions on everything, turn it back on but only on every other square
        // Then we find all the colliding ones and colour them red
        runCodeAndCheckImage("", `
            cat = Actor('cat-test.jpg')
            cat.set_rotation(-75)
            white_square = Image(20, 20)
            white_square.set_fill("white")
            white_square.fill()
            squares = []
            spacing = 50
            collide = True
            for y in range(-300//spacing, 300//spacing):
                for x in range(-400//spacing, 400//spacing):
                    if collide:
                        tag = "collidable"
                    else:
                        tag = None
                    collide = not collide
                    squares.append(Actor(white_square.clone(), x*spacing, y*spacing, tag))
            for sq in cat.get_all_touching("collidable"):
                sq.get_image().set_fill("red")
                sq.get_image().fill()
            `, "graphics-colliding-every-other-square-cat-minus-75");
    });
    it("Collisions before/after changing to smaller image", () => {
        // We make a grid of white squares every 50 pixels that are 20x20
        // We turn off collisions on everything, turn it back on but only on every other square
        // Then we find all the colliding ones and colour them red
        runCodeAndCheckImage("", `
            cat = Actor('cat-test.jpg')
            cat.set_rotation(-75)
            white_square = Image(20, 20)
            white_square.set_fill("white")
            white_square.fill()
            squares = []
            spacing = 50
            cat.set_image('mouse-test.jpg')
            for y in range(-300//spacing, 300//spacing):
                for x in range(-400//spacing, 400//spacing):
                    squares.append(Actor(white_square.clone(), x*spacing, y*spacing))
            for sq in cat.get_all_touching():
                sq.get_image().set_fill("red")
                sq.get_image().fill()
            `, "graphics-colliding-cat-turned-to-mouse");
    });
    it("Collisions before/after changing to larger image", () => {
        // We make a grid of white squares every 50 pixels that are 20x20
        // We turn off collisions on everything, turn it back on but only on every other square
        // Then we find all the colliding ones and colour them red
        runCodeAndCheckImage("", `
            cat = Actor('mouse-test.jpg')
            cat.set_rotation(-75)
            white_square = Image(20, 20)
            white_square.set_fill("white")
            white_square.fill()
            squares = []
            spacing = 50
            cat.set_image('cat-test.jpg')
            for y in range(-300//spacing, 300//spacing):
                for x in range(-400//spacing, 400//spacing):
                    squares.append(Actor(white_square.clone(), x*spacing, y*spacing))
            for sq in cat.get_all_touching():
                sq.get_image().set_fill("red")
                sq.get_image().fill()
            `, "graphics-colliding-mouse-turned-to-cat");
    });
    
    it("Collisions in a radius", () => {
        // We make a grid of white squares every 50 pixels that are 20x20
        // Then we find all the colliding ones in a radius and colour them red
        runCodeAndCheckImage("", `
            circle_guide = Image(800, 600)
            circle_guide.set_fill("black")
            circle_guide.fill()
            circle_guide.set_stroke(None)
            circle_guide.set_fill("#555555")
            circle_guide.draw_circle(400, 300, 200)
            set_background(circle_guide)
            cat = Actor(load_image('cat-test.jpg').clone(0.2))
            white_square = Image(20, 20)
            white_square.set_fill("white")
            white_square.fill()
            squares = []
            spacing = 50
            for y in range(-300//spacing, 300//spacing):
                for x in range(-400//spacing, 400//spacing):
                    squares.append(Actor(white_square.clone(), x*spacing, y*spacing))
            for sq in cat.get_in_range(200):
                sq.get_image().set_fill("red")
                sq.get_image().fill()
            `, "graphics-colliding-radius");
    });
    
    // Not a collision, but similar method:
    it("Allows getting all actors", () => {
        // We make a grid of white squares every 50 pixels that are 20x20
        // Then we find all the colliding ones in a radius and colour them red
        runCodeAndCheckImage("", `
            circle_guide = Image(800, 600)
            circle_guide.set_fill("black")
            circle_guide.fill()
            circle_guide.set_stroke(None)
            circle_guide.set_fill("#555555")
            circle_guide.draw_circle(400, 300, 200)
            set_background(circle_guide)
            white_square = Image(20, 20)
            white_square.set_fill("white")
            white_square.fill()
            squares = []
            spacing = 50
            alternating = False
            for y in range(-300//spacing, 300//spacing):
                for x in range(-400//spacing, 400//spacing):
                    if alternating:
                        tag = "alternating"
                    else:
                        tag = None
                    alternating = not alternating
                    squares.append(Actor(white_square.clone(), x*spacing, y*spacing, tag))
            # All of them get rotated:
            for sq in get_actors():
                sq.turn(45);
            # Just the alternating ones turn red:
            for sq in get_actors("alternating"):
                sq.get_image().set_fill("red")
                sq.get_image().fill()
            `, "graphics-get-actors");
    });

    it("Gets objects at position with two choices", () => {
        // We make a grid of white squares every 50 pixels that are 20x20
        // Then we find all the colliding ones in a radius and colour them red
        runCodeAndCheckImage("", `
            white_square = Image(20, 20)
            white_square.set_fill("white")
            white_square.fill()
            yellow_square = Image(50, 50)
            yellow_square.set_fill("yellow")
            yellow_square.fill()
            white_spacing = 40
            yellow_spacing = 50
            for y in range(-300//yellow_spacing, 300//yellow_spacing):
                for x in range(-400//yellow_spacing, 400//yellow_spacing):
                    Actor(yellow_square.clone(), x*yellow_spacing, y*yellow_spacing)
            for y in range(-300//white_spacing, 300//white_spacing):
                for x in range(-400//white_spacing, 400//white_spacing):
                    Actor(white_square.clone(), x*white_spacing, y*white_spacing)
            img = get_actor_at(0, 0).get_image()
            img.set_fill("red")
            img.fill()
            `, "graphics-get-at-two");
    });

    it("Gets objects at position with one choice", () => {
        // We make a grid of white squares every 50 pixels that are 20x20
        // Then we find all the colliding ones in a radius and colour them red
        runCodeAndCheckImage("", `
            white_square = Image(20, 20)
            white_square.set_fill("white")
            white_square.fill()
            yellow_square = Image(50, 50)
            yellow_square.set_fill("yellow")
            yellow_square.fill()
            white_spacing = 40
            yellow_spacing = 50
            for y in range(-300//yellow_spacing, 300//yellow_spacing):
                for x in range(-400//yellow_spacing, 400//yellow_spacing):
                    Actor(yellow_square.clone(), x*yellow_spacing, y*yellow_spacing)
            for y in range(-300//white_spacing, 300//white_spacing):
                for x in range(-400//white_spacing, 400//white_spacing):
                    Actor(white_square.clone(), x*white_spacing, y*white_spacing)
            img = get_actor_at(20, 0).get_image()
            img.set_fill("red")
            img.fill()
            `, "graphics-get-at-one");
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
            cat.get_image().download()`, "strype-image", "download-plain-cat");
    });

    it("Downloads cat with coloured cross", () => {
        checkImageViaDownload("", `
            cat = load_image('cat-test.jpg')
            cat.set_stroke("red")
            cat.draw_line(0, 0, cat.get_width(), cat.get_height())
            cat.set_stroke("blue")
            cat.draw_line(cat.get_width(), 0, 0, cat.get_height())
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
            a = Image(10, 10)
            b = Image(10, 10)
            c = Image(10, 10)
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
            white_rect = Image(100, 100)
            white_rect.set_fill("white")
            white_rect.fill()
            top_left = Actor(white_rect)
            top_left.set_location(-500, 500)
            red_rect = Image(100, 100)
            red_rect.set_fill("red")
            red_rect.fill()
            top_right = Actor(red_rect)
            top_right.set_location(1000, 500)
            blue_rect = Image(100, 100)
            blue_rect.set_fill("blue")
            blue_rect.fill()
            bottom_right = Actor(blue_rect)
            bottom_right.set_location(800, -600)
            green_rect = Image(100, 100)
            green_rect.set_fill("green")
            green_rect.fill()
            bottom_left = Actor(green_rect)
            bottom_left.set_location(-1500, -1500)
            yellow_rect = Image(50, 50)
            yellow_rect.set_fill("yellow")
            yellow_rect.fill()
            # We scale so that the diagonal will be 50 in total:
            mover = Actor(yellow_rect.clone(1/math.sqrt(2)))
            mover.set_rotation(45)
            # We want to move to 325, 325
            # It should complete the X move (and thus touch red: 325 + 25 either side) but be constrained in Y dimension: 
            mover.move(325 * math.sqrt(2))
            sleep(1)
            `, "bounds-corners");
    });

    it("Registers is_at_edge correctly", () => {
        runCodeAndCheckImage("", `
            for i in range(0, 360):
                img = Image(10, 10)
                img.set_fill("white")
                img.fill()
                a = Actor(img)
                a.turn(i)
                a.move(410)
                if a.is_at_edge():
                    img.set_fill("red")
                    img.fill()
            sleep(1)
            `, "bounds-is-at-edge");
    });

    it("Registers not is_at_edge correctly", () => {
        runCodeAndCheckImage("", `
            for i in range(0, 360):
                img = Image(10, 10)
                img.set_fill("white")
                img.fill()
                a = Actor(img)
                a.turn(i)
                a.move(410)
                a.turn(180)
                # 3 pixels should take us away from the edge enough:
                a.move(3)
                if a.is_at_edge():
                    img.set_fill("red")
                    img.fill()
            sleep(1)
            `, "bounds-not-is-at-edge");
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
    it("Centres larger backgrounds", () => {
        runCodeAndCheckImage("", `
            big = Image(1000, 1000)
            big.set_fill("white")
            big.set_stroke(None)
            big.draw_circle(500, 500, 450)
            set_background(big)
            Actor("cat-test.jpg")
        `, "background-large-centred");
    });

    it("Stretches smaller backgrounds", () => {
        runCodeAndCheckImage("", `
            set_background("cat-test.jpg", True)
            Actor("cat-test.jpg")
        `, "background-small-scaled");
    });

    it("Stretches larger backgrounds", () => {
        runCodeAndCheckImage("", `
            big = Image(1000, 1000)
            big.set_fill("white")
            big.set_stroke(None)
            big.draw_circle(500, 500, 500)
            set_background(big, True)
            Actor("cat-test.jpg")
        `, "background-large-scaled");
    });
    it("Allows drawing on live background", () => {
        runCodeAndCheckImage("", `
            set_background("red")
            bk = get_background()
            bk.set_fill("yellow")
            bk.draw_circle(bk.get_width()/2, bk.get_height()/2, 250)
            Actor("cat-test.jpg")
            sleep(1)
        `, "background-with-circle-drawn");
    });
});

describe("Saying", () => {
    if (Cypress.env("mode") == "microbit") {
        // Graphics tests can't run in microbit
        return;
    }
    
    it("Says top-right when room", () => {
        runCodeAndCheckImage("", `
            Actor(load_image("cat-test.jpg").clone(0.5)).say("Meow!", 48);
        `, "saying-top-right");
    });
    it("Says top-left when not room top-right", () => {
        runCodeAndCheckImage("", `
            Actor(load_image("cat-test.jpg").clone(0.5), 300).say("Meow!", 48);
        `, "saying-top-left");
    });
});

describe.only("Show text", () => {
    if (Cypress.env("mode") == "microbit") {
        // Graphics tests can't run in microbit
        return;
    }
    it("Shows a line of text", () => {
        runCodeAndCheckImage("", `
            set_background("blue")
            show_text("Game Over!")
        `, "show-text-game-over");
    });
    it("Shows multiple bits of text", () => {
        runCodeAndCheckImage("", `
            set_background("red")
            show_text("Score: 42", -300, -200, 40)
            show_text("Game Over!")
            show_text("Player 1", 300, 200)
        `, "show-text-three-items");
    });

    it("Shows text, toggled back and forth", () => {
        runCodeAndCheckImage("", `
            set_background("red")
            # This should replace (including font size):
            show_text("Score: 42", -300, -200, 20)
            show_text("No score", -300, -200, 50)
            # This should turn off (by the time we round):
            show_text("Game Over!")
            show_text(None, 0.25, -0.25)
            # This should overlap because it's not the same coords after rounding:
            show_text("Player 1", 300.25, 200.25, 30)
            show_text("Anonymous", 300.75, 200, 30)
        `, "show-text-items-toggle");
    });
});
