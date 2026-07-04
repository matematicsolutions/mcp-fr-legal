#!/usr/bin/env node
// mcp-fr-legal - offline MCP korpus prawa francuskiego (Legifrance/DILA) w node:sqlite FTS5.
// Verbatim, zero-LLM w sciezce retrievalu - kazda odpowiedz z structuredContent.citations
// (document_id + provision_ref + URL Legifrance + snapshot). Anti-halucynacja przez mechanike.
//
// Rodzina konektorow prawa MateMatic (mcp-saos, mcp-eu-compliance, mcp-eu-sparql, ...).
// Wzorzec architektoniczny: mcp-eu-compliance. Korpus: artefakt danych Ansvar-Systems/French-law-mcp
// (Apache-2.0) zbudowany z DILA LEGI; tekst = Licence Ouverte v2.0 (Etalab). Patrz THIRD_PARTY_INSPIRATIONS.md.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { DatabaseSync } from "node:sqlite";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { ensureCorpus } from "./corpus.js";
import { buildProvenance, stalenessThresholdDays, type Provenance } from "./provenance.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Korpus (offline). Kolejnosc: FR_LEGAL_DB (override) -> data/database.db (dev) -> cache
// (pobierany RAZ z tarballa npm Ansvar; patrz corpus.ts). Sciezka ustawiana w main().
// ---------------------------------------------------------------------------
const BUNDLED_DB = path.join(__dirname, "..", "data", "database.db");
const CACHE_DB = path.join(os.homedir(), ".matematic", "cache", "fr-legal", "database.db");

let DB_PATH = "";

let dbHandle: DatabaseSync | null = null;
function db(): DatabaseSync {
    if (!DB_PATH) throw new Error("Korpus nierozwiazany (DB_PATH pusty) - blad startu serwera");
    if (!dbHandle) dbHandle = new DatabaseSync(DB_PATH, { readOnly: true });
    return dbHandle;
}

// Provenance korpusu z db_metadata.built_at (leniwie, cache) - snapshot_date + staleness_advisory.
let provCache: Provenance | null = null;
function provenance(): Provenance {
    if (provCache) return provCache;
    let builtAt = "";
    try {
        const row = db().prepare("SELECT value FROM db_metadata WHERE key = 'built_at'").get() as
            | { value?: string }
            | undefined;
        builtAt = row?.value ? String(row.value) : "";
    } catch {
        builtAt = "";
    }
    provCache = buildProvenance(builtAt, stalenessThresholdDays());
    return provCache;
}
function snapshot(): string {
    return provenance().snapshot_date;
}

function disclaimer(): string {
    return (
        `\n---\n` +
        `Zrodlo: korpus Legifrance/DILA (Licence Ouverte v2.0 - Etalab), snapshot z ${snapshot()}. ` +
        `Tekst zwracany verbatim z bazy (bez przetwarzania modelem). ` +
        `Wersja autentyczna = Journal officiel de la Republique francaise; sprawdz aktualnosc na Legifrance. ` +
        `To material referencyjny, nie porada prawna.`
    );
}

// ---------------------------------------------------------------------------
// Bledy (strukturalne kody - klient MCP moze iterowac)
// ---------------------------------------------------------------------------
type ErrorCode = "missing_arg" | "empty_query" | "not_found" | "corpus_error";
function errorResult(message: string, code: ErrorCode) {
    return {
        isError: true,
        content: [{ type: "text" as const, text: `[${code}] ${message}` }],
        structuredContent: { error_code: code },
    };
}

// ---------------------------------------------------------------------------
// Pomocnicze
// ---------------------------------------------------------------------------
interface DocRow {
    id: string;
    type: string | null;
    title: string | null;
    short_name: string | null;
    url: string | null;
    status: string | null;
}
const docCache = new Map<string, DocRow | null>();
function getDoc(id: string): DocRow | null {
    if (docCache.has(id)) return docCache.get(id) ?? null;
    const row = db()
        .prepare("SELECT id, type, title, short_name, url, status FROM legal_documents WHERE id = ?")
        .get(id) as DocRow | undefined;
    docCache.set(id, row ?? null);
    return row ?? null;
}

