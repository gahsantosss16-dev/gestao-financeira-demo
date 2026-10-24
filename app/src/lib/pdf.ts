// Documentos PDF com a identidade da ASSOCIAPEC (relatórios, demonstrativos e
// comprovantes). jsPDF é carregado sob demanda para não pesar a abertura do app.
// A logomarca oficial é lida de public/brand/ (arquivos originais da associação).
import type { jsPDF as JsPDF } from 'jspdf';
import { formatDocument } from './documents';
import { brl, fdate, fdatetime } from './format';

export const BRAND = {
  name: 'ASSOCIAPEC',
  fullName: 'Associação de Pecuaristas de Fazendas Certificadas',
  // cores da logomarca oficial
  green: [0, 152, 52] as [number, number, number],
  dark: [0, 48, 52] as [number, number, number],
  muted: [100, 107, 99] as [number, number, number],
  line: [222, 226, 214] as [number, number, number],
  // marca completa com fundo transparente (originais em public/brand/)
  logoPath: 'brand/associapec-logo-web.png',
};

let logoCache: Promise<string | null> | null = null;
/** Logo oficial em data URL, ou null se o arquivo ainda não foi publicado. */
export function loadBrandLogo(): Promise<string | null> {
  logoCache ??= (async () => {
    try {
      if (typeof document === 'undefined') return null;
      const res = await fetch(new URL(BRAND.logoPath, document.baseURI).toString());
      if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return null;
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  })();
  return logoCache;
}

export interface DocContext {
  doc: JsPDF;
  y: number;
  readonly width: number;
  readonly margin: number;
  section(title: string): void;
  row(label: string, value: string): void;
  text(value: string, opts?: { bold?: boolean; size?: number; color?: [number, number, number] }): void;
  ensure(height: number): void;
}

/** Cria um documento A4 com cabeçalho e rodapé institucionais. */
export async function createBrandedDoc(title: string, subtitle: string, opts: { logo?: string | null; issuerCnpj?: string | null; generatedBy?: string } = {}): Promise<DocContext> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 16;
  const logo = opts.logo === undefined ? await loadBrandLogo() : opts.logo;

  doc.setFillColor(...BRAND.green);
  doc.rect(0, 0, width, 3, 'F');
  let textX = margin;
  if (logo) {
    // logomarca oficial preservando a proporção do arquivo (caixa máx. 36 × 20 mm)
    const props = doc.getImageProperties(logo);
    const ratio = props.width / props.height;
    const w = Math.min(36, 20 * ratio);
    const h = w / ratio;
    doc.addImage(logo, margin, 6 + (20 - h) / 2, w, h);
    textX = margin + w + 5;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...BRAND.dark);
  doc.text(BRAND.name, textX, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND.muted);
  doc.text(BRAND.fullName, textX, 19);
  if (opts.issuerCnpj) doc.text(`CNPJ ${formatDocument(opts.issuerCnpj)}`, textX, 23.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(...BRAND.dark);
  doc.text(title, width - margin, 14, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.muted);
  doc.text(subtitle, width - margin, 19.5, { align: 'right' });
  doc.setDrawColor(...BRAND.line);
  doc.setLineWidth(0.4);
  doc.line(margin, 29, width - margin, 29);

  const footer = () => {
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND.muted);
    doc.text(`Gerado em ${fdatetime(new Date().toISOString())}${opts.generatedBy ? ` por ${opts.generatedBy}` : ''} · Financeiro ASSOCIAPEC`, margin, height - 8);
    doc.text(`Página ${doc.getCurrentPageInfo().pageNumber}`, width - margin, height - 8, { align: 'right' });
  };

  const ctx: DocContext = {
    doc, y: 38, width, margin,
    ensure(h) {
      if (ctx.y + h > height - 16) { footer(); doc.addPage(); ctx.y = 18; }
    },
    section(t) {
      ctx.ensure(14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...BRAND.green);
      doc.text(t.toUpperCase(), margin, ctx.y);
      ctx.y += 2;
      doc.setDrawColor(...BRAND.line);
      doc.line(margin, ctx.y, width - margin, ctx.y);
      ctx.y += 6;
    },
    row(label, value) {
      ctx.ensure(7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...BRAND.muted);
      doc.text(label, margin, ctx.y);
      doc.setTextColor(23, 32, 27);
      const lines = doc.splitTextToSize(value || '—', width - margin * 2 - 48);
      doc.text(lines, margin + 48, ctx.y);
      ctx.y += Math.max(6, lines.length * 4.6);
    },
    text(value, o = {}) {
      doc.setFont('helvetica', o.bold ? 'bold' : 'normal');
      doc.setFontSize(o.size ?? 9.5);
      doc.setTextColor(...(o.color ?? [23, 32, 27]));
      const lines = doc.splitTextToSize(value, width - margin * 2);
      ctx.ensure(lines.length * 4.8);
      doc.text(lines, margin, ctx.y);
      ctx.y += lines.length * 4.8 + 1.5;
    },
  };
  // o rodapé da última página é aplicado por finalize()
  (ctx as DocContext & { finalize?: () => void }).finalize = footer;
  return ctx;
}

export function finalizeDoc(ctx: DocContext) {
  (ctx as DocContext & { finalize?: () => void }).finalize?.();
  return ctx.doc;
}

export interface ChargeStatementData {
  code: string;
  statusLabel: string;
  description: string;
  dueDate: string;
  amount: number;
  paid: number;
  open: number;
  notes: string | null;
  client: { name: string; document: string | null; ie: string | null; address: string | null; email: string | null };
  payments: { paid_at: string; amount: number; method: string }[];
  issuerCnpj?: string | null;
  generatedBy?: string;
}

/** Demonstrativo de cobrança — documento informativo, NÃO é boleto nem documento fiscal. */
export async function buildChargeStatement(data: ChargeStatementData, logo?: string | null) {
  const ctx = await createBrandedDoc('DEMONSTRATIVO DE COBRANÇA', data.code, { logo, issuerCnpj: data.issuerCnpj, generatedBy: data.generatedBy });
  ctx.section('Cliente');
  ctx.row('Nome / razão social', data.client.name);
  ctx.row('CPF / CNPJ', data.client.document ? formatDocument(data.client.document) : '—');
  if (data.client.ie) ctx.row('Inscrição estadual', data.client.ie);
  if (data.client.address) ctx.row('Endereço', data.client.address);
  if (data.client.email) ctx.row('E-mail', data.client.email);
  ctx.section('Cobrança');
  ctx.row('Identificação', data.code);
  ctx.row('Descrição', data.description);
  ctx.row('Vencimento', fdate(data.dueDate));
  ctx.row('Valor', brl(data.amount));
  ctx.row('Valor pago', brl(data.paid));
  ctx.row('Saldo em aberto', brl(data.open));
  ctx.row('Situação', data.statusLabel);
  if (data.notes) ctx.row('Observações', data.notes);
  if (data.payments.length) {
    ctx.section('Pagamentos registrados');
    for (const p of data.payments) ctx.row(fdate(p.paid_at), `${brl(p.amount)} — ${p.method}`);
  }
  ctx.y += 4;
  ctx.text('Documento informativo emitido pelo sistema financeiro da ASSOCIAPEC. Não é boleto bancário, não possui código de barras ou Pix e não é documento fiscal. Em caso de dúvidas, entre em contato com a associação.', { size: 8.5, color: BRAND.muted });
  return finalizeDoc(ctx);
}

/** Salva o PDF pelo navegador. */
export function downloadPdf(doc: JsPDF, fileName: string) {
  doc.save(fileName);
}
