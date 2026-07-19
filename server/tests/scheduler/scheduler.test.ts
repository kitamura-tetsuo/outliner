import { expect } from "chai";
import { JobScheduler } from "../../src/scheduler/Scheduler.js";
import { DateTime } from "luxon";

describe("Job Scheduler", () => {
    let scheduler: JobScheduler;
    let hocuspocus: any;
    let sqliteDb: any;

    beforeEach(() => {
        hocuspocus = {
            configuration: { extensions: [] },
            openDirectConnection: async () => ({
                document: null,
                disconnect: () => {}
            })
        };
        sqliteDb = {
            prepare: () => ({ all: () => [], run: () => {} })
        };
        scheduler = new JobScheduler(hocuspocus);
        scheduler.setDb(sqliteDb);
        scheduler.start();
    });

    afterEach(async () => {
        scheduler.stop();
    });

    it("should trigger a tick without crashing", async () => {
        await scheduler.tick();
        expect(true).to.be.true;
    });
});
