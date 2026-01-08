## 2024-03-24 - Missing Authorization in Scheduling Functions
**Vulnerability:** The `createSchedule`, `updateSchedule`, `listSchedules`, `exportSchedulesIcal`, and `cancelSchedule` functions in `functions/index.js` were missing authorization checks. They verified the user's identity (authentication) but did not verify if the user had access to the target project/page (authorization). A malicious user could create schedules on arbitrary pages by guessing the `pageId`.

**Learning:** Authentication != Authorization. Just because a user is logged in does not mean they have permission to access a specific resource. Always check ownership or membership.

**Prevention:** Ensure every Cloud Function that accesses a resource (like a page or container) calls a dedicated access control function (like `checkContainerAccess`) before performing any operations.
