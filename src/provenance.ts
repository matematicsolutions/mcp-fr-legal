// Provenance / staleness dla cytatow - wzorzec "mandatory provenance block" z
// russellbrenner/jurisd (Apache-2.0, src/services/modules.ts buildMetadata + source-store.ts
// content hash). Idea zaadaptowana (snapshot_date + staleness_advisory + integralnosc zrodla);
// kod napisany od zera pod kontrakt MateMatic (structuredContent.citations).
//
// Cel: kazdy cytat niesie nie tylko "skad" (URL) ale i "jak swieze" - snapshot_date + ostrzezenie,
// gdy korpus starszy niz prog. Krytyczne, gdy upstream jest zamrozony (repo Ansvar zarchiwizowane),
// wiec korpus sie nie odswiezy sam - agent musi wiedziec, ze cytuje stan point-in-time.

const DAY_MS = 24 * 60 * 60 * 1000;

export interface Provenance {
    snapshot_date: string; // ISO (YYYY-MM-DD) built_at korpusu
    age_days: number;
    staleness_advisory?: string; // obecne tylko gdy age_days > prog
}

// Prog dni, po ktorym dolaczamy staleness_advisory. Konfigurowalny (FR_STALENESS_DAYS), domyslnie 365.
export function stalenessThresholdDays(): number {
    const raw = Number(process.env.FR_STALENESS_DAYS);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 365;
}

// Buduje blok provenance. nowMs wstrzykiwalny (testy); domyslnie teraz.
export function buildProvenance(builtAtIso: string, thresholdDays: number, nowMs: number = Date.now()): Provenance {
    const day = String(builtAtIso).slice(0, 10);
    const built = Date.parse(String(builtAtIso));
    if (!Number.isFinite(built)) {
        return { snapshot_date: day || "nieznana", age_days: -1 };
    }
    const ageDays = Math.max(0, Math.floor((nowMs - built) / DAY_MS));
    const prov: Provenance = { snapshot_date: day, age_days: ageDays };
    if (ageDays > thresholdDays) {
        prov.staleness_advisory =
            `snapshot korpusu ma ${ageDays} dni (> ${thresholdDays}); zweryfikuj aktualnosc na Legifrance (upstream zamrozony)`;
    }
    return prov;
}
