#!/usr/bin/env node
// Smoke test 4 narzedzi przez klienta MCP (live vs realny korpus).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(here, "..", "dist", "index.js");

const transport = new StdioClientTransport({ command: "node", args: [serverPath] });
const client = new Client({ name: "smoke", version: "0.0.0" }, { capabilities: {} });
await client.connect(transport);

const tools = await client.listTools();
console.log("TOOLS:", tools.tools.map((t) => t.name).join(", "));

function citeCount(res) { return res.structuredContent?.citations?.length ?? 0; }
function firstLines(res, n = 3) { return (res.content?.[0]?.text ?? "").split("\n").slice(0, n).join("\n"); }

let fails = 0;
async function call(name, args, expect) {
    const res = await client.callTool({ name, arguments: args });
    const cites = citeCount(res);
    const ok = expect(res, cites);
    if (!ok) fails++;
    console.log(`\n${ok ? "PASS" : "FAIL"} ${name}(${JSON.stringify(args)}) | citations=${cites} | isError=${!!res.isError}`);
    console.log("   " + firstLines(res).replace(/\n/g, "\n   "));
    return res;
}

await call("fr_list_documents", { query: "travail", limit: 3 }, (r) => !r.isError && (r.structuredContent?.documents?.length ?? 0) > 0);
await call("fr_search", { query: "licenciement", documents: ["code-travail"], limit: 2 }, (r, c) => !r.isError && c > 0);
await call("fr_article", { document_id: "code-travail", provision_ref: "Article L. 1233-15" }, (r, c) => !r.isError && c === 1);
await call("fr_validate_citation", { document_id: "code-civil", provision_ref: "1" }, (r) => !r.isError && r.structuredContent?.provision_exists === true);
await call("fr_validate_citation", { document_id: "code-civil", provision_ref: "99999-zzz" }, (r) => !r.isError && r.structuredContent?.provision_exists === false);
await call("fr_search", { query: "", limit: 1 }, (r) => r.isError === true);

console.log(`\n${fails === 0 ? "SMOKE PASS" : `SMOKE FAIL (${fails})`}`);
await client.close();
process.exit(fails ? 1 : 0);
