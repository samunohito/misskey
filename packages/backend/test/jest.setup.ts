import { INestApplicationContext } from "@nestjs/common";
import { startServer } from "@/../test/utils.js";

beforeAll(async () => {
	console.log('called jest.global-setup');

	const globalWithApp = global as typeof globalThis & {
		app: INestApplicationContext | null;
	};

	if (!globalWithApp.app) {
		const app = await startServer();
		console.log('test application is started.');
		globalWithApp.app = app;
	}
})

