import { HttpServer, Reply } from './dist/index.js';

new HttpServer(console).on('/', () => Reply.from({ message: 'ok' }, 200)).serve(9099);
