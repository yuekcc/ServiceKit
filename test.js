import { ServiceKit, Response } from './dist/index.js';

const bus = new ServiceKit(console);

bus.on('/', () => Response.from({ message: 'ok' }, 200));

bus.launch(9099);
