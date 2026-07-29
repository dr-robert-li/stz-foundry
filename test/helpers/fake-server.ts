/**
 * Shared offline HTTP test double — in-process `node:http` server, zero deps,
 * zero network. `test/foundry-provider.test.ts` and
 * `test/knowledge-embedder.test.ts` each carry their own copy of this idiom;
 * the latter's `ponytail:` comment names "a third consumer" as its own
 * extraction trigger — `test/foundry-agent-runner.test.ts` is that third
 * consumer. Migrating the two existing copies onto this helper is 01-05's
 * mechanical follow-up.
 *
 * NOT collected as a vitest suite (`vitest.config.ts` only globs
 * `test/**\/*.test.ts`), but IS typechecked (`tsconfig.json` includes `test`).
 */
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";

/** `null` = never answer, the wedged-listener case 01-04 needs. */
export type FakeServerHandler = (
  req: IncomingMessage,
  body: any,
) => { status: number; json: unknown } | null;

export interface FakeServerRequest {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: any;
}

export interface FakeServerHandle {
  url: string;
  requests: FakeServerRequest[];
  close: () => void;
}

const servers: Server[] = [];

/** Close every fake server booted since the last call. Call from `afterEach`. */
export function closeAllFakeServers(): void {
  for (const s of servers.splice(0)) s.close();
}

/**
 * Boot an in-process HTTP server on an ephemeral 127.0.0.1 port. Returns its
 * base URL and the captured request log. `handler` returning `null` leaves
 * the response unwritten (a hang, for wedged-listener tests).
 */
export async function fakeServer(handler: FakeServerHandler): Promise<FakeServerHandle> {
  const requests: FakeServerRequest[] = [];
  const server = createServer((req, res: ServerResponse) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : null;
      requests.push({ path: req.url ?? "", headers: req.headers, body });
      const out = handler(req, body);
      if (!out) return; // hang: headers never written, response never ended
      res.writeHead(out.status, { "content-type": "application/json" });
      res.end(JSON.stringify(out.json));
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${addr.port}`,
    requests,
    close: () => server.close(),
  };
}
