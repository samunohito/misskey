import { INestApplication } from '@nestjs/common';

export default async () => {
	console.log('called jest.global-teardown');

	const globalWithApp = global as typeof globalThis & {
		app: INestApplication | null;
	};
	const app = globalWithApp.app;
	if (app) {
		await app.close();
		console.log('test application is closed.');
	}
};

