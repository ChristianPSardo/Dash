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
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      value = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else value += char;
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

function asObjects(matrix: string[][]): Row[] {
  if (!matrix.length) return [];
  const headers = matrix[0].map(clean);
  return matrix
    .slice(1)
    .map((values) =>
      Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""])),
    );
}

function isoDate(value: string) {
  const br = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : "";
}

async function sheetMatrix(name: string) {
  const id =
    process.env.GOOGLE_SHEETS_ID ||
    "1ExgwfrUZy9a_aKla_Q4qgfgCY3Rm5cCchDMxPcYU05g";
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
      {
        headers: { Authorization: headers.get("authorization") || "" },
        cache: "no-store",
      },
    );
    if (!response.ok)
      throw new Error(`Google Sheets API respondeu ${response.status}`);
    const data = (await response.json()) as { values?: string[][] };
    return data.values || [];
  }

  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;
  const response = await fetch(url, { next: { revalidate: 300 } });
  if (!response.ok)
    throw new Error(`Google Sheets respondeu ${response.status}`);
  return parseCsv(await response.text());
}

async function sheet(name: string) {
  return asObjects(await sheetMatrix(name));
}

const asDate = (value: string) => {
  const iso = isoDate(value);
  return iso ? new Date(`${iso}T00:00:00`) : null;
};

const daysBetween = (start: string, end: string) => {
  const a = asDate(start),
    b = asDate(end);
  if (!a || !b) return null;
  const days = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  return days >= 0 && days <= 365 ? days : null;
};

const percentile = (values: number[], ratio: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * ratio)];
};

