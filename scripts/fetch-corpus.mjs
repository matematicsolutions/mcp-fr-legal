#!/usr/bin/env node
// Pobiera korpus prawa FR (database.db) do data/ dla developmentu (serwer i tak pobiera go sam
// na pierwszym uruchomieniu do cache). Reuzywa logiki z dist/corpus.js (jedno zrodlo prawdy).
//
// Zrodlo: immutable tarball npm @ansvar/french-law-mcp (Apache-2.0), tekst Licence Ouverte v2.0
// (Etalab/DILA). Weryfikacja sha1 tarballa + sha256 bazy. Air-gap: ustaw FR_LEGAL_DB.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "..", "dist", "corpus.js");
const DEST = path.join(__dirname, "..", "data", "database.db");

if (!fs.existsSync(DIST)) {
    console.error("Brak dist/corpus.js - uruchom najpierw `npm run build`.");
    process.exit(1);
}
const { downloadCorpus, CORPUS } = await import(fs.realpathSync(DIST));

if (fs.existsSync(DEST) && fs.statSync(DEST).size > 1_000_000) {
    console.log(`Korpus juz obecny: ${DEST} (zrodlo ${CORPUS.source})`);
    process.exit(0);
}
await downloadCorpus(DEST, (m) => console.log(m));
