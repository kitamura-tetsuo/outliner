import { default as rruleImport } from "rrule";
import { DateTime } from "luxon";

const { RRule, rrulestr } = rruleImport;

const dtstartStr = "2024-03-10T02:30:00";
const timezoneStr = "America/New_York";

const dtstart = DateTime.fromISO(dtstartStr, { zone: timezoneStr });
console.log("isValid:", dtstart.isValid);
if (!dtstart.isValid) {
    console.log("invalid reason:", dtstart.invalidReason);
}

const rule = rrulestr("FREQ=DAILY;COUNT=1", { dtstart: new Date(Date.UTC(dtstart.year, dtstart.month - 1, dtstart.day, dtstart.hour, dtstart.minute, dtstart.second)) });
console.log(rule.all());
