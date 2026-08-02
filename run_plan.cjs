const fs = require('fs');
let code = fs.readFileSync('client/src/components/calendar/CalendarView.test.ts', 'utf-8');
console.log(code.includes('calendar-read-only-banner'));
