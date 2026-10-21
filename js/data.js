/* Recebe Fácil — gerador de dados FICTÍCIOS para demonstração.
 * Nenhum dado aqui corresponde a pessoas ou empresas reais.
 * As datas são geradas em relação ao dia atual para a demo parecer sempre "viva". */
(function () {
  'use strict';

  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function addDays(isoDate, days) {
    const [y, m, d] = isoDate.split('-').map(Number);
    return iso(new Date(y, m - 1, d + days));
  }
  function addMonths(isoDate, months, day) {
    const [y, m, d] = isoDate.split('-').map(Number);
    const target = new Date(y, m - 1 + months, 1);
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day || d, last));
    return iso(target);
  }

  const PEOPLE = [
    'Ana Beatriz Moura', 'Bruno Carvalho Lima', 'Camila Duarte Rocha', 'Diego Fernandes Prado', 'Eduarda Nogueira',
    'Felipe Antunes Reis', 'Gabriela Teixeira', 'Henrique Batista Couto', 'Isabela Marques Pinto', 'João Pedro Vasconcelos',
    'Larissa Monteiro', 'Marcelo Siqueira', 'Natália Ribeiro Dias', 'Otávio Lacerda', 'Patrícia Gouveia',
    'Rafael Quintela', 'Sabrina Toledo', 'Thiago Amaral Neves'
  ];
  const COMPANIES = [
    'Padaria Grão Dourado Ltda', 'Studio Equilíbrio Pilates', 'Auto Peças Rota Sul', 'Clínica Sorriso Pleno',
    'Mercadinho Vila Nova', 'Escola de Idiomas Horizonte', 'Pet Shop Patas Felizes', 'Construtora Alicerce Forte',
    'Academia Movimento Total', 'Gráfica Ponto Final', 'Restaurante Sabor da Serra', 'Ótica Visão Clara'
  ];
  const CITIES = ['São Paulo/SP', 'Campinas/SP', 'Curitiba/PR', 'Belo Horizonte/MG', 'Porto Alegre/RS', 'Goiânia/GO', 'Recife/PE', 'Florianópolis/SC'];
  const SERVICES = [
    ['Consultoria financeira', 1800, 6200], ['Desenvolvimento de site', 2400, 9000], ['Manutenção de equipamentos', 450, 2200],
    ['Treinamento de equipe', 1200, 4800], ['Projeto de identidade visual', 1500, 5200], ['Licença de software anual', 2600, 7800],
    ['Reforma comercial', 6000, 18000], ['Gestão de redes sociais (pacote)', 900, 3000], ['Venda de mercadorias', 600, 4200]
  ];
  const RECURRING = [
    ['Mensalidade plano Essencial', 189.9], ['Mensalidade plano Profissional', 349.9], ['Honorários contábeis', 780],
    ['Suporte técnico mensal', 520], ['Aluguel de equipamento', 410], ['Assinatura plano Premium', 649]
  ];
  const METHODS = ['PIX', 'PIX', 'PIX', 'Boleto', 'Boleto', 'Cartão de crédito', 'Transferência', 'Dinheiro'];

  function slugEmail(name) {
    return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/ltda|\bde\b|\bda\b/g, '').trim().split(/\s+/).slice(0, 2).join('.') + '@exemplo.com.br';
  }

  function generate(todayIso) {
    const r = rng(20261021);
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const int = (a, b) => Math.floor(a + r() * (b - a + 1));
    const money = (a, b) => Math.round((a + r() * (b - a)) / 10) * 10;
    const digits = (n) => Array.from({ length: n }, () => int(0, 9)).join('');

    const clients = [], receivables = [], installments = [], recurrences = [], payments = [], messages = [];
    let seq = 1;
    const id = (p) => `${p}${String(seq++).padStart(4, '0')}`;

    const names = [...PEOPLE.map((n) => ['PF', n]), ...COMPANIES.map((n) => ['PJ', n])];
    // embaralha de forma determinística
    for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }

    // perfis de pagamento: maioria em dia, alguns atrasam, poucos inadimplentes
    const profiles = names.map((_, i) => (i % 10 === 3 || i % 10 === 7 ? 'atrasa' : i % 10 === 5 ? 'inadimplente' : 'pontual'));

    names.forEach(([type, name], idx) => {
      const c = {
        id: id('C'), type, name,
        doc: type === 'PF' ? `${digits(3)}.${digits(3)}.${digits(3)}-${digits(2)}` : `${digits(2)}.${digits(3)}.${digits(3)}/0001-${digits(2)}`,
        phone: `(${pick(['11', '19', '41', '31', '51', '62', '81', '48'])}) 9${digits(4)}-${digits(4)}`,
        email: slugEmail(name),
        city: pick(CITIES),
        createdAt: addDays(todayIso, -int(120, 540)),
        notes: '',
        tags: []
      };
      const profile = profiles[idx];
      if (profile === 'pontual' && r() < 0.3) c.tags.push('VIP');
      if (type === 'PJ') c.contact = pick(['Responsável financeiro', 'Sócio-administrador', 'Gerente']);
      clients.push(c);

      const settle = (inst) => {
        if (inst.due > todayIso) {
          // alguns pagam antecipado
          if (profile === 'pontual' && addDays(todayIso, 5) >= inst.due && r() < 0.25) {
            payFull(inst, addDays(todayIso, -int(0, 2)));
          }
          return;
        }
        const daysLate = Math.round((Date.parse(todayIso) - Date.parse(inst.due)) / 864e5);
        let chance = profile === 'pontual' ? 0.96 : profile === 'atrasa' ? 0.75 : 0.25;
        if (profile === 'inadimplente' && daysLate < 70) chance = 0.05;
        if (daysLate <= 3) chance *= 0.8;
        if (r() < chance) {
          const lag = profile === 'pontual' ? int(-3, 1) : int(0, 18);
          let paidAt = addDays(inst.due, lag);
          if (paidAt > todayIso) paidAt = todayIso;
          if (profile === 'atrasa' && r() < 0.12) {
            // pagamento parcial
            addPayment(inst, Math.round(inst.amount * 0.5 * 100) / 100, paidAt);
          } else payFull(inst, paidAt);
        }
      };
      const addPayment = (inst, value, date) => {
        const method = pick(METHODS);
        inst.paid = Math.round((inst.paid + value) * 100) / 100;
        inst.method = method;
        if (inst.paid >= inst.amount) inst.paidAt = date;
        payments.push({ id: id('P'), installmentId: inst.id, clientId: c.id, amount: value, date, method, note: '' });
      };
      const payFull = (inst, date) => addPayment(inst, inst.amount, date);

      // contas parceladas
      const nRec = int(1, 2);
      for (let k = 0; k < nRec; k++) {
        const [desc, a, b] = pick(SERVICES);
        const total = money(a, b);
        const parts = pick([1, 2, 3, 3, 4, 5, 6]);
        const start = addDays(todayIso, -int(10, 170));
        const rec = { id: id('R'), clientId: c.id, description: desc, total, installments: parts, createdAt: addDays(start, -int(3, 15)), category: 'Serviço', recurrenceId: null };
        receivables.push(rec);
        const base = Math.floor((total / parts) * 100) / 100;
        for (let n = 1; n <= parts; n++) {
          const amount = n === parts ? Math.round((total - base * (parts - 1)) * 100) / 100 : base;
          const inst = { id: id('I'), receivableId: rec.id, clientId: c.id, n, of: parts, amount, due: addMonths(start, n - 1), paid: 0, paidAt: null, method: null };
          installments.push(inst);
          settle(inst);
        }
      }

      // cobranças recorrentes
      if (r() < 0.55) {
        const [desc, amount] = pick(RECURRING);
        const day = pick([5, 10, 15, 20, 25]);
        const months = int(3, 6);
        const first = addMonths(todayIso, -months, day);
        const rc = { id: id('M'), clientId: c.id, description: desc, amount, frequency: 'Mensal', day, startDate: first, active: profile !== 'inadimplente' || r() < 0.5, lastGenerated: null };
        recurrences.push(rc);
        const rec = { id: id('R'), clientId: c.id, description: desc, total: amount, installments: 1, createdAt: first, category: 'Recorrente', recurrenceId: rc.id };
        receivables.push(rec);
        for (let m = 0; m <= months + 1; m++) {
          const due = addMonths(first, m, day);
          if (due > addDays(todayIso, 35)) break;
          const inst = { id: id('I'), receivableId: rec.id, clientId: c.id, n: m + 1, of: null, amount, due, paid: 0, paidAt: null, method: null, recurrenceId: rc.id };
          installments.push(inst);
          rc.lastGenerated = due;
          settle(inst);
        }
      }
    });

    // histórico simulado de mensagens
    installments.forEach((inst) => {
      const late = inst.due < todayIso && inst.paid < inst.amount;
      if (late && r() < 0.6) {
        messages.push({ id: id('W'), clientId: inst.clientId, installmentId: inst.id, template: 'atraso', at: [addDays(inst.due, int(1, 5)), todayIso].sort()[0] + 'T09:' + pad(int(0, 59)), status: 'lido', auto: true, text: null });
      }
      if (inst.paidAt && r() < 0.35) {
        messages.push({ id: id('W'), clientId: inst.clientId, installmentId: inst.id, template: 'confirmacao', at: inst.paidAt + 'T14:' + pad(int(0, 59)), status: 'lido', auto: true, text: null });
      }
      if (!inst.paidAt && inst.due >= todayIso && inst.due <= addDays(todayIso, 3) && r() < 0.5) {
        messages.push({ id: id('W'), clientId: inst.clientId, installmentId: inst.id, template: 'lembrete', at: addDays(todayIso, -1) + 'T10:' + pad(int(0, 59)), status: 'entregue', auto: true, text: null });
      }
    });

    return {
      version: 1, generatedFor: todayIso, seq,
      clients, receivables, installments, recurrences, payments, messages,
      rules: { before3: true, onDue: true, after1: true, after7: true, after15: false, confirm: true },
      company: { name: 'Empresa Exemplo', pix: 'financeiro@empresaexemplo.demo' }
    };
  }

  window.DemoData = { generate, iso, addDays, addMonths };
})();
