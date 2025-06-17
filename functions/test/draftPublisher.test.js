// functions/test/draftPublisher.test.js
const admin = require('firebase-admin');
const functions = require('firebase-functions');
const { CloudTasksClient } = require('@google-cloud/tasks');
const fluidService = require('../src/fluidService'); // To mock its methods
const {
    publishDraft,
    publishDraftScheduled,
    createScheduledPublishTask,
    // publishDraftTest, // Not a priority for new tests
} = require('../src/draftPublisher');

// Initialize Firebase app if not already initialized (common for Jest tests)
if (admin.apps.length === 0) {
    admin.initializeApp();
}

// Mock dependencies
jest.mock('firebase-admin', () => ({
    initializeApp: jest.fn(),
    auth: () => ({
        verifyIdToken: jest.fn(),
    }),
    firestore: Object.assign(jest.fn(), { // Mock firestore() and its FieldValue
        FieldValue: {
            serverTimestamp: jest.fn(() => 'mock-server-timestamp'),
        },
    }),
    apps: [], // Mock admin.apps
}));

// Mock firestore().collection().doc().update() chain
const mockUpdate = jest.fn();
const mockDoc = jest.fn(() => ({ update: mockUpdate }));
const mockCollection = jest.fn(() => ({ doc: mockDoc }));
admin.firestore.mockReturnValue({ collection: mockCollection });


jest.mock('@google-cloud/tasks', () => ({
    CloudTasksClient: jest.fn().mockImplementation(() => ({
        createTask: jest.fn(),
        queuePath: jest.fn((project, location, queue) => `projects/${project}/locations/${location}/queues/${queue}`),
    })),
}));

jest.mock('../src/fluidService', () => ({
    createFluidClient: jest.fn(),
    connectToContainer: jest.fn(),
    writeToSharedTree: jest.fn(),
}));

// Mock firebase-functions logger
jest.spyOn(functions.logger, 'info').mockImplementation(() => {});
jest.spyOn(functions.logger, 'error').mockImplementation(() => {});
jest.spyOn(functions.logger, 'warn').mockImplementation(() => {});


