#!/usr/bin/env node
// Test SSRF allowlist bootstrapu (harvest jurisd, Apache-2.0, src/services/fetch-module.ts).
// Pobor korpusu tylko z zaufanych hostow, tylko https.
import { assertAllowedHost, CORPUS } from "../dist/corpus.js";

let pass = 0, fail = 0;
function ok(name, cond) {
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
    cond ? pass++ : fail++;
}
function throws(name, fn, needle) {
    try {
        fn();
        ok(`${name} (oczekiwano wyjatku)`, false);
    } catch (e) {
        ok(`${name}`, !needle || String(e.message).includes(needle));
    }
}

ok("npm registry dozwolony", assertAllowedHost(CORPUS.npmTarball).hostname === "registry.npmjs.org");
ok("github.com dozwolony", assertAllowedHost("https://github.com/x/y/releases/download/v1/db.tgz").hostname === "github.com");
throws("obcy host odrzucony (SSRF)", () => assertAllowedHost("https://evil.example.com/db.tgz"), "allowlisty");
throws("localhost odrzucony", () => assertAllowedHost("https://127.0.0.1/db.tgz"), "allowlisty");
throws("http (nie-https) odrzucony", () => assertAllowedHost("http://registry.npmjs.org/x.tgz"), "https");
throws("smiec URL odrzucony", () => assertAllowedHost("not-a-url"), "Nieprawidlowy");

console.log(`\n${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
