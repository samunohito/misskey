import { initTestDb } from './utils.js';

beforeAll(async () => {
	await initTestDb(false);
});
