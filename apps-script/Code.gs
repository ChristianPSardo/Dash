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

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Asakai')
    .addItem('Registrar resumo do dia', 'registrarResumoAsakaiHoje')
    .addToUi();
}

function registrarResumoAsakaiHoje() {
  const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName('AsakaiDash');
  if (!sheet) throw new Error('A aba AsakaiDash não foi encontrada.');
  const today = Number(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'd'));
  const days = sheet.getRange(15, 2, 1, 31).getDisplayValues()[0].map(v => Number(String(v).replace(/\D/g, '')));
  const dayIndex = days.indexOf(today);
  if (dayIndex < 0) throw new Error('O dia ' + today + ' não foi encontrado na linha 15 da AsakaiDash.');
  const source = sheet.getRange('AQ4:AQ7').getValues();
  if (source.every(row => row[0] === '' || row[0] == null)) throw new Error('AQ4:AQ7 está vazio. Cole o resumo amarelo e aguarde os cálculos antes de registrar.');
  const targetColumn = 2 + dayIndex;
  sheet.getRange(3, targetColumn, 4, 1).setValues(source);
  SpreadsheetApp.flush();
  ss.toast('TOTAL, PCP, TÊXTIL e MANUFATURA registrados no dia ' + String(today).padStart(2, '0') + '.', 'Asakai', 6);
  return { day: today, column: targetColumn, values: source.map(row => row[0]) };
}

function getDashboardData(filters) {
  filters = filters || {};
  const safeFilters = {
    period: ['all', '30', '90', '180', '365'].indexOf(String(filters.period || 'all')) >= 0 ? String(filters.period || 'all') : 'all',
    unit: cleanText(filters.unit || 'Todas'),
    status: cleanText(filters.status || 'Todas')
  };
  const cache = CacheService.getScriptCache();
  const key = 'dashboard-v8-' + Utilities.base64EncodeWebSafe(JSON.stringify(safeFilters));
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const cached = cache.get(key);
  if (cached) {
    const result = JSON.parse(cached);
    result.asakai = analyzeAsakai(ss);
    return result;
  }

  const baseValues = getValues(ss, CONFIG.SHEETS.base);
  const qualityValues = getValues(ss, CONFIG.SHEETS.quality);
  const replacementValues = getValues(ss, CONFIG.SHEETS.replacements);
  const cutoff = getCutoff(safeFilters.period);
  const result = buildDashboard(baseValues, qualityValues, replacementValues, safeFilters, cutoff);
  result.asakai = analyzeAsakai(ss);
  const payload = JSON.stringify(result);
  if (payload.length < 95000) cache.put(key, payload, CONFIG.CACHE_SECONDS);
  return result;
}

function analyzeAsakai(ss) {
  const sheet = ss.getSheetByName('AsakaiDash');
  if (!sheet) return { available:false, message:'A aba AsakaiDash não foi encontrada.' };
  const days = sheet.getRange(15, 2, 1, 31).getDisplayValues()[0];
  const values = sheet.getRange(3, 2, 10, 31).getValues();
  const currentDay = Number(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'd'));
  const daily = days.map((label, i) => ({
    day: String(label || i + 1).padStart(2, '0'), total:nullableNumber(values[0][i]), pcp:nullableNumber(values[1][i]),
    textil:nullableNumber(values[2][i]), manufatura:nullableNumber(values[3][i]), generated:nullableNumber(values[7][i]), delivered:nullableNumber(values[9][i])
  }));
  const current = daily.find(d => Number(d.day) === currentDay) || daily.filter(d => d.total || d.generated || d.delivered).slice(-1)[0] || daily[0];
  const leadTable = sheet.getRange('A18:H24').getDisplayValues();
  const auditTable = sheet.getRange('A26:C28').getDisplayValues();
  const reasonTable = sheet.getRange('J19:N25').getDisplayValues();
  const partTable = sheet.getRange('P19:S25').getDisplayValues();
  return {
    available:true, currentDay:current.day, current:current,
    efficiency:current.generated ? round(current.delivered/current.generated*100,1):0,
    daily:daily,
    lead:{totalDelivered:matrixValue(leadTable,'TOTAL ENTREGUE'),days:matrixValue(leadTable,'DIAS'),average:matrixValue(leadTable,'MEDIA'),target:matrixValue(leadTable,'META'),aboveAverage:matrixValue(leadTable,'PECAS ACIMA DA MEDIA')},
    audit:{audited:matrixValue(auditTable,'AUDITADAS'),requested:matrixValue(auditTable,'SOLICITADAS'),rate:lastNonBlank(auditTable[2]||[])},
    reasons:matrixPairs(reasonTable), parts:matrixPairs(partTable),
    leadTable:leadTable, auditTable:auditTable
  };
}

