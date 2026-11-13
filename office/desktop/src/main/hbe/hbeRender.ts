/**
 * hbe-render client for Electron's main process — a TypeScript port of the official
 * `hbe-render.js` shipped with HBE 0.3.0 (release asset; protocol 1), kept line for line
 * in behaviour so HBE's guide applies as written.
 *
 * It starts the hbe-render helper (its own Java runtime, no system Java), keeps it running,
 * and turns each call into one JSON line on the helper's stdin and its answer back into a
 * Promise. A refusal rejects with an HbeError carrying its stable `type`.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const HBE_PROTOCOL = 1;

/** A refusal from the engine or the helper. `type` is stable; `message` is for people. */
export class HbeError extends Error {
  /** MissingRequiredField, UnrenderableText, ImageDecode, TemplateParse, BillDataParse,
   *  TemplateUnavailable, BadRequest, Internal, HelperMissing, HelperExited, Timeout, ProtocolMismatch */
  readonly type: string;
  /** For MissingRequiredField: the field key that is empty. */
  readonly field?: string;
  constructor(type: string, message: string, details: { field?: string } = {}) {
    super(message);
    this.name = "HbeError";
    this.type = type;
    this.field = details.field;
  }
}

export interface HbeStartOptions {
  /** The unpacked hbe-render-<version>-<platform> directory. */
  helperDir: string;
  /** Where synced templates are kept: the app's data directory. */
  storeDir: string;
  /** Templates shipped with the app (`<dir>/<name>/contract-<n>.json`). */
  bundledDir?: string;
  log?: (line: string) => void;
  /** Per request; default 60 s. */
  timeoutMs?: number;
}

export interface HbeRenderAnswer {
  pdf?: Buffer;
  path?: string;
  sha256: string;
  bytes: number;
  pages: number;
  template: { name?: string; contract?: number; source: "synced" | "bundled" | "inline"; sha256: string };
  templateJson?: string;
}

type Pending = { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };

export class HbeRender {
  private readonly opts: Required<Omit<HbeStartOptions, "bundledDir">> & { bundledDir?: string };
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private child: ChildProcessWithoutNullStreams | null = null;
  private closing = false;

  static async start(options: HbeStartOptions): Promise<HbeRender> {
    const client = new HbeRender(options);
    await client.spawnHelper();
    return client;
  }

  private constructor({ helperDir, storeDir, bundledDir, log, timeoutMs = 60_000 }: HbeStartOptions) {
    this.opts = { helperDir, storeDir, bundledDir, log: log ?? (() => {}), timeoutMs };
  }

  // ─── The operations ───────────────────────────────────────────────────────────

  version(): Promise<{ helper: string; engine: string; protocol: number }> {
    return this.call({ op: "version" }) as never;
  }

  /**
   * Downloads the published template if it changed. Never rejects for network trouble:
   * resolves with { result: "updated" | "unchanged" | "rejected" | "unavailable", reason? }.
   * Call it at startup and when the billing screen opens — never awaited before a render.
   */
  sync(req: { template: string; contract: number; probe?: object }): Promise<{ result: string; reason?: string }> {
    return this.call({ op: "sync", ...req }) as never;
  }

  /** Renders a bill. Never touches the network. */
  async render(req: { template?: string; contract?: number; templateJson?: string; bill: object; images?: Record<string, Uint8Array>; out?: string; returnTemplate?: boolean }): Promise<HbeRenderAnswer> {
    const answer = (await this.call({ op: "render", ...req, images: encodeImages(req.images) })) as unknown as HbeRenderAnswer & { pdf?: string | Buffer };
    if (typeof answer.pdf === "string") answer.pdf = Buffer.from(answer.pdf, "base64");
    return answer as HbeRenderAnswer;
  }

  /** Stops the helper after it has answered everything already asked. */
  close(): Promise<void> {
    this.closing = true;
    const child = this.child;
    if (!child) return Promise.resolve();
    return new Promise((resolve) => {
      child.once("exit", () => resolve());
      child.stdin.end();
    });
  }

  // ─── The process ──────────────────────────────────────────────────────────────

