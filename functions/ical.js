"use strict";

const CRLF = "\r\n";

/**
 * Escape text according to RFC 5545 section 3.3.11.
 * @param {string} value
 * @returns {string}
 */
function escapeText(value) {
  return value.replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/**
 * Fold a line to 75 octets by inserting CRLF + space.
 * @param {string} line
 * @returns {string}
 */
function foldLine(line) {
  const segments = [];
  let current = "";
  for (const char of line) {
    const length = Buffer.byteLength(char, "utf8");
    if (Buffer.byteLength(current, "utf8") + length > 73) {
      segments.push(current);
      current = " " + char;
    } else {
      current += char;
    }
  }
  if (current) {
    segments.push(current);
  }
  return segments.join(CRLF);
}

/**
 * Format milliseconds since epoch into an iCal datetime (UTC) string.
 * @param {number} value
 * @returns {string}
 */
function formatDateTime(value) {
  const iso = new Date(value).toISOString().replace(/\.\d{3}Z$/, "Z");
  return iso.replace(/[-:]/g, "");
}

/**
 * Create a VEVENT entry for a schedule.
 * @param {object} schedule
 * @param {string} schedule.id
 * @param {string} schedule.strategy
 * @param {number} schedule.nextRunAt
 * @param {number} dtstamp
 * @param {number} eventDurationMs
 * @returns {string[]}
 */
function buildEvent(schedule, dtstamp, eventDurationMs) {
  const start = formatDateTime(schedule.nextRunAt);
  const end = formatDateTime(schedule.nextRunAt + eventDurationMs);
  const dtStamp = formatDateTime(dtstamp);
  const summary = `SUMMARY:Outliner publish (${schedule.strategy})`;
  const description =
    `DESCRIPTION:Strategy ${schedule.strategy}\\nNext run at ${
      new Date(schedule.nextRunAt).toISOString()
    }`;

  return [
    "BEGIN:VEVENT",
    `UID:${escapeText(schedule.id)}@outliner`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    foldLine(summary),
    foldLine(description),
    `X-OUTLINER-STRATEGY:${escapeText(schedule.strategy)}`,
    `X-OUTLINER-NEXTRUN:${
      escapeText(new Date(schedule.nextRunAt).toISOString())
    }`,
    "END:VEVENT",
  ];
}

/**
 * Generate an iCal string for the provided schedules.
 * @param {object} options
 * @param {string} options.pageId
 * @param {string=} options.pageTitle
 * @param {Array<object>} options.schedules
 * @param {number=} options.generatedAt
 * @returns {string}
 */
function generateSchedulesIcs({
  pageId,
  pageTitle,
  schedules,
  generatedAt = Date.now(),
}) {
  const headerTitle = pageTitle ? `Outliner schedules for ${pageTitle}` :
    `Outliner schedules for ${pageId}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Outliner//Schedule Export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldLine(`X-WR-CALNAME:${escapeText(headerTitle)}`),
  ];

  const durationMs = 30 * 60 * 1000;
  schedules.forEach(schedule => {
    lines.push(...buildEvent(schedule, generatedAt, durationMs));
  });

  lines.push("END:VCALENDAR");
  return lines.join(CRLF) + CRLF;
}

module.exports = {
  generateSchedulesIcs,
  formatDateTime,
  escapeText,
  foldLine,
};