function matrixValue(matrix, label) {
  const target=normalize(label);
  for(let r=0;r<matrix.length;r++)for(let c=0;c<matrix[r].length;c++)if(normalize(matrix[r][c]).indexOf(target)>=0){for(let x=matrix[r].length-1;x>c;x--)if(cleanText(matrix[r][x]))return cleanText(matrix[r][x]);}
  return '—';
}
function lastNonBlank(row) { for(let i=row.length-1;i>=0;i--)if(cleanText(row[i]))return cleanText(row[i]); return '—'; }
function nullableNumber(value) { return value === '' || value == null ? null : numberValue(value); }

function matrixPairs(matrix) {
  const out=[];
  matrix.forEach(row=>{const label=row.map(cleanText).find(v=>v&&!/^\d+[.,]?\d*%?$/.test(v));const nums=row.map(cleanText).filter(v=>/^[-+]?\d[\d.]*([,]\d+)?%?$/.test(v));if(label&&nums.length&&!/MOTIVOS|PARTE|TOTAL|SOLICITACOES|PECA|PORCENT/i.test(normalize(label)))out.push([label,numberValue(nums[0])]);});
  return out.slice(0,8);
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
  const baseOrder = findColumn(base.headers, ['OP', 'OT', 'ORDEM']);
  const baseArticle = findColumn(base.headers, ['ARTIGO']);
  const baseDescription = findColumn(base.headers, ['DESC REPOSICAO']);
  const baseObservation = findColumn(base.headers, ['OBS', 'OBSERVACAO']);
  const baseWidth = findColumn(base.headers, ['LARGURA']);

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
  const auditCross = analyzeAuditCross(quality, filteredBase, replacements, {
    date: baseDate, order: baseOrder, area: area, reason: reason, status: baseStatus,
    article: baseArticle, description: baseDescription, observation: baseObservation, missing: missingPieces
  }, cutoff);
  const widthAnalysis = analyzeWidths(filteredBase, baseWidth, baseDate, missingPieces);

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
    auditCross: auditCross,
    widthAnalysis: widthAnalysis,
    cut: cut
  };
  return result;
}

