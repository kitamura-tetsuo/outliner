import { default as rruleImport } from "rrule";
const { rrulestr } = rruleImport;

const rule = rrulestr("FREQ=DAILY;COUNT=1", { dtstart: new Date("2024-01-01T10:00:00Z") });
console.log(rule.all());
