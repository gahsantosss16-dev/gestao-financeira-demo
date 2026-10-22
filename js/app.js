/* Recebe Fácil — protótipo de demonstração (dados fictícios, sem backend, sem envio real) */
(function () {
  'use strict';
  const { generate, iso, addDays, addMonths } = window.DemoData;
  const TODAY = iso(new Date());
  const STORE_KEY = 'recebe-facil-demo-v1';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------------- Estado ---------------- */
  let st = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.version === 1 && s.generatedFor === TODAY) return s;
      }
    } catch (e) { /* armazenamento indisponível: segue em memória */ }
    return generate(TODAY);
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(st)); } catch (e) { /* ignora */ } }
  const newId = (p) => `${p}${String(st.seq++).padStart(4, '0')}`;

  /* ---------------- Formatação ---------------- */
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const brl = (v) => BRL.format(v || 0);
  const brlShort = (v) => (Math.abs(v) >= 1000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : brl(v));
  const pct = (v) => (isFinite(v) ? v : 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  const fdate = (d) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');
  const fdatetime = (d) => (d ? fdate(d) + (d.length > 10 ? ' ' + d.slice(11, 16) : '') : '—');
  const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MONTHS_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const diffDays = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
  function rel(d) {
    const n = diffDays(d, TODAY);
    if (n === 0) return 'hoje';
    if (n === 1) return 'amanhã';
    if (n === -1) return 'ontem';
    return n > 0 ? `em ${n} dias` : `há ${-n} dias`;
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = (n) => n.split(/\s+/).filter((w) => w.length > 2 || /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const COLORS = ['#1b7f37', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899', '#64748b', '#84cc16'];
  const colorFor = (id) => COLORS[parseInt(id.replace(/\D/g, ''), 10) % COLORS.length];
  const avatar = (c, size = '') => `<span class="avatar ${size}" style="background:${colorFor(c.id)}">${esc(initials(c.name))}</span>`;
  const monthKey = (d) => d.slice(0, 7);
  const monthLabel = (k) => { const [y, m] = k.split('-').map(Number); return `${MONTHS[m - 1]}/${String(y).slice(2)}`; };

  /* ---------------- Ícones ---------------- */
  const I = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    users: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',
    receipt: '<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 .7V2l-1 .7-3-2-3 2-3-2-3 2-3-2z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
    repeat: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/>',
    wallet: '<path d="M20 12V8H6a2 2 0 010-4h12v4"/><path d="M4 6v12a2 2 0 002 2h14v-4"/><path d="M18 12a2 2 0 000 4h4v-4z"/>',
    bell: '<path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"/>',
    chat: '<path d="M21 11.5a8.4 8.4 0 01-12.6 7.3L3 21l2.2-5.2A8.5 8.5 0 1121 11.5z"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    checks: '<path d="M18 6L7 17l-5-5M22 10l-7.5 7.5L13 16"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alert: '<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    trend: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
    download: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
    play: '<path d="M5 3l14 9-14 9V3z"/>',
    zap: '<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-15-6.7L3 13"/>',
    phone: '<path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.7a2 2 0 01-.5 2.1L8 9.8a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.7.7a2 2 0 011.7 2z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
    moon: '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
  };
  const ic = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[n] || ''}</svg>`;

  /* ---------------- Regras de negócio (simuladas) ---------------- */
  const byId = (arr, id) => arr.find((x) => x.id === id);
  const client = (id) => byId(st.clients, id);
  const receivable = (id) => byId(st.receivables, id);
  const remaining = (i) => Math.max(0, Math.round((i.amount - i.paid) * 100) / 100);
  function status(i) {
    if (i.paid >= i.amount - 0.001) return 'pago';
    if (i.due < TODAY) return 'vencido';
    if (i.due === TODAY) return 'hoje';
    return 'aberto';
  }
  const STATUS = {
    pago: { label: 'Pago', tone: 'success' },
    aberto: { label: 'A vencer', tone: 'info' },
    hoje: { label: 'Vence hoje', tone: 'warning' },
    vencido: { label: 'Vencido', tone: 'danger' }
  };
  const CSTATUS = {
    'em-dia': { label: 'Em dia', tone: 'success' },
    atraso: { label: 'Em atraso', tone: 'warning' },
    inadimplente: { label: 'Inadimplente', tone: 'danger' }
  };
  function badge(i) {
    const s = STATUS[status(i)];
    const partial = i.paid > 0 && status(i) !== 'pago' ? ` <span class="badge plain tone-primary" title="Pagamento parcial">Parcial</span>` : '';
    return `<span class="badge tone-${s.tone}">${s.label}</span>${partial}`;
  }
  const lateDays = (i) => Math.max(0, diffDays(TODAY, i.due));
  function clientSummary(c) {
    const insts = st.installments.filter((i) => i.clientId === c.id);
    let billed = 0, received = 0, open = 0, overdue = 0, maxLate = 0;
    insts.forEach((i) => {
      billed += i.amount; received += i.paid;
      const s = status(i);
      if (s !== 'pago') { open += remaining(i); if (s === 'vencido') { overdue += remaining(i); maxLate = Math.max(maxLate, lateDays(i)); } }
    });
    const cs = maxLate > 30 ? 'inadimplente' : maxLate > 0 ? 'atraso' : 'em-dia';
    return { insts, billed, received, open, overdue, maxLate, status: cs };
  }
  const cbadge = (cs) => `<span class="badge tone-${CSTATUS[cs].tone}">${CSTATUS[cs].label}</span>`;
  const instLabel = (i) => (i.of ? `${i.n}/${i.of}` : `Mensal · ${MONTHS[Number(i.due.slice(5, 7)) - 1]}`);
  const instDesc = (i) => (receivable(i.receivableId) || {}).description || 'Cobrança';
  const firstName = (c) => (c.type === 'PF' ? c.name.split(' ')[0] : c.name);
  const openInsts = () => st.installments.filter((i) => status(i) !== 'pago');

  /* ---------------- Modelos de mensagem ---------------- */
  const TEMPLATES = {
    lembrete: { label: 'Lembrete de vencimento', text: 'Olá, {nome}! 👋\nPassando para lembrar que a parcela {parcela} de *{descricao}*, no valor de *{valor}*, vence em {vencimento}.\n\nPague via PIX: {pix}\nQualquer dúvida, estamos à disposição. 😊' },
    vencimento: { label: 'Vence hoje', text: 'Olá, {nome}! Hoje é o vencimento da parcela {parcela} de *{descricao}* ({valor}).\n\nChave PIX: {pix}\nSe já pagou, por favor desconsidere esta mensagem.' },
    atraso: { label: 'Cobrança de atraso', text: 'Olá, {nome}. Identificamos que a parcela {parcela} de *{descricao}*, vencida em {vencimento}, está em aberto há {dias} dia(s).\n\nValor em aberto: *{valor}*\nChave PIX: {pix}\n\nPodemos ajudar com uma negociação? É só responder esta mensagem.' },
    confirmacao: { label: 'Confirmação de pagamento', text: 'Olá, {nome}! ✅ Recebemos o pagamento de *{pago}* referente a {descricao} ({parcela}).\nObrigado pela pontualidade!' },
    personalizado: { label: 'Mensagem personalizada', text: 'Olá, {nome}! ' }
  };
  function fillTemplate(key, inst, c, extra = {}) {
    const t = (TEMPLATES[key] || TEMPLATES.personalizado).text;
    const map = {
      nome: firstName(c), descricao: inst ? instDesc(inst) : '', parcela: inst ? instLabel(inst) : '',
      valor: inst ? brl(remaining(inst) || inst.amount) : '', vencimento: inst ? fdate(inst.due) : '',
      dias: inst ? String(lateDays(inst)) : '', pix: st.company.pix, pago: brl(extra.paid ?? (inst ? inst.paid : 0))
    };
    return t.replace(/\{(\w+)\}/g, (_, k) => map[k] ?? '');
  }
  const msgText = (m) => m.text || fillTemplate(m.template, byId(st.installments, m.installmentId), client(m.clientId), { paid: m.paid });

  function sendWhatsApp({ clientId, installmentId = null, template, text = null, auto = false, paid }) {
    const m = { id: newId('W'), clientId, installmentId, template, text, at: TODAY + 'T' + new Date().toTimeString().slice(0, 5), status: 'enviado', auto, paid };
    st.messages.push(m);
    save();
    // simula confirmações de entrega e leitura
    setTimeout(() => { m.status = 'entregue'; save(); updateTicks(m); }, 1200);
    setTimeout(() => { m.status = 'lido'; save(); updateTicks(m); }, 3200);
    return m;
  }
  const ticks = (s) => `<span class="ticks ${s}" title="${s === 'enviado' ? 'Enviado' : s === 'entregue' ? 'Entregue' : 'Lido'}">${ic(s === 'enviado' ? 'check' : 'checks')}</span>`;
  function updateTicks(m) { const el = document.querySelector(`[data-ticks="${m.id}"]`); if (el) el.innerHTML = ticks(m.status); }

  /* ---------------- UI helpers ---------------- */
  const ui = {
    clientes: { q: '', status: 'todos', sort: 'nome', page: 1 },
    contas: { q: '', status: 'pendentes', period: 'todos', client: '', page: 1 },
    pagamentos: { q: '', method: '', period: '90', page: 1 },
    recorrencias: { q: '' },
    whatsapp: { client: '' },
    relatorios: { period: '6m', client: '', from: addMonths(TODAY, -2, 1), to: TODAY },
    cliente: { tab: 'parcelas' }
  };
  function toast(msg, kind = 'ok') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = `${ic(kind === 'wa' ? 'chat' : kind === 'warn' ? 'alert' : 'check')}<span>${msg}</span>`;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3400);
  }
  function openModal({ title, body, foot = '', wide = false, form = null }) {
    const inner = `<div class="modal-head"><h3>${title}</h3><button class="icon-btn" type="button" data-action="close-modal" aria-label="Fechar">${ic('x')}</button></div>
      <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}`;
    $('#modalRoot').innerHTML = `<div class="overlay" data-overlay>${form ? `<form class="modal ${wide ? 'wide' : ''}" data-submit="${form}" novalidate>${inner}</form>` : `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${inner}</div>`}</div>`;
    const first = $('#modalRoot input:not([type=hidden]), #modalRoot select, #modalRoot textarea');
    if (first && window.innerWidth > 640) first.focus();
  }
  const closeModal = () => { $('#modalRoot').innerHTML = ''; };
  const pageSlice = (arr, page, size) => {
    const pages = Math.max(1, Math.ceil(arr.length / size));
    const p = Math.min(Math.max(1, page), pages);
    return { rows: arr.slice((p - 1) * size, p * size), page: p, pages, total: arr.length, from: arr.length ? (p - 1) * size + 1 : 0, to: Math.min(p * size, arr.length) };
  };
  const pager = (pg, key) => pg.pages <= 1 ? '' : `<div class="pager"><span>Exibindo ${pg.from}–${pg.to} de ${pg.total}</span><div class="btns">
    <button class="btn sm" type="button" data-action="page" data-key="${key}" data-to="${pg.page - 1}" ${pg.page <= 1 ? 'disabled' : ''}>Anterior</button>
    <button class="btn sm" type="button" data-action="page" data-key="${key}" data-to="${pg.page + 1}" ${pg.page >= pg.pages ? 'disabled' : ''}>Próxima</button></div></div>`;
  const empty = (msg, icon = 'search') => `<div class="empty">${ic(icon)}<div>${msg}</div></div>`;
  const clientOptions = (sel, withAll = false) => (withAll ? `<option value="">Todos os clientes</option>` : `<option value="">Selecione o cliente…</option>`) +
    [...st.clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const normalize = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const matchClient = (c, q) => !q || normalize(c.name + ' ' + c.doc + ' ' + c.phone + ' ' + c.email + ' ' + c.city).includes(normalize(q)) || c.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§');
  function downloadCSV(name, rows) {
    const csv = '﻿' + rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------------- Gráficos (SVG) ---------------- */
  function barChart(labels, series, height = 240) {
    const W = 640, H = height, pl = 58, pr = 12, pt = 14, pb = 28;
    const max = Math.max(1, ...series.flatMap((s) => s.values));
    const nice = Math.pow(10, Math.floor(Math.log10(max)));
    const top = Math.ceil(max / nice) * nice;
    const cw = (W - pl - pr) / labels.length;
    const bw = Math.min(26, (cw * 0.7) / series.length);
    let g = '';
    for (let k = 0; k <= 4; k++) {
      const y = pt + ((H - pt - pb) * k) / 4;
      g += `<line class="grid-line" x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}"/><text x="${pl - 8}" y="${y + 4}" text-anchor="end">${brlShort(top * (1 - k / 4)).replace('R$ ', '')}</text>`;
    }
    labels.forEach((l, li) => {
      const cx = pl + cw * li + cw / 2;
      series.forEach((s, si) => {
        const v = s.values[li];
        const h = ((H - pt - pb) * v) / top;
        const x = cx - (bw * series.length) / 2 + si * bw + 1;
        g += `<rect x="${x}" y="${H - pb - h}" width="${bw - 2}" height="${Math.max(0, h)}" rx="4" fill="${s.color}"><title>${s.name} · ${l}: ${brl(v)}</title></rect>`;
      });
      g += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${l}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de barras">${g}</svg>`;
  }
  function donut(segs, center, sub) {
    const total = segs.reduce((a, s) => a + s.value, 0) || 1;
    const R = 62, C = 2 * Math.PI * R;
    let off = 0, arcs = '';
    segs.forEach((s) => {
      const len = (s.value / total) * C;
      arcs += `<circle r="${R}" cx="80" cy="80" fill="none" stroke="${s.color}" stroke-width="20" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 80 80)"><title>${s.label}: ${brl(s.value)}</title></circle>`;
      off += len;
    });
    return `<div class="donut-wrap"><svg viewBox="0 0 160 160" style="width:160px;height:160px"><circle r="${R}" cx="80" cy="80" fill="none" stroke="var(--surface-2)" stroke-width="20"/>${arcs}
      <text x="80" y="78" text-anchor="middle" style="font-size:20px;font-weight:800;fill:var(--text)">${center}</text><text x="80" y="98" text-anchor="middle" style="font-size:11px;fill:var(--muted)">${sub}</text></svg>
      <div class="donut-legend">${segs.map((s) => `<div><span><i style="background:${s.color}"></i>${s.label}</span><b>${brl(s.value)}</b></div>`).join('')}</div></div>`;
  }
  const hbars = (items, color) => {
    const max = Math.max(1, ...items.map((x) => x.value));
    return items.map((x) => `<div class="hbar"><span class="truncate">${x.label}</span><div class="track"><div class="fill" style="width:${(x.value / max) * 100}%;background:${x.color || color}"></div></div><b>${x.display ?? brl(x.value)}</b></div>`).join('');
  };

  /* ---------------- Navegação ---------------- */
  const NAV = [
    { group: 'Visão geral' },
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'alertas', label: 'Alertas', icon: 'bell', count: () => alertCount() },
    { group: 'Financeiro' },
    { id: 'clientes', label: 'Clientes', icon: 'users' },
    { id: 'contas', label: 'Contas a receber', icon: 'receipt' },
    { id: 'recorrencias', label: 'Recorrências', icon: 'repeat' },
    { id: 'pagamentos', label: 'Pagamentos', icon: 'wallet' },
    { group: 'Cobrança' },
    { id: 'whatsapp', label: 'WhatsApp (simulação)', icon: 'chat' },
    { id: 'relatorios', label: 'Relatórios', icon: 'chart' }
  ];
  const alertCount = () => st.installments.filter((i) => ['vencido', 'hoje'].includes(status(i))).length;
  function renderNav(route) {
    const cur = route === 'cliente' ? 'clientes' : route;
    $('#nav').innerHTML = NAV.map((n) => n.group ? `<div class="nav-label">${n.group}</div>` :
      `<a href="#/${n.id}" class="${cur === n.id ? 'active' : ''}">${ic(n.icon)}<span>${n.label}</span>${n.count && n.count() ? `<span class="pill">${n.count()}</span>` : ''}</a>`).join('');
    const bn = [['dashboard', 'Início', 'dashboard'], ['clientes', 'Clientes', 'users'], ['contas', 'Contas', 'receipt'], ['alertas', 'Alertas', 'bell'], ['whatsapp', 'WhatsApp', 'chat']];
    $('#bottomNav').innerHTML = bn.map(([id, l, icn]) => `<a href="#/${id}" class="${cur === id ? 'active' : ''}">${ic(icn)}${l}${id === 'alertas' && alertCount() ? `<span class="pill">${alertCount()}</span>` : ''}</a>`).join('');
    $('#alertCount').textContent = alertCount() || '';
  }

  /* ---------------- Páginas ---------------- */
  const pages = {};

  pages.dashboard = () => {
    const open = openInsts();
    const next30 = open.filter((i) => i.due >= TODAY && i.due <= addDays(TODAY, 30));
    const overdue = open.filter((i) => status(i) === 'vencido');
    const cm = monthKey(TODAY), pm = monthKey(addMonths(TODAY, -1, 1));
    const recvMonth = st.payments.filter((p) => monthKey(p.date) === cm).reduce((a, p) => a + p.amount, 0);
    const recvPrev = st.payments.filter((p) => monthKey(p.date) === pm && p.date.slice(8) <= TODAY.slice(8)).reduce((a, p) => a + p.amount, 0);
    const delta = recvPrev ? ((recvMonth - recvPrev) / recvPrev) * 100 : 0;
    const dueUntilToday = st.installments.filter((i) => i.due < TODAY).reduce((a, i) => a + i.amount, 0);
    const overdueSum = overdue.reduce((a, i) => a + remaining(i), 0);
    const overdueClients = new Set(overdue.map((i) => i.clientId)).size;
    const months = Array.from({ length: 6 }, (_, k) => monthKey(addMonths(TODAY, k - 5, 1)));
    const expected = months.map((m) => st.installments.filter((i) => monthKey(i.due) === m).reduce((a, i) => a + i.amount, 0));
    const received = months.map((m) => st.payments.filter((p) => monthKey(p.date) === m).reduce((a, p) => a + p.amount, 0));
    const monthInsts = st.installments.filter((i) => monthKey(i.due) === cm);
    const seg = { pago: 0, aberto: 0, vencido: 0 };
    monthInsts.forEach((i) => { seg.pago += i.paid; const s = status(i); if (s === 'vencido') seg.vencido += remaining(i); else if (s !== 'pago') seg.aberto += remaining(i); });
    const monthTotal = monthInsts.reduce((a, i) => a + i.amount, 0);
    const upcoming = open.filter((i) => i.due >= TODAY && i.due <= addDays(TODAY, 15)).sort((a, b) => a.due.localeCompare(b.due));
    const debtors = st.clients.map((c) => ({ c, s: clientSummary(c) })).filter((x) => x.s.overdue > 0).sort((a, b) => b.s.overdue - a.s.overdue).slice(0, 5);
    const activity = [
      ...st.payments.map((p) => ({ at: p.date + 'T12:00', kind: 'pay', p })),
      ...st.messages.map((m) => ({ at: m.at, kind: 'msg', m }))
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
    const [, mm] = TODAY.split('-').map(Number);

    return `
      <div class="page-head"><div><h1>${['Boa noite', 'Bom dia', 'Boa tarde', 'Boa noite'][Math.floor(new Date().getHours() / 6)]}! Aqui está o resumo financeiro</h1><p>Hoje, ${fdate(TODAY)} · dados fictícios de demonstração</p></div>
        <div class="actions"><button class="btn" data-action="new-payment">${ic('cash')} Registrar pagamento</button><button class="btn primary" data-action="new-receivable">${ic('plus')} Nova cobrança</button></div></div>
      <div class="grid kpis">
        <a class="card kpi" href="#/contas" data-goto-filter="contas:status=aberto"><div class="kpi-top">A receber (30 dias)<span class="kpi-ico tone-primary">${ic('calendar')}</span></div><div class="kpi-val">${brl(next30.reduce((a, i) => a + remaining(i), 0))}</div><div class="kpi-sub">${next30.length} parcelas a vencer</div></a>
        <a class="card kpi" href="#/pagamentos"><div class="kpi-top">Recebido em ${MONTHS_FULL[mm - 1]}<span class="kpi-ico tone-success">${ic('trend')}</span></div><div class="kpi-val">${brl(recvMonth)}</div><div class="kpi-sub"><span class="${delta >= 0 ? 'text-success' : 'text-danger'} fw">${delta >= 0 ? '▲' : '▼'} ${pct(Math.abs(delta))}</span> vs. mesmo período do mês anterior</div></a>
        <a class="card kpi" href="#/contas" data-goto-filter="contas:status=vencido"><div class="kpi-top">Vencido<span class="kpi-ico tone-danger">${ic('alert')}</span></div><div class="kpi-val">${brl(overdueSum)}</div><div class="kpi-sub">${overdue.length} parcelas · ${overdueClients} clientes</div></a>
        <a class="card kpi" href="#/relatorios"><div class="kpi-top">Inadimplência<span class="kpi-ico tone-danger">${ic('alert')}</span></div><div class="kpi-val">${pct(dueUntilToday ? (overdueSum / dueUntilToday) * 100 : 0)}</div><div class="kpi-sub">${brl(overdueSum)} vencido em aberto</div></a>
      </div>
      <div class="grid g-2-1 mb">
        <div class="card"><div class="card-head"><h3>Previsto x recebido · últimos 6 meses</h3><div class="legend"><span><i style="background:#b9dcc2"></i>Previsto</span><span><i style="background:var(--primary)"></i>Recebido</span></div></div>
          <div class="card-pad">${barChart(months.map(monthLabel), [{ name: 'Previsto', color: '#b9dcc2', values: expected }, { name: 'Recebido', color: 'var(--primary)', values: received }])}</div></div>
        <div class="card"><div class="card-head"><h3>Situação do mês</h3><small>${monthInsts.length} parcelas</small></div>
          ${donut([{ label: 'Recebido', value: seg.pago, color: '#12a150' }, { label: 'A vencer', value: seg.aberto, color: '#0ea5e9' }, { label: 'Vencido', value: seg.vencido, color: '#ef4444' }], monthTotal ? pct((seg.pago / monthTotal) * 100) : '0%', 'recebido')}</div>
      </div>
      <div class="grid g-1-1 mb">
        <div class="card"><div class="card-head"><h3>Próximos vencimentos <small style="font-weight:500">· 15 dias</small></h3><a href="#/contas" data-goto-filter="contas:status=aberto" class="btn ghost sm">Ver todos</a></div>
          ${upcoming.length ? `<ul class="list">${upcoming.slice(0, 7).map((i) => { const c = client(i.clientId); return `<li>${avatar(c, 'sm')}<div class="grow"><div class="cell-main truncate">${esc(c.name)}</div><div class="cell-sub truncate">${esc(instDesc(i))} · ${instLabel(i)} · <b class="${i.due === TODAY ? 'text-warning' : ''}">${fdate(i.due)} (${rel(i.due)})</b></div></div><div class="amount">${brl(remaining(i))}</div>
            <button class="btn xs wa" data-action="wa-send" data-inst="${i.id}" data-tpl="${i.due === TODAY ? 'vencimento' : 'lembrete'}" title="Lembrete por WhatsApp (simulação)">${ic('chat')}</button><button class="btn xs" data-action="new-payment" data-inst="${i.id}" title="Registrar pagamento">${ic('check')}</button></li>`; }).join('')}</ul>` : empty('Nenhum vencimento nos próximos 15 dias', 'calendar')}</div>
        <div class="card"><div class="card-head"><h3>Maiores valores em atraso</h3><a href="#/alertas" class="btn ghost sm">Ver alertas</a></div>
          ${debtors.length ? `<ul class="list">${debtors.map(({ c, s }) => `<li>${avatar(c, 'sm')}<div class="grow"><a class="cell-main truncate" style="display:block;color:inherit" href="#/clientes/${c.id}">${esc(c.name)}</a><div class="cell-sub">${cbadge(s.status)} · maior atraso ${s.maxLate} dias</div></div><div class="amount text-danger">${brl(s.overdue)}</div>
            <button class="btn xs wa" data-action="wa-client" data-client="${c.id}" title="Cobrar por WhatsApp (simulação)">${ic('chat')} Cobrar</button></li>`).join('')}</ul>` : empty('Nenhum cliente em atraso 🎉', 'check')}</div>
      </div>
      <div class="card"><div class="card-head"><h3>Atividade recente</h3></div>
        <ul class="timeline">${activity.map((a) => {
          if (a.kind === 'pay') { const c = client(a.p.clientId); return `<li><span class="dot" style="background:var(--success)"></span><b>Pagamento recebido · ${brl(a.p.amount)}</b><small>${esc(c.name)} · ${a.p.method} · ${fdate(a.p.date)}</small></li>`; }
          const c = client(a.m.clientId); return `<li><span class="dot" style="background:var(--wa)"></span><b>WhatsApp (simulado) · ${TEMPLATES[a.m.template].label}</b><small>${esc(c.name)} · ${fdatetime(a.m.at)} ${a.m.auto ? '· régua automática' : ''}</small></li>`;
        }).join('')}</ul></div>`;
  };

  /* Clientes */
  pages.clientes = () => {
    const f = ui.clientes;
    const counts = { todos: st.clients.length, 'em-dia': 0, atraso: 0, inadimplente: 0 };
    st.clients.forEach((c) => counts[clientSummary(c).status]++);
    return `
      <div class="page-head"><div><h1>Clientes</h1><p>Cadastro, situação financeira e histórico de cada cliente</p></div>
        <div class="actions"><button class="btn" data-action="export-clients">${ic('download')} Exportar</button><button class="btn primary" data-action="new-client">${ic('plus')} Novo cliente</button></div></div>
      <div class="card">
        <div class="toolbar">
          <label class="search-input grow">${ic('search')}<input type="search" data-filter="clientes.q" value="${esc(f.q)}" placeholder="Nome, CPF/CNPJ, telefone, e-mail ou cidade"></label>
          <select class="select" data-filter="clientes.sort" aria-label="Ordenar"><option value="nome" ${f.sort === 'nome' ? 'selected' : ''}>Ordenar por nome</option><option value="divida" ${f.sort === 'divida' ? 'selected' : ''}>Maior valor vencido</option><option value="aberto" ${f.sort === 'aberto' ? 'selected' : ''}>Maior saldo em aberto</option><option value="recente" ${f.sort === 'recente' ? 'selected' : ''}>Cadastro mais recente</option></select>
        </div>
        <div class="toolbar"><div class="chips">${[['todos', 'Todos'], ['em-dia', 'Em dia'], ['atraso', 'Em atraso'], ['inadimplente', 'Inadimplentes']].map(([k, l]) => `<button class="chip ${f.status === k ? 'active' : ''}" data-action="chip" data-key="clientes.status" data-val="${k}">${l}<span class="count">${counts[k]}</span></button>`).join('')}</div></div>
        <div id="listArea"></div>
      </div>`;
  };
  pages.clientes.list = () => {
    const f = ui.clientes;
    let rows = st.clients.map((c) => ({ c, s: clientSummary(c) })).filter(({ c, s }) => matchClient(c, f.q) && (f.status === 'todos' || s.status === f.status));
    const sorts = { nome: (a, b) => a.c.name.localeCompare(b.c.name), divida: (a, b) => b.s.overdue - a.s.overdue, aberto: (a, b) => b.s.open - a.s.open, recente: (a, b) => b.c.createdAt.localeCompare(a.c.createdAt) };
    rows.sort(sorts[f.sort]);
    const pg = pageSlice(rows, f.page, 12);
    if (!rows.length) return empty('Nenhum cliente encontrado com esses filtros.');
    return `<div class="table-wrap"><table class="table responsive"><thead><tr><th>Cliente</th><th>Contato</th><th class="num">Em aberto</th><th class="num">Vencido</th><th>Situação</th><th class="actions-cell">Ações</th></tr></thead><tbody>
      ${pg.rows.map(({ c, s }) => `<tr class="clickable" data-href="#/clientes/${c.id}">
        <td class="td-main"><div class="who">${avatar(c)}<div><div class="cell-main">${esc(c.name)} ${c.tags.includes('VIP') ? '<span class="badge plain tone-primary">VIP</span>' : ''}</div><div class="cell-sub">${c.type === 'PF' ? 'CPF' : 'CNPJ'} ${esc(c.doc)} · ${esc(c.city)}</div></div></div></td>
        <td data-label="Contato"><div><div>${esc(c.phone)}</div><div class="cell-sub hide-sm">${esc(c.email)}</div></div></td>
        <td class="num" data-label="Em aberto">${brl(s.open)}</td>
        <td class="num ${s.overdue ? 'text-danger fw' : ''}" data-label="Vencido">${brl(s.overdue)}</td>
        <td data-label="Situação">${cbadge(s.status)}</td>
        <td class="actions-cell"><button class="btn xs wa" data-action="wa-client" data-client="${c.id}" title="WhatsApp (simulação)">${ic('chat')}</button><button class="btn xs" data-action="new-receivable" data-client="${c.id}" title="Nova cobrança">${ic('plus')}</button><a class="btn xs" href="#/clientes/${c.id}" title="Ver detalhes">${ic('eye')}</a></td></tr>`).join('')}
      </tbody></table></div>${pager(pg, 'clientes')}`;
  };

  /* Detalhe do cliente */
  pages.cliente = (id) => {
    const c = client(id);
    if (!c) return empty('Cliente não encontrado.') + '<p style="text-align:center"><a href="#/clientes">Voltar para clientes</a></p>';
    const s = clientSummary(c);
    const tab = ui.cliente.tab;
    const pays = st.payments.filter((p) => p.clientId === id).sort((a, b) => b.date.localeCompare(a.date));
    const msgs = st.messages.filter((m) => m.clientId === id).sort((a, b) => b.at.localeCompare(a.at));
    const insts = [...s.insts].sort((a, b) => b.due.localeCompare(a.due));
    const recs = st.recurrences.filter((r) => r.clientId === id);
    let body = '';
    if (tab === 'parcelas') body = insts.length ? instTable(insts, { hideClient: true }) : empty('Nenhuma cobrança cadastrada.');
    if (tab === 'pagamentos') body = pays.length ? payTable(pays, { hideClient: true }) : empty('Nenhum pagamento registrado.', 'wallet');
    if (tab === 'mensagens') body = msgs.length ? `<ul class="list">${msgs.map((m) => `<li><span class="kpi-ico tone-success" style="width:32px;height:32px;border-radius:9px;display:grid;place-items:center">${ic('chat')}</span><div class="grow"><div class="cell-main">${TEMPLATES[m.template].label} <span class="cell-sub">· ${fdatetime(m.at)}${m.auto ? ' · régua automática' : ''}</span></div><div class="cell-sub" style="white-space:pre-wrap">${esc(msgText(m)).slice(0, 180)}${msgText(m).length > 180 ? '…' : ''}</div></div><span data-ticks="${m.id}">${ticks(m.status)}</span></li>`).join('')}</ul>` : empty('Nenhuma mensagem enviada.', 'chat');
    if (tab === 'historico') {
      const ev = [
        { at: c.createdAt, t: 'Cliente cadastrado', d: '', color: 'var(--muted)' },
        ...st.receivables.filter((r) => r.clientId === id).map((r) => ({ at: r.createdAt, t: r.recurrenceId ? `Recorrência criada · ${esc(r.description)}` : `Conta criada · ${esc(r.description)}`, d: r.recurrenceId ? brl(r.total) + '/mês' : `${brl(r.total)} em ${r.installments}x`, color: 'var(--primary)' })),
        ...pays.map((p) => ({ at: p.date, t: `Pagamento de ${brl(p.amount)}`, d: p.method, color: 'var(--success)' })),
        ...msgs.map((m) => ({ at: m.at, t: `WhatsApp simulado · ${TEMPLATES[m.template].label}`, d: m.auto ? 'Régua automática' : 'Envio manual', color: 'var(--wa)' })),
        ...insts.filter((i) => status(i) === 'vencido').map((i) => ({ at: addDays(i.due, 1), t: `Parcela vencida · ${esc(instDesc(i))} ${instLabel(i)}`, d: brl(remaining(i)), color: 'var(--danger)' }))
      ].sort((a, b) => b.at.localeCompare(a.at));
      body = `<ul class="timeline">${ev.map((e) => `<li><span class="dot" style="background:${e.color}"></span><b>${e.t}</b><small>${fdate(e.at)}${e.d ? ' · ' + e.d : ''}</small></li>`).join('')}</ul>`;
    }
    const recvRate = s.billed ? (s.received / s.billed) * 100 : 0;
    return `
      <div class="crumbs"><a href="#/clientes">Clientes</a> › <span>${esc(c.name)}</span></div>
      <div class="card card-pad mb">
        <div class="profile">${avatar(c, 'lg')}<div style="flex:1;min-width:200px"><h2>${esc(c.name)}</h2><div class="row" style="margin-top:6px">${cbadge(s.status)}<span class="badge plain tone-info">${c.type === 'PF' ? 'Pessoa física' : 'Pessoa jurídica'}</span>${c.tags.map((t) => `<span class="badge plain tone-primary">${esc(t)}</span>`).join('')}</div></div>
          <div class="row"><button class="btn" data-action="edit-client" data-client="${c.id}">${ic('edit')} Editar</button><button class="btn wa" data-action="wa-client" data-client="${c.id}">${ic('chat')} WhatsApp</button><button class="btn" data-action="new-payment" data-client="${c.id}">${ic('cash')} Pagamento</button><button class="btn primary" data-action="new-receivable" data-client="${c.id}">${ic('plus')} Nova cobrança</button></div></div>
        <div class="meta"><div><small>${c.type === 'PF' ? 'CPF' : 'CNPJ'}</small><b>${esc(c.doc)}</b></div><div><small>Telefone / WhatsApp</small><b>${esc(c.phone)}</b></div><div><small>E-mail</small><b>${esc(c.email)}</b></div><div><small>Cidade</small><b>${esc(c.city)}</b></div><div><small>Cliente desde</small><b>${fdate(c.createdAt)}</b></div>${recs.length ? `<div><small>Recorrências</small><b>${recs.map((r) => `${esc(r.description)} (${brl(r.amount)}/mês${r.active ? '' : ' · pausada'})`).join('<br>')}</b></div>` : ''}${c.notes ? `<div style="grid-column:1/-1"><small>Observações</small><b>${esc(c.notes)}</b></div>` : ''}</div>
      </div>
      <div class="grid kpis">
        <div class="card kpi"><div class="kpi-top">Total faturado</div><div class="kpi-val">${brl(s.billed)}</div><div class="kpi-sub">${s.insts.length} parcelas</div></div>
        <div class="card kpi"><div class="kpi-top">Recebido</div><div class="kpi-val text-success">${brl(s.received)}</div><div class="progress mt" style="margin-top:8px"><div style="width:${recvRate}%"></div></div></div>
        <div class="card kpi"><div class="kpi-top">Em aberto</div><div class="kpi-val">${brl(s.open)}</div><div class="kpi-sub">inclui parcelas futuras</div></div>
        <div class="card kpi"><div class="kpi-top">Vencido</div><div class="kpi-val ${s.overdue ? 'text-danger' : ''}">${brl(s.overdue)}</div><div class="kpi-sub">${s.maxLate ? `maior atraso: ${s.maxLate} dias` : 'sem atrasos'}</div></div>
      </div>
      <div class="card"><div class="tabs">${[['parcelas', 'Parcelas'], ['pagamentos', 'Pagamentos'], ['mensagens', 'Mensagens'], ['historico', 'Histórico']].map(([k, l]) => `<button type="button" class="${tab === k ? 'active' : ''}" data-action="client-tab" data-tab="${k}">${l}</button>`).join('')}</div>${body}</div>`;
  };

  function instTable(rows, { hideClient = false } = {}) {
    return `<div class="table-wrap"><table class="table responsive"><thead><tr>${hideClient ? '' : '<th>Cliente</th>'}<th>Descrição</th><th>Parcela</th><th>Vencimento</th><th class="num">Valor</th><th class="num">Em aberto</th><th>Situação</th><th class="actions-cell">Ações</th></tr></thead><tbody>
      ${rows.map((i) => { const c = client(i.clientId); const s = status(i); return `<tr class="clickable" data-action="inst-detail" data-inst="${i.id}">
        ${hideClient ? '' : `<td class="td-main"><div class="who">${avatar(c, 'sm')}<div><div class="cell-main">${esc(c.name)}</div><div class="cell-sub only-sm">${esc(instDesc(i))}</div></div></div></td>`}
        <td data-label="Descrição" class="${hideClient ? 'td-main' : 'hide-sm'}"><div><div class="${hideClient ? 'cell-main' : ''}">${esc(instDesc(i))}</div>${i.recurrenceId ? '<div class="cell-sub">Recorrente</div>' : ''}</div></td>
        <td data-label="Parcela">${instLabel(i)}</td>
        <td data-label="Vencimento"><div><div>${fdate(i.due)}</div><div class="cell-sub ${s === 'vencido' ? 'text-danger' : ''}">${s === 'pago' ? 'pago em ' + fdate(i.paidAt) : rel(i.due)}</div></div></td>
        <td class="num" data-label="Valor">${brl(i.amount)}</td>
        <td class="num ${s === 'vencido' ? 'text-danger fw' : ''}" data-label="Em aberto">${brl(remaining(i))}</td>
        <td data-label="Situação">${badge(i)}</td>
        <td class="actions-cell">${s !== 'pago' ? `<button class="btn xs wa" data-action="wa-send" data-inst="${i.id}" data-tpl="${s === 'vencido' ? 'atraso' : s === 'hoje' ? 'vencimento' : 'lembrete'}" title="Cobrar por WhatsApp (simulação)">${ic('chat')}</button><button class="btn xs success" data-action="new-payment" data-inst="${i.id}" title="Registrar pagamento">${ic('check')} Baixar</button>` : `<button class="btn xs" data-action="receipt" data-inst="${i.id}" title="Recibo">${ic('receipt')} Recibo</button>`}</td></tr>`; }).join('')}
      </tbody></table></div>`;
  }
  function payTable(rows, { hideClient = false } = {}) {
    return `<div class="table-wrap"><table class="table responsive"><thead><tr><th>Data</th>${hideClient ? '' : '<th>Cliente</th>'}<th>Referência</th><th>Forma</th><th class="num">Valor</th><th class="actions-cell">Ações</th></tr></thead><tbody>
      ${rows.map((p) => { const c = client(p.clientId); const i = byId(st.installments, p.installmentId); return `<tr>
        <td data-label="Data" class="${hideClient ? 'td-main' : ''}">${fdate(p.date)}</td>
        ${hideClient ? '' : `<td class="td-main"><div class="who">${avatar(c, 'sm')}<a class="cell-main" style="color:inherit" href="#/clientes/${c.id}">${esc(c.name)}</a></div></td>`}
        <td data-label="Referência">${i ? `${esc(instDesc(i))} · ${instLabel(i)}` : '—'}</td>
        <td data-label="Forma"><span class="badge plain tone-info">${p.method}</span></td>
        <td class="num fw text-success" data-label="Valor">${brl(p.amount)}</td>
        <td class="actions-cell"><button class="btn xs" data-action="receipt" data-pay="${p.id}">${ic('receipt')} Recibo</button><button class="btn xs danger" data-action="reverse-payment" data-pay="${p.id}" title="Estornar">${ic('undo')}</button></td></tr>`; }).join('')}
      </tbody></table></div>`;
  }

  /* Contas a receber */
  const PERIODS = { todos: 'Qualquer data', mes: 'Este mês', prox30: 'Próximos 30 dias', ult30: 'Últimos 30 dias', proxmes: 'Próximo mês' };
  function inPeriod(d, p) {
    if (p === 'mes') return monthKey(d) === monthKey(TODAY);
    if (p === 'proxmes') return monthKey(d) === monthKey(addMonths(TODAY, 1, 1));
    if (p === 'prox30') return d >= TODAY && d <= addDays(TODAY, 30);
    if (p === 'ult30') return d <= TODAY && d >= addDays(TODAY, -30);
    return true;
  }
  const contasFilter = (ignoreStatus) => {
    const f = ui.contas;
    return st.installments.filter((i) => {
      const c = client(i.clientId);
      if (f.client && i.clientId !== f.client) return false;
      if (!inPeriod(i.due, f.period)) return false;
      if (f.q && !normalize(c.name + ' ' + instDesc(i) + ' ' + c.doc).includes(normalize(f.q))) return false;
      if (ignoreStatus) return true;
      const s = status(i);
      return f.status === 'todas' || (f.status === 'pendentes' ? s !== 'pago' : s === f.status);
    });
  };
  pages.contas = () => {
    const f = ui.contas;
    const base = contasFilter(true);
    const cnt = (fn) => base.filter(fn).length;
    const chips = [['pendentes', 'Pendentes', cnt((i) => status(i) !== 'pago')], ['aberto', 'A vencer', cnt((i) => status(i) === 'aberto')], ['hoje', 'Vence hoje', cnt((i) => status(i) === 'hoje')], ['vencido', 'Vencidas', cnt((i) => status(i) === 'vencido')], ['pago', 'Pagas', cnt((i) => status(i) === 'pago')], ['todas', 'Todas', base.length]];
    return `
      <div class="page-head"><div><h1>Contas a receber</h1><p>Parcelas, vencimentos e baixas de pagamento</p></div>
        <div class="actions"><button class="btn" data-action="export-insts">${ic('download')} Exportar</button><button class="btn primary" data-action="new-receivable">${ic('plus')} Nova cobrança</button></div></div>
      <div class="card">
        <div class="toolbar">
          <label class="search-input grow">${ic('search')}<input type="search" data-filter="contas.q" value="${esc(f.q)}" placeholder="Buscar por cliente, documento ou descrição"></label>
          <select class="select" data-filter="contas.client" aria-label="Cliente">${clientOptions(f.client, true)}</select>
          <select class="select" data-filter="contas.period" aria-label="Período">${Object.entries(PERIODS).map(([k, l]) => `<option value="${k}" ${f.period === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        <div class="toolbar"><div class="chips">${chips.map(([k, l, n]) => `<button class="chip ${f.status === k ? 'active' : ''}" data-action="chip" data-key="contas.status" data-val="${k}">${l}<span class="count">${n}</span></button>`).join('')}</div></div>
        <div id="listArea"></div>
      </div>`;
  };
  pages.contas.list = () => {
    const f = ui.contas;
    const rows = contasFilter(false).sort((a, b) => (f.status === 'pago' || f.status === 'todas' ? b.due.localeCompare(a.due) : a.due.localeCompare(b.due)));
    if (!rows.length) return empty('Nenhuma parcela encontrada com esses filtros.', 'receipt');
    const total = rows.reduce((a, i) => a + i.amount, 0), open = rows.reduce((a, i) => a + remaining(i), 0);
    const pg = pageSlice(rows, f.page, 15);
    return `<div class="toolbar" style="background:var(--surface-2);font-size:13px"><span><b>${rows.length}</b> parcelas</span><span>Valor total: <b>${brl(total)}</b></span><span>Em aberto: <b class="${open ? 'text-danger' : ''}">${brl(open)}</b></span></div>${instTable(pg.rows)}${pager(pg, 'contas')}`;
  };

  /* Recorrências */
  const nextRecDue = (r) => (r.lastGenerated ? addMonths(r.lastGenerated, 1, r.day) : addMonths(r.startDate, 0, r.day));
  pages.recorrencias = () => {
    const active = st.recurrences.filter((r) => r.active);
    const mrr = active.reduce((a, r) => a + r.amount, 0);
    const pendingGen = active.filter((r) => nextRecDue(r) <= addDays(TODAY, 30));
    const q = ui.recorrencias.q;
    const rows = st.recurrences.filter((r) => !q || normalize(client(r.clientId).name + ' ' + r.description).includes(normalize(q))).sort((a, b) => Number(b.active) - Number(a.active) || nextRecDue(a).localeCompare(nextRecDue(b)));
    return `
      <div class="page-head"><div><h1>Cobranças recorrentes</h1><p>Mensalidades e contratos que geram cobranças automaticamente</p></div>
        <div class="actions"><button class="btn" data-action="gen-recurrences" ${pendingGen.length ? '' : 'disabled'}>${ic('zap')} Gerar próximas cobranças (${pendingGen.length})</button><button class="btn primary" data-action="new-recurrence">${ic('plus')} Nova recorrência</button></div></div>
      <div class="grid kpis">
        <div class="card kpi"><div class="kpi-top">Receita recorrente mensal<span class="kpi-ico tone-primary">${ic('repeat')}</span></div><div class="kpi-val">${brl(mrr)}</div><div class="kpi-sub">soma das recorrências ativas</div></div>
        <div class="card kpi"><div class="kpi-top">Recorrências ativas<span class="kpi-ico tone-success">${ic('play')}</span></div><div class="kpi-val">${active.length}</div><div class="kpi-sub">${st.recurrences.length - active.length} pausadas</div></div>
        <div class="card kpi"><div class="kpi-top">A gerar (30 dias)<span class="kpi-ico tone-warning">${ic('calendar')}</span></div><div class="kpi-val">${pendingGen.length}</div><div class="kpi-sub">${brl(pendingGen.reduce((a, r) => a + r.amount, 0))}</div></div>
        <div class="card kpi"><div class="kpi-top">Receita anual projetada<span class="kpi-ico tone-info">${ic('trend')}</span></div><div class="kpi-val">${brl(mrr * 12)}</div><div class="kpi-sub">mantidas as ativas</div></div>
      </div>
      <div class="card"><div class="toolbar"><label class="search-input grow">${ic('search')}<input type="search" data-filter="recorrencias.q" value="${esc(q)}" placeholder="Buscar por cliente ou plano"></label></div>
        <div id="listArea">${recTable(rows)}</div></div>`;
  };
  pages.recorrencias.list = () => {
    const q = ui.recorrencias.q;
    return recTable(st.recurrences.filter((r) => !q || normalize(client(r.clientId).name + ' ' + r.description).includes(normalize(q))));
  };
  function recTable(rows) {
    if (!rows.length) return empty('Nenhuma recorrência encontrada.', 'repeat');
    return `<div class="table-wrap"><table class="table responsive"><thead><tr><th>Cliente</th><th>Plano / serviço</th><th class="num">Valor</th><th>Vencimento</th><th>Próxima cobrança</th><th>Status</th><th class="actions-cell">Ações</th></tr></thead><tbody>
      ${rows.map((r) => { const c = client(r.clientId); return `<tr>
        <td class="td-main"><div class="who">${avatar(c, 'sm')}<a class="cell-main" style="color:inherit" href="#/clientes/${c.id}">${esc(c.name)}</a></div></td>
        <td data-label="Plano"><div>${esc(r.description)}<div class="cell-sub">${r.frequency} · desde ${fdate(r.startDate)}</div></div></td>
        <td class="num fw" data-label="Valor">${brl(r.amount)}</td>
        <td data-label="Vencimento">Todo dia ${r.day}</td>
        <td data-label="Próxima">${r.active ? fdate(nextRecDue(r)) : '—'}</td>
        <td data-label="Status"><label class="switch" title="${r.active ? 'Pausar' : 'Reativar'}"><input type="checkbox" data-action="toggle-rec" data-rec="${r.id}" ${r.active ? 'checked' : ''}><span></span></label></td>
        <td class="actions-cell"><button class="btn xs" data-action="gen-one" data-rec="${r.id}" ${r.active ? '' : 'disabled'}>${ic('zap')} Gerar agora</button></td></tr>`; }).join('')}
      </tbody></table></div>`;
  }
  function generateRecurrence(r) {
    const due = nextRecDue(r);
    let rec = st.receivables.find((x) => x.recurrenceId === r.id);
    if (!rec) { rec = { id: newId('R'), clientId: r.clientId, description: r.description, total: r.amount, installments: 1, createdAt: TODAY, category: 'Recorrente', recurrenceId: r.id }; st.receivables.push(rec); }
    const count = st.installments.filter((i) => i.recurrenceId === r.id).length;
    st.installments.push({ id: newId('I'), receivableId: rec.id, clientId: r.clientId, n: count + 1, of: null, amount: r.amount, due, paid: 0, paidAt: null, method: null, recurrenceId: r.id });
    r.lastGenerated = due;
    return due;
  }

  /* Pagamentos */
  const payFilter = () => {
    const f = ui.pagamentos;
    const from = f.period === 'mes' ? TODAY.slice(0, 8) + '01' : f.period === 'todos' ? '0000' : addDays(TODAY, -Number(f.period));
    return st.payments.filter((p) => p.date >= from && (!f.method || p.method === f.method) && (!f.q || normalize(client(p.clientId).name).includes(normalize(f.q)))).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  };
  pages.pagamentos = () => {
    const f = ui.pagamentos;
    const methods = [...new Set(st.payments.map((p) => p.method))].sort();
    return `
      <div class="page-head"><div><h1>Pagamentos</h1><p>Histórico financeiro de recebimentos e baixas</p></div>
        <div class="actions"><button class="btn" data-action="export-pays">${ic('download')} Exportar</button><button class="btn primary" data-action="new-payment">${ic('plus')} Registrar pagamento</button></div></div>
      <div id="payKpis"></div>
      <div class="card"><div class="toolbar">
          <label class="search-input grow">${ic('search')}<input type="search" data-filter="pagamentos.q" value="${esc(f.q)}" placeholder="Buscar por cliente"></label>
          <select class="select" data-filter="pagamentos.period" aria-label="Período"><option value="mes" ${f.period === 'mes' ? 'selected' : ''}>Este mês</option><option value="30" ${f.period === '30' ? 'selected' : ''}>Últimos 30 dias</option><option value="90" ${f.period === '90' ? 'selected' : ''}>Últimos 90 dias</option><option value="365" ${f.period === '365' ? 'selected' : ''}>Últimos 12 meses</option><option value="todos" ${f.period === 'todos' ? 'selected' : ''}>Todo o período</option></select>
          <select class="select" data-filter="pagamentos.method" aria-label="Forma de pagamento"><option value="">Todas as formas</option>${methods.map((m) => `<option ${f.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
        </div><div id="listArea"></div></div>`;
  };
  pages.pagamentos.list = () => {
    const rows = payFilter();
    const total = rows.reduce((a, p) => a + p.amount, 0);
    const byM = {}; rows.forEach((p) => { byM[p.method] = (byM[p.method] || 0) + p.amount; });
    const top = Object.entries(byM).sort((a, b) => b[1] - a[1])[0];
    const k = $('#payKpis');
    if (k) k.innerHTML = `<div class="grid kpis">
      <div class="card kpi"><div class="kpi-top">Total recebido<span class="kpi-ico tone-success">${ic('wallet')}</span></div><div class="kpi-val">${brl(total)}</div><div class="kpi-sub">no período selecionado</div></div>
      <div class="card kpi"><div class="kpi-top">Pagamentos<span class="kpi-ico tone-primary">${ic('receipt')}</span></div><div class="kpi-val">${rows.length}</div><div class="kpi-sub">${new Set(rows.map((p) => p.clientId)).size} clientes</div></div>
      <div class="card kpi"><div class="kpi-top">Ticket médio<span class="kpi-ico tone-info">${ic('cash')}</span></div><div class="kpi-val">${brl(rows.length ? total / rows.length : 0)}</div><div class="kpi-sub">por pagamento</div></div>
      <div class="card kpi"><div class="kpi-top">Forma mais usada<span class="kpi-ico tone-warning">${ic('zap')}</span></div><div class="kpi-val">${top ? top[0] : '—'}</div><div class="kpi-sub">${top ? pct((top[1] / total) * 100) + ' do valor' : ''}</div></div></div>`;
    if (!rows.length) return empty('Nenhum pagamento no período.', 'wallet');
    const pg = pageSlice(rows, ui.pagamentos.page, 15);
    return payTable(pg.rows) + pager(pg, 'pagamentos');
  };

  /* Alertas */
  function alertGroups() {
    const open = openInsts();
    return [
      { key: 'hoje', title: 'Vencem hoje', tone: 'warning', icon: 'clock', tpl: 'vencimento', items: open.filter((i) => i.due === TODAY) },
      { key: 'prox', title: 'Vencem nos próximos 3 dias', tone: 'info', icon: 'calendar', tpl: 'lembrete', items: open.filter((i) => i.due > TODAY && i.due <= addDays(TODAY, 3)) },
      { key: 'atraso', title: 'Em atraso (até 30 dias)', tone: 'danger', icon: 'alert', tpl: 'atraso', items: open.filter((i) => status(i) === 'vencido' && lateDays(i) <= 30) },
      { key: 'inad', title: 'Inadimplência (mais de 30 dias)', tone: 'danger', icon: 'alert', tpl: 'atraso', items: open.filter((i) => status(i) === 'vencido' && lateDays(i) > 30) }
    ].map((g) => ({ ...g, items: g.items.sort((a, b) => a.due.localeCompare(b.due)), total: g.items.reduce((a, i) => a + remaining(i), 0) }));
  }
  pages.alertas = () => {
    const groups = alertGroups();
    const inadClients = new Set(groups[3].items.map((i) => i.clientId)).size;
    return `
      <div class="page-head"><div><h1>Alertas de vencimento e inadimplência</h1><p>Acompanhe o que precisa de atenção hoje e dispare cobranças em lote (simulação)</p></div>
        <div class="actions"><a class="btn" href="#/whatsapp">${ic('zap')} Configurar régua de cobrança</a></div></div>
      <div class="grid kpis">${groups.map((g) => `<a class="card kpi" href="#alert-${g.key}" data-scroll="alert-${g.key}"><div class="kpi-top">${g.title}<span class="kpi-ico tone-${g.tone}">${ic(g.icon)}</span></div><div class="kpi-val">${brl(g.total)}</div><div class="kpi-sub">${g.items.length} parcelas</div></a>`).join('')}</div>
      ${inadClients ? `<div class="callout tone-danger mb">${ic('alert')}<div><b>${inadClients} cliente(s) com atraso superior a 30 dias.</b> Considere contato direto ou proposta de renegociação. Os envios abaixo são apenas simulados.</div></div>` : ''}
      ${groups.map((g) => `<div class="card alert-group" id="alert-${g.key}"><div class="card-head"><h3>${g.title} <span class="badge tone-${g.tone}">${g.items.length}</span></h3>
        ${g.items.length ? `<button class="btn sm wa" data-action="wa-batch" data-group="${g.key}">${ic('send')} Cobrar todos via WhatsApp (simulação)</button>` : ''}</div>
        ${g.items.length ? `<ul class="list">${g.items.map((i) => { const c = client(i.clientId); const sent = st.messages.filter((m) => m.installmentId === i.id).sort((a, b) => b.at.localeCompare(a.at))[0];
          return `<li>${avatar(c, 'sm')}<div class="grow"><a class="cell-main truncate" style="display:block;color:inherit" href="#/clientes/${c.id}">${esc(c.name)}</a><div class="cell-sub truncate">${esc(instDesc(i))} · ${instLabel(i)} · venc. ${fdate(i.due)} ${status(i) === 'vencido' ? `<b class="text-danger">(${lateDays(i)} dias)</b>` : `(${rel(i.due)})`}${sent ? ` · última cobrança ${fdate(sent.at)}` : ''}</div></div>
          <div class="amount">${brl(remaining(i))}</div><button class="btn xs wa" data-action="wa-send" data-inst="${i.id}" data-tpl="${g.tpl}" title="Cobrar (simulação)">${ic('chat')}</button><button class="btn xs" data-action="new-payment" data-inst="${i.id}" title="Registrar pagamento">${ic('check')}</button></li>`; }).join('')}</ul>` : empty('Nada por aqui. 👍', 'check')}</div>`).join('')}`;
  };

  /* WhatsApp (simulação) */
  pages.whatsapp = () => {
    const convs = {};
    st.messages.forEach((m) => { if (!convs[m.clientId] || convs[m.clientId].at < m.at) convs[m.clientId] = m; });
    const list = Object.values(convs).sort((a, b) => b.at.localeCompare(a.at));
    if (!ui.whatsapp.client) ui.whatsapp.client = list[0] ? list[0].clientId : st.clients[0].id;
    const sel = client(ui.whatsapp.client);
    const msgs = st.messages.filter((m) => m.clientId === sel.id).sort((a, b) => a.at.localeCompare(b.at));
    const rules = st.rules;
    const rule = (k, t, d) => `<div class="rule-row"><div><b>${t}</b><small>${d}</small></div><label class="switch"><input type="checkbox" data-action="toggle-rule" data-rule="${k}" ${rules[k] ? 'checked' : ''}><span></span></label></div>`;
    let lastDay = '';
    const chat = msgs.map((m) => {
      const day = m.at.slice(0, 10);
      const sep = day !== lastDay ? `<div class="day-sep">${day === TODAY ? 'Hoje' : fdate(day)}</div>` : '';
      lastDay = day;
      return `${sep}<div class="bubble out">${esc(msgText(m)).replace(/\*(.+?)\*/g, '<b>$1</b>')}<div class="bmeta">${m.auto ? 'auto · ' : ''}${m.at.slice(11, 16)} <span data-ticks="${m.id}">${ticks(m.status)}</span></div></div>`;
    }).join('');
    const opens = openInsts().filter((i) => i.clientId === sel.id).sort((a, b) => a.due.localeCompare(b.due));
    return `
      <div class="page-head"><div><h1>Cobrança por WhatsApp <span class="badge tone-warning plain" style="vertical-align:middle">SIMULAÇÃO</span></h1><p>Demonstração do fluxo de lembretes e cobranças. Nenhuma mensagem é enviada de verdade e não há integração com API.</p></div></div>
      <div class="wa-layout">
        <div class="card"><div class="card-head" style="padding-bottom:12px"><h3>Conversas</h3><small>${list.length}</small></div>
          <div style="padding:0 16px 12px"><select class="select" data-action="wa-pick" aria-label="Nova conversa"><option value="">+ Nova conversa…</option>${clientOptions('', false).replace('<option value="">Selecione o cliente…</option>', '')}</select></div>
          <div class="wa-convs">${list.map((m) => { const c = client(m.clientId); return `<button type="button" class="${c.id === sel.id ? 'active' : ''}" data-action="wa-open" data-client="${c.id}">${avatar(c, 'sm')}<div class="grow"><div class="cell-main truncate">${esc(c.name)}</div><small class="truncate" style="display:block">${TEMPLATES[m.template].label}</small></div><small>${fdate(m.at).slice(0, 5)}</small></button>`; }).join('')}</div></div>
        <div>
          <div class="phone"><div class="phone-top">${avatar(sel, 'sm')}<div style="min-width:0"><b class="truncate" style="display:block">${esc(sel.name)}</b><small>${esc(sel.phone)}</small></div></div>
            <div class="phone-chat" id="phoneChat"><div class="sim-tag">🔒 Ambiente de demonstração — mensagens simuladas, não enviadas</div>${chat || '<div class="day-sep">Nenhuma mensagem ainda</div>'}</div>
            <div class="phone-input"><div>Mensagem</div><span>${ic('send')}</span></div></div>
        </div>
        <div class="stack wa-side">
          <form class="card card-pad" data-submit="wa-compose" novalidate><h3 style="font-size:15px;margin-bottom:12px">Nova mensagem para ${esc(firstName(sel))}</h3>
            <div class="field mb"><label>Parcela de referência</label><select class="select" name="inst" data-action="wa-compose-change">${opens.length ? '' : '<option value="">Sem parcelas em aberto</option>'}${opens.map((i) => `<option value="${i.id}">${esc(instDesc(i))} · ${instLabel(i)} · ${fdate(i.due)} · ${brl(remaining(i))}</option>`).join('')}</select></div>
            <div class="field mb"><label>Modelo</label><select class="select" name="tpl" data-action="wa-compose-change">${Object.entries(TEMPLATES).map(([k, t]) => `<option value="${k}" ${k === (opens[0] && status(opens[0]) === 'vencido' ? 'atraso' : 'lembrete') ? 'selected' : ''}>${t.label}</option>`).join('')}</select></div>
            <div class="field mb"><label>Mensagem (editável)</label><textarea class="input" name="text" rows="7"></textarea><div class="hint">Variáveis preenchidas automaticamente com os dados do cliente e da parcela.</div></div>
            <button class="btn wa" style="width:100%" type="submit">${ic('send')} Enviar (simulação)</button></form>
          <div class="card card-pad"><div class="row" style="justify-content:space-between;margin-bottom:4px"><h3 style="font-size:15px">Régua de cobrança automática</h3><span class="badge plain tone-warning">Simulada</span></div>
            ${rule('before3', '3 dias antes do vencimento', 'Lembrete amigável')}${rule('onDue', 'No dia do vencimento', 'Aviso com chave PIX')}${rule('after1', '1 dia após o vencimento', 'Primeira cobrança')}${rule('after7', '7 dias após o vencimento', 'Cobrança com proposta de negociação')}${rule('after15', '15+ dias após o vencimento', 'Cobrança de inadimplência')}${rule('confirm', 'Confirmação de pagamento', 'Agradecimento ao dar baixa')}
            <button class="btn" style="width:100%;margin-top:12px" type="button" data-action="run-rules">${ic('zap')} Executar régua agora (simulação)</button></div>
        </div>
      </div>`;
  };
  function waComposeFill(form) {
    const c = client(ui.whatsapp.client);
    const inst = byId(st.installments, form.inst.value);
    form.text.value = fillTemplate(form.tpl.value, inst, c);
  }

  /* Relatórios */
  function reportRange() {
    const f = ui.relatorios;
    if (f.period === 'mes') return [TODAY.slice(0, 8) + '01', addDays(addMonths(TODAY.slice(0, 8) + '01', 1, 1), -1)];
    if (f.period === '3m') return [addMonths(TODAY, -2, 1), addDays(addMonths(TODAY.slice(0, 8) + '01', 1, 1), -1)];
    if (f.period === '6m') return [addMonths(TODAY, -5, 1), addDays(addMonths(TODAY.slice(0, 8) + '01', 1, 1), -1)];
    if (f.period === 'ano') return [TODAY.slice(0, 4) + '-01-01', TODAY.slice(0, 4) + '-12-31'];
    return [f.from || '0000-01-01', f.to || '9999-12-31'];
  }
  pages.relatorios = () => {
    const f = ui.relatorios;
    return `
      <div class="page-head"><div><h1>Relatórios</h1><p>Faturamento, recebimentos, inadimplência e desempenho por cliente</p></div>
        <div class="actions"><button class="btn" data-action="print">${ic('printer')} Imprimir</button><button class="btn" data-action="export-pdf">${ic('download')} Baixar PDF</button><button class="btn" data-action="export-report">${ic('download')} Exportar CSV</button></div></div>
      <div class="card mb no-print"><div class="toolbar" style="border:0">
        <span class="muted row">${ic('filter')} Filtros</span>
        <select class="select" data-filter="relatorios.period" aria-label="Período"><option value="mes" ${f.period === 'mes' ? 'selected' : ''}>Mês atual</option><option value="3m" ${f.period === '3m' ? 'selected' : ''}>Últimos 3 meses</option><option value="6m" ${f.period === '6m' ? 'selected' : ''}>Últimos 6 meses</option><option value="ano" ${f.period === 'ano' ? 'selected' : ''}>Ano atual</option><option value="custom" ${f.period === 'custom' ? 'selected' : ''}>Personalizado</option></select>
        <span class="row" ${f.period === 'custom' ? '' : 'hidden'} id="customRange"><input class="input" style="width:auto" type="date" data-filter="relatorios.from" value="${f.from}" aria-label="De"> até <input class="input" style="width:auto" type="date" data-filter="relatorios.to" value="${f.to}" aria-label="Até"></span>
        <select class="select" data-filter="relatorios.client" aria-label="Cliente">${clientOptions(f.client, true)}</select>
      </div></div>
      <div id="listArea"></div>`;
  };
  pages.relatorios.list = () => {
    const f = ui.relatorios;
    const cr = $('#customRange'); if (cr) cr.hidden = f.period !== 'custom';
    const [from, to] = reportRange();
    const okC = (id) => !f.client || id === f.client;
    const insts = st.installments.filter((i) => okC(i.clientId) && i.due >= from && i.due <= to);
    const pays = st.payments.filter((p) => okC(p.clientId) && p.date >= from && p.date <= to);
    const billed = insts.reduce((a, i) => a + i.amount, 0);
    const recv = pays.reduce((a, p) => a + p.amount, 0);
    const dueInsts = insts.filter((i) => i.due < TODAY);
    const dueBilled = dueInsts.reduce((a, i) => a + i.amount, 0);
    const dueOpen = dueInsts.reduce((a, i) => a + remaining(i), 0);
    const onTime = insts.filter((i) => i.paidAt && i.paidAt <= i.due).length;
    const paidCount = insts.filter((i) => i.paidAt).length;
    // série mensal
    const months = [];
    for (let m = monthKey(from) + '-01'; monthKey(m) <= monthKey(to) && months.length < 24; m = addMonths(m, 1, 1)) months.push(monthKey(m));
    const exp = months.map((m) => insts.filter((i) => monthKey(i.due) === m).reduce((a, i) => a + i.amount, 0));
    const rec = months.map((m) => pays.filter((p) => monthKey(p.date) === m).reduce((a, p) => a + p.amount, 0));
    const byM = {}; pays.forEach((p) => { byM[p.method] = (byM[p.method] || 0) + p.amount; });
    const methodColors = { PIX: '#10b981', Boleto: '#6b8f3a', 'Cartão de crédito': '#f59e0b', 'Transferência': '#0ea5e9', Dinheiro: '#64748b' };
    // aging da carteira vencida atual
    const buckets = [['1–15 dias', 1, 15], ['16–30 dias', 16, 30], ['31–60 dias', 31, 60], ['61–90 dias', 61, 90], ['Mais de 90', 91, 1e9]];
    const overdueNow = openInsts().filter((i) => status(i) === 'vencido' && okC(i.clientId));
    const aging = buckets.map(([l, a, b], k) => ({ label: l, value: overdueNow.filter((i) => lateDays(i) >= a && lateDays(i) <= b).reduce((s, i) => s + remaining(i), 0), color: ['#fbbf24', '#f59e0b', '#f97316', '#ef4444', '#b91c1c'][k] }));
    const byClient = st.clients.filter((c) => okC(c.id)).map((c) => {
      const ci = insts.filter((i) => i.clientId === c.id);
      return { c, billed: ci.reduce((a, i) => a + i.amount, 0), recv: pays.filter((p) => p.clientId === c.id).reduce((a, p) => a + p.amount, 0), open: ci.reduce((a, i) => a + remaining(i), 0), overdue: ci.filter((i) => status(i) === 'vencido').reduce((a, i) => a + remaining(i), 0), n: ci.length };
    }).filter((x) => x.n || x.recv).sort((a, b) => b.billed - a.billed);
    reportCache = { from, to, byClient, billed, recv, nInsts: insts.length, nPays: pays.length, dueOpen, dueBilled, onTime, paidCount, months, exp, rec, byM, methodColors, aging };
    return `
      <p class="muted" style="margin:-4px 0 14px">Período: <b>${fdate(from)}</b> a <b>${fdate(to)}</b>${f.client ? ` · Cliente: <b>${esc(client(f.client).name)}</b>` : ''}</p>
      <div class="grid kpis">
        <div class="card kpi"><div class="kpi-top">Faturado no período<span class="kpi-ico tone-primary">${ic('receipt')}</span></div><div class="kpi-val">${brl(billed)}</div><div class="kpi-sub">${insts.length} parcelas com vencimento no período</div></div>
        <div class="card kpi"><div class="kpi-top">Recebido no período<span class="kpi-ico tone-success">${ic('wallet')}</span></div><div class="kpi-val">${brl(recv)}</div><div class="kpi-sub">${pays.length} pagamentos</div></div>
        <div class="card kpi"><div class="kpi-top">Inadimplência<span class="kpi-ico tone-danger">${ic('alert')}</span></div><div class="kpi-val">${pct(dueBilled ? (dueOpen / dueBilled) * 100 : 0)}</div><div class="kpi-sub">${brl(dueOpen)} vencido em aberto</div></div>
        <div class="card kpi"><div class="kpi-top">Pagamentos em dia<span class="kpi-ico tone-info">${ic('check')}</span></div><div class="kpi-val">${pct(paidCount ? (onTime / paidCount) * 100 : 0)}</div><div class="kpi-sub">${onTime} de ${paidCount} parcelas pagas</div></div>
      </div>
      <div class="grid g-2-1 mb">
        <div class="card"><div class="card-head"><h3>Faturado x recebido por mês</h3><div class="legend"><span><i style="background:#b9dcc2"></i>Faturado</span><span><i style="background:var(--success)"></i>Recebido</span></div></div>
          <div class="card-pad">${months.length ? barChart(months.map(monthLabel), [{ name: 'Faturado', color: '#b9dcc2', values: exp }, { name: 'Recebido', color: 'var(--success)', values: rec }]) : empty('Período inválido')}</div></div>
        <div class="stack">
          <div class="card"><div class="card-head"><h3>Recebido por forma de pagamento</h3></div><div class="card-pad">${Object.keys(byM).length ? hbars(Object.entries(byM).sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ label: l, value: v, color: methodColors[l] })), 'var(--primary)') : empty('Sem pagamentos no período', 'wallet')}</div></div>
          <div class="card"><div class="card-head"><h3>Aging da carteira vencida</h3><small>posição de hoje</small></div><div class="card-pad">${hbars(aging)}</div></div>
        </div>
      </div>
      <div class="card"><div class="card-head" style="padding-bottom:12px"><h3>Desempenho por cliente</h3><small>${byClient.length} clientes</small></div>
        ${byClient.length ? `<div class="table-wrap"><table class="table responsive"><thead><tr><th>Cliente</th><th class="num">Faturado</th><th class="num">Recebido</th><th class="num">Em aberto</th><th class="num">Vencido</th><th>Recebimento</th></tr></thead><tbody>
        ${byClient.map((x) => { const rate = x.billed ? Math.min(100, ((x.billed - x.open) / x.billed) * 100) : 100; return `<tr class="clickable" data-href="#/clientes/${x.c.id}"><td class="td-main"><div class="who">${avatar(x.c, 'sm')}<span class="cell-main">${esc(x.c.name)}</span></div></td><td class="num" data-label="Faturado">${brl(x.billed)}</td><td class="num text-success" data-label="Recebido">${brl(x.recv)}</td><td class="num" data-label="Em aberto">${brl(x.open)}</td><td class="num ${x.overdue ? 'text-danger fw' : ''}" data-label="Vencido">${brl(x.overdue)}</td><td data-label="Recebimento" style="min-width:120px"><div class="row" style="flex-wrap:nowrap"><div class="progress" style="flex:1"><div style="width:${rate}%;background:${rate < 60 ? 'var(--danger)' : rate < 90 ? 'var(--warning)' : 'var(--success)'}"></div></div><small>${Math.round(rate)}%</small></div></td></tr>`; }).join('')}
        </tbody></table></div>` : empty('Sem dados para o período.')}</div>`;
  };
  let reportCache = null;

  /* PDF do relatório: jsPDF carregado só no primeiro uso, documento desenhado direto (A4 retrato) */
  let pdfLib = null;
  function loadPdfLib() {
    if (window.jspdf) return Promise.resolve(window.jspdf.jsPDF);
    if (!pdfLib) {
      pdfLib = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'js/vendor/jspdf.umd.min.js';
        s.onload = () => resolve(window.jspdf.jsPDF);
        s.onerror = () => { pdfLib = null; reject(new Error('falha ao carregar')); };
        document.head.appendChild(s);
      });
    }
    return pdfLib;
  }
  async function exportReportPDF(btn) {
    const r = reportCache;
    if (!r) return;
    btn.disabled = true;
    try {
      const JsPDF = await loadPdfLib();
      const doc = new JsPDF({ unit: 'mm', format: 'a4' });
      const W = 210, M = 14, CW = W - 2 * M, BOTTOM = 282;
      const GREEN = [27, 127, 55], DARK = [14, 59, 46], TEXT = [23, 32, 27], MUTED = [100, 107, 99], LINE = [230, 226, 212], SOFT = [247, 245, 236];
      const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
      const txt = (s) => String(s).replace(/ /g, ' ');
      const cid = ui.relatorios.client;
      const cl = cid ? client(cid) : null;
      let y = 0;
      const footer = () => {
        const n = doc.getNumberOfPages();
        for (let p = 1; p <= n; p++) {
          doc.setPage(p); doc.setFontSize(8); doc.setTextColor(...MUTED);
          doc.text(txt(`${st.company.name} · Relatório de demonstração com dados fictícios · gerado em ${fdate(TODAY)}`), M, 291);
          doc.text(`Página ${p} de ${n}`, W - M, 291, { align: 'right' });
        }
      };
      const ensure = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = 16; return true; } return false; };
      const section = (title) => { ensure(14); doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...DARK); doc.text(title, M, y); y += 2.5; doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(M, y, W - M, y); y += 6; };

      // Cabeçalho
      doc.setFillColor(...DARK); doc.rect(0, 0, W, 30, 'F');
      doc.setFillColor(...GREEN); doc.rect(0, 30, W, 1.6, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
      doc.text('Relatório financeiro', M, 14);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      doc.text(txt(`Período: ${fdate(r.from)} a ${fdate(r.to)}  ·  ${cl ? cl.name : 'Todos os clientes'}`), M, 22);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(txt(st.company.name), W - M, 13, { align: 'right' });
      doc.setFillColor(253, 230, 138); doc.roundedRect(W - M - 52, 18, 52, 6.5, 1.5, 1.5, 'F');
      doc.setTextColor(59, 35, 0); doc.setFontSize(7.5); doc.text('DEMONSTRAÇÃO · dados fictícios', W - M - 26, 22.4, { align: 'center' });
      y = 42;

      // Indicadores
      const kpis = [
        ['Faturado no período', brl(r.billed), `${r.nInsts} parcelas no período`, GREEN],
        ['Recebido no período', brl(r.recv), `${r.nPays} pagamentos`, [18, 161, 80]],
        ['Inadimplência', pct(r.dueBilled ? (r.dueOpen / r.dueBilled) * 100 : 0), `${brl(r.dueOpen)} vencido em aberto`, [220, 38, 38]],
        ['Pagamentos em dia', pct(r.paidCount ? (r.onTime / r.paidCount) * 100 : 0), `${r.onTime} de ${r.paidCount} parcelas pagas`, [2, 132, 199]]
      ];
      const kw = (CW - 3 * 4) / 4;
      kpis.forEach(([label, val, sub, color], k) => {
        const x = M + k * (kw + 4);
        doc.setFillColor(...SOFT); doc.setDrawColor(...LINE); doc.roundedRect(x, y, kw, 24, 2, 2, 'FD');
        doc.setFillColor(...color); doc.rect(x, y + 3, 1.2, 18, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text(label, x + 4, y + 6.5);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...TEXT); doc.text(txt(val), x + 4, y + 14);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED); doc.text(doc.splitTextToSize(txt(sub), kw - 6)[0], x + 4, y + 19.5);
      });
      y += 33;

      // Gráfico mensal
      section('Faturado x recebido por mês');
      const ch = 52, max = Math.max(1, ...r.exp, ...r.rec);
      const step = Math.pow(10, Math.floor(Math.log10(max)));
      const top = Math.ceil(max / step) * step;
      const gx = M + 16, gw = CW - 16;
      doc.setFontSize(7); doc.setTextColor(...MUTED); doc.setDrawColor(...LINE); doc.setLineWidth(0.2);
      for (let g = 0; g <= 4; g++) {
        const gy = y + ch - (ch * g) / 4;
        doc.line(gx, gy, gx + gw, gy);
        doc.text(txt(brlShort((top * g) / 4)), gx - 2, gy + 1, { align: 'right' });
      }
      const n = r.months.length || 1, slot = gw / n, bw = Math.min(9, slot * 0.32);
      r.months.forEach((m, k) => {
        const cx = gx + slot * k + slot / 2;
        [[r.exp[k], [185, 220, 194]], [r.rec[k], [18, 161, 80]]].forEach(([v, c], j) => {
          const h = (v / top) * ch;
          doc.setFillColor(...c); doc.rect(cx - bw - 0.5 + j * (bw + 1), y + ch - h, bw, h, 'F');
        });
        doc.setTextColor(...MUTED); doc.text(monthLabel(m), cx, y + ch + 4.5, { align: 'center' });
      });
      y += ch + 8;
      doc.setFillColor(185, 220, 194); doc.rect(gx, y - 2.6, 3, 3, 'F'); doc.setTextColor(...TEXT); doc.text('Faturado', gx + 4.5, y);
      doc.setFillColor(18, 161, 80); doc.rect(gx + 22, y - 2.6, 3, 3, 'F'); doc.text('Recebido', gx + 26.5, y);
      y += 9;

      // Barras horizontais (forma de pagamento e aging)
      const hbarsPdf = (rows) => {
        const mx = Math.max(1, ...rows.map((x) => x.value));
        rows.forEach((x) => {
          ensure(8);
          doc.setFontSize(8.5); doc.setTextColor(...TEXT); doc.setFont('helvetica', 'normal'); doc.text(x.label, M, y + 3);
          doc.setFillColor(...SOFT); doc.rect(M + 40, y, CW - 80, 3.6, 'F');
          doc.setFillColor(...hex(x.color || '#1b7f37')); doc.rect(M + 40, y, ((CW - 80) * x.value) / mx, 3.6, 'F');
          doc.setFont('helvetica', 'bold'); doc.text(txt(brl(x.value)), W - M, y + 3, { align: 'right' });
          y += 7;
        });
        y += 4;
      };
      section('Recebido por forma de pagamento');
      const methods = Object.entries(r.byM).sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ label: l, value: v, color: r.methodColors[l] }));
      if (methods.length) hbarsPdf(methods); else { doc.setFontSize(9); doc.setTextColor(...MUTED); doc.text('Sem pagamentos no período.', M, y); y += 8; }
      section('Aging da carteira vencida (posição de hoje)');
      hbarsPdf(r.aging);

      // Tabela por cliente
      const cols = [['Cliente', M + 2, 'left'], ['Faturado', M + 88, 'right'], ['Recebido', M + 114, 'right'], ['Em aberto', M + 140, 'right'], ['Vencido', M + 164, 'right']];
      const head = () => {
        doc.setFillColor(...DARK); doc.rect(M, y, CW, 7, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
        cols.forEach(([t, x, al]) => doc.text(t, x, y + 4.7, { align: al }));
        doc.text('Receb.', W - M - 2, y + 4.7, { align: 'right' });
        y += 7;
      };
      ensure(45);
      section(`Desempenho por cliente (${r.byClient.length})`);
      if (!r.byClient.length) { doc.setFontSize(9); doc.setTextColor(...MUTED); doc.text('Sem dados para o período.', M, y); }
      else {
        head();
        r.byClient.forEach((x, k) => {
          if (ensure(6.5)) head();
          if (k % 2) { doc.setFillColor(...SOFT); doc.rect(M, y, CW, 6.5, 'F'); }
          const rate = x.billed ? Math.min(100, ((x.billed - x.open) / x.billed) * 100) : 100;
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...TEXT);
          doc.text(doc.splitTextToSize(txt(x.c.name), 62)[0], M + 2, y + 4.4);
          doc.text(txt(brl(x.billed)), M + 88, y + 4.4, { align: 'right' });
          doc.setTextColor(18, 161, 80); doc.text(txt(brl(x.recv)), M + 114, y + 4.4, { align: 'right' });
          doc.setTextColor(...TEXT); doc.text(txt(brl(x.open)), M + 140, y + 4.4, { align: 'right' });
          if (x.overdue) { doc.setFont('helvetica', 'bold'); doc.setTextColor(220, 38, 38); }
          doc.text(txt(brl(x.overdue)), M + 164, y + 4.4, { align: 'right' });
          doc.setFont('helvetica', 'bold'); doc.setTextColor(...(rate < 60 ? [220, 38, 38] : rate < 90 ? [217, 119, 6] : [18, 161, 80]));
          doc.text(`${Math.round(rate)}%`, W - M - 2, y + 4.4, { align: 'right' });
          y += 6.5;
        });
        doc.setDrawColor(...LINE); doc.line(M, y, W - M, y);
      }
      footer();
      doc.save(`relatorio-${r.from}-a-${r.to}-demo.pdf`);
      toast('PDF do relatório gerado');
    } catch (e) {
      toast('Não foi possível gerar o PDF. Use Imprimir → Salvar como PDF.', 'warn');
    } finally {
      btn.disabled = false;
    }
  }


  /* ---------------- Modais / formulários ---------------- */
  function clientModal(id) {
    const c = id ? client(id) : { type: 'PF', name: '', doc: '', phone: '', email: '', city: '', notes: '', tags: [] };
    openModal({
      title: id ? 'Editar cliente' : 'Novo cliente', form: 'client',
      body: `<input type="hidden" name="id" value="${id || ''}"><div class="form-grid">
        <div class="field"><label>Tipo</label><select class="select" name="type"><option value="PF" ${c.type === 'PF' ? 'selected' : ''}>Pessoa física</option><option value="PJ" ${c.type === 'PJ' ? 'selected' : ''}>Pessoa jurídica</option></select></div>
        <div class="field"><label>CPF / CNPJ</label><input class="input" name="doc" value="${esc(c.doc)}" placeholder="000.000.000-00"></div>
        <div class="field full"><label>Nome / razão social *</label><input class="input" name="name" value="${esc(c.name)}" required placeholder="Ex.: Maria Exemplo"></div>
        <div class="field"><label>WhatsApp *</label><input class="input" name="phone" value="${esc(c.phone)}" required placeholder="(11) 90000-0000"></div>
        <div class="field"><label>E-mail</label><input class="input" type="email" name="email" value="${esc(c.email)}" placeholder="cliente@exemplo.com.br"></div>
        <div class="field"><label>Cidade/UF</label><input class="input" name="city" value="${esc(c.city)}" placeholder="São Paulo/SP"></div>
        <div class="field"><label>Etiqueta</label><select class="select" name="tag"><option value="">Nenhuma</option><option ${c.tags.includes('VIP') ? 'selected' : ''}>VIP</option></select></div>
        <div class="field full"><label>Observações</label><textarea class="input" name="notes" rows="3">${esc(c.notes)}</textarea></div></div>
        <p class="muted" style="font-size:12px;margin:12px 0 0">Demonstração: os dados ficam somente neste navegador.</p>`,
      foot: `<button class="btn" type="button" data-action="close-modal">Cancelar</button><button class="btn primary" type="submit">${ic('check')} Salvar cliente</button>`
    });
  }
  function receivableModal(clientId = '') {
    openModal({
      title: 'Nova cobrança', form: 'receivable', wide: true,
      body: `<div class="form-grid">
        <div class="field full"><label>Cliente *</label><select class="select" name="client" required>${clientOptions(clientId)}</select></div>
        <div class="field full"><label>Descrição *</label><input class="input" name="description" required placeholder="Ex.: Projeto de site institucional"></div>
        <div class="field"><label>Valor total (R$) *</label><input class="input" name="total" type="number" min="1" step="0.01" required placeholder="0,00" data-action="rcv-preview"></div>
        <div class="field"><label>Número de parcelas</label><select class="select" name="parts" data-action="rcv-preview">${Array.from({ length: 12 }, (_, k) => `<option value="${k + 1}">${k + 1}x</option>`).join('')}</select></div>
        <div class="field"><label>1º vencimento</label><input class="input" type="date" name="first" value="${addDays(TODAY, 7)}" data-action="rcv-preview"></div>
        <div class="field"><label>Intervalo</label><select class="select" name="interval" data-action="rcv-preview"><option value="m">Mensal</option><option value="15">Quinzenal</option><option value="7">Semanal</option></select></div>
        <div class="field full"><label class="check"><input type="checkbox" name="notify" checked> Enviar aviso da nova cobrança por WhatsApp <span class="muted">(simulação)</span></label></div>
        <div class="field full"><label>Parcelas geradas</label><div class="preview-box" id="rcvPreview"><span class="muted">Informe o valor para visualizar as parcelas.</span></div></div></div>`,
      foot: `<button class="btn" type="button" data-action="close-modal">Cancelar</button><button class="btn primary" type="submit">${ic('check')} Criar cobrança</button>`
    });
  }
  function buildParts(form) {
    const total = parseFloat(form.total.value), parts = Number(form.parts.value), first = form.first.value || TODAY, iv = form.interval.value;
    if (!(total > 0)) return [];
    const base = Math.floor((total / parts) * 100) / 100;
    return Array.from({ length: parts }, (_, k) => ({
      n: k + 1, of: parts, amount: k === parts - 1 ? Math.round((total - base * (parts - 1)) * 100) / 100 : base,
      due: iv === 'm' ? addMonths(first, k) : addDays(first, k * Number(iv))
    }));
  }
  function paymentModal({ instId = '', clientId = '' } = {}) {
    const inst = instId ? byId(st.installments, instId) : null;
    const cid = inst ? inst.clientId : clientId;
    const opts = (c) => openInsts().filter((i) => !c || i.clientId === c).sort((a, b) => a.due.localeCompare(b.due))
      .map((i) => `<option value="${i.id}" ${i.id === instId ? 'selected' : ''}>${c ? '' : esc(client(i.clientId).name) + ' · '}${esc(instDesc(i))} ${instLabel(i)} · venc. ${fdate(i.due)} · ${brl(remaining(i))}</option>`).join('');
    openModal({
      title: 'Registrar pagamento', form: 'payment',
      body: `<div class="form-grid">
        <div class="field full"><label>Cliente</label><select class="select" name="client" data-action="pay-client">${clientOptions(cid, true).replace('Todos os clientes', 'Todos os clientes com parcelas em aberto')}</select></div>
        <div class="field full"><label>Parcela *</label><select class="select" name="inst" required data-action="pay-inst">${opts(cid) || '<option value="">Nenhuma parcela em aberto</option>'}</select></div>
        <div class="field"><label>Valor recebido (R$) *</label><input class="input" type="number" step="0.01" min="0.01" name="amount" required></div>
        <div class="field"><label>Data do pagamento</label><input class="input" type="date" name="date" value="${TODAY}" max="${TODAY}"></div>
        <div class="field"><label>Forma de pagamento</label><select class="select" name="method"><option>PIX</option><option>Boleto</option><option>Cartão de crédito</option><option>Transferência</option><option>Dinheiro</option></select></div>
        <div class="field"><label>Observação</label><input class="input" name="note" placeholder="Opcional"></div>
        <div class="field full" id="payHint"></div>
        <div class="field full"><label class="check"><input type="checkbox" name="confirm" ${st.rules.confirm ? 'checked' : ''}> Enviar confirmação de pagamento por WhatsApp <span class="muted">(simulação)</span></label></div></div>`,
      foot: `<button class="btn" type="button" data-action="close-modal">Cancelar</button><button class="btn success" type="submit">${ic('check')} Confirmar baixa</button>`
    });
    const form = $('#modalRoot form');
    form._opts = opts;
    payInstChanged(form);
  }
  function payInstChanged(form) {
    const i = byId(st.installments, form.inst.value);
    form.amount.value = i ? remaining(i).toFixed(2) : '';
    $('#payHint').innerHTML = i ? `<div class="callout tone-info">${ic('info')}<div>Valor da parcela: <b>${brl(i.amount)}</b>${i.paid ? ` · já pago: <b>${brl(i.paid)}</b>` : ''} · em aberto: <b>${brl(remaining(i))}</b>. Um valor menor registra pagamento parcial.</div></div>` : '';
  }
  function instDetailModal(id) {
    const i = byId(st.installments, id), c = client(i.clientId), r = receivable(i.receivableId), s = status(i);
    const pays = st.payments.filter((p) => p.installmentId === id);
    const msgs = st.messages.filter((m) => m.installmentId === id).sort((a, b) => b.at.localeCompare(a.at));
    openModal({
      title: `${esc(instDesc(i))} · ${instLabel(i)}`,
      body: `<div class="row mb">${badge(i)}${s === 'vencido' ? `<span class="text-danger fw">${lateDays(i)} dias em atraso</span>` : ''}</div>
        <dl class="kv"><dt>Cliente</dt><dd><a href="#/clientes/${c.id}" data-action="close-modal">${esc(c.name)}</a></dd><dt>Vencimento</dt><dd>${fdate(i.due)} (${rel(i.due)})</dd><dt>Valor</dt><dd>${brl(i.amount)}</dd><dt>Pago</dt><dd class="text-success">${brl(i.paid)}${i.paidAt ? ' em ' + fdate(i.paidAt) : ''}</dd><dt>Em aberto</dt><dd class="${s === 'vencido' ? 'text-danger' : ''}">${brl(remaining(i))}</dd><dt>Conta</dt><dd>${r.recurrenceId ? 'Cobrança recorrente mensal' : `${brl(r.total)} em ${r.installments}x · criada em ${fdate(r.createdAt)}`}</dd></dl>
        ${pays.length ? `<h4 class="mt" style="margin-bottom:6px">Pagamentos</h4><div class="preview-box"><table>${pays.map((p) => `<tr><td>${fdate(p.date)}</td><td>${p.method}</td><td style="text-align:right"><b>${brl(p.amount)}</b></td></tr>`).join('')}</table></div>` : ''}
        ${msgs.length ? `<h4 class="mt" style="margin-bottom:6px">Mensagens (simuladas)</h4><div class="preview-box"><table>${msgs.map((m) => `<tr><td>${fdatetime(m.at)}</td><td>${TEMPLATES[m.template].label}</td><td style="text-align:right">${ticks(m.status)}</td></tr>`).join('')}</table></div>` : ''}
        ${s !== 'pago' ? `<h4 class="mt" style="margin-bottom:6px">Renegociar vencimento</h4><div class="row"><input class="input" style="flex:1;min-width:150px" type="date" id="newDue" value="${i.due < TODAY ? addDays(TODAY, 7) : i.due}"><button class="btn" type="button" data-action="change-due" data-inst="${i.id}">${ic('calendar')} Alterar data</button></div>` : ''}`,
      foot: s !== 'pago' ? `<button class="btn wa" data-action="wa-send" data-inst="${i.id}" data-tpl="${s === 'vencido' ? 'atraso' : s === 'hoje' ? 'vencimento' : 'lembrete'}">${ic('chat')} Cobrar por WhatsApp</button><button class="btn success" data-action="new-payment" data-inst="${i.id}">${ic('check')} Registrar pagamento</button>` : `<button class="btn" data-action="receipt" data-inst="${i.id}">${ic('receipt')} Ver recibo</button>`
    });
  }
  function waModal(instId, tpl, clientId) {
    const inst = instId ? byId(st.installments, instId) : null;
    const c = client(inst ? inst.clientId : clientId);
    const text = fillTemplate(tpl, inst, c);
    openModal({
      title: 'Enviar WhatsApp <span class="badge plain tone-warning">simulação</span>', form: 'wa',
      body: `<input type="hidden" name="inst" value="${inst ? inst.id : ''}"><input type="hidden" name="client" value="${c.id}"><input type="hidden" name="tpl" value="${tpl}">
        <div class="who mb">${avatar(c)}<div><div class="cell-main">${esc(c.name)}</div><div class="cell-sub">${esc(c.phone)}</div></div></div>
        <div class="field"><label>Mensagem (${TEMPLATES[tpl].label})</label><textarea class="input" name="text" rows="8">${esc(text)}</textarea></div>
        <div class="callout tone-warning mt">${ic('info')}<div>Ambiente de demonstração: a mensagem é <b>apenas registrada no histórico</b>. Nenhum envio real é feito e não há integração com WhatsApp.</div></div>`,
      foot: `<button class="btn" type="button" data-action="close-modal">Cancelar</button><button class="btn wa" type="submit">${ic('send')} Enviar (simulação)</button>`
    });
  }
  function receiptModal({ payId, instId }) {
    const pays = payId ? [byId(st.payments, payId)] : st.payments.filter((p) => p.installmentId === instId);
    const p = pays[pays.length - 1];
    const i = byId(st.installments, p ? p.installmentId : instId), c = client(i.clientId);
    const total = pays.reduce((a, x) => a + x.amount, 0);
    openModal({
      title: 'Recibo de pagamento',
      body: `<div style="border:1px solid var(--border);border-radius:12px;padding:20px;position:relative;overflow:hidden">
        <div style="position:absolute;right:-40px;top:22px;transform:rotate(35deg);background:#fbbf24;color:#3b2300;font-size:11px;font-weight:800;padding:4px 50px;letter-spacing:.1em">DEMONSTRAÇÃO</div>
        <div class="row" style="margin-bottom:14px"><span class="brand-mark" style="width:32px;height:32px"><svg viewBox="0 0 24 24"><path d="M5 13l4 4 10-11"/></svg></span><div><b>${esc(st.company.name)}</b><div class="cell-sub">Recibo nº ${p ? p.id : '—'} · documento sem valor fiscal</div></div></div>
        <p>Recebemos de <b>${esc(c.name)}</b> (${esc(c.doc)}) a importância de <b>${brl(total)}</b>, referente a <b>${esc(instDesc(i))}</b> — parcela ${instLabel(i)} com vencimento em ${fdate(i.due)}.</p>
        <dl class="kv"><dt>Data</dt><dd>${p ? fdate(p.date) : '—'}</dd><dt>Forma</dt><dd>${p ? p.method : '—'}</dd><dt>Situação da parcela</dt><dd>${STATUS[status(i)].label}</dd></dl></div>`,
      foot: `<button class="btn" type="button" data-action="print">${ic('printer')} Imprimir</button><button class="btn wa" type="button" data-action="wa-send" data-inst="${i.id}" data-tpl="confirmacao">${ic('chat')} Enviar por WhatsApp</button>`
    });
  }
  function recurrenceModal() {
    openModal({
      title: 'Nova cobrança recorrente', form: 'recurrence',
      body: `<div class="form-grid">
        <div class="field full"><label>Cliente *</label><select class="select" name="client" required>${clientOptions('')}</select></div>
        <div class="field full"><label>Plano / serviço *</label><input class="input" name="description" required placeholder="Ex.: Mensalidade plano Profissional"></div>
        <div class="field"><label>Valor mensal (R$) *</label><input class="input" type="number" min="1" step="0.01" name="amount" required></div>
        <div class="field"><label>Dia do vencimento</label><select class="select" name="day">${[1, 5, 10, 15, 20, 25, 28].map((d) => `<option ${d === 10 ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
        <div class="field full"><label class="check"><input type="checkbox" name="genNow" checked> Gerar a primeira cobrança agora</label></div></div>`,
      foot: `<button class="btn" type="button" data-action="close-modal">Cancelar</button><button class="btn primary" type="submit">${ic('check')} Criar recorrência</button>`
    });
  }
  function confirmModal(title, text, action, data) {
    openModal({ title, body: `<p style="margin:0">${text}</p>`, foot: `<button class="btn" type="button" data-action="close-modal">Cancelar</button><button class="btn primary" type="button" data-action="${action}" ${Object.entries(data).map(([k, v]) => `data-${k}="${v}"`).join(' ')}>Confirmar</button>` });
  }

  /* ---------------- Submissões ---------------- */
  const submit = {
    client(form) {
      const d = Object.fromEntries(new FormData(form));
      if (!d.name.trim() || !d.phone.trim()) return toast('Preencha nome e WhatsApp.', 'warn');
      if (d.id) {
        Object.assign(client(d.id), { type: d.type, name: d.name.trim(), doc: d.doc, phone: d.phone, email: d.email, city: d.city, notes: d.notes, tags: d.tag ? [d.tag] : [] });
        toast('Cliente atualizado.');
      } else {
        const c = { id: newId('C'), type: d.type, name: d.name.trim(), doc: d.doc || '—', phone: d.phone, email: d.email, city: d.city || '—', notes: d.notes, tags: d.tag ? [d.tag] : [], createdAt: TODAY };
        st.clients.push(c);
        toast('Cliente cadastrado com sucesso.');
        save(); closeModal(); location.hash = `#/clientes/${c.id}`; return;
      }
      save(); closeModal(); render();
    },
    receivable(form) {
      const parts = buildParts(form);
      if (!form.client.value || !form.description.value.trim() || !parts.length) return toast('Preencha cliente, descrição e valor.', 'warn');
      const r = { id: newId('R'), clientId: form.client.value, description: form.description.value.trim(), total: parseFloat(form.total.value), installments: parts.length, createdAt: TODAY, category: 'Serviço', recurrenceId: null };
      st.receivables.push(r);
      const created = parts.map((p) => { const i = { id: newId('I'), receivableId: r.id, clientId: r.clientId, ...p, paid: 0, paidAt: null, method: null }; st.installments.push(i); return i; });
      if (form.notify.checked) sendWhatsApp({ clientId: r.clientId, installmentId: created[0].id, template: 'personalizado', text: `Olá, ${firstName(client(r.clientId))}! Registramos uma nova cobrança: *${r.description}* no valor de *${brl(r.total)}* em ${parts.length}x. Primeiro vencimento: ${fdate(parts[0].due)}.\nChave PIX: ${st.company.pix}` });
      save(); closeModal(); render();
      toast(`Cobrança criada: ${parts.length} parcela(s) de ${brl(parts[0].amount)}${form.notify.checked ? ' · aviso simulado enviado' : ''}.`);
    },
    payment(form) {
      const i = byId(st.installments, form.inst.value);
      const amount = Math.round(parseFloat(form.amount.value) * 100) / 100;
      if (!i || !(amount > 0)) return toast('Selecione a parcela e informe o valor.', 'warn');
      const value = Math.min(amount, remaining(i));
      const date = form.date.value || TODAY;
      st.payments.push({ id: newId('P'), installmentId: i.id, clientId: i.clientId, amount: value, date, method: form.elements.method.value, note: form.note.value });
      i.paid = Math.round((i.paid + value) * 100) / 100; i.method = form.elements.method.value;
      if (remaining(i) <= 0) i.paidAt = date;
      if (form.confirm.checked) sendWhatsApp({ clientId: i.clientId, installmentId: i.id, template: 'confirmacao', paid: value });
      save(); closeModal(); render();
      toast(`${remaining(i) <= 0 ? 'Baixa registrada' : 'Pagamento parcial registrado'}: ${brl(value)}${form.confirm.checked ? ' · confirmação simulada enviada' : ''}.`);
    },
    wa(form) {
      sendWhatsApp({ clientId: form.client.value, installmentId: form.inst.value || null, template: form.tpl.value, text: form.text.value });
      save(); closeModal(); render();
      toast(`Mensagem simulada para ${esc(client(form.client.value).name)}.`, 'wa');
    },
    'wa-compose'(form) {
      if (!form.text.value.trim()) return toast('Escreva a mensagem.', 'warn');
      sendWhatsApp({ clientId: ui.whatsapp.client, installmentId: form.inst.value || null, template: form.tpl.value, text: form.text.value });
      render(); toast('Mensagem simulada registrada.', 'wa');
    },
    recurrence(form) {
      const amount = parseFloat(form.amount.value);
      if (!form.client.value || !form.description.value.trim() || !(amount > 0)) return toast('Preencha cliente, plano e valor.', 'warn');
      const day = Number(form.day.value);
      let start = addMonths(TODAY, 0, day); if (start < TODAY) start = addMonths(TODAY, 1, day);
      const r = { id: newId('M'), clientId: form.client.value, description: form.description.value.trim(), amount, frequency: 'Mensal', day, startDate: start, active: true, lastGenerated: null };
      st.recurrences.push(r);
      if (form.genNow.checked) generateRecurrence(r);
      save(); closeModal(); render();
      toast(`Recorrência criada${form.genNow.checked ? ` · 1ª cobrança em ${fdate(r.lastGenerated)}` : ''}.`);
    }
  };

  /* ---------------- Ações ---------------- */
  const actions = {
    'close-modal': () => closeModal(),
    'open-menu': () => document.body.classList.add('menu-open'),
    'close-menu': () => document.body.classList.remove('menu-open'),
    'toggle-theme': () => {
      const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('recebe-facil-theme', next); } catch (e) { /* ignora */ }
    },
    'reset-demo': () => confirmModal('Restaurar dados da demonstração', 'Todas as alterações feitas nesta demonstração serão descartadas e os dados fictícios originais serão recarregados.', 'do-reset', {}),
    'do-reset': () => { st = generate(TODAY); save(); closeModal(); render(); toast('Dados da demonstração restaurados.'); },
    'new-client': () => clientModal(),
    'edit-client': (el) => clientModal(el.dataset.client),
    'new-receivable': (el) => receivableModal(el.dataset.client || ''),
    'new-payment': (el) => paymentModal({ instId: el.dataset.inst || '', clientId: el.dataset.client || '' }),
    'new-recurrence': () => recurrenceModal(),
    'inst-detail': (el) => instDetailModal(el.dataset.inst),
    'wa-send': (el) => waModal(el.dataset.inst, el.dataset.tpl || 'lembrete'),
    'wa-client': (el) => {
      const insts = openInsts().filter((i) => i.clientId === el.dataset.client).sort((a, b) => a.due.localeCompare(b.due));
      const i = insts[0];
      if (!i) return waModal(null, 'personalizado', el.dataset.client);
      waModal(i.id, status(i) === 'vencido' ? 'atraso' : status(i) === 'hoje' ? 'vencimento' : 'lembrete');
    },
    'wa-open': (el) => { ui.whatsapp.client = el.dataset.client; render(); },
    receipt: (el) => receiptModal({ payId: el.dataset.pay, instId: el.dataset.inst }),
    print: () => window.print(),
    'export-pdf': (el) => exportReportPDF(el),
    page: (el) => { ui[el.dataset.key].page = Number(el.dataset.to); refreshList(); $('#view').scrollIntoView({ block: 'start' }); },
    chip: (el) => { const [p, k] = el.dataset.key.split('.'); ui[p][k] = el.dataset.val; ui[p].page = 1; render(); },
    'client-tab': (el) => { ui.cliente.tab = el.dataset.tab; render(); },
    'change-due': (el) => {
      const i = byId(st.installments, el.dataset.inst); const v = $('#newDue').value;
      if (!v) return;
      i.due = v; save(); closeModal(); render(); toast(`Vencimento alterado para ${fdate(v)}.`);
    },
    'reverse-payment': (el) => confirmModal('Estornar pagamento', 'O valor voltará a ficar em aberto na parcela correspondente. Deseja continuar?', 'do-reverse', { pay: el.dataset.pay }),
    'do-reverse': (el) => {
      const p = byId(st.payments, el.dataset.pay); const i = byId(st.installments, p.installmentId);
      st.payments = st.payments.filter((x) => x.id !== p.id);
      if (i) { i.paid = Math.max(0, Math.round((i.paid - p.amount) * 100) / 100); i.paidAt = null; }
      save(); closeModal(); render(); toast('Pagamento estornado.');
    },
    'wa-batch': (el) => {
      const g = alertGroups().find((x) => x.key === el.dataset.group);
      confirmModal('Cobrança em lote (simulação)', `Serão registradas <b>${g.items.length}</b> mensagens simuladas para os clientes do grupo “${g.title}”. Nenhuma mensagem real será enviada.`, 'do-batch', { group: g.key });
    },
    'do-batch': (el) => {
      const g = alertGroups().find((x) => x.key === el.dataset.group);
      g.items.forEach((i) => sendWhatsApp({ clientId: i.clientId, installmentId: i.id, template: g.tpl, auto: true }));
      save(); closeModal(); render(); toast(`${g.items.length} cobranças simuladas registradas.`, 'wa');
    },
    'run-rules': () => {
      const r = st.rules; let n = 0;
      openInsts().forEach((i) => {
        const d = diffDays(i.due, TODAY); // >0 futuro, <0 atraso
        let tpl = null;
        if (r.before3 && d > 0 && d <= 3) tpl = 'lembrete';
        else if (r.onDue && d === 0) tpl = 'vencimento';
        else if (r.after1 && d <= -1 && d > -7) tpl = 'atraso';
        else if (r.after7 && d <= -7 && d > -15) tpl = 'atraso';
        else if (r.after15 && d <= -15) tpl = 'atraso';
        if (!tpl) return;
        if (st.messages.some((m) => m.installmentId === i.id && m.template === tpl && diffDays(TODAY, m.at.slice(0, 10)) < 3)) return;
        sendWhatsApp({ clientId: i.clientId, installmentId: i.id, template: tpl, auto: true }); n++;
      });
      save(); render();
      toast(n ? `Régua executada: ${n} mensagens simuladas.` : 'Régua executada: nenhuma parcela pendente de aviso hoje.', n ? 'wa' : 'ok');
    },
    'gen-recurrences': () => {
      const list = st.recurrences.filter((r) => r.active && nextRecDue(r) <= addDays(TODAY, 30));
      list.forEach(generateRecurrence); save(); render(); toast(`${list.length} cobranças recorrentes geradas.`);
    },
    'gen-one': (el) => { const r = byId(st.recurrences, el.dataset.rec); const due = generateRecurrence(r); save(); render(); toast(`Cobrança gerada com vencimento em ${fdate(due)}.`); },
    'export-clients': () => downloadCSV('clientes-demo.csv', [['Nome', 'Tipo', 'Documento', 'Telefone', 'E-mail', 'Cidade', 'Em aberto', 'Vencido', 'Situação'], ...st.clients.map((c) => { const s = clientSummary(c); return [c.name, c.type, c.doc, c.phone, c.email, c.city, s.open.toFixed(2).replace('.', ','), s.overdue.toFixed(2).replace('.', ','), CSTATUS[s.status].label]; })]),
    'export-insts': () => downloadCSV('contas-a-receber-demo.csv', [['Cliente', 'Descrição', 'Parcela', 'Vencimento', 'Valor', 'Pago', 'Em aberto', 'Situação'], ...contasFilter(false).map((i) => [client(i.clientId).name, instDesc(i), instLabel(i), fdate(i.due), i.amount.toFixed(2).replace('.', ','), i.paid.toFixed(2).replace('.', ','), remaining(i).toFixed(2).replace('.', ','), STATUS[status(i)].label])]),
    'export-pays': () => downloadCSV('pagamentos-demo.csv', [['Data', 'Cliente', 'Referência', 'Forma', 'Valor'], ...payFilter().map((p) => { const i = byId(st.installments, p.installmentId); return [fdate(p.date), client(p.clientId).name, i ? instDesc(i) + ' ' + instLabel(i) : '', p.method, p.amount.toFixed(2).replace('.', ',')]; })]),
    'export-report': () => { if (!reportCache) return; downloadCSV(`relatorio-${reportCache.from}-a-${reportCache.to}-demo.csv`, [['Cliente', 'Faturado', 'Recebido', 'Em aberto', 'Vencido'], ...reportCache.byClient.map((x) => [x.c.name, ...[x.billed, x.recv, x.open, x.overdue].map((v) => v.toFixed(2).replace('.', ','))])]); }
  };
  const changeActions = {
    'toggle-rec': (el) => { const r = byId(st.recurrences, el.dataset.rec); r.active = el.checked; save(); render(); toast(r.active ? 'Recorrência reativada.' : 'Recorrência pausada.'); },
    'toggle-rule': (el) => { st.rules[el.dataset.rule] = el.checked; save(); toast(`Regra ${el.checked ? 'ativada' : 'desativada'} (simulação).`); },
    'wa-pick': (el) => { if (el.value) { ui.whatsapp.client = el.value; render(); } },
    'wa-compose-change': (el) => waComposeFill(el.form),
    'rcv-preview': (el) => {
      const parts = buildParts(el.form);
      $('#rcvPreview').innerHTML = parts.length ? `<table>${parts.map((p) => `<tr><td>Parcela ${p.n}/${p.of}</td><td>${fdate(p.due)}</td><td style="text-align:right"><b>${brl(p.amount)}</b></td></tr>`).join('')}</table>` : '<span class="muted">Informe o valor para visualizar as parcelas.</span>';
    },
    'pay-client': (el) => { const f = el.form; f.inst.innerHTML = f._opts(el.value) || '<option value="">Nenhuma parcela em aberto</option>'; payInstChanged(f); },
    'pay-inst': (el) => payInstChanged(el.form)
  };

  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-overlay]')) return closeModal();
    const a = e.target.closest('[data-action]');
    if (a && actions[a.dataset.action] && !(a.tagName === 'INPUT' || a.tagName === 'SELECT')) {
      if (a.tagName !== 'A' || a.dataset.action !== 'close-modal') e.preventDefault();
      if (a.dataset.action === 'close-modal' && a.tagName === 'A') { closeModal(); return; }
      e.stopPropagation();
      actions[a.dataset.action](a, e);
      return;
    }
    const sc = e.target.closest('[data-scroll]');
    if (sc) { e.preventDefault(); const t = document.getElementById(sc.dataset.scroll); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const gf = e.target.closest('[data-goto-filter]');
    if (gf) { const [p, kv] = gf.dataset.gotoFilter.split(':'); const [k, v] = kv.split('='); Object.assign(ui[p], { [k]: v, page: 1, period: 'todos', client: '', q: '' }); }
    const row = e.target.closest('tr[data-href]');
    if (row && !e.target.closest('a,button')) location.hash = row.dataset.href;
    if (e.target.closest('.nav a')) document.body.classList.remove('menu-open');
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.action && changeActions[el.dataset.action]) return changeActions[el.dataset.action](el);
    if (el.dataset.filter && el.tagName === 'SELECT' || (el.dataset.filter && el.type === 'date')) setFilter(el);
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.filter && el.type === 'search') setFilter(el);
    if (el.dataset.action === 'rcv-preview') changeActions['rcv-preview'](el);
  });
  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (f.id === 'globalSearch') {
      e.preventDefault();
      ui.clientes.q = $('#globalSearchInput').value; ui.clientes.page = 1; ui.clientes.status = 'todos';
      if (location.hash === '#/clientes') render(); else location.hash = '#/clientes';
      return;
    }
    if (f.dataset.submit && submit[f.dataset.submit]) { e.preventDefault(); submit[f.dataset.submit](f); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); document.body.classList.remove('menu-open'); } });
  $('#globalSearchInput').addEventListener('input', (e) => {
    ui.clientes.q = e.target.value; ui.clientes.page = 1;
    if (currentRoute === 'clientes') { const inp = $('[data-filter="clientes.q"]'); if (inp) inp.value = e.target.value; refreshList(); }
  });

  function setFilter(el) {
    const [p, k] = el.dataset.filter.split('.');
    ui[p][k] = el.value; if ('page' in ui[p]) ui[p].page = 1;
    // selects de status/contagem dependem de outros filtros: re-renderiza a página; busca textual só a lista
    if (el.type === 'search') refreshList(); else render();
  }

  /* ---------------- Roteador ---------------- */
  let currentRoute = 'dashboard';
  function parse() {
    const parts = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/');
    if (parts[0] === 'clientes' && parts[1]) return ['cliente', parts[1]];
    return [pages[parts[0]] ? parts[0] : 'dashboard', null];
  }
  function refreshList() {
    const p = pages[currentRoute];
    const area = $('#listArea');
    if (p && p.list && area) area.innerHTML = p.list();
  }
  let lastClient = null;
  function render() {
    const [route, arg] = parse();
    if (route === 'cliente' && arg !== lastClient) { ui.cliente.tab = 'parcelas'; lastClient = arg; }
    const scroll = route === currentRoute ? window.scrollY : 0;
    currentRoute = route;
    renderNav(route);
    const view = $('#view');
    // preserva o foco em campos de busca durante re-render
    const active = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.filter : null;
    view.innerHTML = pages[route](arg);
    refreshList();
    if (route === 'whatsapp') { const f = $('form[data-submit="wa-compose"]'); if (f) waComposeFill(f); const ch = $('#phoneChat'); if (ch) ch.scrollTop = ch.scrollHeight; }
    if (active) { const el = $(`[data-filter="${active}"]`); if (el && el.type === 'search') { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
    window.scrollTo(0, scroll);
    document.title = `${(NAV.find((n) => n.id === (route === 'cliente' ? 'clientes' : route)) || {}).label || 'Dashboard'} · Recebe Fácil (Demonstração)`;
  }
  window.addEventListener('hashchange', () => { closeModal(); render(); });

  try { const t = localStorage.getItem('recebe-facil-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* ignora */ }
  save();
  render();
})();