function analyzeAuditCross(quality, baseRows, replacementRows, baseCols, cutoff) {
  const h = quality.headers;
  const qDate = fallbackColumn(findColumn(h, ['DATA', 'DATA AUDITORIA']), 0);
  const qOrder = fallbackColumn(findColumn(h, ['ORDEM', 'OP', 'OT']), 1);
  const qShift = fallbackColumn(findColumn(h, ['TURNO PRODUZIDO', 'TURNO']), 4);
  const qStatus = fallbackColumn(findColumn(h, ['STATUS', 'RESULTADO']), 8);
  const audits = quality.rows.filter(r => {
    const d = toDate(r[qDate]);
    return (!cutoff || !d || d >= cutoff) && otKey(r[qOrder]);
  });

  const requestsByOt = {};
  function requestEntry(ot) {
    if (!requestsByOt[ot]) requestsByOt[ot] = { base: 0, replacements: 0, dates: [], reasons: {}, areas: {}, statuses: {}, articles: {}, descriptions: {}, observations: {}, missing: 0 };
    return requestsByOt[ot];
  }
  baseRows.forEach(r => {
    const ot = otKey(r[baseCols.order]); if (!ot) return;
    const e = requestEntry(ot); e.base++; const d = toDate(r[baseCols.date]); if (d) e.dates.push(d);
    count(e.reasons, r[baseCols.reason]); count(e.areas, r[baseCols.area]); count(e.statuses, r[baseCols.status]);
    countIfPresent(e.articles, r[baseCols.article]); countIfPresent(e.descriptions, r[baseCols.description]); countIfPresent(e.observations, r[baseCols.observation]);
    e.missing += numberValue(r[baseCols.missing]);
  });
  replacementRows.forEach(r => {
    const ot = otKey(r[4]); if (!ot) return;
    const e = requestEntry(ot); e.replacements++; const d = toDate(r[3]); if (d) e.dates.push(d);
    count(e.reasons, r[0]);
  });

  const auditByOt = {}, monthMap = {}, statusMap = {}, shiftMap = {};
  audits.forEach(r => {
    const ot = otKey(r[qOrder]), d = toDate(r[qDate]);
    if (!auditByOt[ot]) auditByOt[ot] = { count: 0, dates: [], statuses: {}, shifts: {} };
    const a = auditByOt[ot]; a.count++; if (d) a.dates.push(d); count(a.statuses, r[qStatus]); count(a.shifts, r[qShift]);
    const matched = !!requestsByOt[ot];
    const month = d ? Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM') : 'Sem data';
    if (!monthMap[month]) monthMap[month] = { audits: 0, matched: 0 };
    monthMap[month].audits++; if (matched) monthMap[month].matched++;
    addCrossGroup(statusMap, cleanText(r[qStatus]) || 'Não informado', matched);
    addCrossGroup(shiftMap, cleanText(r[qShift]) || 'Não informado', matched);
  });

  const auditedOts = Object.keys(auditByOt);
  const matchedOts = auditedOts.filter(ot => requestsByOt[ot]);
  const matchedAudits = matchedOts.reduce((n, ot) => n + auditByOt[ot].count, 0);
  const matchedReasons = {}, matchedAreas = {}, matchedStatuses = {};
  let matchedRequests = 0, matchedPieces = 0, repeatOts = 0, approvedMatchedOts = 0;
  const details = matchedOts.map(ot => {
    const a = auditByOt[ot], req = requestsByOt[ot];
    const firstAudit = minDate(a.dates), firstRequest = minDate(req.dates);
    const source = req.base && req.replacements ? 'BASE e REPOSIÇÕES' : req.base ? 'Somente BASE' : 'Somente REPOSIÇÕES';
    Object.keys(req.reasons).forEach(k => add(matchedReasons, k, req.reasons[k]));
    Object.keys(req.areas).forEach(k => add(matchedAreas, k, req.areas[k]));
    Object.keys(req.statuses).forEach(k => add(matchedStatuses, k, req.statuses[k]));
    matchedRequests += req.base + req.replacements; matchedPieces += req.missing;
    if (req.base + req.replacements > 1) repeatOts++;
    if (normalize(topLabel(a.statuses)).indexOf('APROV') >= 0) approvedMatchedOts++;
    let timingLabel = 'Sem data comparável';
    const delta = diffDays(firstAudit, firstRequest);
    if (delta != null) timingLabel = delta > 0 ? 'Solicitação após auditoria' : delta === 0 ? 'Mesmo dia' : 'Solicitação antes da auditoria';
    return {
      ot: ot, audits: a.count, requests: req.base + req.replacements, source: source,
      auditResult: topLabel(a.statuses), auditDate: formatDate(firstAudit), requestDate: formatDate(firstRequest), timing: timingLabel,
      article: joinTopLabels(req.articles, 3), description: joinTopLabels(req.descriptions, 3), area: joinTopLabels(req.areas, 3),
      observation: joinTopLabels(req.observations, 2), missingPieces: round(req.missing, 0)
    };
  }).sort((a,b) => b.requests-a.requests || b.audits-a.audits).slice(0,20);

  return {
    totalAudits: audits.length,
    auditedOts: auditedOts.length,
    matchedOts: matchedOts.length,
    matchedAudits: matchedAudits,
    incidenceRate: auditedOts.length ? round(matchedOts.length / auditedOts.length * 100, 1) : 0,
    auditIncidenceRate: audits.length ? round(matchedAudits / audits.length * 100, 1) : 0,
    matchedRequests: matchedRequests,
    matchedPieces: round(matchedPieces, 0),
    repeatOts: repeatOts,
    approvedMatchedOts: approvedMatchedOts,
    requestStatuses: topPairs(matchedStatuses, 8),
    monthly: Object.keys(monthMap).sort().map(k => ({ month:k, audits:monthMap[k].audits, matched:monthMap[k].matched, rate:monthMap[k].audits ? round(monthMap[k].matched/monthMap[k].audits*100,1):0 })),
    byStatus: crossGroups(statusMap),
    byShift: crossGroups(shiftMap),
    reasons: topPairs(matchedReasons, 8),
    areas: topPairs(matchedAreas, 8),
    details: details
  };
}

