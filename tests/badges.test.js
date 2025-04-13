// import { awardBadgeForLinesOfCode, badges } from './badges';

// describe("Badge Awarding Logic", () => {

//     beforeEach(() => {
//         // Reset badge status before each test
//         badges["Apprentice Scripter"].earned = 0;
//     });

//     it("should award the Apprentice Scripter badge for 50 lines of code", () => {
//         // Test if the badge is awarded correctly
//         const badge = awardBadgeForLinesOfCode(50);
//         expect(badge).toBeTruthy(); // Badge should be awarded
//         expect(badge.earned).toBe(1); // The badge should be marked as earned
//     });

//     it("should not award the Apprentice Scripter badge for less than 50 lines of code", () => {
//         // Test if the badge is not awarded if not enough lines
//         const badge = awardBadgeForLinesOfCode(49);
//         expect(badge).toBeNull(); // No badge should be awarded
//     });

//     it("should not re-award the Apprentice Scripter badge once earned", () => {
//         // Test if the badge is not awarded again after being earned
//         awardBadgeForLinesOfCode(50);
//         const badge = awardBadgeForLinesOfCode(50); // Try again
//         expect(badge).toBeNull(); // Badge should not be awarded again
//     });

// });
