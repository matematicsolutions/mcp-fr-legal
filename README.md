<!-- mcp-name: io.github.matematicsolutions/mcp-fr-legal -->

# mcp-fr-legal

An **MCP** server exposing an **offline corpus of French law** (Legifrance / DILA, full text)
in a local **SQLite FTS5** database, with tools for search and **citation grounding**. Snippets are
returned **verbatim** from the database (zero-LLM), each with a `document_id`, a `provision_ref` and a
Legifrance URL. Anti-hallucination by mechanism, not by trust in the model.

**Scope:** consolidated LEGI codes and statutes (Code civil, Code du travail, Code penal, Code de
commerce, Code de la defense, Code de la securite interieure, ...) - **3,953 documents / 193,681
provisions** in the bundled snapshot. **No case law (jurisprudence)** and no full JORF.

Part of the MateMatic law-connector family: [`mcp-saos`](https://github.com/matematicsolutions/mcp-saos)
(PL case law), [`mcp-eu-compliance`](https://github.com/matematicsolutions/mcp-eu-compliance)
(EU law), [`mcp-eu-sparql`](https://github.com/matematicsolutions/mcp-eu-sparql) (live EUR-Lex).

## Installation

```bash
npm install            # Node 22.5+ (node:sqlite built in, FTS5)
npm run fetch-corpus   # downloads database.db (~303 MB) from the DILA/Ansvar artifact (Apache-2.0 + Etalab)
npm run build
npm start
```

Air-gapped / fully offline: point `FR_LEGAL_DB` at a local copy of `database.db`.

MCP client configuration:

```json
{ "name": "fr-legal", "command": "node", "args": ["/path/to/mcp-fr-legal/dist/index.js"] }
```

## Tools

| Tool | Description |
|---|---|
| `fr_search(query, documents?, limit?)` | Full-text (FTS5) over provisions, verbatim snippets + citations. |
| `fr_article(document_id, provision_ref)` | Full verbatim text of a provision (tolerant `provision_ref`). |
| `fr_validate_citation(document_id, provision_ref)` | **Grounding**: whether the citation exists (fail-closed) - anti-hallucination. |
| `fr_list_documents(type?, query?)` | List documents (discovery of `document_id`). |

Every tool returns `structuredContent.citations` (document_id, provision_ref, Legifrance URL,
`source_authority` DILA, `license` Etalab v2.0, `snapshot`, `age_days`, and a `staleness_advisory`
when the snapshot is older than the `FR_STALENESS_DAYS` threshold (365 by default) - provenance and
staleness modelled on russellbrenner/jurisd, Apache-2.0).

## Grounding (anti-hallucination)

`fr_validate_citation` is a grounding primitive: it mechanically checks whether `document_id +
provision_ref` exists in the corpus. **Fail-closed** - a missing document or provision yields
`provision_exists=false` (not "probably ok"). It plugs into
[`citation-grounding-pl`](https://github.com/matematicsolutions/awesome-matematic-skills-pl)
as the anchor resolver for French law (EXISTENCE level).

## Zero-cloud / GDPR

No network calls at runtime (the database is opened read-only). Corpus bootstrap (`fetch-corpus`) is
the only moment a network is used. Text is returned verbatim (grounding). For currency, check
Legifrance (a snapshot is not the authoritative source - the Journal officiel is).

## License and attribution

- **Code:** MIT (MateMatic Solutions).
- **Corpus:** the `database.db` artifact from [Ansvar-Systems/French-law-mcp](https://github.com/Ansvar-Systems/French-law-mcp)
  (Apache-2.0); the legal text is under the **Licence Ouverte v2.0 (Etalab)**, DILA/Legifrance,
  commercial reuse with attribution. Full attribution: [THIRD_PARTY_INSPIRATIONS.md](./THIRD_PARTY_INSPIRATIONS.md).

Citation: *MateMatic Solutions (2026), mcp-fr-legal - an offline MCP corpus of French law
(Legifrance/DILA), MIT. Data: DILA, Licence Ouverte v2.0.*