// Precyzyjny URL Legifrance na poziomie dokumentu (kodu/ustawy) + odsylacz do provision_ref
// w polu human-readable (baza nie trzyma per-article LEGIARTI, wiec link celuje w dokument).
function docUrl(doc: DocRow | null): string | null {
    return doc?.url ?? null;
}

function buildCitation(doc: DocRow | null, provisionRef: string, provisionTitle?: string | null) {
    const p = provenance();
    return {
        document_id: doc?.id ?? null,
        document_title: doc?.title ?? doc?.short_name ?? null,
        provision_ref: provisionRef,
        ...(provisionTitle ? { provision_title: provisionTitle } : {}),
        legifrance_url: docUrl(doc),
        source_authority: "DILA (Legifrance)",
        license: "Licence Ouverte v2.0 (Etalab)",
        snapshot: p.snapshot_date,
        age_days: p.age_days,
        ...(p.staleness_advisory ? { staleness_advisory: p.staleness_advisory } : {}),
    };
}

// Normalizacja odwolania do przepisu: "Article L. 1233-15" / "L1233-15" / "art. 1233-15" -> "artL1233-15".
function normRef(input: string): string {
    let s = String(input).trim().toLowerCase().replace(/\s+/g, "").replace(/\./g, "");
    s = s.replace(/^article/, "").replace(/^art/, "");
    s = s.replace(/^([lrda])/, (m) => m.toUpperCase()); // prefiks L/R/D/A wielka litera
    return "art" + s;
}

// FTS5 MATCH bezpieczny: kazdy term jako fraza, laczone OR (recall), bm25 (ORDER BY rank) na gorze.
function toFtsMatch(query: string): string {
    const terms = query.match(/[\p{L}\p{N}]+/gu);
    if (!terms || terms.length === 0) return "";
    return terms.map((t) => `"${t}"`).join(" OR ");
}

// ---------------------------------------------------------------------------
// Handlery
// ---------------------------------------------------------------------------
function handleSearch(a: Record<string, unknown>) {
    const query = typeof a.query === "string" ? a.query : "";
    if (!query.trim()) return errorResult("Parametr 'query' wymagany (niepusty)", "missing_arg");
    const match = toFtsMatch(query);
    if (!match) return errorResult("Zapytanie po normalizacji nie zawiera slow do wyszukania", "empty_query");
    const limit = Math.min(Math.max(Number(a.limit) || 5, 1), 25);
    const docs = Array.isArray(a.documents)
        ? a.documents.map((x) => String(x)).filter(Boolean)
        : [];

    try {
        const params: (string | number)[] = [match];
        let docFilter = "";
        if (docs.length > 0) {
            docFilter = ` AND p.document_id IN (${docs.map(() => "?").join(",")})`;
            params.push(...docs);
        }
        params.push(limit);
        const rows = db()
            .prepare(
                `SELECT p.document_id AS document_id, p.provision_ref AS provision_ref,
                        p.title AS title,
                        snippet(provisions_fts, -1, '[', ']', ' ... ', 12) AS snip
                 FROM provisions_fts f
                 JOIN legal_provisions p ON p.id = f.rowid
                 WHERE provisions_fts MATCH ?${docFilter}
                 ORDER BY rank
                 LIMIT ?`,
            )
            .all(...params) as { document_id: string; provision_ref: string; title: string | null; snip: string }[];

        if (rows.length === 0) {
            return {
                content: [{ type: "text" as const, text: `Brak trafien dla zapytania "${query}".${disclaimer()}` }],
                structuredContent: { citations: [], results: [] },
            };
        }
        const citations = rows.map((r) => buildCitation(getDoc(r.document_id), r.provision_ref, r.title));
        const lines = rows
            .map((r, i) => {
                const doc = getDoc(r.document_id);
                const name = doc?.title ?? doc?.short_name ?? r.document_id;
                return `${i + 1}. [${name}] ${r.title ?? r.provision_ref}: ${r.snip}`;
            })
            .join("\n");
        return {
            content: [{ type: "text" as const, text: `${lines}${disclaimer()}` }],
            structuredContent: { citations, results: rows },
        };
    } catch (err) {
        return errorResult(`Blad dostepu do korpusu FR: ${(err as Error).message}`, "corpus_error");
    }
}

