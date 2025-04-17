// import { useStore } from "@/store/store";
// import { expect } from "chai";

// describe("Award Badge Functionality", () => {
//     it("awards points for the badge", () => {
//         // Mock store
//         const mockStore = {
//             currentPoints: 0,
//             badges: {
//                 "Hello From Python": { points: 5, earned: false },
//             },
//         };

//         // Mock useStore function
//         const useStore = () => mockStore;

//         // App logic
//         const app = {
//             awardBadge(badgeName: string) {
//                 const store = mockStore;
//                 store.currentPoints += store.badges[badgeName as string].points;
//                 store.badges[badgeName].earned = true;
//             },
//         };

//         // Test logic
//         app.awardBadge("Hello From Python");
//         expect(mockStore.currentPoints).to.equal(5); // Chai matcher
//         expect(mockStore.badges["Hello From Python"].earned).to.be.true; // Chai matcher
//     });
// });

// require("cypress-terminal-report/src/installLogsCollector")();
// import "@testing-library/cypress/add-commands";
// import failOnConsoleError from "cypress-fail-on-console-error";
// chai.use(require("chai-sorted"));
// failOnConsoleError();


// interface App {
//     currentPoints: number;
//     badges: Record<string, { points: number; earned: boolean }>;
//     trackingData: {
//         userProgress: {
//             currentBadge: string | null;
//             badgeCount: number;
//         };
//     };
//     badgeBannerVisible: boolean;
//     awardBadge: (badgeName: string) => void;
// }


// describe("Award Badge Functionality", () => {
//     let app: App;

//     beforeEach(() => {
//         // Mock application state
//         app = {
//             currentPoints: 0,
//             badges: {
//                 HelloFromPython: { points: 5, earned: false },
//             },
//             trackingData: {
//                 userProgress: {
//                     currentBadge: null,
//                     badgeCount: 0,
//                 },
//             },
//             badgeBannerVisible: false,
//             awardBadge: function (badgeName: string) {
//                 this.currentPoints += this.badges[badgeName].points;
//                 this.trackingData.userProgress.currentBadge = badgeName;
//                 this.trackingData.userProgress.badgeCount++;
//                 this.badges[badgeName].earned = true;
//                 this.badgeBannerVisible = true;
//                 setTimeout(() => {
//                     this.badgeBannerVisible = false;
//                 }, 7000);
//             },
//         };
//     });

//     it("awards points for the badge", () => {
//         app.awardBadge("HelloFromPython");
//         expect(app.currentPoints).toBe(5);
//     });

//     it("updates tracking data", () => {
//         app.awardBadge("HelloFromPython");
//         expect(app.trackingData.userProgress.currentBadge).toBe("HelloFromPython");
//         expect(app.trackingData.userProgress.badgeCount).toBe(1);
//     });

//     it("marks the badge as earned", () => {
//         app.awardBadge("HelloFromPython");
//         expect(app.badges.HelloFromPython.earned).toBe(true);
//     });

//     it("displays the badge banner", () => {
//         jest.useFakeTimers(); // Mock timers
//         app.awardBadge("HelloFromPython");
//         expect(app.badgeBannerVisible).toBe(true);
//         jest.advanceTimersByTime(7000); // Fast forward 7 seconds
//         expect(app.badgeBannerVisible).toBe(false);
//     });
// });

// describe("Award Badges Functionality", () => {
//     beforeEach(() => {
//         // Ensure local storage is cleared and the app starts fresh for each test
//         cy.clearLocalStorage();
//         cy.visit("/", {
//             onBeforeLoad: (win) => {
//                 win.localStorage.clear();
//                 win.sessionStorage.clear();
//                 // Ensure isFirstExecutionDone is reset to false
//                 win.localStorage.setItem("isFirstExecutionDone", "false");
//             },
//         });
//     });

//     function resetStateAndAwardBadge(userCode: string, badgeName: string, points: number) {
//         cy.log("Resetting state and checking badge awarding...");
//         // Ensure the editor is initialized
//         cy.get("#editor").should("be.visible");
//         cy.get("#editor [contenteditable]")
//           .should("exist")
//           .focus() // Ensure the editor is focused
//           .type(userCode, { force: true }); // Type the user code
    
