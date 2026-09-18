import { NextRequest, NextResponse } from "next/server";
import { JWT } from "google-auth-library";

export const revalidate = 300;

type Row = Record<string, string>;

const clean = (value = "") => value.trim().replace(/\s+/g, " ");
const upper = (value = "") => clean(value).toLocaleUpperCase("pt-BR");
const number = (value = "") => {
  const raw = String(value).trim();
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(value); value = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}

function asObjects(matrix: string[][]): Row[] {
  if (!matrix.length) return [];
  const headers = matrix[0].map(clean);
  return matrix.slice(1).map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""])));
}

function isoDate(value: string) {
  const br = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : "";
}

async function sheet(name: string) {
  const id = process.env.GOOGLE_SHEETS_ID || "1ExgwfrUZy9a_aKla_Q4qgfgCY3Rm5cCchDMxPcYU05g";
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (serviceAccountEmail && privateKey) {
    const auth = new JWT({
      email: serviceAccountEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const headers = await auth.getRequestHeaders();
    const range = encodeURIComponent(`'${name}'!A:AJ`);
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}?majorDimension=ROWS`,
      { headers: { Authorization: headers.get("authorization") || "" }, cache: "no-store" },
    );
    if (!response.ok) throw new Error(`Google Sheets API respondeu ${response.status}`);
    const data = await response.json() as { values?: string[][] };
    return asObjects(data.values || []);
  }

  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;
  const response = await fetch(url, { next: { revalidate: 300 } });
  if (!response.ok) throw new Error(`Google Sheets respondeu ${response.status}`);
  return asObjects(parseCsv(await response.text()));
}

export async function GET(request: NextRequest) {
  try {
    const baseName = process.env.BASE_SHEET_NAME || "BASE";
    const qualityName = process.env.QUALITY_SHEET_NAME || "QUALIDADE";
    const [base, quality] = await Promise.all([sheet(baseName), sheet(qualityName)]);

    const allRows = base
      .filter(r => clean(r["ID ITEM"]))
      .map(r => ({
        id: clean(r["ID ITEM"]),
        date: isoDate(r["DATA SOLICITAÇÃO"]),
        macro: upper(r["MACRO-FASE"]),
        op: clean(r["OP"]),
        article: clean(r["ARTIGO"]),
        route: clean(r["ROTA"]),
        description: upper(r["DESC. REPOSIÇÃO"]),
        reason: upper(r["MOTIVO"]),
        specificReason: upper(r["MOTIVO ESPECÍFICO"]),
        area: upper(r["ÁREA CAUSADORA"]),
        unit: upper(r["UND. CORTE"]),
        phase: upper(r["FASE"]),
        shipment: clean(r["EMBARQUE"]),
        pieces: number(r["PÇS TOTAL"]),
        missing: number(r["FALTA TOTAL"] || r[" FALTA TOTAL"]),
        status: upper(r["SITUAÇÃO"]) || "SEM SITUAÇÃO",
        block: upper(r["BLOCO"]),
        pcp: upper(r["ANÁLISE PCP"]),
      }));

    const audits = quality
      .filter(r => clean(r["DATA"]))
      .map(r => ({
        date: isoDate(r["DATA"]),
        order: clean(r["ORDEM"]),
        request: clean(r["SOLICITAÇÃO"]),
        auditedShift: clean(r["TURNO AUDITADO"]),
        producedShift: clean(r["TURNO PRODUZIDO"] || r["TURNO PRODUZIDO "]),
        requestedWeight: number(r["PESO SOLICITADO"] || r["PESO SOLICITADO "]),
        cutWeight: number(r["PESO CORTE"]),
        auditedWeight: number(r["PESO AUDITADO"]),
        status: upper(r["STATUS"]) || "SEM STATUS",
      }));

    const selectedMacro = clean(request.nextUrl.searchParams.get("macro") || "all");
    const selectedStatus = clean(request.nextUrl.searchParams.get("status") || "all");
    const period = Number(request.nextUrl.searchParams.get("period") || 0);
    const cutoff = period > 0 ? new Date(Date.now() - period * 86_400_000) : null;
    const rows = allRows.filter(row =>
      (selectedMacro === "all" || row.macro === selectedMacro) &&
      (selectedStatus === "all" || row.status === selectedStatus) &&
      (!cutoff || (row.date && new Date(`${row.date}T00:00:00`) >= cutoff))
    );

    const group = <T,>(items: T[], key: (item: T) => string) =>
      Object.entries(items.reduce<Record<string, number>>((acc, item) => {
        const label = key(item) || "NÃO INFORMADO";
        acc[label] = (acc[label] || 0) + 1;
        return acc;
      }, {})).sort((a, b) => b[1] - a[1]);

    const monthly = Object.entries(rows.reduce<Record<string, number>>((acc, row) => {
      if (row.date) {
        const month = row.date.slice(0, 7);
        acc[month] = (acc[month] || 0) + 1;
      }
      return acc;
    }, {})).sort((a, b) => a[0].localeCompare(b[0])).slice(-9);

    const approved = audits.filter(a => a.status === "APROVADO").length;
    const rejected = audits.filter(a => a.status === "REPROVADO").length;

    return NextResponse.json({
      summary: {
        requests: rows.length,
        missing: rows.reduce((sum, row) => sum + row.missing, 0),
        pieces: rows.reduce((sum, row) => sum + row.pieces, 0),
      },
      monthly,
      areas: group(rows, row => row.area).slice(0, 6),
      reasons: group(rows, row => row.reason).slice(0, 6),
      situations: group(rows, row => row.status).slice(0, 6),
      filters: {
        macros: [...new Set(allRows.map(row => row.macro).filter(Boolean))].sort(),
        statuses: [...new Set(allRows.map(row => row.status).filter(Boolean))].sort(),
      },
      quality: { audits: audits.length, approved, rejected },
      source: "live",
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Falha ao consultar a planilha",
      hint: "Configure a conta de serviço do Google na Vercel e compartilhe a planilha com o e-mail técnico.",
    }, { status: 503 });
  }
}
