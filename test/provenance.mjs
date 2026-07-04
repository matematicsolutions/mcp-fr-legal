#!/usr/bin/env node
// Test logiki provenance/staleness (deterministyczny - wstrzyknieta stala "now"). node test/provenance.mjs
import { buildProvenance } from "../dist/provenance.js";

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
    ok ? pass++ : fail++;
}

const NOW = Date.parse("2026-07-04T00:00:00Z");

// snapshot swiezy (10 dni) przy progu 365 -> brak advisory
let p = buildProvenance("2026-06-24T00:00:00Z", 365, NOW);
check("swiezy: snapshot_date", p.snapshot_date, "2026-06-24");
check("swiezy: age_days", p.age_days, 10);
check("swiezy: brak advisory", p.staleness_advisory, undefined);

// snapshot stary (400 dni) przy progu 365 -> advisory obecne
p = buildProvenance("2025-05-30T00:00:00Z", 365, NOW);
check("stary: age_days", p.age_days, 400);
check("stary: advisory obecne", typeof p.staleness_advisory === "string" && p.staleness_advisory.includes("400"), true);

// prog konfigurowalny: ten sam 129-dniowy snapshot Feb-2026 przekracza prog 120
p = buildProvenance("2026-02-25T00:00:00Z", 120, NOW);
check("prog 120: age 129 > prog -> advisory", typeof p.staleness_advisory === "string", true);
p = buildProvenance("2026-02-25T00:00:00Z", 365, NOW);
check("prog 365: age 129 < prog -> brak advisory", p.staleness_advisory, undefined);

// built_at niepoprawny -> nie wybucha
p = buildProvenance("", 365, NOW);
check("pusty built_at: age -1", p.age_days, -1);

console.log(`\n${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
