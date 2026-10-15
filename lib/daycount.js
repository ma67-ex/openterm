// Day-count conventions for bond/trading math.
// Ported from Bloomberg's BDE (bbldc package, Apache 2.0):
// https://github.com/bloomberg/bde/tree/main/groups/bbl/bbldc
//
// Dates are plain JS Date objects (time-of-day is ignored; UTC y/m/d used).

function ymd(date) {
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
}

function rawDaysDiff(beginDate, endDate) {
  const [y1, m1, d1] = ymd(beginDate);
  const [y2, m2, d2] = ymd(endDate);
  const begin = Date.UTC(y1, m1 - 1, d1);
  const end = Date.UTC(y2, m2 - 1, d2);
  return Math.round((end - begin) / 86400000);
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isLastDayOfFebruary(year, month, day) {
  return month === 2 && (day === 29 || (day === 28 && !isLeapYear(year)));
}

// ACTUAL/360, ACTUAL/365FIXED, ACTUAL/365.25: actual days over a fixed denominator.
export const ACTUAL_360 = {
  daysDiff: rawDaysDiff,
  yearsDiff: (b, e) => rawDaysDiff(b, e) / 360.0,
};

export const ACTUAL_365_FIXED = {
  daysDiff: rawDaysDiff,
  yearsDiff: (b, e) => rawDaysDiff(b, e) / 365.0,
};

export const ACTUAL_365_25 = {
  daysDiff: rawDaysDiff,
  yearsDiff: (b, e) => rawDaysDiff(b, e) / 365.25,
};

// NL/365: actual days, excluding Feb 29 in leap years.
const NL365_MONTH_CORRECTION = [0, 0, 0, 3, 3, 4, 4, 5, 5, 5, 6, 6, 7];

export const NL_365 = {
  daysDiff(beginDate, endDate) {
    const [y1, m1, d1] = ymd(beginDate);
    const [y2, m2, d2] = ymd(endDate);
    return (
      (y2 - y1) * 365 +
      (m2 - m1) * 31 -
      (NL365_MONTH_CORRECTION[m2] - NL365_MONTH_CORRECTION[m1]) +
      (d2 - d1)
    );
  },
  yearsDiff(beginDate, endDate) {
    return NL_365.daysDiff(beginDate, endDate) / 365.0;
  },
};

// ISMA 30/360: 30-day months, 360-day year. Day 31 clamped to 30.
function ismaDaysDiff(beginDate, endDate) {
  let [yBegin, mBegin, dBegin] = ymd(beginDate);
  let [yEnd, mEnd, dEnd] = ymd(endDate);
  if (dBegin === 31) dBegin = 30;
  if (dEnd === 31) dEnd = 30;
  return (yEnd - yBegin) * 360 + (mEnd - mBegin) * 30 + dEnd - dBegin;
}

export const ISMA_30_360 = {
  daysDiff: ismaDaysDiff,
  yearsDiff: (b, e) => ismaDaysDiff(b, e) / 360.0,
};

// PSA 30/360 (end-of-month variant).
function psaDaysDiff(beginDate, endDate) {
  let y1, m1, d1, y2, m2, d2;
  const negate = beginDate > endDate;
  if (negate) {
    [y1, m1, d1] = ymd(endDate);
    [y2, m2, d2] = ymd(beginDate);
  } else {
    [y1, m1, d1] = ymd(beginDate);
    [y2, m2, d2] = ymd(endDate);
  }

  if (isLastDayOfFebruary(y1, m1, d1)) d1 = 30;
  if (d1 === 31) d1 = 30;
  if (d1 === 30 && d2 === 31) d2 = 30;

  let result = Math.max((y2 - y1) * 360 + (m2 - m1) * 30 + d2 - d1, 0);
  return negate ? -result : result;
}

export const PSA_30_360_EOM = {
  daysDiff: psaDaysDiff,
  yearsDiff: (b, e) => psaDaysDiff(b, e) / 360.0,
};

// SIA 30/360 (end-of-month variant).
function siaEomDaysDiff(beginDate, endDate) {
  let y1, m1, d1, y2, m2, d2;
  const negate = beginDate > endDate;
  if (negate) {
    [y1, m1, d1] = ymd(endDate);
    [y2, m2, d2] = ymd(beginDate);
  } else {
    [y1, m1, d1] = ymd(beginDate);
    [y2, m2, d2] = ymd(endDate);
  }

  if (isLastDayOfFebruary(y1, m1, d1)) {
    if (isLastDayOfFebruary(y2, m2, d2)) d2 = 30;
    d1 = 30;
  }
  if (d1 === 30 || d1 === 31) {
    if (d2 === 31) d2 = 30;
    d1 = 30;
  }

  const result = (y2 - y1) * 360 + (m2 - m1) * 30 + d2 - d1;
  return negate ? -result : result;
}

export const SIA_30_360_EOM = {
  daysDiff: siaEomDaysDiff,
  yearsDiff: (b, e) => siaEomDaysDiff(b, e) / 360.0,
};

// SIA 30/360 (no end-of-month variant).
function siaNeomDaysDiff(beginDate, endDate) {
  let y1, m1, d1, y2, m2, d2;
  const negate = beginDate > endDate;
  if (negate) {
    [y1, m1, d1] = ymd(endDate);
    [y2, m2, d2] = ymd(beginDate);
  } else {
    [y1, m1, d1] = ymd(beginDate);
    [y2, m2, d2] = ymd(endDate);
  }

  if (d1 === 31) d1 = 30;
  if (d1 === 30 && d2 === 31) d2 = 30;

  const result = (y2 - y1) * 360 + (m2 - m1) * 30 + d2 - d1;
  return negate ? -result : result;
}

export const SIA_30_360_NEOM = {
  daysDiff: siaNeomDaysDiff,
  yearsDiff: (b, e) => siaNeomDaysDiff(b, e) / 360.0,
};

// ISDA Actual/Actual: splits the period across begin/end calendar years,
// each year weighted by its own actual length (365 or 366 days).
export const ISDA_ACTUAL_ACTUAL = {
  daysDiff: rawDaysDiff,
  yearsDiff(beginDate, endDate) {
    const beginYear = beginDate.getUTCFullYear();
    const endYear = endDate.getUTCFullYear();

    const daysInBeginYear = isLeapYear(beginYear) ? 366 : 365;
    const daysInEndYear = isLeapYear(endYear) ? 366 : 365;

    const yDiff = endYear - beginYear - 1;
    const beginYearDayDiff = rawDaysDiff(beginDate, new Date(Date.UTC(beginYear + 1, 0, 1)));
    const endYearDayDiff = rawDaysDiff(new Date(Date.UTC(endYear, 0, 1)), endDate);

    const numerator =
      yDiff * daysInBeginYear * daysInEndYear +
      beginYearDayDiff * daysInEndYear +
      endYearDayDiff * daysInBeginYear;
    const denominator = daysInBeginYear * daysInEndYear;

    return numerator / denominator;
  },
};

export const CONVENTIONS = {
  ACTUAL_360,
  ACTUAL_365_FIXED,
  ACTUAL_365_25,
  NL_365,
  ISMA_30_360,
  PSA_30_360_EOM,
  SIA_30_360_EOM,
  SIA_30_360_NEOM,
  ISDA_ACTUAL_ACTUAL,
};

// Self-check: run `node lib/daycount.js` directly to verify against known
// reference values (BDE's own test tables use the same conventions).
if (import.meta.url === `file://${process.argv[1]}`) {
  const d = (y, m, day) => new Date(Date.UTC(y, m - 1, day));

  const cases = [
    [ACTUAL_360, d(2023, 1, 1), d(2023, 7, 1), 181, 181 / 360],
    [ACTUAL_365_FIXED, d(2023, 1, 1), d(2023, 7, 1), 181, 181 / 365],
    [NL_365, d(2023, 2, 1), d(2024, 2, 1), 365, 1],
    [ISMA_30_360, d(2023, 1, 31), d(2023, 2, 28), 28, 28 / 360],
    [SIA_30_360_EOM, d(2023, 2, 28), d(2023, 3, 31), 30, 30 / 360],
    [ISDA_ACTUAL_ACTUAL, d(2023, 7, 1), d(2024, 7, 1), 366, 133774 / 133590],
  ];

  let failures = 0;
  for (const [conv, begin, end, expectDays, expectYears] of cases) {
    const days = conv.daysDiff(begin, end);
    const years = conv.yearsDiff(begin, end);
    const ok = days === expectDays && Math.abs(years - expectYears) < 1e-9;
    if (!ok) {
      failures++;
      console.error(`FAIL: days=${days} (want ${expectDays}), years=${years} (want ${expectYears})`);
    }
  }
  console.log(failures === 0 ? "daycount.js: all checks passed" : `daycount.js: ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}
