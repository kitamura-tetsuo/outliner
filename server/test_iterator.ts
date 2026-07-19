import { default as rruleImport } from "rrule";
import { DateTime } from "luxon";

const { rrulestr } = rruleImport;

const dtstartStr = "2024-01-01T10:00:00";
const timezoneStr = "America/New_York";

const dtstart = DateTime.fromISO(dtstartStr, { zone: timezoneStr });
const rruleDtstart = new Date(Date.UTC(dtstart.year, dtstart.month - 1, dtstart.day, dtstart.hour, dtstart.minute, dtstart.second));

const rule = rrulestr("FREQ=DAILY;COUNT=3", { dtstart: rruleDtstart });

console.log("Checking if iter exists:");
console.log(typeof rule.iterator);
