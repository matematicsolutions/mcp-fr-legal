// Bootstrap korpusu FR (database.db) - pobranie RAZ z immutable tarballa npm Ansvar
// (@ansvar/french-law-mcp, Apache-2.0), wyluskanie przez wbudowany zlib (bez zewnetrznego tar).
// Sciezka ZAPYTAN pozostaje offline/zero-cloud - to jedyny moment sieci (bootstrap, nie per-query).
//
// Zrodlo pinowane + integralnosc: sha1 tarballa (npm dist.shasum) + sha256 wyluskanej bazy.
// Docelowo MateMatic hostuje wlasny snapshot; dopoki nie, ciagniemy przypieta wersje z npm.

import { createHash, type Hash } from "node:crypto";
import { createGunzip } from "node:zlib";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as fs from "node:fs";
import * as path from "node:path";

export const CORPUS = {
    source: "@ansvar/french-law-mcp@2.0.0",
    npmTarball: "https://registry.npmjs.org/@ansvar/french-law-mcp/-/french-law-mcp-2.0.0.tgz",
    tarballSha1: "a35dead4fbb26a14598e42f5b6e435e27c8e6f30",
    dbSha256: "bc7c490d483c2b235da30b077d4055f8cf5686cee3a0a527be67b046c7d045d2",
    entry: "package/data/database.db",
};

// SSRF allowlist - wzorzec z russellbrenner/jurisd (Apache-2.0, src/services/fetch-module.ts:
// allowlist hostow przy dystrybucji modulow danych). Kod od zera. Defense-in-depth: pobor korpusu
// tylko z zaufanych hostow, tylko https (gdyby URL zrodla stal sie env-override'owalny).
const ALLOWED_HOSTS = new Set([
    "registry.npmjs.org",
    "github.com",
    "objects.githubusercontent.com", // GitHub Releases redirect target
    "raw.githubusercontent.com",
]);

export function assertAllowedHost(rawUrl: string): URL {
    let u: URL;
    try {
        u = new URL(rawUrl);
    } catch {
        throw new Error(`Nieprawidlowy URL zrodla korpusu: ${rawUrl}`);
    }
    if (u.protocol !== "https:") {
        throw new Error(`Odmawiam poboru po ${u.protocol} (wymagane https): ${rawUrl}`);
    }
    if (!ALLOWED_HOSTS.has(u.hostname)) {
        throw new Error(
            `Host '${u.hostname}' spoza allowlisty zrodel korpusu (SSRF guard). Dozwolone: ${[...ALLOWED_HOSTS].join(", ")}`,
        );
    }
    return u;
}

const BLOCK = 512;
// Straznik bomby zip: rozpakowany tar leci na DYSK, nie do pamieci, wiec bomba
// kosztuje miejsce, nie RAM - ale limit i tak trzymamy. Korpus ma ~303 MB,
// wiec 2 GB to zapas rzedu 6x na przyszle wersje, a nie zaproszenie.
const MAX_DECOMPRESSED = 2_000_000_000;

// Strumieniowy ekstraktor JEDNEGO pliku z tara (bloki 512 B). Pomija naglowki
// pax/global (ich name != target). Nazwa docelowa < 100 znakow -> brak
// long-name/pax-path. W pamieci trzyma tylko biezacy kawalek strumienia plus
// ogon < 512 B - to jest ROZNICA wobec poprzedniej wersji, ktora materializowala
// caly tar naraz. Zapis przez writeSync: prostsze niz backpressure i daje
// naturalne dlawienie strumienia (bootstrap biegnie raz, nie w petli zapytan).
class TarSingleFileExtractor extends Writable {
    private leftover: Buffer = Buffer.alloc(0);
    private mode: "header" | "copy" | "drain" = "header";
    private remaining = 0;
    private pad = 0;
    private total = 0;
    private ended = false;
    found = false;
    bytesWritten = 0;
    readonly sha256: Hash = createHash("sha256");

    constructor(private readonly target: string, private readonly fd: number) {
        super();
    }

    _write(chunk: Buffer, _enc: BufferEncoding, cb: (e?: Error | null) => void): void {
        try {
            this.consume(chunk);
            cb();
        } catch (e) {
            cb(e as Error);
        }
    }

