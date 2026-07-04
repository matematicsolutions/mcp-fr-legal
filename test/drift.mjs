#!/usr/bin/env node
// Drift test - INSTRUCTIONS + kody bledow spojne z kodem (bez uruchamiania serwera).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(here, "..", "src", "index.ts"), "utf8");
const failures = [];

// 1. Kazdy tool name uzyty w buildInstructions musi istniec w TOOLS.
const instr = SRC.match(/function buildInstructions\(\):\s*string\s*\{\s*return `([\s\S]*?)`;/);
if (!instr) failures.push("Nie znaleziono buildInstructions()");
else {
    const body = instr[1];
    const registered = new Set([...SRC.matchAll(/name:\s*"(fr_\w+)"/g)].map((m) => m[1]));
    const referenced = new Set([...body.matchAll(/`(fr_\w+)`/g)].map((m) => m[1]));
    for (const ref of referenced) {
        if (!registered.has(ref)) failures.push(`INSTRUCTIONS referencuje tool '${ref}' spoza TOOLS`);
    }
    if (registered.size === 0) failures.push("Brak toolow fr_* w TOOLS");
}

// 2. Kazdy ErrorCode w typie musi byc udokumentowany w INSTRUCTIONS "Iteracja po bledach".
const typeMatch = SRC.match(/type ErrorCode\s*=\s*([^;]+);/);
if (typeMatch) {
    const codes = [...typeMatch[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
    const body = instr ? instr[1] : "";
    for (const c of codes) {
        if (!body.includes(c)) failures.push(`ErrorCode '${c}' nieudokumentowany w INSTRUCTIONS`);
    }
}

if (failures.length) {
    console.error("DRIFT FAIL:\n - " + failures.join("\n - "));
    process.exit(1);
}
console.log("OK drift - INSTRUCTIONS i ErrorCode spojne z TOOLS i kodem.");