  private spawnHelper(): Promise<void> {
    const isWindows = process.platform === "win32";
    const java = join(this.opts.helperDir, "runtime", "bin", isWindows ? "java.exe" : "java");
    const jar = join(this.opts.helperDir, "lib", "hbe-render.jar");
    for (const file of [java, jar]) {
      if (!existsSync(file)) return Promise.reject(new HbeError("HelperMissing", `The PDF maker (hbe-render) is missing: ${file} does not exist`));
    }
    mkdirSync(this.opts.storeDir, { recursive: true });

    // A small, steady footprint: a bill needs a few MB; the serial collector suits one process doing little.
    const args = ["-Xmx512m", "-XX:+UseSerialGC", "-Djava.awt.headless=true", "-jar", jar, "serve", "--store", this.opts.storeDir];
    if (this.opts.bundledDir) args.push("--bundled", this.opts.bundledDir);

    const child = spawn(java, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    this.child = child;

    return new Promise((resolve, reject) => {
      let ready = false;
      let buffered = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        buffered += chunk;
        let newline: number;
        while ((newline = buffered.indexOf("\n")) >= 0) {
          const line = buffered.slice(0, newline);
          buffered = buffered.slice(newline + 1);
          if (!line.trim()) continue;
          let message: Record<string, unknown>;
          try {
            message = JSON.parse(line) as Record<string, unknown>;
          } catch {
            this.opts.log(`hbe-render wrote a line that is not JSON: ${line}`);
            continue;
          }
          if (!ready && message.event === "ready") {
            ready = true;
            if (message.protocol !== HBE_PROTOCOL) {
              reject(new HbeError("ProtocolMismatch", `hbe-render speaks protocol ${String(message.protocol)}; this app speaks ${HBE_PROTOCOL}`));
              child.kill();
              return;
            }
            resolve();
            continue;
          }
          this.settle(message);
        }
      });

      let errBuffered = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        errBuffered += chunk;
        const lines = errBuffered.split("\n");
        errBuffered = lines.pop() ?? "";
        lines.filter(Boolean).forEach((l) => this.opts.log(l));
      });

      child.on("error", (error) => {
        if (!ready) reject(new HbeError("HelperMissing", `Could not start the PDF maker: ${error.message}`));
      });
      child.on("exit", (code, signal) => {
        this.child = null;
        const reason = new HbeError("HelperExited", `The PDF maker stopped (${signal ?? code})`);
        if (!ready) reject(reason);
        for (const { reject: fail, timer } of this.pending.values()) {
          clearTimeout(timer);
          fail(reason);
        }
        this.pending.clear();
      });
    });
  }

  private async call(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    // A helper that died (killed by the OS, a crash) is started again on the next call.
    if (!this.child) {
      if (this.closing) throw new HbeError("HelperExited", "The PDF maker was closed");
      await this.spawnHelper();
    }
    const id = this.nextId++;
    const line = `${JSON.stringify(stripUndefined({ id, ...request }))}\n`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new HbeError("Timeout", `The PDF maker did not answer ${String(request.op)} within ${this.opts.timeoutMs} ms`));
      }, this.opts.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child!.stdin.write(line, "utf8");
    });
  }

  private settle(message: Record<string, unknown>): void {
    const pending = this.pending.get(message.id as number);
    if (!pending) {
      if (message.ok === false) this.opts.log(`hbe-render: ${String((message.error as { message?: string } | undefined)?.message)}`);
      return;
    }
    this.pending.delete(message.id as number);
    clearTimeout(pending.timer);
    if (message.ok) {
      delete message.id;
      delete message.ok;
      pending.resolve(message);
    } else {
      const error = (message.error ?? {}) as { type?: string; message?: string; field?: string };
      pending.reject(new HbeError(error.type ?? "Internal", error.message ?? "The PDF maker refused the request", error));
    }
  }
}

function encodeImages(images?: Record<string, Uint8Array>): Record<string, string> | undefined {
  if (!images) return undefined;
  return Object.fromEntries(Object.entries(images).map(([key, bytes]) => [key, Buffer.from(bytes).toString("base64")]));
}

function stripUndefined(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}