export async function GET(request: NextRequest) {
  try {
    const baseName = process.env.BASE_SHEET_NAME || "BASE";
    const qualityName = process.env.QUALITY_SHEET_NAME || "QUALIDADE";
    const replacementsName =
      process.env.REPLACEMENTS_SHEET_NAME || "REPOSIÇÔES";
    const [base, quality, replacementMatrix] = await Promise.all([
      sheet(baseName),
      sheet(qualityName),
      sheetMatrix(replacementsName),
    ]);

    const allRows = base
      .filter((r) => clean(r["ID ITEM"]))
      .map((r) => ({
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
      .filter((r) => clean(r["DATA"]))
      .map((r) => ({
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

    const selectedMacro = clean(
      request.nextUrl.searchParams.get("macro") || "all",
    );
    const selectedStatus = clean(
      request.nextUrl.searchParams.get("status") || "all",
    );
    const period = Number(request.nextUrl.searchParams.get("period") || 0);
    const cutoff =
      period > 0 ? new Date(Date.now() - period * 86_400_000) : null;
    const rows = allRows.filter(
      (row) =>
        (selectedMacro === "all" || row.macro === selectedMacro) &&
        (selectedStatus === "all" || row.status === selectedStatus) &&
        (!cutoff || (row.date && new Date(`${row.date}T00:00:00`) >= cutoff)),
    );

    const group = <T>(items: T[], key: (item: T) => string) =>
      Object.entries(
        items.reduce<Record<string, number>>((acc, item) => {
          const label = key(item) || "NÃO INFORMADO";
          acc[label] = (acc[label] || 0) + 1;
          return acc;
        }, {}),
      ).sort((a, b) => b[1] - a[1]);

    const monthly = Object.entries(
      rows.reduce<Record<string, number>>((acc, row) => {
        if (row.date) {
          const month = row.date.slice(0, 7);
          acc[month] = (acc[month] || 0) + 1;
        }
        return acc;
      }, {}),
    )
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-9);

    const approved = audits.filter((a) => a.status === "APROVADO").length;
    const rejected = audits.filter((a) => a.status === "REPROVADO").length;
    const qualityByShift = Object.entries(
      audits.reduce<Record<string, { total: number; approved: number }>>(
        (acc, audit) => {
          const shift = audit.producedShift || "NÃO INFORMADO";
          acc[shift] ||= { total: 0, approved: 0 };
          acc[shift].total++;
          if (audit.status === "APROVADO") acc[shift].approved++;
          return acc;
        },
        {},
      ),
    ).map(([shift, values]) => ({
      shift,
      ...values,
      rate: values.total ? (values.approved / values.total) * 100 : 0,
    }));
    const auditCutDeviations = audits
      .filter((a) => a.cutWeight > 0 && a.auditedWeight > 0)
      .map((a) => ((a.auditedWeight - a.cutWeight) / a.cutWeight) * 100)
      .filter((value) => Math.abs(value) < 100);

    // A aba REPOSIÇÔES não possui cabeçalho. O mapeamento abaixo segue sua
    // estrutura operacional atual: motivo, unidade, liberação, datas e status.
    const replacements = replacementMatrix
      .filter((row) => row.some(Boolean))
      .map((row) => ({
        reason: upper(row[0]),
        unit: upper(row[1]),
        releaseStatus: upper(row[2]),
        requestDate: isoDate(row[3] || ""),
        quantity: number(row[7] || ""),
        material: upper(row[8]),
        part: upper(row[9]),
        supplyStatus: upper(row[11]),
        releaseDate: isoDate(row[13] || ""),
        cutStatus: upper(row[14]),
        receiveStatus: upper(row[15]),
        receiveDate: isoDate(row[16] || ""),
        article: clean(row[18] || ""),
        cutDate: isoDate(row[19] || ""),
        finishDate: isoDate(row[20] || ""),
      }));
    const selectedUnit = clean(
      request.nextUrl.searchParams.get("unit") || "all",
    );
    const cutRows = replacements.filter(
      (row) =>
        (selectedUnit === "all" || row.unit === selectedUnit) &&
        (!cutoff ||
          (row.requestDate &&
            new Date(`${row.requestDate}T00:00:00`) >= cutoff)),
    );
    const completed = cutRows.filter((row) => row.finishDate);
    const cancelled = cutRows.filter(
      (row) =>
        row.cutStatus === "CANCELADO" || row.receiveStatus === "CANCELADO",
    );
    const backlog = cutRows.filter(
      (row) =>
        !row.finishDate &&
        row.cutStatus !== "CANCELADO" &&
        row.receiveStatus !== "CANCELADO",
    );
    const totalLeadTimes = completed
      .map((row) => daysBetween(row.requestDate, row.finishDate))
      .filter((v): v is number => v !== null);
    const stage = (
      start: keyof (typeof cutRows)[number],
      end: keyof (typeof cutRows)[number],
    ) => {
      const values = cutRows
        .map((row) =>
          daysBetween(String(row[start] || ""), String(row[end] || "")),
        )
        .filter((v): v is number => v !== null);
      return {
        average: values.length
          ? values.reduce((sum, value) => sum + value, 0) / values.length
          : 0,
        median: percentile(values, 0.5),
        p90: percentile(values, 0.9),
        count: values.length,
      };
    };
    const cutMonthlyMap = cutRows.reduce<
      Record<string, { requested: number; completed: number }>
    >((acc, row) => {
      if (row.requestDate) {
        const month = row.requestDate.slice(0, 7);
        acc[month] ||= { requested: 0, completed: 0 };
        acc[month].requested++;
      }
      if (row.finishDate) {
        const month = row.finishDate.slice(0, 7);
        acc[month] ||= { requested: 0, completed: 0 };
        acc[month].completed++;
      }
      return acc;
    }, {});
    const leadBuckets = [
      ["Até 3 dias", totalLeadTimes.filter((value) => value <= 3).length],
      [
        "4–7 dias",
        totalLeadTimes.filter((value) => value >= 4 && value <= 7).length,
      ],
      [
        "8–14 dias",
        totalLeadTimes.filter((value) => value >= 8 && value <= 14).length,
      ],
      [
        "15–30 dias",
        totalLeadTimes.filter((value) => value >= 15 && value <= 30).length,
      ],
      ["Acima de 30", totalLeadTimes.filter((value) => value > 30).length],
    ];

    return NextResponse.json({
      summary: {
        requests: rows.length,
        missing: rows.reduce((sum, row) => sum + row.missing, 0),
        pieces: rows.reduce((sum, row) => sum + row.pieces, 0),
      },
      monthly,
      areas: group(rows, (row) => row.area).slice(0, 6),
      reasons: group(rows, (row) => row.reason).slice(0, 6),
      situations: group(rows, (row) => row.status).slice(0, 6),
      filters: {
        macros: [
          ...new Set(allRows.map((row) => row.macro).filter(Boolean)),
        ].sort(),
        statuses: [
          ...new Set(allRows.map((row) => row.status).filter(Boolean)),
        ].sort(),
      },
      quality: {
        audits: audits.length,
        approved,
        rejected,
        approvalRate:
          approved + rejected ? (approved / (approved + rejected)) * 100 : 0,
        requestedWeight: audits.reduce(
          (sum, audit) => sum + audit.requestedWeight,
          0,
        ),
        cutWeight: audits.reduce((sum, audit) => sum + audit.cutWeight, 0),
        auditedWeight: audits.reduce(
          (sum, audit) => sum + audit.auditedWeight,
          0,
        ),
        medianAuditCutDeviation: percentile(auditCutDeviations, 0.5),
        byShift: qualityByShift,
      },
      cut: {
        total: cutRows.length,
        quantity: cutRows.reduce((sum, row) => sum + row.quantity, 0),
        completed: completed.length,
        cancelled: cancelled.length,
        backlog: backlog.length,
        completionRate: cutRows.length
          ? (completed.length / cutRows.length) * 100
          : 0,
        sla7Rate: totalLeadTimes.length
          ? (totalLeadTimes.filter((value) => value <= 7).length /
              totalLeadTimes.length) *
            100
          : 0,
        leadTime: {
          average: totalLeadTimes.length
            ? totalLeadTimes.reduce((sum, value) => sum + value, 0) /
              totalLeadTimes.length
            : 0,
          median: percentile(totalLeadTimes, 0.5),
          p90: percentile(totalLeadTimes, 0.9),
        },
        stages: {
          release: stage("requestDate", "releaseDate"),
          receiving: stage("releaseDate", "receiveDate"),
          cutting: stage("receiveDate", "cutDate"),
          finishing: stage("cutDate", "finishDate"),
        },
        monthly: Object.entries(cutMonthlyMap)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(-9)
          .map(([month, values]) => ({ month, ...values })),
        reasons: group(cutRows, (row) => row.reason).slice(0, 8),
        materials: group(cutRows, (row) => row.material).slice(0, 8),
        parts: group(cutRows, (row) => row.part).slice(0, 8),
        supplyStatuses: group(cutRows, (row) => row.supplyStatus).slice(0, 8),
        cutStatuses: group(cutRows, (row) => row.cutStatus).slice(0, 8),
        receiveStatuses: group(cutRows, (row) => row.receiveStatus).slice(0, 8),
        leadBuckets,
        units: [
          ...new Set(replacements.map((row) => row.unit).filter(Boolean)),
        ].sort(),
      },
      source: "live",
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao consultar a planilha",
        hint: "Configure a conta de serviço do Google na Vercel e compartilhe a planilha com o e-mail técnico.",
      },
      { status: 503 },
    );
  }
}
