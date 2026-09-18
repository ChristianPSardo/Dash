"use client";

import { useEffect, useMemo, useState } from "react";

type Pair = [string, number];
type Stage = { average: number; median: number; p90: number; count: number };
type Payload = {
  summary: { requests: number; missing: number; pieces: number };
  monthly: Pair[];
  areas: Pair[];
  reasons: Pair[];
  situations: Pair[];
  filters: { macros: string[]; statuses: string[] };
  quality: {
    audits: number;
    approved: number;
    rejected: number;
    approvalRate: number;
    requestedWeight: number;
    cutWeight: number;
    auditedWeight: number;
    medianAuditCutDeviation: number;
    byShift: { shift: string; total: number; approved: number; rate: number }[];
  };
  cut: {
    total: number;
    quantity: number;
    completed: number;
    cancelled: number;
    backlog: number;
    completionRate: number;
    sla7Rate: number;
    leadTime: { average: number; median: number; p90: number };
    stages: {
      release: Stage;
      receiving: Stage;
      cutting: Stage;
      finishing: Stage;
    };
    monthly: { month: string; requested: number; completed: number }[];
    reasons: Pair[];
    materials: Pair[];
    parts: Pair[];
    supplyStatuses: Pair[];
    cutStatuses: Pair[];
    receiveStatuses: Pair[];
    leadBuckets: Pair[];
    units: string[];
  };
  source: string;
  updatedAt: string;
};

const snapshot = {
  summary: { requests: 2629, missing: 802988, pieces: 850959 },
  quality: {
    audits: 527,
    approved: 484,
    rejected: 42,
    approvalRate: 92,
    medianAuditCutDeviation: 0.81,
    requestedWeight: 0,
    cutWeight: 0,
    auditedWeight: 0,
    byShift: [
      { shift: "1", total: 239, approved: 221, rate: 92.5 },
      { shift: "2", total: 287, approved: 263, rate: 91.6 },
    ],
  },
  monthly: [
    ["2026-01", 256],
    ["2026-02", 288],
    ["2026-03", 260],
    ["2026-04", 269],
    ["2026-05", 271],
    ["2026-06", 396],
    ["2026-07", 312],
    ["2026-08", 404],
    ["2026-09", 172],
  ] as Pair[],
  areas: [
    ["TALHARIA", 2041],
    ["BENEFICIAMENTO", 198],
    ["COST. EXTERNA", 187],
    ["MALHARIA", 117],
    ["COST. INTERNA", 58],
  ] as Pair[],
  reasons: [
    ["PROBLEMA NO TALHADO", 2092],
    ["PROBLEMA COSTURA", 253],
    ["PROBLEMA MATÉRIA-PRIMA", 233],
    ["PROBLEMA INTERNO", 36],
  ] as Pair[],
  situations: [
    ["ANÁLISE", 2106],
    ["CANCELADO", 419],
    ["AP QUEBRA", 77],
    ["OUTROS", 27],
  ] as Pair[],
  cut: {
    total: 1228,
    quantity: 506689,
    completed: 911,
    cancelled: 43,
    backlog: 285,
    completionRate: 74.2,
    sla7Rate: 53.4,
    leadTime: { average: 16.5, median: 7, p90: 23 },
    stages: {
      release: { average: 0.3, median: 0, p90: 1, count: 1129 },
      receiving: { average: 2.7, median: 1, p90: 5, count: 1043 },
      cutting: { average: 4.1, median: 1, p90: 3, count: 1078 },
      finishing: { average: 4.4, median: 4, p90: 6, count: 905 },
    },
    monthly: [],
    reasons: [
      ["QUANTIDADE INSUFICIENTE", 795],
      ["TONALIDADE", 102],
      ["NÃO ENVIADO CORTE", 60],
      ["USADO EM OUTRA ORDEM", 51],
      ["MALHA COM DEFEITO", 50],
      ["ERRO OPERAÇÃO COSTURA", 44],
      ["ERRO DO PROCESSO NO CORTE", 43],
    ] as Pair[],
    materials: [
      ["ACABAMENTO", 887],
      ["M. ABERTA", 157],
      ["RETILÍNEA", 114],
      ["M. TUBULAR", 57],
      ["ELÁSTICO", 7],
    ] as Pair[],
    parts: [
      ["FRISO DECOTE", 474],
      ["FRISO REFORÇO", 266],
      ["GOLAS", 184],
      ["FRISO CAVAS DECOTE", 48],
      ["RETILÍNEA GOLA", 38],
    ] as Pair[],
    supplyStatuses: [
      ["ENTREGUE", 1150],
      ["LOTE NÃO BATE TON", 23],
      ["DIRETO CORTE", 16],
      ["FALTA BAIXA", 8],
    ] as Pair[],
    cutStatuses: [
      ["ENTREGUE", 1156],
      ["CANCELADO", 39],
      ["NÃO INFORMADO", 25],
      ["FALTA BAIXA", 5],
    ] as Pair[],
    receiveStatuses: [
      ["RECEBIDO", 1143],
      ["CANCELADO", 42],
      ["NÃO INFORMADO", 24],
      ["ENTREGUE", 16],
    ] as Pair[],
    leadBuckets: [
      ["Até 3 dias", 245],
      ["4–7 dias", 239],
      ["8–14 dias", 168],
      ["15–30 dias", 181],
      ["Acima de 30", 74],
    ] as Pair[],
    units: ["GOIÁS", "SUL"],
  },
};

