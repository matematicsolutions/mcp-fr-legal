// Bootstrap korpusu FR (database.db) - pobranie RAZ z immutable tarballa npm Ansvar
// (@ansvar/french-law-mcp, Apache-2.0), wyluskanie przez wbudowany zlib (bez zewnetrznego tar).
// Sciezka ZAPYTAN pozostaje offline/zero-cloud - to jedyny moment sieci (bootstrap, nie per-query).
//
// Zrodlo pinowane + integralnosc: sha1 tarballa (npm dist.shasum) + sha256 wyluskanej bazy.
// Docelowo MateMatic hostuje wlasny snapshot; dopoki nie, ciagniemy przypieta wersje z npm.

import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import * as fs from "node:fs";
import * as path from "node:path";

export const CORPUS = {
    source: "@ansvar/french-law-mcp@2.0.0",
    npmTarball: "https://registry.npmjs.org/@ansvar/french-law-mcp/-/french-law-mcp-2.0.0.tgz",
    tarballSha1: "a35dead4fbb26a14598e42f5b6e435e27c8e6f30",
    dbSha256: "bc7c490d483c2b235da30b077d4055f8cf5686cee3a0a527be67b046c7d045d2",
    entry: "package/data/database.db",
};

function digest(algo: "sha1" | "sha256", buf: Buffer): string {
    return createHash(algo).update(buf).digest("hex");
}

// Minimalny ekstraktor JEDNEGO pliku z tara (512-bajtowe bloki). Pomija naglowki pax/global
// (ich name != target). Nazwa docelowa < 100 znakow -> brak long-name/pax-path.
function extractFromTar(tar: Buffer, target: string): Buffer | null {
    let off = 0;
    while (off + 512 <= tar.length) {
        const block = tar.subarray(off, off + 512);
        let allZero = true;
        for (let i = 0; i < 512; i++) if (block[i] !== 0) { allZero = false; break; }
        if (allZero) break; // koniec archiwum (dwa zerowe bloki)
        const name = block.subarray(0, 100).toString("utf8").replace(/\0[\s\S]*$/, "");
        const sizeStr = block.subarray(124, 136).toString("utf8").replace(/\0[\s\S]*$/, "").trim();
        const size = parseInt(sizeStr, 8) || 0;
        const typeflag = String.fromCharCode(block[156]);
        const dataStart = off + 512;
        if (name === target && (typeflag === "0" || typeflag === "\0" || typeflag === "")) {
            return tar.subarray(dataStart, dataStart + size);
        }
        off = dataStart + Math.ceil(size / 512) * 512;
    }
    return null;
}

export async function downloadCorpus(dest: string, log: (m: string) => void = () => {}): Promise<string> {
    log(`Pobieram korpus FR z ${CORPUS.source} (~110 MB spakowane) ...`);
    const res = await fetch(CORPUS.npmTarball);
    if (!res.ok) throw new Error(`HTTP ${res.status} przy pobieraniu tarballa npm`);
    const tgz = Buffer.from(await res.arrayBuffer());
    if (digest("sha1", tgz) !== CORPUS.tarballSha1) {
        throw new Error("Niezgodny sha1 tarballa npm - odmawiam uzycia (integralnosc)");
    }
    const tar = gunzipSync(tgz);
    const dbBuf = extractFromTar(tar, CORPUS.entry);
    if (!dbBuf) throw new Error(`Nie znaleziono ${CORPUS.entry} w tarballu`);
    if (digest("sha256", dbBuf) !== CORPUS.dbSha256) {
        throw new Error("Niezgodny sha256 bazy - odmawiam zapisu (integralnosc)");
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, dbBuf);
    fs.renameSync(tmp, dest);
    log(`Korpus gotowy (sha256 OK): ${dest}`);
    return dest;
}

// Zwraca sciezke do korpusu. Kolejnosc: override -> bundled (data/) -> cache (pobierz raz).
export async function ensureCorpus(bundledDb: string, cacheDb: string, override?: string): Promise<string> {
    if (override) {
        if (!fs.existsSync(override)) throw new Error(`FR_LEGAL_DB wskazuje nieistniejacy plik: ${override}`);
        return override;
    }
    if (fs.existsSync(bundledDb) && fs.statSync(bundledDb).size > 1_000_000) return bundledDb;
    if (fs.existsSync(cacheDb) && fs.statSync(cacheDb).size > 1_000_000) return cacheDb;
    return downloadCorpus(cacheDb, (m) => process.stderr.write(m + "\n"));
}