function handleArticle(a: Record<string, unknown>) {
    const documentId = typeof a.document_id === "string" ? a.document_id : "";
    const provisionRaw = typeof a.provision_ref === "string" ? a.provision_ref : "";
    if (!documentId) return errorResult("Parametr 'document_id' wymagany (np. 'code-civil')", "missing_arg");
    if (!provisionRaw) return errorResult("Parametr 'provision_ref' wymagany (np. 'L1233-15' albo '1')", "missing_arg");
    const ref = normRef(provisionRaw);
    try {
        const row = db()
            .prepare(
                `SELECT document_id, provision_ref, title, chapter, section, content, valid_from, valid_to
                 FROM legal_provisions
                 WHERE document_id = ? AND lower(provision_ref) = lower(?)`,
            )
            .get(documentId, ref) as
            | { document_id: string; provision_ref: string; title: string | null; chapter: string | null; section: string | null; content: string; valid_from: string | null; valid_to: string | null }
            | undefined;
        if (!row) {
            return errorResult(
                `Nie znaleziono przepisu '${provisionRaw}' (znormalizowano do '${ref}') w '${documentId}'. Uzyj fr_search albo fr_list_documents.`,
                "not_found",
            );
        }
        const doc = getDoc(row.document_id);
        const citation = buildCitation(doc, row.provision_ref, row.title);
        const header = `${doc?.title ?? row.document_id} - ${row.title ?? row.provision_ref}`;
        return {
            content: [{ type: "text" as const, text: `${header}\n\n${row.content}${disclaimer()}` }],
            structuredContent: { citations: [citation], provision: row },
        };
    } catch (err) {
        return errorResult(`Blad dostepu do korpusu FR: ${(err as Error).message}`, "corpus_error");
    }
}

// Grounding primitive - istnienie cytatu w korpusie (fail-closed: brak DB/przepisu => valid:false).
function handleValidateCitation(a: Record<string, unknown>) {
    const documentId = typeof a.document_id === "string" ? a.document_id : "";
    const provisionRaw = typeof a.provision_ref === "string" ? a.provision_ref : "";
    if (!documentId) return errorResult("Parametr 'document_id' wymagany", "missing_arg");
    if (!provisionRaw) return errorResult("Parametr 'provision_ref' wymagany", "missing_arg");
    const ref = normRef(provisionRaw);
    try {
        const doc = getDoc(documentId);
        const documentExists = doc != null;
        const prov = documentExists
            ? (db()
                  .prepare(
                      `SELECT provision_ref, title, valid_to FROM legal_provisions
                       WHERE document_id = ? AND lower(provision_ref) = lower(?)`,
                  )
                  .get(documentId, ref) as { provision_ref: string; title: string | null; valid_to: string | null } | undefined)
            : undefined;
        const provisionExists = prov != null;
        const inForce = provisionExists ? prov!.valid_to == null || prov!.valid_to === "" : false;
        const citation = provisionExists ? buildCitation(doc, prov!.provision_ref, prov!.title) : null;
        const verdict = documentExists && provisionExists ? "ISTNIEJE" : "BRAK - mozliwa halucynacja";
        return {
            content: [
                {
                    type: "text" as const,
                    text:
                        `Weryfikacja: ${documentId} ${provisionRaw} -> ${verdict}\n` +
                        `document_exists=${documentExists}, provision_exists=${provisionExists}, in_force=${inForce}${disclaimer()}`,
                },
            ],
            structuredContent: {
                document_exists: documentExists,
                provision_exists: provisionExists,
                in_force: inForce,
                normalized_ref: ref,
                citations: citation ? [citation] : [],
            },
        };
    } catch (err) {
        return errorResult(`Blad dostepu do korpusu FR: ${(err as Error).message}`, "corpus_error");
    }
}

