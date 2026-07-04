#!/usr/bin/env node
// Pobiera korpus prawa FR (database.db) do data/ RAZ. Zrodlo artefaktu: paczka npm
// @ansvar/french-law-mcp (Apache-2.0), zbudowana z DILA LEGI (Licence Ouverte v2.0).
// To bootstrap korpusu, nie wywolanie per-query - sciezka ZAPYTAN pozostaje offline/zero-cloud.
//
// Air-gap / pelny offline: ustaw FR_LEGAL_DB na lokalna kopie database.db (serwer to uszanuje).
//
// UWAGA (produkcja): docelowo MateMatic hostuje wlasny, przypiety snapshot (GitHub release),
// zeby build nie byl zakladnikiem stanu repo/paczki Ansvar (repo zarchiwizowane 2026-07-03).
// Dopoki tego nie ma, pobieramy przypieta wersje paczki npm.

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DEST = path.join(DATA_DIR, "database.db");

// Przypieta wersja + sha256 zweryfikowanego artefaktu (integralnosc).
const PKG = "@ansvar/french-law-mcp@2.0.0";
const EXPECTED_SHA256 = "bc7c490d483c2b235da30b077d4055f8cf5686cee3a0a527be67b046c7d045d2";

function sha256(p) {
    return createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

if (fs.existsSync(DEST) && fs.statSync(DEST).size > 1_000_000) {
    if (sha256(DEST) === EXPECTED_SHA256) {
        console.log(`Korpus juz obecny i zgodny (sha256 OK): ${DEST}`);
        process.exit(0);
    }
    console.log("Korpus obecny, ale niezgodny sha256 - pobieram ponownie.");
}

fs.mkdirSync(DATA_DIR, { recursive: true });
const tmp = path.join(DATA_DIR, `_fetch_${process.pid}`);
fs.mkdirSync(tmp, { recursive: true });

try {
    console.log(`Pobieram ${PKG} (npm pack, ~110 MB spakowane) ...`);
    execSync(`npm pack ${PKG}`, { cwd: tmp, stdio: "inherit" });
    const tgz = fs.readdirSync(tmp).find((f) => f.endsWith(".tgz"));
    if (!tgz) throw new Error("Nie znaleziono paczki .tgz po npm pack");
    console.log("Rozpakowuje database.db ...");
    execSync(`tar -xzf "${tgz}" package/data/database.db`, { cwd: tmp, stdio: "inherit" });
    const extracted = path.join(tmp, "package", "data", "database.db");
    if (!fs.existsSync(extracted)) throw new Error("Brak package/data/database.db w paczce");
    const got = sha256(extracted);
    if (got !== EXPECTED_SHA256) {
        throw new Error(`Niezgodny sha256 korpusu (oczekiwano ${EXPECTED_SHA256}, jest ${got})`);
    }
    fs.renameSync(extracted, DEST);
    console.log(`Korpus gotowy (sha256 OK): ${DEST}`);
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}
