const CONFIG = Object.freeze({
  SPREADSHEET_ID: '1ExgwfrUZy9a_aKla_Q4qgfgCY3Rm5cCchDMxPcYU05g',
  SHEETS: { base: 'BASE', quality: 'QUALIDADE', replacements: 'REPOSIÇÔES' },
  CACHE_SECONDS: 300,
  TIMEZONE: 'America/Sao_Paulo'
});

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Painel de Reposições e Corte')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getDashboardData(filters) {
  filters = filters || {};
  const safeFilters = {
    period: ['all', '30', '90', '180', '365'].indexOf(String(filters.period || 'all')) >= 0 ? String(filters.period || 'all') : 'all',
    unit: cleanText(filters.unit || 'Todas'),
    status: cleanText(filters.status || 'Todas')
  };
  const cache = CacheService.getScriptCache();
  const key = 'dashboard-v3-' + Utilities.base64EncodeWebSafe(JSON.stringify(safeFilters));
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached);

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const baseValues = getValues(ss, CONFIG.SHEETS.base);
  const qualityValues = getValues(ss, CONFIG.SHEETS.quality);
  const replacementValues = getValues(ss, CONFIG.SHEETS.replacements);
  const cutoff = getCutoff(safeFilters.period);
  const result = buildDashboard(baseValues, qualityValues, replacementValues, safeFilters, cutoff);
  const payload = JSON.stringify(result);
  if (payload.length < 95000) cache.put(key, payload, CONFIG.CACHE_SECONDS);
  return result;
}

function getValues(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Aba não encontrada: ' + sheetName);
  if (!sheet.getLastRow() || !sheet.getLastColumn()) return [];
  return sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
}

