import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeSession,
  normalizeSessions,
  quotaComplianceForDay,
  splitByLocalDay,
  summarizeDay,
  summarizeRange,
  unionMinutes,
  usedMinutesOn,
} from "../domain/usage.js";

const TAIPEI = "Asia/Taipei";
const TODAY = "2026-08-17";

/** Monday 2026-08-17 Taipei wall clock. */
function at(hour, minute = 0) {
  return Date.UTC(2026, 7, 17, hour - 8, minute);
}

function session(appId, category, startHour, startMinute, endHour, endMinute) {
  return {
    appId,
    appName: appId.toUpperCase(),
    category,
    startMs: at(startHour, startMinute),
    endMs: at(endHour, endMinute),
  };
}

test("sessions are validated on the way in", () => {
  const valid = normalizeSession(session("youtube", "video", 6, 0, 6, 30));
  assert.equal(valid.appId, "youtube");
  assert.throws(() => normalizeSession({ ...session("a", "video", 6, 0, 6, 30), category: "gambling" }), /invalid-usage-session/);
  assert.throws(() => normalizeSession(session("a", "video", 6, 30, 6, 30)), /invalid-usage-session/);
  assert.throws(() => normalizeSession(session("a", "video", 7, 0, 6, 0)), /invalid-usage-session/);
  assert.throws(() => normalizeSession({ appId: "a" }), /invalid-usage-session/);
});

test("normalizeSessions sorts chronologically", () => {
  const sessions = normalizeSessions([
    session("b", "game", 6, 30, 6, 45),
    session("a", "social", 6, 0, 6, 20),
  ]);
  assert.deepEqual(sessions.map((entry) => entry.appId), ["a", "b"]);
});

test("overlapping segments are counted once", () => {
  const sessions = normalizeSessions([
    session("youtube", "video", 6, 0, 6, 30),
    session("line", "social", 6, 20, 6, 40),
  ]);
  assert.equal(unionMinutes(sessions), 40, "20 overlapping minutes are not double-counted");
});

test("a re-uploaded session does not inflate screen time", () => {
  const duplicate = session("youtube", "video", 6, 0, 6, 30);
  assert.equal(unionMinutes(normalizeSessions([duplicate, { ...duplicate }])), 30);
});

test("a session across local midnight is split between the two days", () => {
  const overnight = normalizeSessions([{
    appId: "game",
    appName: "GAME",
    category: "game",
    startMs: at(23, 30),
    endMs: at(24, 30), // 00:30 the next day
  }]);
  const parts = splitByLocalDay(overnight, TAIPEI);
  assert.deepEqual(parts.map((part) => part.dateKey), ["2026-08-17", "2026-08-18"]);
  assert.equal(unionMinutes([parts[0]]), 30);
  assert.equal(unionMinutes([parts[1]]), 30);
});

test("summarizeDay breaks usage down by app and category", () => {
  const sessions = [
    session("youtube", "video", 6, 0, 6, 30),
    session("line", "social", 7, 0, 7, 15),
    session("roblox", "game", 19, 0, 19, 45),
    session("youtube", "video", 20, 0, 20, 30),
  ];
  const summary = summarizeDay({ sessions, timeZone: TAIPEI, dateKey: TODAY });
  assert.equal(summary.totalMinutes, 120);
  assert.equal(summary.sessionCount, 4);
  assert.deepEqual(
    summary.byApp.map((app) => [app.key, app.minutes, app.share]),
    [["youtube", 60, 50], ["roblox", 45, 37.5], ["line", 15, 12.5]],
  );
  assert.deepEqual(
    summary.byCategory.map((entry) => [entry.key, entry.minutes]),
    [["video", 60], ["game", 45], ["social", 15]],
  );
  assert.equal(summary.longestSessionMinutes, 45);
  assert.equal(summary.firstUseMs, at(6, 0));
  assert.equal(summary.lastUseMs, at(20, 30));
});

test("the hourly profile splits a session across hour boundaries", () => {
  const summary = summarizeDay({
    sessions: [session("youtube", "video", 6, 45, 7, 15)],
    timeZone: TAIPEI,
    dateKey: TODAY,
  });
  assert.equal(summary.hourly[6], 15);
  assert.equal(summary.hourly[7], 15);
  assert.equal(summary.hourly.reduce((sum, value) => sum + value, 0), 30);
});

test("a day with no usage summarizes cleanly", () => {
  const summary = summarizeDay({ sessions: [], timeZone: TAIPEI, dateKey: TODAY });
  assert.equal(summary.totalMinutes, 0);
  assert.deepEqual(summary.byApp, []);
  assert.equal(summary.firstUseMs, null);
  assert.equal(summary.longestSessionMinutes, 0);
});

test("usedMinutesOn feeds the quota with only that day's usage", () => {
  const sessions = [
    session("youtube", "video", 6, 0, 6, 30),
    {
      appId: "game",
      appName: "GAME",
      category: "game",
      startMs: at(23, 0),
      endMs: at(25, 0), // runs two hours past midnight
    },
  ];
  assert.equal(usedMinutesOn({ sessions, timeZone: TAIPEI, dateKey: TODAY }), 90);
  assert.equal(usedMinutesOn({ sessions, timeZone: TAIPEI, dateKey: "2026-08-18" }), 60);
});

test("summarizeRange totals a week and reports the trend", () => {
  const days = ["2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"].map((dateKey, index) => ({
    dateKey,
    totalMinutes: [60, 60, 90, 90][index],
    byApp: [{ key: "youtube", label: "YOUTUBE", minutes: [60, 60, 90, 90][index], share: 100 }],
  }));
  const range = summarizeRange(days);
  assert.equal(range.totalMinutes, 300);
  assert.equal(range.averageMinutes, 75);
  assert.equal(range.dayCount, 4);
  assert.equal(range.busiestDateKey, "2026-08-13");
  assert.equal(range.trendPercent, 50, "second half averages 50% above the first");
  assert.deepEqual(range.topApps[0], { key: "youtube", label: "YOUTUBE", minutes: 300, share: 100 });
  assert.equal(range.series.length, 4);
});

test("summarizeRange orders days regardless of input order", () => {
  const range = summarizeRange([
    { dateKey: "2026-08-13", totalMinutes: 30, byApp: [] },
    { dateKey: "2026-08-11", totalMinutes: 10, byApp: [] },
  ]);
  assert.equal(range.fromDateKey, "2026-08-11");
  assert.equal(range.toDateKey, "2026-08-13");
  assert.throws(() => summarizeRange([]), /invalid-usage-session/);
});

test("quota compliance flags days that ran over the allowance", () => {
  const over = quotaComplianceForDay({ dateKey: TODAY, totalMinutes: 95 }, 60);
  assert.equal(over.withinQuota, false);
  assert.equal(over.overMinutes, 35);
  assert.equal(over.utilization, 158.3);

  const under = quotaComplianceForDay({ dateKey: TODAY, totalMinutes: 42 }, 60);
  assert.equal(under.withinQuota, true);
  assert.equal(under.overMinutes, 0);
  assert.equal(under.utilization, 70);
});
