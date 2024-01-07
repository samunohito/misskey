import { Test } from '@nestjs/testing';
import { portToPid } from 'pid-port';
import fkill from 'fkill';
import { MainModule } from '@/MainModule.js';
import { ServerService } from '@/server/ServerService.js';
import { loadConfig } from '@/config.js';

async function launch() {
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

	console.log('starting application...');

	const mainModuleFixture = await Test
		.createTestingModule({
			imports: [MainModule],
		})
		.compile();

	const app = await mainModuleFixture.createNestApplication().init();
	const serverService = app.get(ServerService);
	await serverService.launch();

	console.log('application initialized.');
}

export default launch;