function buildDashboard(baseValues, qualityValues, replacementValues, filters, cutoff) {
  const base = parseTable(baseValues);
  const quality = parseTable(qualityValues);
  const baseDate = findColumn(base.headers, ['DATA SOLICITACAO']);
  const baseUnit = findColumn(base.headers, ['UND CORTE', 'UNIDADE CORTE']);
  const baseStatus = findColumn(base.headers, ['SITUACAO']);
  const totalPieces = findColumn(base.headers, ['PCS TOTAL', 'PECAS TOTAL']);
  const missingPieces = findColumn(base.headers, ['FALTA TOTAL']);
  const area = findColumn(base.headers, ['AREA CAUSADORA']);
  const reason = findColumn(base.headers, ['MOTIVO']);

  const allUnits = unique(base.rows.map(r => cleanText(r[baseUnit])).concat(replacementValues.map(r => cleanText(r[1]))));
  const allStatuses = unique(base.rows.map(r => cleanText(r[baseStatus])));
  const filteredBase = base.rows.filter(r => passes(r[baseDate], r[baseUnit], r[baseStatus], filters, cutoff));

  const totalRequests = filteredBase.length;
  const missing = sum(filteredBase.map(r => numberValue(r[missingPieces])));
  const pieces = sum(filteredBase.map(r => numberValue(r[totalPieces])));
  const baseDates = filteredBase.map(r => toDate(r[baseDate])).filter(Boolean);
  const dailyRate = dateSpanRate(totalRequests, baseDates);

  const monthlyMap = {};
  filteredBase.forEach(r => {
    const d = toDate(r[baseDate]);
    if (d) add(monthlyMap, Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM'), 1);
  });

  const replacements = replacementValues.filter(r => r.some(v => v !== '' && v != null)).filter(r =>
    passes(r[3], r[1], '', filters, cutoff, true)
  );
  const cut = analyzeReplacements(replacements);
  const qualityData = analyzeQuality(quality, filters, cutoff);

  const result = {
    source: 'Google Sheets privado — dados consolidados no Apps Script',
    updatedAt: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy 'às' HH:mm"),
    appliedFilters: filters,
    filters: { units: ['Todas'].concat(allUnits), statuses: ['Todas'].concat(allStatuses) },
    summary: {
      totalRequests: totalRequests,
      missingPieces: round(missing, 0),
      totalPieces: round(pieces, 0),
      shortageRate: pieces ? round(missing / pieces * 100, 1) : 0,
      dailyRate: round(dailyRate, 1),
      backlog: cut.backlog,
      replacementQty: cut.totalQty,
      completionRate: cut.completionRate
    },
    monthly: sortedPairs(monthlyMap),
    areas: topPairs(group(filteredBase, area), 8),
    reasons: topPairs(group(filteredBase, reason), 8),
    situations: topPairs(group(filteredBase, baseStatus), 8),
    quality: qualityData,
    cut: cut
  };
  return result;
}

function analyzeQuality(table, filters, cutoff) {
  const h = table.headers;
  const dateCol = findColumn(h, ['DATA', 'DATA AUDITORIA', 'DATA CORTE']);
  const unitCol = findColumn(h, ['UNIDADE', 'UND CORTE', 'UNIDADE CORTE']);
  const resultCol = findColumn(h, ['RESULTADO', 'SITUACAO', 'STATUS']);
  const shiftCol = findColumn(h, ['TURNO PRODUZIDO', 'TURNO']);
  const deviationCol = findColumn(h, ['DESVIO', 'DIFERENCA', 'VARIACAO']);
  const rows = table.rows.filter(r => passes(r[dateCol], r[unitCol], r[resultCol], filters, cutoff, true));
  let approved = 0, rejected = 0;
  const deviations = [], shifts = {};
  rows.forEach(r => {
    const status = normalize(r[resultCol]);
    const ok = status.indexOf('APROV') >= 0;
    const no = status.indexOf('REPROV') >= 0;
    if (ok) approved++;
    if (no) rejected++;
    const dev = percentValue(r[deviationCol]);
    if (dev != null && Math.abs(dev) < 1) deviations.push(Math.abs(dev) * 100);
    const shift = cleanText(r[shiftCol]) || 'Não informado';
    if (!shifts[shift]) shifts[shift] = { total: 0, approved: 0 };
    shifts[shift].total++;
    if (ok) shifts[shift].approved++;
  });
  const evaluated = approved + rejected;
  return {
    total: rows.length,
    approved: approved,
    rejected: rejected,
    approvalRate: evaluated ? round(approved / evaluated * 100, 1) : 0,
    averageDeviation: deviations.length ? round(avg(deviations), 2) : 0,
    medianDeviation: deviations.length ? round(median(deviations), 2) : 0,
    shifts: Object.keys(shifts).map(k => ({ name: k, total: shifts[k].total, approved: shifts[k].approved, rate: shifts[k].total ? round(shifts[k].approved / shifts[k].total * 100, 1) : 0 })).sort((a,b) => b.total-a.total)
  };
}

function analyzeReplacements(rows) {
  const completed = [], totalLead = [], stages = { release: [], receive: [], cut: [], finish: [] };
  const reasons = {}, materials = {}, parts = {}, supply = {}, cutStatus = {}, receiveStatus = {}, buckets = {'Até 3 dias':0,'4–7 dias':0,'8–14 dias':0,'15–30 dias':0,'Acima de 30':0};
  let totalQty = 0, backlog = 0, cancelled = 0, sla = 0;
  rows.forEach(r => {
    totalQty += numberValue(r[7]);
    count(reasons, r[0]); count(materials, r[8]); count(parts, r[9]); count(supply, r[11]); count(cutStatus, r[14]); count(receiveStatus, r[15]);
    const request = toDate(r[3]), release = toDate(r[13]), receive = toDate(r[16]), cutDate = toDate(r[19]), finish = toDate(r[20]);
    const statusText = normalize([r[2],r[11],r[14],r[15]].join(' '));
    const isCancelled = statusText.indexOf('CANCEL') >= 0;
    if (isCancelled) cancelled++;
    if (!finish && !isCancelled) backlog++;
    if (finish) completed.push(1);
    pushDays(stages.release, request, release); pushDays(stages.receive, release, receive); pushDays(stages.cut, receive, cutDate); pushDays(stages.finish, cutDate, finish);
    const lead = diffDays(request, finish);
    if (lead != null && lead >= 0) {
      totalLead.push(lead); if (lead <= 7) sla++;
      if (lead <= 3) buckets['Até 3 dias']++; else if (lead <= 7) buckets['4–7 dias']++; else if (lead <= 14) buckets['8–14 dias']++; else if (lead <= 30) buckets['15–30 dias']++; else buckets['Acima de 30']++;
    }
  });
  return {
    records: rows.length, totalQty: round(totalQty, 0), completed: completed.length, backlog: backlog, cancelled: cancelled,
    completionRate: rows.length ? round(completed.length / rows.length * 100, 1) : 0,
    slaRate: totalLead.length ? round(sla / totalLead.length * 100, 1) : 0,
    leadTime: stats(totalLead),
    stages: [stage('Solicitação → liberação', stages.release),stage('Liberação → recebimento', stages.receive),stage('Recebimento → corte', stages.cut),stage('Corte → finalização', stages.finish)],
    reasons: topPairs(reasons, 10), materials: topPairs(materials, 8), parts: topPairs(parts, 10), supplyStatus: topPairs(supply, 8), cutStatus: topPairs(cutStatus, 8), receiveStatus: topPairs(receiveStatus, 8), leadBuckets: Object.keys(buckets).map(k => [k,buckets[k]])
  };
}

function parseTable(values) {
  if (!values.length) return { headers: [], rows: [] };
  return { headers: values[0].map(normalize), rows: values.slice(1).filter(r => r.some(v => v !== '' && v != null)) };
}
function findColumn(headers, candidates) { for (let i=0;i<candidates.length;i++){const c=normalize(candidates[i]);const exact=headers.indexOf(c);if(exact>=0)return exact;const partial=headers.findIndex(h=>h.indexOf(c)>=0);if(partial>=0)return partial;} return -1; }
function passes(dateValue, unitValue, statusValue, filters, cutoff, ignoreStatus) { const d=toDate(dateValue); if(cutoff && d && d<cutoff)return false; if(filters.unit!=='Todas' && unitValue !== undefined && cleanText(unitValue)!==filters.unit)return false; if(!ignoreStatus && filters.status!=='Todas' && statusValue !== undefined && cleanText(statusValue)!==filters.status)return false; return true; }
function getCutoff(period) { if(period==='all')return null; const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-Number(period)); return d; }
function normalize(v) { return String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,' ').trim().toUpperCase(); }
function cleanText(v) { return String(v == null ? '' : v).trim().replace(/\s+/g,' '); }
function numberValue(v) { if(typeof v==='number')return isFinite(v)?v:0; const s=String(v||'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''); const n=Number(s); return isFinite(n)?n:0; }
function percentValue(v) { if(v===''||v==null)return null; if(typeof v==='number')return v; const n=numberValue(v); return String(v).indexOf('%')>=0?n/100:n; }
function toDate(v) { if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v))return new Date(v); if(typeof v==='number'&&v>20000)return new Date(Math.round((v-25569)*86400000)); if(!v)return null; const s=String(v).trim(); const br=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/); if(br){const y=Number(br[3])+(br[3].length===2?2000:0);const d=new Date(y,Number(br[2])-1,Number(br[1]));return isNaN(d)?null:d;} const d=new Date(s); return isNaN(d)?null:d; }
function diffDays(a,b) { if(!a||!b)return null; return Math.round((b.getTime()-a.getTime())/86400000); }
function pushDays(arr,a,b){const n=diffDays(a,b);if(n!=null&&n>=0&&n<365)arr.push(n);}
function add(obj,k,n){obj[k]=(obj[k]||0)+n;} function count(obj,v){const k=cleanText(v)||'Não informado';add(obj,k,1);} function sum(a){return a.reduce((x,y)=>x+y,0);} function avg(a){return a.length?sum(a)/a.length:0;}
function median(a){if(!a.length)return 0;const b=a.slice().sort((x,y)=>x-y),m=Math.floor(b.length/2);return b.length%2?b[m]:(b[m-1]+b[m])/2;}
function percentile(a,p){if(!a.length)return 0;const b=a.slice().sort((x,y)=>x-y),i=Math.ceil(p*b.length)-1;return b[Math.max(0,i)];}
function round(n,d){const p=Math.pow(10,d||0);return Math.round((n+Number.EPSILON)*p)/p;}
function group(rows,col){const o={};if(col<0)return o;rows.forEach(r=>count(o,r[col]));return o;}
function unique(a){return Array.from(new Set(a.filter(Boolean))).sort((x,y)=>x.localeCompare(y,'pt-BR'));}
function sortedPairs(o){return Object.keys(o).sort().map(k=>[k,o[k]]);} function topPairs(o,n){return Object.keys(o).map(k=>[k,o[k]]).sort((a,b)=>b[1]-a[1]).slice(0,n);}
function stats(a){return {average:round(avg(a),1),median:round(median(a),1),p90:round(percentile(a,.9),1),count:a.length};}
function stage(name,a){const s=stats(a);s.name=name;return s;}
function dateSpanRate(total,dates){if(!dates.length)return 0;const min=new Date(Math.min.apply(null,dates)),max=new Date(Math.max.apply(null,dates));return total/Math.max(1,diffDays(min,max)+1);}
