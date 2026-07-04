<!-- mcp-name: io.github.matematicsolutions/mcp-fr-legal -->

# mcp-fr-legal

Serwer **MCP** udostepniajacy **offline korpus prawa francuskiego** (Legifrance/DILA, pelny tekst)
w lokalnym **SQLite FTS5**, z narzedziami do wyszukiwania i **groundingu cytatu**. Snippety zwracane
**verbatim** z bazy (zero-LLM) - kazdy z `document_id`, `provision_ref` i URL do Legifrance.
Anti-halucynacja przez mechanike, nie przez zaufanie do modelu.

**Zakres:** kody i ustawy skonsolidowane LEGI (Code civil, Code du travail, Code penal, Code de
commerce, Code de la defense, Code de la securite interieure, ...) - **3 953 dokumenty / 193 681
przepisow** w bundlowanym snapshocie. **Bez orzecznictwa (jurisprudence)** i bez pelnego JORF.

Rodzina konektorow prawa MateMatic: [`mcp-saos`](https://github.com/matematicsolutions/mcp-saos)
(orzecznictwo PL), [`mcp-eu-compliance`](https://github.com/matematicsolutions/mcp-eu-compliance)
(prawo UE), [`mcp-eu-sparql`](https://github.com/matematicsolutions/mcp-eu-sparql) (live EUR-Lex).

## Instalacja

```bash
npm install            # Node 22.5+ (node:sqlite wbudowane, FTS5)
npm run fetch-corpus   # pobiera database.db (~303 MB) z artefaktu DILA/Ansvar (Apache-2.0 + Etalab)
npm run build
npm start
```

Air-gap / pelny offline: ustaw `FR_LEGAL_DB` na lokalna kopie `database.db`.

Konfiguracja w kliencie MCP:

```json
{ "name": "fr-legal", "command": "node", "args": ["/sciezka/mcp-fr-legal/dist/index.js"] }
```

## Narzedzia

| Tool | Opis |
|---|---|
| `fr_search(query, documents?, limit?)` | Pelnotekstowo (FTS5) po przepisach, snippety verbatim + citations. |
| `fr_article(document_id, provision_ref)` | Pelny verbatim tekst przepisu (tolerancyjny `provision_ref`). |
| `fr_validate_citation(document_id, provision_ref)` | **Grounding**: czy cytat istnieje (fail-closed) - anti-halucynacja. |
| `fr_list_documents(type?, query?)` | Lista dokumentow (discovery `document_id`). |

Kazde narzedzie zwraca `structuredContent.citations` (document_id, provision_ref, URL Legifrance,
`source_authority` DILA, `license` Etalab v2.0, snapshot).

## Grounding (anti-halucynacja)

`fr_validate_citation` to prymityw groundingu: sprawdza mechanicznie, czy `document_id + provision_ref`
istnieje w korpusie. **Fail-closed** - brak dokumentu/przepisu => `provision_exists=false` (nie
"prawdopodobnie ok"). Spina sie z [`citation-grounding-pl`](https://github.com/matematicsolutions/awesome-matematic-skills-pl)
jako resolver kotwicy dla prawa FR (poziom ISTNIENIE).

## Zero-cloud / RODO

Zero wywolan sieciowych w runtime (baza otwierana read-only). Bootstrap korpusu (`fetch-corpus`) to
jedyny moment sieci. Tekst zwracany verbatim (grounding). Swiezosc: sprawdzaj na Legifrance (snapshot
!= zrodlo autentyczne = Journal officiel).

## Licencja i atrybucja

- **Kod:** MIT (MateMatic Solutions).
- **Korpus:** artefakt `database.db` z [Ansvar-Systems/French-law-mcp](https://github.com/Ansvar-Systems/French-law-mcp)
  (Apache-2.0); tekst prawny = **Licence Ouverte v2.0 (Etalab)**, DILA/Legifrance, reuzycie komercyjne
  z atrybucja. Pelna atrybucja: [THIRD_PARTY_INSPIRATIONS.md](./THIRD_PARTY_INSPIRATIONS.md).

Cytowanie: *MateMatic Solutions (2026), mcp-fr-legal - offline MCP korpus prawa francuskiego
(Legifrance/DILA), MIT. Dane: DILA, Licence Ouverte v2.0.*
