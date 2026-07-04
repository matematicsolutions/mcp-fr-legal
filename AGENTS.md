# AGENTS.md - mcp-fr-legal

Plik standardu [agents.md](https://agents.md) - kanoniczne instrukcje dla agentow AI pracujacych z tym repo.

## Cel projektu

Serwer **MCP** udostepniajacy **offline korpus prawa francuskiego** (Legifrance/DILA) w lokalnym
**SQLite FTS5**, z narzedziami do wyszukiwania i groundingu cytatu. **Verbatim, zero-LLM** w sciezce
retrievalu - snippety bez zmian z bazy, kazdy z `document_id`, `provision_ref` i URL Legifrance.

Kolejny konektor rodziny prawa MateMatic (mcp-saos, mcp-eu-compliance, mcp-eu-sparql, mcp-krs).
Wzorzec architektoniczny: **mcp-eu-compliance**.

## TWARDE OGRANICZENIA (kontekst MateMatic)

- **Kazde wywolanie MUSI zwracac `structuredContent.citations`** z: document_id, provision_ref,
  legifrance_url, source_authority (DILA), license (Etalab v2.0), snapshot.
- **Verbatim** - tekst bez przetwarzania modelem (grounding, anti-halucynacja).
- **Snapshot, nie zrodlo autentyczne** - disclaimer w kazdej odpowiedzi (autentyczne = Journal officiel).
- **Zakres: kody + ustawy LEGI, BEZ orzecznictwa** i bez pelnego JORF.
- **Offline** - zero sieci w runtime. Bootstrap korpusu tylko przez `fetch-corpus`.
- **Atrybucja Etalab OBOWIAZKOWA** na republikacji (DILA/Legifrance).

## Narzedzia (tools contract)

| Tool | Parametry | Zwraca |
|---|---|---|
| `fr_search` | query, documents?, limit? | snippety FTS5 verbatim + citations |
| `fr_article` | document_id, provision_ref | pelny tekst przepisu + citation |
| `fr_validate_citation` | document_id, provision_ref | grounding: document_exists/provision_exists/in_force |
| `fr_list_documents` | type?, query?, limit? | lista dokumentow (discovery) |

## Build i test

```bash
npm install            # Node 22.5+ (node:sqlite wbudowane)
npm run fetch-corpus   # pobiera database.db z artefaktu Ansvar/DILA (Apache-2.0 + Etalab)
npm run build          # tsc -> dist/
npm run drift          # spojnosc INSTRUCTIONS <-> TOOLS <-> kody bledow (offline)
npm run smoke          # smoke 4 toolow przez klienta MCP (live vs korpus)
```

## Zasady kodu

- **TypeScript strict**. `@modelcontextprotocol/sdk` ^1.12.0.
- **`node:sqlite` wbudowane** (Node >=22.5) - zero native deps, baza read-only. Spojne z zero-cloud.
- **Korpus poza repo** - artefakt upstream (Ansvar/DILA), pobierany skryptem. NIE commituj `data/*.db`.
- **Bez polskich znakow w commit messages.**

## Czego NIE robic

- **NIE przetwarzaj tekstu modelem** w sciezce retrievalu - verbatim to grounding.
- **NIE pomijaj disclaimera** ani atrybucji Etalab/DILA.
- **NIE dodawaj orzecznictwa/JORF** poza zakres (korpus ich nie zawiera - nie udawaj, ze zawiera).
- **NIE redystrybuuj binarki korpusu w repo** - pobieranie skryptem, weryfikacja sha256.

## Zrodla prawdy

1. [README.md](./README.md)
2. [THIRD_PARTY_INSPIRATIONS.md](./THIRD_PARTY_INSPIRATIONS.md) - atrybucja Etalab/DILA + Ansvar
3. `src/index.ts`
4. [Legifrance](https://www.legifrance.gouv.fr) - zrodlo upstream

## Licencja

**MIT** (kod). Korpus: Apache-2.0 (Ansvar) + Licence Ouverte v2.0 (Etalab) - patrz THIRD_PARTY_INSPIRATIONS.md.
