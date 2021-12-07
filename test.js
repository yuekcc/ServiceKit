import { HttpServer, Reply } from './dist/index.js';

new HttpServer(console)
  .on('/', () => Reply.from({ message: 'ok' }, 200))
  .on('/:name', ({ pathParams }) => Reply.from({ message: pathParams.name }, 200))
  .on('/:name/age/:age', ({ pathParams }) =>
    Reply.from({ message: { name: pathParams.name, age: pathParams.age } }, 200),
  )
  .serve(9099);
