import { ServiceKit } from './dist/index.js';

const srv = new ServiceKit(console);

srv
  .on('/', () => {
    return {
      status: 200,
      body: JSON.stringify({ message: 'ok' }),
    };
  })
  .listen(9099);