    private consume(chunk: Buffer): void {
        this.total += chunk.length;
        if (this.total > MAX_DECOMPRESSED) {
            throw new Error(`Rozpakowany tarball przekroczyl ${MAX_DECOMPRESSED} B - przerywam (ochrona przed bomba zip)`);
        }
        const buf = this.leftover.length ? Buffer.concat([this.leftover, chunk]) : chunk;
        let off = 0;
        for (;;) {
            if (this.ended) { off = buf.length; break; }
            if (this.mode === "header") {
                if (buf.length - off < BLOCK) break;
                const h = buf.subarray(off, off + BLOCK);
                off += BLOCK;
                let allZero = true;
                for (let i = 0; i < BLOCK; i++) if (h[i] !== 0) { allZero = false; break; }
                if (allZero) { this.ended = true; continue; } // koniec archiwum
                const name = h.subarray(0, 100).toString("utf8").replace(/\0[\s\S]*$/, "");
                const size = parseInt(h.subarray(124, 136).toString("utf8").replace(/\0[\s\S]*$/, "").trim(), 8) || 0;
                const typeflag = String.fromCharCode(h[156]);
                const padded = Math.ceil(size / BLOCK) * BLOCK;
                const isFile = typeflag === "0" || typeflag === "\0" || typeflag === "";
                if (!this.found && name === this.target && isFile) {
                    this.mode = "copy"; this.remaining = size; this.pad = padded - size;
                } else {
                    this.mode = "drain"; this.remaining = padded;
                }
                continue;
            }
            const avail = buf.length - off;
            if (avail === 0) break;
            const take = Math.min(this.remaining, avail);
            if (this.mode === "copy" && take > 0) {
                const slice = buf.subarray(off, off + take);
                fs.writeSync(this.fd, slice);
                this.sha256.update(slice);
                this.bytesWritten += take;
            }
            off += take;
            this.remaining -= take;
            if (this.remaining === 0) {
                if (this.mode === "copy") {
                    this.found = true;
                    this.mode = "drain";
                    this.remaining = this.pad;
                    this.pad = 0;
                } else {
                    this.mode = "header";
                }
            }
        }
        this.leftover = off < buf.length ? Buffer.from(buf.subarray(off)) : Buffer.alloc(0);
    }
}

// Bootstrap STRUMIENIOWY (2026-07-27). Poprzednia wersja robila
// `Buffer.from(await res.arrayBuffer())` + `gunzipSync()`, czyli trzymala naraz
// ~110 MB pobranego + ~110 MB kopii + ~303 MB rozpakowanego tara = ponad 520 MB
// samych buforow. W kontenerze z limitem 768 MB konczylo sie to SIGKILL (exit 137)
// i serwer NIE WSTAWAL - wykryte przez zewnetrzny audyt zgodnosci mcpprobe
// (Ahmad-Faraj/mcp-conformance), gdzie bylismy jedynym z 44 konektorow, ktory
// nie przeszedl handshake'u. Teraz pamiec jest ograniczona rozmiarem kawalka
// strumienia, niezaleznie od wielkosci korpusu.
//
// Kolejnosc kontroli integralnosci sie NIE zmienia z punktu widzenia efektu:
// sha1 tarballa liczymy w locie (Transform), sha256 bazy w trakcie wypakowania,
// a `rename` na docelowa nazwe nastepuje DOPIERO po sprawdzeniu obu suma. Roznica
// jest taka, ze dane niezweryfikowane trafiaja przejsciowo na dysk (plik .tmp,
// kasowany przy kazdym bledzie) zamiast do RAM - stad dodatkowy limit
// MAX_DECOMPRESSED, bo rozpakowujemy przed poznaniem sha1.
export async function downloadCorpus(dest: string, log: (m: string) => void = () => {}): Promise<string> {
    const url = assertAllowedHost(CORPUS.npmTarball);
    log(`Pobieram korpus FR z ${CORPUS.source} (~110 MB spakowane, ~300 MB po rozpakowaniu, strumieniowo) ...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} przy pobieraniu tarballa npm`);
    if (!res.body) throw new Error("Brak strumienia odpowiedzi npm registry");

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.${process.pid}.tmp`;
    const fd = fs.openSync(tmp, "w");
    let fdOpen = true;
    const closeFd = () => { if (fdOpen) { fdOpen = false; try { fs.closeSync(fd); } catch { /* ignore */ } } };

    const sha1 = createHash("sha1");
    const extractor = new TarSingleFileExtractor(CORPUS.entry, fd);
    try {
        const tap = new Transform({
            transform(c: Buffer, _e, cb) { sha1.update(c); cb(null, c); },
        });
        await pipeline(Readable.fromWeb(res.body as never), tap, createGunzip(), extractor);
        closeFd();

        if (sha1.digest("hex") !== CORPUS.tarballSha1) {
            throw new Error("Niezgodny sha1 tarballa npm - odmawiam uzycia (integralnosc)");
        }
        if (!extractor.found) throw new Error(`Nie znaleziono ${CORPUS.entry} w tarballu`);
        if (extractor.sha256.digest("hex") !== CORPUS.dbSha256) {
            throw new Error("Niezgodny sha256 bazy - odmawiam zapisu (integralnosc)");
        }
    } catch (e) {
        closeFd();
        fs.rmSync(tmp, { force: true });
        throw e;
    }
    fs.renameSync(tmp, dest);
    log(`Korpus gotowy (sha1 + sha256 OK, ${extractor.bytesWritten} B): ${dest}`);
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
