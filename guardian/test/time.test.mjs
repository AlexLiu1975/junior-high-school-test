import assert from "node:assert/strict";
import test from "node:test";
import {
  addLocalDays,
  dateKeyOf,
  formatTimeOfDay,
  instantAtLocalMinutes,
  isDateKey,
  isTimeOfDay,
  isTimeZone,
  localParts,
  minutesOfDay,
  startOfLocalDay,
  weekdayOf,
} from "../domain/time.js";

const TAIPEI = "Asia/Taipei";
const NEW_YORK = "America/New_York";

/** 2026-08-17 06:30 Taipei — a Monday morning inside the 06:00-07:00 window. */
const MONDAY_0630_TAIPEI = Date.UTC(2026, 7, 16, 22, 30);

test("localParts renders wall-clock time in the family time zone", () => {
  const parts = localParts(MONDAY_0630_TAIPEI, TAIPEI);
  assert.equal(parts.dateKey, "2026-08-17");
  assert.equal(parts.weekday, 1);
  assert.equal(parts.hour, 6);
  assert.equal(parts.minute, 30);
  assert.equal(parts.minutesOfDay, 390);
});

test("localParts of the same instant differs by zone", () => {
  assert.equal(dateKeyOf(MONDAY_0630_TAIPEI, TAIPEI), "2026-08-17");
  assert.equal(dateKeyOf(MONDAY_0630_TAIPEI, NEW_YORK), "2026-08-16");
  assert.equal(weekdayOf(MONDAY_0630_TAIPEI, NEW_YORK), 0);
});

test("midnight is reported as hour 0, not 24", () => {
  const parts = localParts(Date.UTC(2026, 7, 16, 16, 0), TAIPEI);
  assert.equal(parts.hour, 0);
  assert.equal(parts.minutesOfDay, 0);
  assert.equal(parts.dateKey, "2026-08-17");
});

test("startOfLocalDay lands on local midnight", () => {
  const dayStart = startOfLocalDay(MONDAY_0630_TAIPEI, TAIPEI);
  const parts = localParts(dayStart, TAIPEI);
  assert.equal(parts.minutesOfDay, 0);
  assert.equal(parts.second, 0);
  assert.equal(parts.dateKey, "2026-08-17");
});

test("instantAtLocalMinutes resolves a wall-clock time on the current local day", () => {
  const sevenAm = instantAtLocalMinutes(MONDAY_0630_TAIPEI, TAIPEI, 7 * 60);
  assert.equal(sevenAm - MONDAY_0630_TAIPEI, 30 * 60000);
  assert.equal(localParts(sevenAm, TAIPEI).minutesOfDay, 420);
});

test("local-day arithmetic survives a spring-forward transition", () => {
  // 2026-03-08 is the US spring-forward date; that local day is only 23 hours.
  const beforeDst = Date.UTC(2026, 2, 7, 17, 0); // 2026-03-07 12:00 New York
  const nextDay = addLocalDays(beforeDst, NEW_YORK, 1);
  const parts = localParts(nextDay, NEW_YORK);
  assert.equal(parts.dateKey, "2026-03-08");
  assert.equal(parts.minutesOfDay, 0);
});

test("instantAtLocalMinutes keeps the requested wall clock across spring-forward", () => {
  const dstDayNoon = Date.UTC(2026, 2, 8, 16, 0); // 2026-03-08 12:00 New York
  const sixPm = instantAtLocalMinutes(dstDayNoon, NEW_YORK, 18 * 60);
  assert.equal(localParts(sixPm, NEW_YORK).minutesOfDay, 18 * 60);
  assert.equal(localParts(sixPm, NEW_YORK).dateKey, "2026-03-08");
});

test("addLocalDays crosses month and year boundaries", () => {
  const newYearEve = Date.UTC(2026, 11, 31, 4, 0); // 2026-12-31 12:00 Taipei
  assert.equal(dateKeyOf(addLocalDays(newYearEve, TAIPEI, 1), TAIPEI), "2027-01-01");
  assert.equal(dateKeyOf(addLocalDays(newYearEve, TAIPEI, -1), TAIPEI), "2026-12-30");
});

test("time-of-day parsing and formatting round-trip", () => {
  assert.equal(minutesOfDay("06:00"), 360);
  assert.equal(minutesOfDay("23:59"), 1439);
  assert.equal(formatTimeOfDay(390), "06:30");
  assert.equal(formatTimeOfDay(1440), "00:00");
  assert.ok(isTimeOfDay("00:00"));
  assert.ok(!isTimeOfDay("24:00"));
  assert.ok(!isTimeOfDay("6:00"));
  assert.throws(() => minutesOfDay("25:00"), /invalid-time-of-day/);
});

test("date keys reject impossible calendar days", () => {
  assert.ok(isDateKey("2026-02-28"));
  assert.ok(!isDateKey("2026-02-30"));
  assert.ok(!isDateKey("2026-13-01"));
  assert.ok(!isDateKey("2026-8-1"));
});

test("time zones are validated before use", () => {
  assert.ok(isTimeZone(TAIPEI));
  assert.ok(!isTimeZone("Mars/Olympus"));
  assert.throws(() => localParts(MONDAY_0630_TAIPEI, "Mars/Olympus"), /invalid-time-zone/);
  assert.throws(() => localParts(Number.NaN, TAIPEI), /invalid-instant/);
});
