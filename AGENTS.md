# AGENTS.md - mcp-fr-legal

An [agents.md](https://agents.md) standard file - canonical instructions for AI agents working in this repo.

## Project goal

An **MCP** server exposing an **offline corpus of French law** (Legifrance / DILA) in a local
**SQLite FTS5** database, with tools for search and citation grounding. **Verbatim, zero-LLM** on the
retrieval path - snippets come from the database unchanged, each with a `document_id`, a
`provision_ref` and a Legifrance URL.

Another connector in the MateMatic law family (mcp-saos, mcp-eu-compliance, mcp-eu-sparql, mcp-krs).
Architecture pattern: **mcp-eu-compliance**.

## HARD CONSTRAINTS (MateMatic context)

- **Every call MUST return `structuredContent.citations`** with: document_id, provision_ref,
  legifrance_url, source_authority (DILA), license (Etalab v2.0), snapshot.
- **Verbatim** - text is not processed by a model (grounding, anti-hallucination).
- **Snapshot, not the authoritative source** - a disclaimer on every response (the authoritative source is the Journal officiel).
- **Scope: LEGI codes and statutes, NO case law** and no full JORF.
- **Offline** - no network at runtime. Corpus bootstrap only via `fetch-corpus`.
- **Etalab attribution is MANDATORY** on republication (DILA/Legifrance).

## Tools contract

| Tool | Parameters | Returns |
|---|---|---|
| `fr_search` | query, documents?, limit? | verbatim FTS5 snippets + citations |
| `fr_article` | document_id, provision_ref | full provision text + citation |
| `fr_validate_citation` | document_id, provision_ref | grounding: document_exists/provision_exists/in_force |
| `fr_list_documents` | type?, query?, limit? | list of documents (discovery) |

## Build and test

```bash
npm install            # Node 22.5+ (node:sqlite built in)
npm run fetch-corpus   # downloads database.db from the Ansvar/DILA artifact (Apache-2.0 + Etalab)
npm run build          # tsc -> dist/
npm run drift          # consistency INSTRUCTIONS <-> TOOLS <-> error codes (offline)
npm run smoke          # smoke-test the 4 tools through an MCP client (live vs corpus)
```

## Code rules

- **TypeScript strict**. `@modelcontextprotocol/sdk` ^1.12.0.
- **`node:sqlite` built in** (Node >=22.5) - zero native deps, read-only database. Consistent with zero-cloud.
- **Corpus outside the repo** - an upstream artifact (Ansvar/DILA), fetched by script. Do NOT commit `data/*.db`.
- **No Polish characters in commit messages.**

## What NOT to do

- **Do NOT process the text with a model** on the retrieval path - verbatim is the grounding.
- **Do NOT drop the disclaimer** or the Etalab/DILA attribution.
- **Do NOT add case law / JORF** beyond scope (the corpus does not contain them - do not pretend it does).
- **Do NOT redistribute the corpus binary in the repo** - fetch by script, verify sha256.

## Sources of truth

1. [README.md](./README.md)
2. [THIRD_PARTY_INSPIRATIONS.md](./THIRD_PARTY_INSPIRATIONS.md) - Etalab/DILA + Ansvar attribution
3. `src/index.ts`
4. [Legifrance](https://www.legifrance.gouv.fr) - the upstream source

## License

**MIT** (code). Corpus: Apache-2.0 (Ansvar) + Licence Ouverte v2.0 (Etalab) - see THIRD_PARTY_INSPIRATIONS.md.