describe('draftPublisher', () => {
    beforeEach(() => {
        // Clear all mock implementations and calls before each test
        jest.clearAllMocks();
        // Reset mock return values for chained firestore calls
        mockUpdate.mockResolvedValue({}); // Default success for Firestore update
        admin.firestore().collection.mockReturnValue({ doc: mockDoc });
        admin.firestore().collection().doc.mockReturnValue({ update: mockUpdate });

    });

    describe('createScheduledPublishTask', () => {
        const mockTaskPayload = { draftId: 'draft123', data: 'testData' };
        const mockScheduleTime = Date.now() + 3600000; // 1 hour from now
        const mockProject = 'outliner-d57b0';
        const mockQueue = 'draft-publish-queue';
        const mockLocation = 'us-central1';
        const mockApiUrl = 'https://outliner-d57b0.web.app/api/publish-draft-scheduled';

        it('should call CloudTasksClient.createTask with correct parameters', async () => {
            const mockCreateTaskResponse = { name: 'task-name' };
            CloudTasksClient.prototype.createTask.mockResolvedValue([mockCreateTaskResponse]);

            await createScheduledPublishTask(mockTaskPayload, mockScheduleTime);

            expect(CloudTasksClient).toHaveBeenCalledTimes(1);
            expect(CloudTasksClient.prototype.createTask).toHaveBeenCalledTimes(1);
            const callArg = CloudTasksClient.prototype.createTask.mock.calls[0][0];

            expect(callArg.parent).toBe(`projects/${mockProject}/locations/${mockLocation}/queues/${mockQueue}`);
            expect(callArg.task.httpRequest.httpMethod).toBe('POST');
            expect(callArg.task.httpRequest.url).toBe(mockApiUrl);
            expect(callArg.task.httpRequest.headers['Content-Type']).toBe('application/json');
            expect(Buffer.from(callArg.task.httpRequest.body, 'base64').toString()).toBe(JSON.stringify(mockTaskPayload));
            expect(callArg.task.scheduleTime.seconds).toBe(Math.floor(mockScheduleTime / 1000));
        });

        it('should return task name on successful task creation', async () => {
            const mockTaskName = 'projects/my-project/locations/us-central1/queues/my-queue/tasks/12345';
            CloudTasksClient.prototype.createTask.mockResolvedValue([{ name: mockTaskName }]);

            const result = await createScheduledPublishTask(mockTaskPayload, mockScheduleTime);
            expect(result).toBe(mockTaskName);
        });

        it('should throw error if task creation fails', async () => {
            const mockError = new Error('Task creation failed');
            CloudTasksClient.prototype.createTask.mockRejectedValue(mockError);

            await expect(createScheduledPublishTask(mockTaskPayload, mockScheduleTime)).rejects.toThrow(mockError);
        });
    });

    describe('publishDraft', () => {
        const mockRequest = {
            draftId: 'draftABC',
            containerId: 'containerXYZ',
            projectData: { some: 'data' },
            idToken: 'test-id-token',
        };
        const mockDecodedToken = { uid: 'user123' };

        beforeEach(() => {
            admin.auth().verifyIdToken.mockResolvedValue(mockDecodedToken);
            fluidService.createFluidClient.mockResolvedValue({ client: {} });
            fluidService.connectToContainer.mockResolvedValue({ appData: {} });
            fluidService.writeToSharedTree.mockResolvedValue(undefined);
        });

        it('should successfully publish a draft if all steps succeed', async () => {
            const result = await publishDraft(mockRequest);
            expect(admin.auth().verifyIdToken).toHaveBeenCalledWith(mockRequest.idToken);
            expect(fluidService.createFluidClient).toHaveBeenCalledWith(mockDecodedToken.uid, mockRequest.containerId);
            expect(fluidService.connectToContainer).toHaveBeenCalled();
            expect(fluidService.writeToSharedTree).toHaveBeenCalled();
            expect(result.success).toBe(true);
            expect(result.containerId).toBe(mockRequest.containerId);
        });

        it('should return error if token verification fails', async () => {
            admin.auth().verifyIdToken.mockRejectedValue(new Error('Invalid token'));
            const result = await publishDraft(mockRequest);
            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid token');
        });

        it('should return error if createFluidClient fails', async () => {
            fluidService.createFluidClient.mockRejectedValue(new Error('Fluid client error'));
            const result = await publishDraft(mockRequest);
            expect(result.success).toBe(false);
            expect(result.error).toBe('Fluid client error');
        });
         it('should return error if connectToContainer fails', async () => {
            fluidService.connectToContainer.mockRejectedValue(new Error('Fluid container error'));
            const result = await publishDraft(mockRequest);
            expect(result.success).toBe(false);
            expect(result.error).toBe('Fluid container error');
        });
        it('should return error if writeToSharedTree fails', async () => {
            fluidService.writeToSharedTree.mockRejectedValue(new Error('Fluid write error'));
            const result = await publishDraft(mockRequest);
            expect(result.success).toBe(false);
            expect(result.error).toBe('Fluid write error');
        });
    });

    describe('publishDraftScheduled', () => {
        const mockPayload = {
            draftId: 'schedDraft1',
            containerId: 'schedContainer1',
            projectData: { scheduled: 'data' },
            authorId: 'author789',
        };

        beforeEach(() => {
            fluidService.createFluidClient.mockResolvedValue({ client: {} });
            fluidService.connectToContainer.mockResolvedValue({ appData: {} });
            fluidService.writeToSharedTree.mockResolvedValue(undefined);
            mockUpdate.mockResolvedValue({}); // Default success for Firestore update
        });

        it('should successfully publish and update Firestore', async () => {
            const result = await publishDraftScheduled(mockPayload);

            expect(fluidService.createFluidClient).toHaveBeenCalledWith(mockPayload.authorId, mockPayload.containerId);
            expect(fluidService.connectToContainer).toHaveBeenCalled();
            expect(fluidService.writeToSharedTree).toHaveBeenCalled();
            expect(admin.firestore().collection).toHaveBeenCalledWith('drafts');
            expect(admin.firestore().collection().doc).toHaveBeenCalledWith(mockPayload.draftId);
            expect(mockUpdate).toHaveBeenCalledWith({
                status: 'published',
                publishedAt: 'mock-server-timestamp',
            });
            expect(result.success).toBe(true);
        });

        it('should still succeed if Firestore update fails', async () => {
            mockUpdate.mockRejectedValue(new Error('Firestore unavailable'));
            const result = await publishDraftScheduled(mockPayload);

            expect(result.success).toBe(true); // Overall success
            expect(functions.logger.warn).toHaveBeenCalledWith(
                "Failed to update draft metadata in Firestore",
                expect.objectContaining({ draftId: mockPayload.draftId, error: 'Firestore unavailable' })
            );
        });

        it('should return error if createFluidClient fails', async () => {
            fluidService.createFluidClient.mockRejectedValue(new Error('Fluid client error'));
            const result = await publishDraftScheduled(mockPayload);
            expect(result.success).toBe(false);
            expect(result.error).toBe('Fluid client error');
        });
    });
});
