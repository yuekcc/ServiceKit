import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Stream } from 'stream';

export type LoggerMethod = 'info' | 'warn' | 'error' | 'debug' | 'trace';

export interface Logger {
  [method: string]: (...msg: any[]) => void;
}

export class Response {
  status: number = 200;
  data?: Buffer = null;

  constructor(data: Buffer, status) {
    this.status = status;
    this.data = data;
  }

  static from(obj: object, status: number = 200): Response {
    if (typeof obj === 'string') {
      return new Response(Buffer.from(obj, 'utf-8'), status);
    }

    return new Response(Buffer.from(JSON.stringify(obj), 'utf-8'), status);
  }
}

export type Handler = (context: any) => Promise<Response>;

export interface Router {
  [url: string]: Handler;
}

function getRequestBody(rs: Stream): Promise<Buffer> {
  return new Promise(resolve => {
    let result: Buffer | null = null;
    rs.addListener('data', (chunk: Buffer) => {
      if (result) {
        result = Buffer.concat([result, chunk]);
      } else {
        result = Buffer.concat([chunk]);
      }
    });

    rs.addListener('end', () => resolve(result));
  });
}

export class ServiceKit {
  private logger!: Logger;
  private router!: Router;
  private supportedHttpMethods = ['OPTIONS', 'GET', 'POST', 'PUT', 'DELETE'];

  constructor(logger: Logger) {
    this.logger = logger;
    this.router = {};
  }

  private async doRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method?.toUpperCase();

    if (!this.supportedHttpMethods.includes(method)) {
      res.writeHead(405);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname || '/';

    const prefixedPath = `${pathname}`;

    const handler = this.router[prefixedPath];
    if (handler) {
      const event = {
        data: method === 'POST' || method === 'PUT' ? await getRequestBody(req) : null,
        headers: req.headers,
        method,
        pathname,
        searchParams: url.searchParams,
      };

      try {
        const reply = await handler(event);
        res.writeHead(reply.status);
        if (reply.data) {
          res.write(reply.data);
        }
      } catch (err: unknown) {
        res.writeHead(500);
        res.write((err as Error).message || 'unknown error');
      }

      res.end();
      return;
    }

    res.writeHead(404);
    res.end();
  }

  on(path: string, handler: Handler) {
    this.router[path] = handler;

    return this;
  }

  launch(port: number) {
    const server = createServer((req, res) => this.doRequest(req, res));

    server.listen(port, () => {
      this.logger.info('\n\n' + `Server started on http://localhost:${port}` + '\n\n');
    });
  }
}
