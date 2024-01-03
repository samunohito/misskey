import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MainModule } from '@/MainModule.js';

export default async () => {
	console.log('called jest.global-setup');

	const testingModule: TestingModule = await Test
		.createTestingModule({
			imports: [MainModule],
		})
		.compile();

	const app = await testingModule.createNestApplication().init();
	console.log('test application is started.');

	const globalWithApp = global as typeof globalThis & {
		app: INestApplication | null;
	};
	globalWithApp.app = app;
};

