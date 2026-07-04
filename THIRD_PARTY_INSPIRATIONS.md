# Third-party inspirations / dependencies

## Korpus danych: prawo francuskie (Legifrance / DILA)

- **Zrodlo:** DILA (Direction de l'information legale et administrative), portal
  [Legifrance](https://www.legifrance.gouv.fr), archiwum LEGI.
- **Licencja tekstu:** **Licence Ouverte v2.0 (Etalab)** -
  https://www.etalab.gouv.fr/licence-ouverte-open-licence/ - reuzycie komercyjne
  **dozwolone z atrybucja** zrodla (DILA/Legifrance). Teksty ustawowe NIE sa w domenie
  publicznej wg prawa francuskiego; reuzycie opiera sie na warunkach Etalab.
- **Atrybucja (obowiazkowa):** kazda odpowiedz konektora zawiera w `structuredContent.citations`
  pola `source_authority: "DILA (Legifrance)"` i `license: "Licence Ouverte v2.0 (Etalab)"`
  oraz disclaimer.
- **Zastrzezenie:** wersja autentyczna = Journal officiel de la Republique francaise. Ten
  korpus to point-in-time snapshot, nie zrodlo autentyczne - kazda odpowiedz odsyla do Legifrance.

## Artefakt bazy (database.db): Ansvar-Systems/French-law-mcp

- **Repo:** https://github.com/Ansvar-Systems/French-law-mcp (zarchiwizowane 2026-07-03).
- **Licencja kodu:** Apache-2.0 (c) Ansvar Systems.
- **Snapshot uzyty:** paczka npm `@ansvar/french-law-mcp@2.0.0`, `data/database.db`
  (built_at 2026-02-25, schema_version 1.0, jurisdiction FR, 3 953 dokumenty / 193 681 przepisow).
- **Relacja:** ADAPTACJA WZORCA + adopcja artefaktu danych (analogicznie do ADR-0022 PATRON i
  konektora mcp-eu-compliance). Plik `data/database.db` jest artefaktem upstream - NIE jest
  trzymany w tym repo (gitignored), pobierany skryptem `scripts/fetch-corpus.mjs` (przypieta
  wersja + weryfikacja sha256).
- **Co bierzemy:** (1) artefakt danych `database.db` (Apache-2.0 + Etalab); (2) WZORZEC danych
  (DILA LEGI -> SQLite FTS5 -> verbatim). **Kod serwera napisany od zera** (nasz chassis, node:sqlite),
  NIE adaptujemy kodu Ansvar (ich runtime uzywa @ansvar/mcp-sqlite WASM).
- **Czego NIE bierzemy:** kodu serwera Ansvar, hostowanego gateway, mapowan, warstwy EU-bridge.

### Snapshot licencji (naglowek Apache-2.0)

```
Apache License, Version 2.0, January 2004
http://www.apache.org/licenses/
Copyright Ansvar Systems
```

Apache-2.0 pozwala na uzycie komercyjne, modyfikacje i redystrybucje przy zachowaniu noty o
prawach autorskich i NOTICE. Atrybucja w tym pliku + README.md + LICENSE.

## Wzorzec konektora: mcp-eu-compliance (MateMatic)

Struktura repo i kontrakt MCP (`structuredContent.citations`, verbatim zero-LLM, disclaimer,
offline node:sqlite, kody bledow, AGENTS.md) - rodzina konektorow prawa MateMatic: mcp-saos,
mcp-eu-compliance, mcp-eu-sparql, mcp-krs. Ten konektor (mcp-fr-legal) jest kolejnym czlonkiem,
komplementarnym do mcp-eu-sparql (live) i mcp-eu-compliance (prawo UE).

## Uwaga o utrzymaniu (freshness)

Repo Ansvar zarchiwizowane - artefakt npm jest stabilny, ale nie bedzie sam sie odswiezal.
Docelowo: MateMatic hostuje wlasny, przypiety snapshot (GitHub release) i/lub przejmuje pipeline
ingest DILA LEGI, zeby freshness byl pod nasza kontrola. Do tego czasu `fetch-corpus.mjs`
pobiera przypieta wersje paczki npm z weryfikacja sha256.
