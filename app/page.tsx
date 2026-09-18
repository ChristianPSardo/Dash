"use client";

import { useEffect, useMemo, useState } from "react";

type BaseRow = { id:string; date:string; macro:string; op:string; article:string; route:string; description:string; reason:string; specificReason:string; area:string; unit:string; phase:string; shipment:string; pieces:number; missing:number; status:string; block:string; pcp:string };
type Audit = { date:string; order:string; request:string; auditedShift:string; producedShift:string; requestedWeight:number; cutWeight:number; auditedWeight:number; status:string };
type Payload = { rows:BaseRow[]; audits:Audit[]; source:string; updatedAt:string };

const snapshot = {
  requests: 2629, missing: 802988, pieces: 850959, audits: 527, approved: 484, rejected: 42,
  monthly: [["jan",256],["fev",288],["mar",260],["abr",269],["mai",271],["jun",396],["jul",312],["ago",404],["set",172]] as [string,number][],
  areas: [["Talharia",2041],["Beneficiamento",198],["Cost. externa",187],["Malharia",117],["Cost. interna",58]] as [string,number][],
  reasons: [["Problema no talhado",2092],["Problema costura",253],["Problema matéria-prima",233],["Problema interno",36],["Cadastro/modelagem",10]] as [string,number][],
  statuses: [["Em análise",2106],["Cancelado",419],["AP quebra",77],["Outros",27]] as [string,number][],
};

const fmt = new Intl.NumberFormat("pt-BR");
const pct = (v:number) => `${v.toFixed(1).replace(".", ",")}%`;
const title = (s:string) => s.toLocaleLowerCase("pt-BR").replace(/(^|\s)\S/g, c => c.toLocaleUpperCase("pt-BR"));
const countBy = <T,>(data:T[], getter:(item:T)=>string) => Object.entries(data.reduce<Record<string,number>>((acc,item)=>{ const key=getter(item)||"Não informado"; acc[key]=(acc[key]||0)+1; return acc; },{})).sort((a,b)=>b[1]-a[1]);

function Stat({ label, value, detail, tone="green" }:{ label:string; value:string; detail:string; tone?:string }) {
  return <article className={`stat ${tone}`}><div className="stat-head"><span>{label}</span><i /></div><strong>{value}</strong><small>{detail}</small></article>;
}

function Bars({ data, color="green", limit=6 }:{ data:[string,number][]; color?:string; limit?:number }) {
  const sliced=data.slice(0,limit); const max=Math.max(...sliced.map(x=>x[1]),1);
  return <div className="bars">{sliced.map(([label,value])=><div className="bar-row" key={label}><div className="bar-label"><span>{title(label)}</span><b>{fmt.format(value)}</b></div><div className="bar-track"><div className={`bar-fill ${color}`} style={{width:`${value/max*100}%`}} /></div></div>)}</div>;
}

function Trend({ data }:{ data:[string,number][] }) {
  const max=Math.max(...data.map(x=>x[1]),1); const width=640, height=190, pad=22;
  const points=data.map(([,v],i)=>`${pad+i*(width-pad*2)/Math.max(data.length-1,1)},${height-pad-v/max*(height-pad*2)}`).join(" ");
  return <div className="trend"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolução mensal"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1eae78" stopOpacity=".28"/><stop offset="1" stopColor="#1eae78" stopOpacity="0"/></linearGradient></defs><polygon points={`${pad},${height-pad} ${points} ${width-pad},${height-pad}`} fill="url(#area)"/><polyline points={points} fill="none" stroke="#1eae78" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>{data.map(([,v],i)=><circle key={i} cx={pad+i*(width-pad*2)/Math.max(data.length-1,1)} cy={height-pad-v/max*(height-pad*2)} r="5" fill="#101c18" stroke="#5de1ae" strokeWidth="3"/>)}</svg><div className="trend-labels">{data.map(([m])=><span key={m}>{m}</span>)}</div></div>;
}

