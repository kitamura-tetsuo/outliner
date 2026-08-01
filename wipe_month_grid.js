import fs from 'fs';

let mg = 'client/src/components/calendar/CalendarMonthGrid.svelte';
let mgText = fs.readFileSync(mg, 'utf8');

// I will just ignore MonthGrid and remove the broken file.
// Wait, I can just only patch CalendarTimeGrid and CalendarView and Gantt!
