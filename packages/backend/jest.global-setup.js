import {Test} from "@nestjs/testing";
import {MainModule} from "./built/MainModule.js";
import {ServerService} from "./built/server/ServerService.js";
import {QueueProcessorModule} from "./built/queue/QueueProcessorModule.js";
import {QueueProcessorService} from "./built/queue/QueueProcessorService.js";
import {ChartManagementService} from "./built/core/chart/ChartManagementService.js";

async function launch() {
	console.log('start application...');

	const mainModuleFixture = await Test
		.createTestingModule({
			imports: [
				MainModule
			]
		})
		.compile();

	const app = await mainModuleFixture.createNestApplication().init();
	const serverService = app.get(ServerService);
	await serverService.launch();

	console.log('application initialized.');

	// ----------------------------------------------

	console.log('start jobQueue...');

	const jobQueueFixture = await Test
		.createTestingModule({
			imports: [
				QueueProcessorModule
			]
		})
		.compile();

	const jobQueue = await jobQueueFixture.createNestApplication().init();
	jobQueue.get(QueueProcessorService).start();
	jobQueue.get(ChartManagementService).start();

	console.log('jobQueue initialized.');
}

export default launch
