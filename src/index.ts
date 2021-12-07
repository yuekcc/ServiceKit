import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Stream } from 'stream';

export interface ReplyOptions {
  status: number;
  headers?: Record<string, string>;
}

export type ReplayPayload = Buffer | object | Array<any> | string | number | boolean;

export class Reply {
  status: number = 200;
  data?: ReplayPayload;
  headers?: Record<string, string>;

  constructor(data: ReplayPayload, { status, headers }: ReplyOptions) {
    this.status = status;
    this.data = data;
    this.headers = headers;
  }

  static from(obj: object | string, status: number = 200): Reply {
    if (typeof obj === 'string') {
      return new Reply(Buffer.from(obj, 'utf-8'), {
        status,
        headers: { 'Content-Type': 'plain/text; charset=utf-8' },
      });
    }

    return new Reply(Buffer.from(JSON.stringify(obj), 'utf-8'), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

export interface Context {
  data: Buffer;
  headers: Record<string, string>;
  method: string;
  pathname: string;
  pathParams: Record<string, string>;
  searchParams: URLSearchParams;
}

export type Handler = (context: Readonly<Context>) => Promise<Reply>;

export interface Router {
  [url: string]: Handler;
}

export interface Route {
  path: string;
  handler: Handler;
  match: (path: string) => Record<string, string> | null;
}

function pathToMatcher(path: string): (pathname: string) => Record<string, string> | null {
  const samples = path.split('/').filter(Boolean);
  const samplesLen = samples.length;

  return (path: string) => {
    const parts = path.split('/').filter(Boolean);
    if (parts.length != samplesLen) {
      return null;
    }

    const pathParams: Record<string, string> = {};

    for (let i = 0; i < samplesLen; i++) {
      const sample = samples[i];
      const part = parts[i];

      if (sample.startsWith(':')) {
        pathParams[sample.substr(1)] = part;
        continue;
      }

      if (sample !== part) {
        return null;
      }
    }

    return pathParams;
  };
}

function readAll(rs: Stream): Promise<Buffer> {
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

export class HttpServer {
  private logger!: Console;
  private routes: Route[] = [];
  private supportedHttpMethods = ['OPTIONS', 'GET', 'POST', 'PUT', 'DELETE'];

  constructor(logger: Console) {
    this.logger = logger;
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method?.toUpperCase();

    if (!this.supportedHttpMethods.includes(method)) {
      res.writeHead(405);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname || '/';

    let handler: Handler;
    let pathParams: Record<string, string> = {};
    for (const route of this.routes) {
      pathParams = route.match(pathname);
      if (pathParams) {
        handler = route.handler;
        break;
      }
    }

    if (!handler) {
      res.writeHead(404);
      res.end();
      return;
    }

    const context: Context = Object.freeze({
      data: method === 'POST' || method === 'PUT' ? await readAll(req) : null,
      headers: req.headers as Record<string, string>,
      method,
      pathname,
      pathParams,
      searchParams: url.searchParams,
    });

    try {
      const reply = await handler(context);

      res.writeHead(reply.status, null, reply.headers);
      if (reply.data) {
        res.write(reply.data);
      }
    } catch (err: unknown) {
      res.writeHead(500);
      res.write((err as Error).message || 'unknown error');
    } finally {
      res.end();
    }
  }

  on(path: string, handler: Handler) {
    this.routes.push({
      path,
      handler,
      match: pathToMatcher(path),
    });

    return this;
  }

  serve(port: number) {
    this.routes.sort((a, b) => b.path.length - a.path.length);

    const server = createServer((req, res) => this.handleRequest(req, res));

    server.listen(port, () => {
      this.logger.info('\n\t' + `Server hosted at http://localhost:${port}` + '\n');
    });
  }
}