function addCrossGroup(obj, key, matched) { if (!obj[key]) obj[key] = { total:0, matched:0 }; obj[key].total++; if (matched) obj[key].matched++; }
function crossGroups(obj) { return Object.keys(obj).map(k => ({ name:k, total:obj[k].total, matched:obj[k].matched, rate:obj[k].total ? round(obj[k].matched/obj[k].total*100,1):0 })).sort((a,b)=>b.total-a.total); }
function otKey(v) { return cleanText(v).replace(/\.0+$/, '').replace(/\s+/g, '').toUpperCase(); }
function minDate(values) { return values.length ? new Date(Math.min.apply(null, values.map(d=>d.getTime()))) : null; }
function formatDate(d) { return d ? Utilities.formatDate(d, CONFIG.TIMEZONE, 'dd/MM/yyyy') : '—'; }
function topLabel(obj) { const pairs=topPairs(obj,1); return pairs.length ? pairs[0][0] : 'Não informado'; }
function joinTopLabels(obj, limit) { return topPairs(obj, limit).map(p=>p[0]).join(' • ') || '—'; }
function countIfPresent(obj, value) { const key=cleanText(value); if(key) add(obj,key,1); }

function analyzeWidths(rows, widthCol, dateCol, piecesCol) {
  const grouped = {};
  rows.forEach(r => {
    const width = normalizeWidth(r[widthCol]), d = toDate(r[dateCol]), pieces = numberValue(r[piecesCol]);
    if (!width || !d || pieces <= 0) return;
    if (!grouped[width]) grouped[width] = { total:0, dates:{} };
    grouped[width].total += pieces;
    add(grouped[width].dates, Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd'), pieces);
  });
  return Object.keys(grouped).map(width => ({
    width:width, total:round(grouped[width].total,0),
    points:sortedPairs(grouped[width].dates).map(p=>({date:p[0],pieces:round(p[1],0)}))
  })).sort((a,b)=>b.total-a.total).slice(0,15);
}

function normalizeWidth(value) {
  const text=cleanText(value); if(!text)return '';
  const normalized=text.replace(',','.').replace(/[^0-9.]/g,'');
  const number=Number(normalized); return isFinite(number)&&normalized ? String(round(number,2)) : text;
}

function buildReplacementTrend(rows, categoryCol) {
  const totals={}, months={};
  rows.forEach(r=>{const name=cleanText(r[categoryCol])||'Não informado',d=toDate(r[3]),pieces=numberValue(r[7]);if(!d||pieces<=0)return;add(totals,name,pieces);const m=Utilities.formatDate(d,CONFIG.TIMEZONE,'yyyy-MM');if(!months[m])months[m]={};add(months[m],name,pieces);});
  const names=topPairs(totals,6).map(p=>p[0]), labels=Object.keys(months).sort();
  return {labels:labels,series:names.map(name=>({name:name,values:labels.map(m=>round(months[m][name]||0,0))}))};
}

function analyzeQuality(table, filters, cutoff) {
  const h = table.headers;
  const dateCol = fallbackColumn(findColumn(h, ['DATA', 'DATA AUDITORIA', 'DATA CORTE']), 0);
  const unitCol = findColumn(h, ['UNIDADE', 'UND CORTE', 'UNIDADE CORTE']);
  const resultCol = fallbackColumn(findColumn(h, ['RESULTADO', 'SITUACAO', 'STATUS']), 8);
  const shiftCol = fallbackColumn(findColumn(h, ['TURNO PRODUZIDO', 'TURNO']), 4);
  const deviationCol = findColumn(h, ['DESVIO', 'DIFERENCA', 'VARIACAO']);
  const cutWeightCol = findColumn(h, ['PESO CORTE']);
  const auditedWeightCol = findColumn(h, ['PESO AUDITADO']);
  const rows = table.rows.filter(r => passes(r[dateCol], r[unitCol], r[resultCol], filters, cutoff, true));
  let approved = 0, rejected = 0;
  const deviations = [], shifts = {};
  rows.forEach(r => {
    const status = normalize(r[resultCol]);
    const ok = status.indexOf('APROV') >= 0;
    const no = status.indexOf('REPROV') >= 0;
    if (ok) approved++;
    if (no) rejected++;
    let dev = percentValue(r[deviationCol]);
    if (deviationCol < 0 && cutWeightCol >= 0 && auditedWeightCol >= 0) {
      const cutWeight = numberValue(r[cutWeightCol]);
      const auditedWeight = numberValue(r[auditedWeightCol]);
      dev = cutWeight ? Math.abs(auditedWeight - cutWeight) / cutWeight : null;
    }
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
  const completed = [], cdLeadRaw = [], stages = { release: [], receive: [], cut: [], finish: [] };
  const reasons = {}, materials = {}, parts = {}, supply = {}, cutStatus = {}, receiveStatus = {};
  let totalQty = 0, backlog = 0, cancelled = 0;
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
    const cdLead = diffDays(request, receive);
    if (!isCancelled && cdLead != null && cdLead >= 0) cdLeadRaw.push(cdLead);
  });
  const cleanedLead = removeAbsurdLeadTimes(cdLeadRaw);
  const cdLead = cleanedLead.values;
  const sla = cdLead.filter(days => days <= 2).length;
  const buckets = {'Até 2 dias':0,'3 dias':0,'4–5 dias':0,'6–10 dias':0,'Acima de 10':0};
  cdLead.forEach(days => {
    if (days <= 2) buckets['Até 2 dias']++; else if (days === 3) buckets['3 dias']++; else if (days <= 5) buckets['4–5 dias']++; else if (days <= 10) buckets['6–10 dias']++; else buckets['Acima de 10']++;
  });
  return {
    records: rows.length, totalQty: round(totalQty, 0), completed: completed.length, backlog: backlog, cancelled: cancelled,
    completionRate: rows.length ? round(completed.length / rows.length * 100, 1) : 0,
    slaRate: cdLead.length ? round(sla / cdLead.length * 100, 1) : 0,
    leadTime: Object.assign(stats(cdLead), { target: 2, ignoredOutliers: cleanedLead.ignored, outlierLimit: cleanedLead.limit }),
    stages: [stage('Solicitação → liberação', stages.release),stage('Liberação → recebimento', stages.receive),stage('Recebimento → corte', stages.cut),stage('Corte → finalização', stages.finish)],
    reasons: topPairs(reasons, 10), materials: topPairs(materials, 8), parts: topPairs(parts, 10), supplyStatus: topPairs(supply, 8), cutStatus: topPairs(cutStatus, 8), receiveStatus: topPairs(receiveStatus, 8), leadBuckets: Object.keys(buckets).map(k => [k,buckets[k]]),
    partTrend: buildReplacementTrend(rows, 9), reasonTrend: buildReplacementTrend(rows, 0)
  };
}

function parseTable(values) {
  if (!values.length) return { headers: [], rows: [] };
  return { headers: values[0].map(normalize), rows: values.slice(1).filter(r => r.some(v => v !== '' && v != null)) };
}
function findColumn(headers, candidates) { for (let i=0;i<candidates.length;i++){const c=normalize(candidates[i]);const exact=headers.indexOf(c);if(exact>=0)return exact;const partial=headers.findIndex(h=>h.indexOf(c)>=0);if(partial>=0)return partial;} return -1; }
function fallbackColumn(column, fallback) { return column >= 0 ? column : fallback; }
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
function removeAbsurdLeadTimes(values){
  if (!values.length) return { values: [], ignored: 0, limit: 30 };
  const q1 = percentile(values, .25), q3 = percentile(values, .75);
  const statisticalLimit = q3 + 1.5 * (q3 - q1);
  const limit = Math.max(30, Math.ceil(statisticalLimit));
  const cleaned = values.filter(value => value <= limit);
  return { values: cleaned, ignored: values.length - cleaned.length, limit: limit };
}
function round(n,d){const p=Math.pow(10,d||0);return Math.round((n+Number.EPSILON)*p)/p;}
function group(rows,col){const o={};if(col<0)return o;rows.forEach(r=>count(o,r[col]));return o;}
function unique(a){return Array.from(new Set(a.filter(Boolean))).sort((x,y)=>x.localeCompare(y,'pt-BR'));}
function sortedPairs(o){return Object.keys(o).sort().map(k=>[k,o[k]]);} function topPairs(o,n){return Object.keys(o).map(k=>[k,o[k]]).sort((a,b)=>b[1]-a[1]).slice(0,n);}
function stats(a){return {average:round(avg(a),1),median:round(median(a),1),p90:round(percentile(a,.9),1),count:a.length};}
function stage(name,a){const s=stats(a);s.name=name;return s;}
function dateSpanRate(total,dates){if(!dates.length)return 0;const min=new Date(Math.min.apply(null,dates)),max=new Date(Math.max.apply(null,dates));return total/Math.max(1,diffDays(min,max)+1);}
