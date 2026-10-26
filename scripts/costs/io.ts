// Download, unzip and line-reading helpers for the cost imports (Node only; uses the `unzip` command).
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";
import { endsInsideQuotes, splitCsvLine } from "./parse.ts";

const UA = { "User-Agent": "Vynthera cost import" };

export async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url, { headers: UA, redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res;
}

let tmp: string | undefined;
export async function tempPath(name: string): Promise<string> {
  tmp ??= await mkdtemp(path.join(tmpdir(), "vynthera-"));
  return path.join(tmp, name.replace(/[^\w.-]+/g, "_"));
}

/** Download a URL to a temporary file and return its path. */
export async function download(url: string, name: string): Promise<string> {
  const file = await tempPath(name);
  const res = await fetchOk(url);
  await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(file));
  return file;
}

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn("unzip", args);
    let out = "";
    let err = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.stderr.on("data", (d: Buffer) => (err += d.toString()));
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`unzip ${args.join(" ")} failed: ${err.trim()}`))));
  });
}

/** Names of the files inside a zip. */
export async function zipEntries(zip: string): Promise<string[]> {
  return (await run(["-Z1", zip])).split("\n").map((s) => s.trim()).filter(Boolean);
}

/** Extract one zip entry to a temporary file. */
export async function extract(zip: string, entry: string): Promise<string> {
  const file = await tempPath(path.basename(entry));
  await new Promise<void>((resolve, reject) => {
    const p = spawn("unzip", ["-p", zip, entry]);
    const out = createWriteStream(file);
    p.stdout.pipe(out);
    p.on("error", reject);
    out.on("finish", () => resolve());
    p.on("close", (code) => code !== 0 && reject(new Error(`unzip -p ${entry} failed`)));
  });
  return file;
}

/** Lines of one entry of a zip, streamed. */
export async function* zipLines(zip: string, entry: string): AsyncGenerator<string> {
  const p = spawn("unzip", ["-p", zip, entry]);
  for await (const line of createInterface({ input: p.stdout, crlfDelay: Infinity })) yield line;
}

/** Stream CSV records from a URL or local file, yielding parsed fields per record. */
export async function* csvRecords(source: string | AsyncIterable<string>): AsyncGenerator<string[]> {
  let lines: AsyncIterable<string>;
  if (typeof source !== "string") lines = source;
  else {
    const input = /^https?:/.test(source)
      ? Readable.fromWeb((await fetchOk(source)).body as import("node:stream/web").ReadableStream)
      : createReadStream(source);
    lines = createInterface({ input, crlfDelay: Infinity });
  }
  let pending = "";
  for await (const line of lines) {
    pending = pending ? `${pending}\n${line}` : line;
    if (endsInsideQuotes(pending)) continue;
    if (pending.trim()) yield splitCsvLine(pending);
    pending = "";
  }
}

/** Pipe-delimited records (CMS formulary files), header included. */
export async function* pipeRecords(lines: AsyncIterable<string>): AsyncGenerator<string[]> {
  for await (const line of lines) if (line.trim()) yield line.split("|");
}

export async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}
