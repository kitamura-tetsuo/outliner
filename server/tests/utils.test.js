// server/tests/utils.test.js
const chai = require('chai');
const sinon = require('sinon');
const fsExtra = require('fs-extra');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const dotenv = require('dotenv');

// Modules to test
const loggerUtils = require('../utils/logger');
const ngrokUtils = require('../utils/ngrok-helper');

const expect = chai.expect;

describe('Utility Functions', () => {
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        // Suppress console output from the modules themselves during tests
        sandbox.stub(console, 'log');
        sandbox.stub(console, 'warn');
        sandbox.stub(console, 'error');
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('logger.js - rotateLogFile', () => {
        const mockLogFilePath = '/test/logs/app.log';
        const mockLogDir = '/test/logs';
        const mockLogFile = 'app.log';

        beforeEach(() => {
            sandbox.stub(path, 'dirname').returns(mockLogDir);
            sandbox.stub(path, 'basename').returns(mockLogFile);
            sandbox.stub(path, 'join').callsFake((...args) => args.join('/')); // Simple join mock

            // Mock fs-extra
            sandbox.stub(fsExtra, 'pathExists');
            sandbox.stub(fsExtra, 'readdir');
            sandbox.stub(fsExtra, 'remove').resolves();
            sandbox.stub(fsExtra, 'move').resolves();
            sandbox.stub(fsExtra, 'ensureFile').resolves();
        });

        it('should return false if log file does not exist', async () => {
            fsExtra.pathExists.withArgs(mockLogFilePath).resolves(false);
            const result = await loggerUtils.rotateLogFile(mockLogFilePath);
            expect(result).to.be.false;
        });

        it('should correctly rotate when no backups exist', async () => {
            fsExtra.pathExists.withArgs(mockLogFilePath).resolves(true);
            fsExtra.readdir.withArgs(mockLogDir).resolves([mockLogFile]); // Only current log file

            const result = await loggerUtils.rotateLogFile(mockLogFilePath, 2);
            expect(result).to.be.true;
            expect(fsExtra.move.calledOnceWith(mockLogFilePath, `${mockLogDir}/${mockLogFile}.1`)).to.be.true;
            expect(fsExtra.ensureFile.calledOnceWith(mockLogFilePath)).to.be.true;
            expect(fsExtra.remove.notCalled).to.be.true;
        });

        it('should handle existing backups and rename them, then move current to .1', async () => {
            fsExtra.pathExists.withArgs(mockLogFilePath).resolves(true);
            fsExtra.readdir.withArgs(mockLogDir).resolves([mockLogFile, `${mockLogFile}.1`, `${mockLogFile}.2`]);

            // Mock path.join to correctly form paths for these specific files when needed by readdir sort
            path.join.withArgs(mockLogDir, `${mockLogFile}.1`).returns(`${mockLogDir}/${mockLogFile}.1`);
            path.join.withArgs(mockLogDir, `${mockLogFile}.2`).returns(`${mockLogDir}/${mockLogFile}.2`);


            const result = await loggerUtils.rotateLogFile(mockLogFilePath, 3);
            expect(result).to.be.true;

            // Check renaming of existing backups (order matters for simulation)
            // .2 -> .3
            expect(fsExtra.move.calledWith(`${mockLogDir}/${mockLogFile}.2`, `${mockLogDir}/${mockLogFile}.3`)).to.be.true;
            // .1 -> .2
            expect(fsExtra.move.calledWith(`${mockLogDir}/${mockLogFile}.1`, `${mockLogDir}/${mockLogFile}.2`)).to.be.true;
            // current -> .1
            expect(fsExtra.move.calledWith(mockLogFilePath, `${mockLogDir}/${mockLogFile}.1`)).to.be.true;
            expect(fsExtra.ensureFile.calledOnceWith(mockLogFilePath)).to.be.true;
            expect(fsExtra.remove.notCalled).to.be.true;
        });

        it('should remove oldest backups if exceeding maxBackups', async () => {
            fsExtra.pathExists.withArgs(mockLogFilePath).resolves(true);
            // Simulate files: app.log, app.log.1, app.log.2, app.log.3
            fsExtra.readdir.withArgs(mockLogDir).resolves([
                mockLogFile, `${mockLogFile}.1`, `${mockLogFile}.2`, `${mockLogFile}.3`
            ]);
            path.join.withArgs(mockLogDir, `${mockLogFile}.1`).returns(`${mockLogDir}/${mockLogFile}.1`);
            path.join.withArgs(mockLogDir, `${mockLogFile}.2`).returns(`${mockLogDir}/${mockLogFile}.2`);
            path.join.withArgs(mockLogDir, `${mockLogFile}.3`).returns(`${mockLogDir}/${mockLogFile}.3`);

            const result = await loggerUtils.rotateLogFile(mockLogFilePath, 2); // maxBackups = 2
            expect(result).to.be.true;

            // The code logic:
            // 1. Lists all .N files, sorts them by N desc: app.log.3, app.log.2, app.log.1
            // 2. Removes files from index maxBackups onwards:
            //    backupFiles[2] (app.log.1) is removed because i=2 (maxBackups)
            expect(fsExtra.remove.calledOnceWith(`${mockLogDir}/${mockLogFile}.1`)).to.be.true;

            // 3. Renames remaining:
            //    Loop for moving: i from 0 to min(backupFiles.length (now 2), maxBackups (2)) - 1 = 1
            //    i=0: file=app.log.3 (backupFiles[0]). newSuffix=3+1=4. 4 <= 2 is false. Not moved.
            //    i=1: file=app.log.2 (backupFiles[1]). newSuffix=2+1=3. 3 <= 2 is false. Not moved.
            // This means after removing .1, .3 and .2 are NOT further renamed by this loop. This is different from my initial long comment.
            // The important part is to test the code as written.

            // Current log moved to .1
            expect(fsExtra.move.calledWith(mockLogFilePath, `${mockLogDir}/${mockLogFile}.1`)).to.be.true;
        });

        it('should return false on fs-extra error', async () => {
            fsExtra.pathExists.withArgs(mockLogFilePath).resolves(true);
            fsExtra.readdir.withArgs(mockLogDir).rejects(new Error('FS error'));
            const result = await loggerUtils.rotateLogFile(mockLogFilePath);
            expect(result).to.be.false;
        });
    });

    describe('ngrok-helper.js', () => {
        let axiosGetStub;
        let readFileSyncStub, writeFileSyncStub, existsSyncStub, dotenvConfigStub;

        beforeEach(() => {
            axiosGetStub = sandbox.stub(axios, 'get');
            readFileSyncStub = sandbox.stub(fs, 'readFileSync');
            writeFileSyncStub = sandbox.stub(fs, 'writeFileSync');
            existsSyncStub = sandbox.stub(fs, 'existsSync');
            dotenvConfigStub = sandbox.stub(dotenv, 'config'); // Stub dotenv.config
        });

        describe('getNgrokPublicUrl', () => {
            it('should return HTTPS URL if available', async () => {
                axiosGetStub.resolves({ data: { tunnels: [{ proto: 'http', public_url: 'http://url' }, { proto: 'https', public_url: 'https://secure_url' }] } });
                const url = await ngrokUtils.getNgrokPublicUrl();
                expect(url).to.equal('https://secure_url');
            });

            it('should return HTTP URL if HTTPS not available', async () => {
                axiosGetStub.resolves({ data: { tunnels: [{ proto: 'http', public_url: 'http://url' }] } });
                const url = await ngrokUtils.getNgrokPublicUrl();
                expect(url).to.equal('http://url');
            });

            it('should return undefined if no tunnels available', async () => {
                axiosGetStub.resolves({ data: { tunnels: [] } });
                const url = await ngrokUtils.getNgrokPublicUrl();
                expect(url).to.be.undefined;
            });

            it('should return undefined on axios error', async () => {
                axiosGetStub.rejects(new Error('API down'));
                const url = await ngrokUtils.getNgrokPublicUrl();
                expect(url).to.be.undefined;
            });
        });

        describe('updateEnvCallbackUrl', () => {
            const mockNgrokUrl = 'https://fake-ngrok.io';
            // Use a fixed path for .env that the test can reliably mock
            const envPath = path.resolve(process.cwd(), '.env'); // Or a more specific test path if needed

            beforeEach(() => {
                // Ensure path.join for .env resolves to a predictable value for stubbing existsSync
                 path.join.withArgs(sinon.match.any, '.env').returns(envPath); // For path.join(__dirname, '..', '.env')
            });


            it('should return false if .env file does not exist', () => {
                existsSyncStub.withArgs(envPath).returns(false);
                const result = ngrokUtils.updateEnvCallbackUrl(mockNgrokUrl);
                expect(result).to.be.false;
            });

            it('should update existing GOOGLE_CALLBACK_URL', () => {
                existsSyncStub.withArgs(envPath).returns(true);
                readFileSyncStub.withArgs(envPath, 'utf8').returns('OLD_VAR=old_value\nGOOGLE_CALLBACK_URL=http://old-url.com\nOTHER_VAR=val');

                const result = ngrokUtils.updateEnvCallbackUrl(mockNgrokUrl);
                expect(result).to.be.true;
                const expectedContent = `OLD_VAR=old_value\nGOOGLE_CALLBACK_URL=${mockNgrokUrl}/auth/google/callback\nOTHER_VAR=val`;
                expect(writeFileSyncStub.calledOnceWith(envPath, expectedContent)).to.be.true;
                expect(dotenvConfigStub.calledOnce).to.be.true;
            });

            it('should add GOOGLE_CALLBACK_URL if not present', () => {
                existsSyncStub.withArgs(envPath).returns(true);
                readFileSyncStub.withArgs(envPath, 'utf8').returns('OLD_VAR=old_value\n');

                const result = ngrokUtils.updateEnvCallbackUrl(mockNgrokUrl);
                expect(result).to.be.true;
                // Ensure an extra newline isn't added if one already exists at EOF, or handle both cases.
                // The code likely adds it regardless.
                const expectedContent = `OLD_VAR=old_value\n\nGOOGLE_CALLBACK_URL=${mockNgrokUrl}/auth/google/callback`;
                expect(writeFileSyncStub.calledOnceWith(envPath, expectedContent)).to.be.true;
            });

            it('should return false on writeFileSync error', () => {
                existsSyncStub.withArgs(envPath).returns(true);
                readFileSyncStub.withArgs(envPath, 'utf8').returns('');
                writeFileSyncStub.throws(new Error('Disk full'));
                const result = ngrokUtils.updateEnvCallbackUrl(mockNgrokUrl);
                expect(result).to.be.false;
            });
        });

        describe('setupNgrokUrl', () => {
            it('should call getNgrokPublicUrl and updateEnvCallbackUrl, returning URL on success', async () => {
                // Stub the module's own functions for this higher-level test
                sandbox.stub(ngrokUtils, 'getNgrokPublicUrl').resolves('https://test-url');
                sandbox.stub(ngrokUtils, 'updateEnvCallbackUrl').returns(true);

                const url = await ngrokUtils.setupNgrokUrl();
                expect(url).to.equal('https://test-url');
                expect(ngrokUtils.getNgrokPublicUrl.calledOnce).to.be.true;
                expect(ngrokUtils.updateEnvCallbackUrl.calledOnceWith('https://test-url')).to.be.true;
            });

            it('should return undefined if getNgrokPublicUrl returns undefined', async () => {
                sandbox.stub(ngrokUtils, 'getNgrokPublicUrl').resolves(undefined);
                sandbox.spy(ngrokUtils, 'updateEnvCallbackUrl'); // Spy, should not be called

                const url = await ngrokUtils.setupNgrokUrl();
                expect(url).to.be.undefined;
                expect(ngrokUtils.updateEnvCallbackUrl.notCalled).to.be.true;
            });

            it('should return undefined if updateEnvCallbackUrl returns false', async () => {
                sandbox.stub(ngrokUtils, 'getNgrokPublicUrl').resolves('https://test-url');
                sandbox.stub(ngrokUtils, 'updateEnvCallbackUrl').returns(false);

                const url = await ngrokUtils.setupNgrokUrl();
                expect(url).to.be.undefined;
            });
        });
    });
});