function handleListDocuments(a: Record<string, unknown>) {
    const type = typeof a.type === "string" ? a.type : "";
    const query = typeof a.query === "string" ? a.query : "";
    const limit = Math.min(Math.max(Number(a.limit) || 30, 1), 200);
    try {
        const clauses: string[] = [];
        const params: (string | number)[] = [];
        if (type) { clauses.push("type = ?"); params.push(type); }
        if (query) { clauses.push("(title LIKE ? OR short_name LIKE ? OR id LIKE ?)"); const q = `%${query}%`; params.push(q, q, q); }
        const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
        params.push(limit);
        const rows = db()
            .prepare(`SELECT id, type, title, short_name, status, url FROM legal_documents ${where} ORDER BY id LIMIT ?`)
            .all(...params) as unknown as DocRow[];
        const lines = rows.map((r) => `- ${r.id} (${r.type ?? "?"}): ${r.title ?? r.short_name ?? ""}`).join("\n");
        return {
            content: [{ type: "text" as const, text: `${rows.length} dokumentow:\n${lines}${disclaimer()}` }],
            structuredContent: { documents: rows },
        };
    } catch (err) {
        return errorResult(`Blad dostepu do korpusu FR: ${(err as Error).message}`, "corpus_error");
    }
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------
const READ_ONLY = { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false };
const TOOLS: Tool[] = [
    {
        name: "fr_search",
        description:
            "Pelnotekstowo (FTS5) po przepisach prawa francuskiego (kody + ustawy LEGI). Snippety verbatim z markerami [ ]. " +
            "Opcjonalny filtr `documents` (lista document_id, np. ['code-travail']). Zwraca structuredContent.citations. " +
            "Kody bledow: missing_arg, empty_query, corpus_error.",
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string", description: "Fraza/keyword po francusku (np. 'licenciement', 'responsabilite civile')" },
                documents: { type: "array", items: { type: "string" }, description: "Opcjonalny filtr document_id" },
                limit: { type: "number", description: "Liczba wynikow (1-25, domyslnie 5)" },
            },
            required: ["query"],
        },
        annotations: READ_ONLY,
    },
    {
        name: "fr_article",
        description:
            "Pelny verbatim tekst przepisu (document_id + provision_ref, np. 'code-travail' + 'L1233-15'). " +
            "provision_ref tolerancyjny ('Article L. 1233-15' == 'L1233-15'). Kody bledow: missing_arg, not_found, corpus_error.",
        inputSchema: {
            type: "object",
            properties: {
                document_id: { type: "string", description: "ID dokumentu (np. 'code-civil', 'code-travail')" },
                provision_ref: { type: "string", description: "Odwolanie do przepisu (np. 'L1233-15', '1234', 'R123-4')" },
            },
            required: ["document_id", "provision_ref"],
        },
        annotations: READ_ONLY,
    },
    {
        name: "fr_validate_citation",
        description:
            "Grounding: czy cytat (document_id + provision_ref) ISTNIEJE w korpusie (anti-halucynacja). Fail-closed: " +
            "brak dokumentu/przepisu => provision_exists=false. Zwraca document_exists, provision_exists, in_force + citation. " +
            "Kody bledow: missing_arg, corpus_error.",
        inputSchema: {
            type: "object",
            properties: {
                document_id: { type: "string", description: "ID dokumentu" },
                provision_ref: { type: "string", description: "Odwolanie do przepisu do weryfikacji" },
            },
            required: ["document_id", "provision_ref"],
        },
        annotations: READ_ONLY,
    },
    {
        name: "fr_list_documents",
        description:
            "Lista dostepnych dokumentow (kody/ustawy) - discovery document_id. Opcjonalnie filtr `type` (np. 'statute') " +
            "i `query` (fraza w tytule). Kody bledow: corpus_error.",
        inputSchema: {
            type: "object",
            properties: {
                type: { type: "string", description: "Filtr typu dokumentu (np. 'statute')" },
                query: { type: "string", description: "Fraza w tytule/nazwie" },
                limit: { type: "number", description: "Liczba wynikow (1-200, domyslnie 30)" },
            },
        },
        annotations: READ_ONLY,
    },
];