const fmt = new Intl.NumberFormat("pt-BR");
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const pct = (v: number) => `${decimal.format(v)}%`;
const title = (s: string) =>
  s
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|\s)\S/g, (c) => c.toLocaleUpperCase("pt-BR"));
const monthLabel = (m: string) =>
  new Date(`${m}-02`)
    .toLocaleDateString("pt-BR", { month: "short" })
    .replace(".", "");

function Stat({
  label,
  value,
  detail,
  tone = "green",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <article className={`stat ${tone}`}>
      <div className="stat-head">
        <span>{label}</span>
        <i />
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
function Bars({
  data,
  color = "green",
  limit = 7,
}: {
  data: Pair[];
  color?: string;
  limit?: number;
}) {
  const rows = data.slice(0, limit),
    max = Math.max(...rows.map((x) => x[1]), 1);
  return (
    <div className="bars">
      {rows.map(([label, value]) => (
        <div className="bar-row" key={label}>
          <div className="bar-label">
            <span title={label}>{title(label)}</span>
            <b>{fmt.format(value)}</b>
          </div>
          <div className="bar-track">
            <div
              className={`bar-fill ${color}`}
              style={{ width: `${(value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
function Trend({ data }: { data: Pair[] }) {
  const max = Math.max(...data.map((x) => x[1]), 1),
    w = 640,
    h = 190,
    p = 22,
    points = data
      .map(
        ([, v], i) =>
          `${p + (i * (w - p * 2)) / Math.max(data.length - 1, 1)},${h - p - (v / max) * (h - p * 2)}`,
      )
      .join(" ");
  return (
    <div className="trend">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Evolução mensal">
        <defs>
          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#34d399" stopOpacity=".28" />
            <stop offset="1" stopColor="#34d399" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon
          points={`${p},${h - p} ${points} ${w - p},${h - p}`}
          fill="url(#area)"
        />
        <polyline
          points={points}
          fill="none"
          stroke="#34d399"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.map(([, v], i) => (
          <circle
            key={i}
            cx={p + (i * (w - p * 2)) / Math.max(data.length - 1, 1)}
            cy={h - p - (v / max) * (h - p * 2)}
            r="5"
            fill="#101c18"
            stroke="#5de1ae"
            strokeWidth="3"
          />
        ))}
      </svg>
      <div className="trend-labels">
        {data.map(([m]) => (
          <span key={m}>{m}</span>
        ))}
      </div>
    </div>
  );
}
function CompareTrend({
  data,
}: {
  data: { month: string; requested: number; completed: number }[];
}) {
  const max = Math.max(...data.flatMap((x) => [x.requested, x.completed]), 1);
  return (
    <div className="compare-chart">
      {data.map((row) => (
        <div className="compare-col" key={row.month}>
          <div className="columns">
            <i
              className="requested"
              style={{ height: `${(row.requested / max) * 100}%` }}
              title={`${row.requested} solicitadas`}
            />
            <i
              className="completed"
              style={{ height: `${(row.completed / max) * 100}%` }}
              title={`${row.completed} concluídas`}
            />
          </div>
          <span>{monthLabel(row.month)}</span>
        </div>
      ))}
    </div>
  );
}
function CardTitle({
  eyebrow,
  children,
  badge,
}: {
  eyebrow: string;
  children: React.ReactNode;
  badge?: string;
}) {
  return (
    <div className="card-title">
      <div>
        <span>{eyebrow}</span>
        <h2>{children}</h2>
      </div>
      {badge ? <b>{badge}</b> : null}
    </div>
  );
}

export default function Dashboard() {
  const [payload, setPayload] = useState<Payload | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("all"),
    [macro, setMacro] = useState("all"),
    [status, setStatus] = useState("all"),
    [unit, setUnit] = useState("all");
  const [tab, setTab] = useState<"overview" | "cut" | "quality" | "causes">(
    "overview",
  );
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ period, macro, status, unit });
      const r = await fetch(`/api/dashboard?${params}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.hint || j.error);
      setPayload(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na atualização");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [period, macro, status, unit]);
  const d = payload || snapshot;
  const live = Boolean(payload);
  const missingRate = d.summary.pieces
    ? (d.summary.missing / d.summary.pieces) * 100
    : 0;
  const monthly = useMemo(
    () => d.monthly.map(([m, v]) => [monthLabel(m), v] as Pair),
    [d.monthly],
  );
  const nav = [
    { id: "overview", icon: "⌁", label: "Visão geral" },
    { id: "cut", icon: "◫", label: "Corte" },
    { id: "quality", icon: "✓", label: "Qualidade" },
    { id: "causes", icon: "◎", label: "Causas" },
  ] as const;
  const reset = () => {
    setPeriod("all");
    setMacro("all");
    setStatus("all");
    setUnit("all");
  };
  return (
    <main>
      <aside>
        <div className="brand">
          <div className="brand-mark">R</div>
          <div>
            <b>Reposições</b>
            <span>Inteligência operacional</span>
          </div>
        </div>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "active" : ""}
              onClick={() => setTab(item.id)}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="side-note">
          <span>FONTE DE DADOS</span>
          <b>{live ? "Google Sheets" : "Snapshot validado"}</b>
          <small>
            {live
              ? "Agregados atualizados pelo servidor"
              : "Integração corporativa pendente"}
          </small>
        </div>
      </aside>
      <section className="content">
        <header>
          <div>
            <p>CORTE · REPOSIÇÕES · QUALIDADE</p>
            <h1>
              {tab === "overview"
                ? "Painel executivo"
                : tab === "cut"
                  ? "Reposições produzidas no corte"
                  : tab === "quality"
                    ? "Qualidade do corte"
                    : "Causas e oportunidades"}
            </h1>
            <span>
              {tab === "cut"
                ? "Fluxo, volume, backlog e tempo de atendimento das reposições."
                : "Indicadores consolidados para orientar a operação."}
            </span>
          </div>
          <div className="actions">
            <div className={`source ${live ? "online" : "offline"}`}>
              <i />
              {live ? "Dados ao vivo" : "Snapshot"}
            </div>
            <button className="refresh" onClick={load} disabled={loading}>
              {loading ? "Atualizando…" : "↻ Atualizar"}
            </button>
          </div>
        </header>
        {error ? (
          <div className="notice">
            <b>Integração corporativa pendente.</b>
            <span>
              Os indicadores abaixo usam o arquivo validado. A conta de serviço
              ativa a atualização ao vivo sem tornar a planilha pública.
            </span>
          </div>
        ) : null}
        <div className="filters">
          <label>
            Período
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="all">Todo o período</option>
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
              <option value="180">Últimos 180 dias</option>
            </select>
          </label>
          {tab !== "cut" ? (
            <>
              <label>
                Macro-fase
                <select
                  value={macro}
                  onChange={(e) => setMacro(e.target.value)}
                >
                  <option value="all">Todas</option>
                  {payload?.filters.macros.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Situação
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="all">Todas</option>
                  {payload?.filters.statuses.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <label>
              Unidade
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="all">Todas</option>
                {d.cut.units.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          )}
          <button onClick={reset}>Limpar filtros</button>
        </div>

        {tab === "overview" ? (
          <>
            <div className="stats">
              <Stat
                label="Solicitações"
                value={fmt.format(d.summary.requests)}
                detail="Demandas registradas"
              />
              <Stat
                label="Peças faltantes"
                value={fmt.format(d.summary.missing)}
                detail={`${pct(missingRate)} do volume informado`}
                tone="amber"
              />
              <Stat
                label="Reposições no corte"
                value={fmt.format(d.cut.total)}
                detail={`${fmt.format(d.cut.quantity)} unidades`}
                tone="blue"
              />
              <Stat
                label="Conclusão no corte"
                value={pct(d.cut.completionRate)}
                detail={`${fmt.format(d.cut.completed)} finalizadas`}
                tone="violet"
              />
            </div>
            <div className="grid">
              <article className="card wide">
                <CardTitle
                  eyebrow="DEMANDA"
                  badge={`${fmt.format(monthly.at(-1)?.[1] || 0)} no último mês`}
                >
                  Solicitações por mês
                </CardTitle>
                <Trend data={monthly} />
              </article>
              <article className="card">
                <CardTitle eyebrow="STATUS">
                  Situação das solicitações
                </CardTitle>
                <Bars data={d.situations} color="amber" />
              </article>
              <article className="card">
                <CardTitle eyebrow="FOCO DO CORTE">Fila operacional</CardTitle>
                <div className="mini-kpis">
                  <div>
                    <span>Backlog estimado</span>
                    <b>{fmt.format(d.cut.backlog)}</b>
                  </div>
                  <div>
                    <span>Concluídas em até 7 dias</span>
                    <b>{pct(d.cut.sla7Rate)}</b>
                  </div>
                  <div>
                    <span>Lead time mediano</span>
                    <b>{decimal.format(d.cut.leadTime.median)} dias</b>
                  </div>
                </div>
              </article>
              <article className="card">
                <CardTitle eyebrow="CAUSA RAIZ">Áreas causadoras</CardTitle>
                <Bars data={d.areas} />
              </article>
            </div>
          </>
        ) : tab === "cut" ? (
          <>
            <div className="stats">
              <Stat
                label="Reposições do corte"
                value={fmt.format(d.cut.total)}
                detail={`${fmt.format(d.cut.quantity)} unidades informadas`}
              />
              <Stat
                label="Finalizadas"
                value={fmt.format(d.cut.completed)}
                detail={`${pct(d.cut.completionRate)} do total`}
                tone="blue"
              />
              <Stat
                label="Backlog"
                value={fmt.format(d.cut.backlog)}
                detail="Sem data final e não canceladas"
                tone="amber"
              />
              <Stat
                label="Lead time"
                value={`${decimal.format(d.cut.leadTime.median)} dias`}
                detail={`P90 em ${decimal.format(d.cut.leadTime.p90)} dias`}
                tone="violet"
              />
            </div>
            <div className="grid cut-grid">
              <article className="card wide">
                <CardTitle
                  eyebrow="FLUXO MENSAL"
                  badge="Solicitadas × concluídas"
                >
                  Ritmo de produção
                </CardTitle>
                {d.cut.monthly.length ? (
                  <CompareTrend data={d.cut.monthly} />
                ) : (
                  <div className="empty-chart">
                    Dados mensais disponíveis na atualização ao vivo
                  </div>
                )}
                <div className="chart-legend">
                  <span>
                    <i className="req" />
                    Solicitadas
                  </span>
                  <span>
                    <i className="done" />
                    Concluídas
                  </span>
                </div>
              </article>
              <article className="card">
                <CardTitle eyebrow="SLA">Tempo total de atendimento</CardTitle>
                <Bars data={d.cut.leadBuckets} color="blue" />
              </article>
              <article className="card wide stages-card">
                <CardTitle eyebrow="TEMPO POR ETAPA">
                  Onde o ciclo consome tempo
                </CardTitle>
                <div className="stages">
                  {Object.entries(d.cut.stages).map(([key, value]) => (
                    <div key={key}>
                      <span>
                        {
                          (
                            {
                              release: "Liberação",
                              receiving: "Recebimento",
                              cutting: "Fila até o corte",
                              finishing: "Finalização",
                            } as Record<string, string>
                          )[key]
                        }
                      </span>
                      <b>
                        {decimal.format(value.median)} dia
                        {value.median === 1 ? "" : "s"}
                      </b>
                      <small>
                        Média {decimal.format(value.average)} · P90{" "}
                        {decimal.format(value.p90)}
                      </small>
                    </div>
                  ))}
                </div>
              </article>
              <article className="card">
                <CardTitle eyebrow="MATERIAL">Tipos mais produzidos</CardTitle>
                <Bars data={d.cut.materials} />
              </article>
              <article className="card">
                <CardTitle eyebrow="COMPONENTE">
                  Peças mais recorrentes
                </CardTitle>
                <Bars data={d.cut.parts} color="amber" />
              </article>
              <article className="card">
                <CardTitle eyebrow="MOTIVO">
                  Por que a reposição foi aberta
                </CardTitle>
                <Bars data={d.cut.reasons} color="blue" />
              </article>
            </div>
          </>
        ) : tab === "quality" ? (
          <>
            <div className="stats quality">
              <Stat
                label="Auditorias"
                value={fmt.format(d.quality.audits)}
                detail="Registros avaliados"
              />
              <Stat
                label="Aprovadas"
                value={fmt.format(d.quality.approved)}
                detail={pct(d.quality.approvalRate)}
                tone="blue"
              />
              <Stat
                label="Reprovadas"
                value={fmt.format(d.quality.rejected)}
                detail={pct(100 - d.quality.approvalRate)}
                tone="amber"
              />
              <Stat
                label="Desvio mediano"
                value={pct(d.quality.medianAuditCutDeviation)}
                detail="Peso auditado × peso do corte"
                tone="violet"
              />
            </div>
            <div className="grid quality-grid">
              <article className="card wide">
                <CardTitle eyebrow="CONFORMIDADE">
                  Resultado das auditorias
                </CardTitle>
                <div className="donut-wrap">
                  <div
                    className="donut"
                    style={{
                      background: `conic-gradient(#23c58b 0 ${d.quality.approvalRate}%,#ffb454 0)`,
                    }}
                  >
                    <div>
                      <b>{pct(d.quality.approvalRate)}</b>
                      <span>aprovação</span>
                    </div>
                  </div>
                  <div className="legend">
                    <p>
                      <i className="ok" />
                      <span>Aprovado</span>
                      <b>{fmt.format(d.quality.approved)}</b>
                    </p>
                    <p>
                      <i className="bad" />
                      <span>Reprovado</span>
                      <b>{fmt.format(d.quality.rejected)}</b>
                    </p>
                  </div>
                </div>
              </article>
              <article className="card">
                <CardTitle eyebrow="TURNO PRODUZIDO">
                  Conformidade por turno
                </CardTitle>
                <div className="shift-list">
                  {d.quality.byShift.map((row) => (
                    <div key={row.shift}>
                      <span>Turno {row.shift}</span>
                      <b>{pct(row.rate)}</b>
                      <small>
                        {row.approved}/{row.total} aprovadas
                      </small>
                    </div>
                  ))}
                </div>
              </article>
              <article className="card insight">
                <span>LEITURA</span>
                <h2>O peso auditado fica próximo do corte</h2>
                <p>
                  O desvio mediano é de {pct(d.quality.medianAuditCutDeviation)}
                  . A mediana reduz o efeito de lançamentos extremos e é a
                  medida mais segura para este acompanhamento.
                </p>
              </article>
              <article className="card">
                <CardTitle eyebrow="PROCESSO">Status no corte</CardTitle>
                <Bars data={d.cut.cutStatuses} />
              </article>
            </div>
          </>
        ) : (
          <>
            <div className="stats">
              <Stat
                label="Talharia"
                value={fmt.format(d.areas[0]?.[1] || 0)}
                detail="Principal área causadora"
              />
              <Stat
                label="Qtd. insuficiente"
                value={fmt.format(d.cut.reasons[0]?.[1] || 0)}
                detail="Principal motivo no corte"
                tone="amber"
              />
              <Stat
                label="Friso decote"
                value={fmt.format(d.cut.parts[0]?.[1] || 0)}
                detail="Componente mais recorrente"
                tone="blue"
              />
              <Stat
                label="Canceladas"
                value={fmt.format(d.cut.cancelled)}
                detail="No fluxo de produção"
                tone="violet"
              />
            </div>
            <div className="grid">
              <article className="card">
                <CardTitle eyebrow="SOLICITAÇÕES">Principais motivos</CardTitle>
                <Bars data={d.reasons} color="amber" />
              </article>
              <article className="card">
                <CardTitle eyebrow="CORTE">
                  Motivos das reposições produzidas
                </CardTitle>
                <Bars data={d.cut.reasons} color="blue" />
              </article>
              <article className="card">
                <CardTitle eyebrow="ABASTECIMENTO">
                  Situação de materiais
                </CardTitle>
                <Bars data={d.cut.supplyStatuses} />
              </article>
              <article className="card">
                <CardTitle eyebrow="RECEBIMENTO">
                  Situação após o corte
                </CardTitle>
                <Bars data={d.cut.receiveStatuses} />
              </article>
            </div>
          </>
        )}
        <footer>
          <span>
            Última atualização:{" "}
            {live
              ? new Date(payload!.updatedAt).toLocaleString("pt-BR")
              : "arquivo enviado"}
          </span>
          <span>API pública somente com dados agregados</span>
        </footer>
      </section>
    </main>
  );
}