//         // Simulate clicking the "Run Code" button
//         cy.get("button#runCode").click();
    
//         // Validate that the badge has been awarded
//         cy.get(`#badge-${badgeName}`).should("exist");
//         cy.get(`#badge-${badgeName}.earned`).should("have.text", "Earned");
//         cy.get("#currentPoints").should("have.text", `${points}`);
//     }

//     it("Awards the 'Hello From Python' badge for the first execution", () => {
//         const userCode = "print('Hello From Python')";
//         const badgeName = "HelloFromPython";
//         const badgePoints = 5; // Adjust the points based on your app's logic

//         // Ensure isFirstExecutionDone is false before the test
//         cy.window().then((win) => {
//             expect(win.localStorage.getItem("isFirstExecutionDone")).to.equal("false");
//         });

//         // Award the "Hello From Python" badge
//         resetStateAndAwardBadge(userCode, badgeName, badgePoints);

//         // Ensure isFirstExecutionDone is set to true after the first execution
//         cy.window().then((win) => {
//             expect(win.localStorage.getItem("isFirstExecutionDone")).to.equal("true");
//         });
//     });

//     it("Awards the 'Code Hatchling' badge for executing a different program", () => {
//         const firstCode = "print('Hello From Python')";
//         const userCode = "print('Unique Program!')";
//         const badgeName = "CodeHatchling";
//         const badgePoints = 10; // Adjust the points based on your app's logic

//         // Simulate the first execution
//         cy.get("#editor [contenteditable]").type(firstCode);
//         cy.get("button#runCode").click();

//         // Ensure the first program is stored
//         cy.window().then((win) => {
//             expect(win.localStorage.getItem("firstExecutedProgram")).to.equal(firstCode);
//         });

//         // Award the "Code Hatchling" badge for a different program
//         resetStateAndAwardBadge(userCode, badgeName, badgePoints);
//     });

//     it("Does not award the 'Code Hatchling' badge for executing the same program", () => {
//         const firstCode = "print('Hello From Python')";
//         const badgeName = "CodeHatchling";

//         // Simulate the first execution
//         cy.get("#editor [contenteditable]").type(firstCode);
//         cy.get("button#runCode").click();

//         // Attempt to execute the same program again
//         cy.get("#editor [contenteditable]").type(firstCode);
//         cy.get("button#runCode").click();

//         // Validate that the "Code Hatchling" badge is not awarded
//         cy.get(`#badge-${badgeName}`).should("not.exist");
//     });

//     it("Awards multiple badges in sequence", () => {
//         const firstCode = "print('Hello From Python')";
//         const secondCode = "print('Unique Program!')";
//         const badgeName1 = "HelloFromPython";
//         const badgeName2 = "CodeHatchling";
//         const badgePoints1 = 5;
//         const badgePoints2 = 10;

//         // Award the "Hello From Python" badge
//         resetStateAndAwardBadge(firstCode, badgeName1, badgePoints1);

//         // Award the "Code Hatchling" badge for a different program
//         resetStateAndAwardBadge(secondCode, badgeName2, badgePoints1 + badgePoints2);
//     });

//     it("Resets badges and points correctly after a reset", () => {
//         const userCode = "print('Hello From Python')";
//         const badgeName = "HelloFromPython";
//         const badgePoints = 5;

//         // Award the badge
//         cy.get("#editor [contenteditable]").type(userCode);
//         cy.get("button#runCode").click();
//         cy.get(`#badge-${badgeName}`).should("exist");
//         cy.get("#currentPoints").should("have.text", `${badgePoints}`);

//         // Reset the app state
//         cy.get("button#resetApp").click();

//         // Validate that badges and points are reset
//         cy.get(`#badge-${badgeName}`).should("not.exist");
//         cy.get("#currentPoints").should("have.text", "0");
//         cy.window().then((win) => {
//             expect(win.localStorage.getItem("isFirstExecutionDone")).to.equal("false");
//         });
//     });
// });