function buildInstructions(): string {
    return `Ten serwer MCP zwraca verbatim tekst prawa francuskiego (Legifrance/DILA) z lokalnego korpusu SQLite FTS5. Kody + ustawy LEGI (Code civil, Code du travail, Code penal, Code de commerce, ...). Snapshot offline, zero-LLM w sciezce retrievalu - tresc grounding, nie generowana przez model.

## Kolejnosc wywolan
1. \`fr_list_documents\` - poznaj dostepne document_id (np. 'code-travail'), gdy nie znasz ID.
2. \`fr_search\` - keyword/fraza po francusku po przepisach; snippety FTS5 (bm25) z markerami [ ]. Pierwszy krok merytoryczny.
3. \`fr_article\` - pelny tekst konkretnego przepisu (document_id + provision_ref) gdy potrzebny doslowny przepis.
4. \`fr_validate_citation\` - GROUNDING: sprawdz czy cytat istnieje ZANIM go zacytujesz w odpowiedzi (anti-halucynacja, fail-closed).

## Twarde ograniczenia
- **Verbatim** - tekst zwracany bez przetwarzania modelem (grounding). NIE parafrazuj przepisu jako cytatu.
- **Snapshot, NIE zrodlo autentyczne** - wersja autentyczna = Journal officiel; sprawdz aktualnosc na Legifrance. Disclaimer zostaje w odpowiedzi.
- **structuredContent.citations** zawsze wypelnione (document_id, provision_ref, URL Legifrance, snapshot, licencja Etalab). Cytuj je.
- **Zakres: kody + ustawy LEGI, BEZ orzecznictwa (jurisprudence)** i bez pelnego JORF. Do orzecznictwa/aktualnosci: inne zrodla.

## Iteracja po bledach
Tool zwraca isError:true + [kod]:
- \`missing_arg\` - brakujacy parametr. Przeczytaj inputSchema.
- \`empty_query\` - query bez slow do wyszukania. Doprecyzuj.
- \`not_found\` - przepis/dokument nie w snapshot. Uzyj fr_search / fr_list_documents.
- \`corpus_error\` - blad dostepu do bazy. Retry raz.

## Styl
- Cytuj w formacie "art. L. 1233-15 Code du travail". Ujawniaj snapshot. Disclaimer zawsze zostaje.`;
}

// ---------------------------------------------------------------------------
// Serwer
// ---------------------------------------------------------------------------
const server = new Server(
    { name: "mcp-fr-legal", version: "0.1.0" },
    { capabilities: { tools: {} }, instructions: buildInstructions() },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        annotations: t.annotations,
    })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {}) as Record<string, unknown>;
    try {
        switch (name) {
            case "fr_search": return handleSearch(a);
            case "fr_article": return handleArticle(a);
            case "fr_validate_citation": return handleValidateCitation(a);
            case "fr_list_documents": return handleListDocuments(a);
            default: return errorResult(`Nieznane narzedzie: ${name}`, "missing_arg");
        }
    } catch (err: unknown) {
        return errorResult(`Blad wewnetrzny: ${(err as Error).message}`, "corpus_error");
    }
});

async function main() {
    // Rozwiaz/pobierz korpus RAZ przed serwowaniem (bootstrap; DB otwierana leniwie w db()).
    DB_PATH = await ensureCorpus(BUNDLED_DB, CACHE_DB, process.env.FR_LEGAL_DB);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write(`mcp-fr-legal gotowy (korpus: ${path.basename(DB_PATH)})\n`);
}

main().catch((err) => {
    process.stderr.write(`Fatal: ${(err as Error).message}\n`);
    process.exit(1);
});
