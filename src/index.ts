import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Stream } from 'stream';

export type LoggerMethod = 'info' | 'warn' | 'error' | 'debug' | 'trace';

export interface Logger {
  [method: string]: (...msg: any[]) => void;
}

export interface Response {
  status: number;
  body?: Buffer;
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
      const context = {
        method,
        pathname,
        searchParams: url.searchParams,
        headers: req.headers,
        data: method === 'POST' || method === 'PUT' ? await getRequestBody(req) : null,
      };

      const response = await handler(context);
      res.writeHead(response.status);
      if (response.body) {
        res.write(response.body);
      }

      res.end();
      return;
    }

    res.writeHead(404);
    res.end();
  }

  on(url: string, handler: Handler) {
    const prefixedPath = `${url}`;
    this.router[prefixedPath] = handler;

    return this;
  }

  listen(port: number) {
    const server = createServer((req, res) => this.doRequest(req, res));
    server.listen(port, () => {
      this.logger.info('\n\n' + `Server started on http://localhost:${port}` + '\n\n');
    });
  }
}
