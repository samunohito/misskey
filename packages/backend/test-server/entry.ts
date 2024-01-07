import { Test } from '@nestjs/testing';
import { portToPid } from 'pid-port';
import fkill from 'fkill';
import { MainModule } from '@/MainModule.js';
import { ServerService } from '@/server/ServerService.js';
import { loadConfig } from '@/config.js';

async function launch() {
	process.env.NODE_ENV = 'test';

	await killTestServer();

	console.log('starting application...');

	const mainModuleFixture = await Test
		.createTestingModule({
			imports: [MainModule],
		})
		.compile();

	const app = await mainModuleFixture.createNestApplication().init();
	const serverService = app.get(ServerService);
	await serverService.launch();

	// ジョブキューは必要な時にテストコード側で起動する

	console.log('application initialized.');
}

async function killTestServer() {
	// 既に重複したポートがある場合はkill
	const config = loadConfig();
	try {
		const pid = await portToPid(config.port);
		if (pid) {
			await fkill(pid, { force: true });
		}
	} catch {
		// NOP;
	}
}

export default launch;