export default function Dashboard() {
  const [payload,setPayload]=useState<Payload|null>(null); const [error,setError]=useState(""); const [loading,setLoading]=useState(true);
  const [period,setPeriod]=useState("all"); const [macro,setMacro]=useState("all"); const [status,setStatus]=useState("all"); const [tab,setTab]=useState<"operacao"|"qualidade">("operacao");
  const load=async()=>{ setLoading(true); setError(""); try { const r=await fetch('/api/dashboard',{cache:'no-store'}); const j=await r.json(); if(!r.ok) throw new Error(j.hint||j.error); setPayload(j); } catch(e){ setError(e instanceof Error?e.message:"Falha na atualização"); } finally { setLoading(false); } };
  useEffect(()=>{load()},[]);

  const macros=useMemo(()=>payload?[...new Set(payload.rows.map(r=>r.macro).filter(Boolean))].sort():[],[payload]);
  const statuses=useMemo(()=>payload?[...new Set(payload.rows.map(r=>r.status).filter(Boolean))].sort():[],[payload]);
  const filtered=useMemo(()=>{ if(!payload)return[]; const now=new Date(); const cutoff=period==='all'?null:new Date(now.getTime()-Number(period)*86400000); return payload.rows.filter(r=>(macro==='all'||r.macro===macro)&&(status==='all'||r.status===status)&&(!cutoff||new Date(`${r.date}T00:00:00`)>=cutoff)); },[payload,period,macro,status]);

  const live=Boolean(payload); const req=live?filtered.length:snapshot.requests; const missing=live?filtered.reduce((s,r)=>s+r.missing,0):snapshot.missing; const pieces=live?filtered.reduce((s,r)=>s+r.pieces,0):snapshot.pieces;
  const approved=live?payload!.audits.filter(a=>a.status==='APROVADO').length:snapshot.approved; const rejected=live?payload!.audits.filter(a=>a.status==='REPROVADO').length:snapshot.rejected; const audits=live?payload!.audits.length:snapshot.audits;
  const areas=(live?countBy(filtered,r=>r.area):snapshot.areas).slice(0,6) as [string,number][];
  const reasons=(live?countBy(filtered,r=>r.reason):snapshot.reasons).slice(0,6) as [string,number][];
  const situation=(live?countBy(filtered,r=>r.status):snapshot.statuses).slice(0,6) as [string,number][];
  const monthly=useMemo(()=>{ if(!live)return snapshot.monthly; const map=new Map<string,number>(); filtered.forEach(r=>{if(r.date){const k=r.date.slice(0,7);map.set(k,(map.get(k)||0)+1)}}); return [...map.entries()].sort().slice(-9).map(([m,v])=>[new Date(`${m}-02`).toLocaleDateString('pt-BR',{month:'short'}).replace('.',''),v] as [string,number]); },[filtered,live]);

  return <main>
    <aside><div className="brand"><div className="brand-mark">R</div><div><b>Reposições</b><span>Inteligência operacional</span></div></div><nav><button className={tab==='operacao'?'active':''} onClick={()=>setTab('operacao')}><span>⌁</span> Visão geral</button><button className={tab==='qualidade'?'active':''} onClick={()=>setTab('qualidade')}><span>✓</span> Qualidade</button></nav><div className="side-note"><span>FONTE DE DADOS</span><b>{live?'Google Sheets':'Snapshot da planilha'}</b><small>{live?'Atualização automática a cada 5 min':'Conecte a planilha para dados ao vivo'}</small></div></aside>
    <section className="content"><header><div><p>OPERAÇÃO · REPOSIÇÕES</p><h1>{tab==='operacao'?'Painel de desempenho':'Auditoria de qualidade'}</h1><span>{tab==='operacao'?'Visão consolidada das solicitações, causas e volumes.':'Acompanhamento de aprovações e pesos auditados.'}</span></div><div className="actions"><div className={`source ${live?'online':'offline'}`}><i/>{live?'Dados ao vivo':'Modo demonstração'}</div><button className="refresh" onClick={load} disabled={loading}>{loading?'Atualizando…':'↻ Atualizar'}</button></div></header>
      {error&&<div className="notice"><b>A integração corporativa ainda não foi configurada.</b><span>Exibindo indicadores do arquivo enviado. Cadastre a conta de serviço do Google nas variáveis protegidas da Vercel para ativar os dados ao vivo.</span></div>}
      {tab==='operacao'?<>
        <div className="filters"><label>Período<select value={period} onChange={e=>setPeriod(e.target.value)}><option value="all">Todo o período</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="180">Últimos 180 dias</option></select></label><label>Macro-fase<select value={macro} onChange={e=>setMacro(e.target.value)}><option value="all">Todas</option>{macros.map(x=><option key={x}>{x}</option>)}</select></label><label>Situação<select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Todas</option>{statuses.map(x=><option key={x}>{x}</option>)}</select></label><button onClick={()=>{setPeriod('all');setMacro('all');setStatus('all')}}>Limpar filtros</button></div>
        <div className="stats"><Stat label="Solicitações" value={fmt.format(req)} detail="Registros no período"/><Stat label="Peças faltantes" value={fmt.format(missing)} detail="Soma da falta total" tone="amber"/><Stat label="Volume das ordens" value={fmt.format(pieces)} detail="Peças totais informadas" tone="blue"/><Stat label="Índice de falta" value={pct(pieces?missing/pieces*100:0)} detail="Falta ÷ volume informado" tone="violet"/></div>
        <div className="grid"><article className="card wide"><div className="card-title"><div><span>TENDÊNCIA</span><h2>Solicitações por mês</h2></div><b>{monthly.length?`${fmt.format(monthly.at(-1)![1])} no último mês`:'Sem dados'}</b></div><Trend data={monthly}/></article><article className="card"><div className="card-title"><div><span>STATUS</span><h2>Situação atual</h2></div></div><Bars data={situation} color="amber"/></article><article className="card"><div className="card-title"><div><span>CAUSA RAIZ</span><h2>Áreas causadoras</h2></div></div><Bars data={areas}/></article><article className="card"><div className="card-title"><div><span>OCORRÊNCIAS</span><h2>Principais motivos</h2></div></div><Bars data={reasons} color="blue"/></article></div>
      </>:<>
        <div className="stats quality"><Stat label="Auditorias" value={fmt.format(audits)} detail="Registros avaliados"/><Stat label="Aprovadas" value={fmt.format(approved)} detail={`${pct(audits?approved/audits*100:0)} das auditorias`} tone="blue"/><Stat label="Reprovadas" value={fmt.format(rejected)} detail={`${pct(audits?rejected/audits*100:0)} das auditorias`} tone="amber"/><Stat label="Conformidade" value={pct((approved+rejected)?approved/(approved+rejected)*100:0)} detail="Desconsidera status vazio" tone="violet"/></div>
        <div className="grid quality-grid"><article className="card wide"><div className="card-title"><div><span>RESULTADO</span><h2>Distribuição das auditorias</h2></div></div><div className="donut-wrap"><div className="donut" style={{background:`conic-gradient(#23c58b 0 ${approved/Math.max(approved+rejected,1)*100}%, #ffb454 0)`}}><div><b>{pct(approved/Math.max(approved+rejected,1)*100)}</b><span>aprovação</span></div></div><div className="legend"><p><i className="ok"/><span>Aprovado</span><b>{fmt.format(approved)}</b></p><p><i className="bad"/><span>Reprovado</span><b>{fmt.format(rejected)}</b></p></div></div></article><article className="card insight"><span>LEITURA DO INDICADOR</span><h2>Qualidade em nível elevado</h2><p>A taxa de conformidade está acima de 90%. Acompanhe as reprovações por turno e compare o peso solicitado, cortado e auditado para detectar desvios.</p><button onClick={()=>setTab('operacao')}>Ver causas operacionais →</button></article></div>
      </>}
      <footer><span>Última atualização: {live?new Date(payload!.updatedAt).toLocaleString('pt-BR'):'arquivo enviado'}</span><span>{live?`${fmt.format(filtered.length)} registros após os filtros`:'Snapshot com dados até setembro de 2026'}</span></footer>
    </section>
  </main>;
}
