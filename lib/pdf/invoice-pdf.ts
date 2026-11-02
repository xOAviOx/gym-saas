import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';

import { amountInWords } from '@/lib/amount-in-words';
import { copy } from '@/lib/copy';
import { formatDate, type DateOnly } from '@/lib/dates';
import { formatNumber, type Paise } from '@/lib/money';
import { qrModules } from '@/lib/qr';

export type InvoiceDocument = {
  org: {
    name: string;
    addressLines: string[];
    phone: string | null;
    email: string | null;
    gstin: string | null;
    state: string | null;
  };
  invoice: {
    number: string;
    issueDate: DateOnly;
    dueDate: DateOnly;
    status: 'unpaid' | 'partially_paid' | 'paid' | 'void';
    voidReason: string | null;
    subtotal: Paise;
    discount: Paise;
    taxable: Paise;
    cgst: Paise;
    sgst: Paise;
    total: Paise;
    gstRate: number;
    amountPaid: Paise;
    balanceDue: Paise;
  };
  member: { name: string; code: string; phone: string | null };
  items: { description: string; sac: string; amount: Paise }[];
  payments: {
    paidAt: string;
    method: string;
    reference: string | null;
    amount: Paise;
    isReversal: boolean;
  }[];
  /** A UPI deep link for the open balance, drawn as a QR code. */
  upiUri: string | null;
};

const PAGE = { width: 595.28, height: 841.89, margin: 48 };
const INK = rgb(0.094, 0.094, 0.106);
const MUTED = rgb(0.443, 0.443, 0.478);
const RULE = rgb(0.894, 0.894, 0.906);
const BRAND = rgb(0.016, 0.471, 0.341);
const DANGER = rgb(0.725, 0.11, 0.11);

// Characters outside WinAnsi (the encoding of the built-in PDF fonts) cannot be drawn.
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

/** Text that the built-in Helvetica can render; unsupported scripts are dropped. */
export function pdfText(value: string, fallback = ''): string {
  let out = '';
  for (const char of value.normalize('NFC').replace(/₹/g, 'Rs.').replace(/→/g, '->')) {
    const code = char.codePointAt(0)!;
    if (
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0xa0 && code <= 0xff) ||
      WIN_ANSI_EXTRA.has(char)
    ) {
      out += char;
    } else if (/\s/.test(char)) {
      out += ' ';
    }
  }
  const cleaned = out.replace(/\s+/g, ' ').trim();
  return cleaned || fallback;
}

const decimals = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function pdfMoney(paise: Paise): string {
  const value = copy.pdf.currency(decimals.format(Math.abs(Math.round(paise)) / 100));
  return paise < 0 ? `-${value}` : value;
}

type Fonts = { regular: PDFFont; bold: PDFFont };

class Writer {
  page: PDFPage;
  y: number;

  constructor(
    private readonly pdf: PDFDocument,
    readonly fonts: Fonts,
  ) {
    this.page = pdf.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
  }

  get right() {
    return PAGE.width - PAGE.margin;
  }

  ensure(height: number) {
    if (this.y - height < PAGE.margin + 24) {
      this.page = this.pdf.addPage([PAGE.width, PAGE.height]);
      this.y = PAGE.height - PAGE.margin;
    }
  }

  text(
    value: string,
    x: number,
    options: {
      size?: number;
      bold?: boolean;
      color?: RGB;
      align?: 'left' | 'right';
      y?: number;
    } = {},
  ) {
    const size = options.size ?? 10;
    const font = options.bold ? this.fonts.bold : this.fonts.regular;
    const safe = pdfText(value);
    const width = font.widthOfTextAtSize(safe, size);
    this.page.drawText(safe, {
      x: options.align === 'right' ? x - width : x,
      y: options.y ?? this.y,
      size,
      font,
      color: options.color ?? INK,
    });
  }

  wrap(value: string, maxWidth: number, size = 10, bold = false): string[] {
    const font = bold ? this.fonts.bold : this.fonts.regular;
    const words = pdfText(value).split(' ');
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) {
        line = next;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  rule(gap = 10) {
    this.page.drawLine({
      start: { x: PAGE.margin, y: this.y },
      end: { x: this.right, y: this.y },
      thickness: 0.75,
      color: RULE,
    });
    this.y -= gap;
  }
}

function drawQr(writer: Writer, data: string, x: number, top: number, size: number) {
  const { size: modules, isDark } = qrModules(data);
  const cell = size / (modules + 2);
  writer.page.drawRectangle({ x, y: top - size, width: size, height: size, color: rgb(1, 1, 1) });
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (!isDark(row, col)) continue;
      writer.page.drawRectangle({
        x: x + (col + 1) * cell,
        y: top - (row + 2) * cell,
        width: cell,
        height: cell,
        color: INK,
      });
    }
  }
}

/** One A4 document per invoice: a GST Tax Invoice or a plain Receipt, with payments to date. */
export async function buildInvoicePdf(doc: InvoiceDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const isTaxInvoice = doc.invoice.gstRate > 0;
  const title = isTaxInvoice ? copy.pdf.taxInvoice : copy.pdf.receipt;
  pdf.setTitle(`${title} ${pdfText(doc.invoice.number)}`);
  pdf.setAuthor(pdfText(doc.org.name, 'GymDesk'));
  pdf.setProducer('GymDesk');
  pdf.setCreator('GymDesk');

  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const w = new Writer(pdf, fonts);
  const left = PAGE.margin;
  const halfWidth = (w.right - left) / 2 - 12;

  // Supplier (left) and document title (right)
  const headerTop = w.y;
  w.text(doc.org.name, left, { size: 16, bold: true, y: headerTop - 4 });
  let leftY = headerTop - 22;
  const supplierLines = [
    ...doc.org.addressLines,
    doc.org.phone ? `${copy.pdf.phone}: ${doc.org.phone}` : null,
    doc.org.email,
    isTaxInvoice && doc.org.gstin ? `${copy.pdf.gstin}: ${doc.org.gstin}` : null,
  ].filter((line): line is string => !!line);
  for (const line of supplierLines) {
    for (const wrapped of w.wrap(line, halfWidth, 9)) {
      w.text(wrapped, left, { size: 9, color: MUTED, y: leftY });
      leftY -= 12;
    }
  }

  w.text(title, w.right, { size: 18, bold: true, align: 'right', color: BRAND, y: headerTop - 4 });
  let rightY = headerTop - 24;
  for (const [label, value] of [
    [copy.pdf.invoiceNumber, doc.invoice.number],
    [copy.pdf.issueDate, formatDate(doc.invoice.issueDate)],
    [copy.pdf.dueDate, formatDate(doc.invoice.dueDate)],
  ] as const) {
    w.text(`${label}  ${value}`, w.right, { size: 9, align: 'right', y: rightY });
    rightY -= 13;
  }
  w.y = Math.min(leftY, rightY) - 8;
  w.rule(18);

  // Recipient
  const recipientTop = w.y;
  w.text(copy.pdf.billedTo, left, { size: 8, color: MUTED, y: recipientTop });
  w.text(pdfText(doc.member.name, doc.member.code), left, {
    size: 11,
    bold: true,
    y: recipientTop - 14,
  });
  w.text(`${copy.pdf.memberCode}: ${doc.member.code}`, left, {
    size: 9,
    color: MUTED,
    y: recipientTop - 27,
  });
  if (doc.member.phone) {
    w.text(`${copy.pdf.phone}: ${doc.member.phone}`, left, {
      size: 9,
      color: MUTED,
      y: recipientTop - 39,
    });
  }
  if (isTaxInvoice) {
    if (doc.org.state) {
      w.text(`${copy.pdf.placeOfSupply}: ${doc.org.state}`, w.right, {
        size: 9,
        align: 'right',
        y: recipientTop - 14,
      });
    }
    w.text(copy.pdf.reverseCharge, w.right, {
      size: 9,
      align: 'right',
      color: MUTED,
      y: recipientTop - 27,
    });
  }
  w.y = recipientTop - 60;

  // Line items
  const sacX = w.right - 150;
  w.text(copy.pdf.description, left, { size: 8, bold: true, color: MUTED });
  if (isTaxInvoice) w.text(copy.pdf.sac, sacX, { size: 8, bold: true, color: MUTED });
  w.text(copy.pdf.amount, w.right, { size: 8, bold: true, color: MUTED, align: 'right' });
  w.y -= 8;
  w.rule(16);
  for (const item of doc.items) {
    const lines = w.wrap(item.description, (isTaxInvoice ? sacX : w.right - 110) - left - 12, 10);
    w.ensure(lines.length * 13 + 24);
    lines.forEach((line, index) => w.text(line, left, { y: w.y - index * 13 }));
    if (isTaxInvoice) w.text(item.sac, sacX);
    w.text(pdfMoney(item.amount), w.right, { align: 'right' });
    w.y -= lines.length * 13;
    w.y -= 6;
  }
  w.rule(16);

  // Totals
  const labelX = w.right - 120;
  const totals: [string, Paise][] = [[copy.pdf.subtotal, doc.invoice.subtotal]];
  if (doc.invoice.discount > 0) totals.push([copy.pdf.discount, -doc.invoice.discount]);
  if (isTaxInvoice) {
    const half = formatNumber(doc.invoice.gstRate / 2);
    totals.push(
      [copy.pdf.taxable, doc.invoice.taxable],
      [copy.pdf.cgst(half), doc.invoice.cgst],
      [copy.pdf.sgst(half), doc.invoice.sgst],
    );
  }
  w.ensure(totals.length * 15 + 60);
  for (const [label, value] of totals) {
    w.text(label, labelX, { size: 9, color: MUTED, align: 'right' });
    w.text(pdfMoney(value), w.right, { size: 9, align: 'right' });
    w.y -= 15;
  }
  w.y -= 2;
  w.text(isTaxInvoice ? copy.pdf.totalInclusive : copy.pdf.total, labelX, {
    size: 11,
    bold: true,
    align: 'right',
  });
  w.text(pdfMoney(doc.invoice.total), w.right, { size: 11, bold: true, align: 'right' });
  w.y -= 20;
  w.text(copy.pdf.amountInWords, left, { size: 8, color: MUTED });
  w.y -= 12;
  for (const line of w.wrap(amountInWords(doc.invoice.total), w.right - left, 9, true)) {
    w.text(line, left, { size: 9, bold: true });
    w.y -= 12;
  }
  w.y -= 14;

  // Payments
  w.ensure(60);
  w.text(copy.pdf.paymentsReceived, left, { size: 11, bold: true });
  w.y -= 16;
  if (doc.payments.length === 0) {
    w.text(copy.pdf.noPayments, left, { size: 9, color: MUTED });
    w.y -= 16;
  } else {
    const methodX = left + 110;
    const referenceX = left + 230;
    w.text(copy.pdf.date, left, { size: 8, bold: true, color: MUTED });
    w.text(copy.pdf.method, methodX, { size: 8, bold: true, color: MUTED });
    w.text(copy.pdf.reference, referenceX, { size: 8, bold: true, color: MUTED });
    w.text(copy.pdf.amount, w.right, { size: 8, bold: true, color: MUTED, align: 'right' });
    w.y -= 8;
    w.rule(14);
    for (const payment of doc.payments) {
      w.ensure(16);
      w.text(formatDate(new Date(payment.paidAt)), left, { size: 9 });
      w.text(
        payment.isReversal ? `${payment.method} (${copy.pdf.reversal})` : payment.method,
        methodX,
        {
          size: 9,
        },
      );
      const reference = w.wrap(payment.reference ?? '', w.right - referenceX - 90, 9)[0] ?? '';
      w.text(reference, referenceX, { size: 9, color: MUTED });
      w.text(pdfMoney(payment.amount), w.right, { size: 9, align: 'right' });
      w.y -= 14;
    }
    w.y -= 2;
  }
  w.ensure(40);
  w.text(copy.pdf.amountPaid, labelX, { size: 9, color: MUTED, align: 'right' });
  w.text(pdfMoney(doc.invoice.amountPaid), w.right, { size: 9, align: 'right' });
  w.y -= 15;
  w.text(copy.pdf.balanceDue, labelX, { size: 11, bold: true, align: 'right' });
  w.text(pdfMoney(doc.invoice.balanceDue), w.right, {
    size: 11,
    bold: true,
    align: 'right',
    color: doc.invoice.balanceDue > 0 ? DANGER : INK,
  });
  w.y -= 26;

  // Status stamp, or a QR code for the open balance
  if (doc.invoice.status === 'void') {
    w.ensure(50);
    w.text(copy.pdf.voidStamp, left, { size: 22, bold: true, color: DANGER });
    w.y -= 18;
    for (const line of w.wrap(
      copy.pdf.voidReason(doc.invoice.voidReason ?? ''),
      w.right - left,
      9,
    )) {
      w.text(line, left, { size: 9, color: DANGER });
      w.y -= 12;
    }
  } else if (doc.invoice.status === 'paid') {
    w.ensure(30);
    w.text(copy.pdf.paidStamp, left, { size: 22, bold: true, color: BRAND });
    w.y -= 24;
  } else if (doc.upiUri && doc.invoice.balanceDue > 0) {
    const size = 104;
    w.ensure(size + 20);
    drawQr(w, doc.upiUri, left, w.y, size);
    w.text(copy.pdf.scanToPay, left + size + 14, { size: 10, bold: true, y: w.y - 30 });
    w.text(pdfMoney(doc.invoice.balanceDue), left + size + 14, { size: 10, y: w.y - 45 });
    w.y -= size + 16;
  }

  for (const page of pdf.getPages()) {
    page.drawText(pdfText(copy.pdf.footer), {
      x: PAGE.margin,
      y: PAGE.margin - 16,
      size: 8,
      font: fonts.regular,
      color: MUTED,
    });
  }
  return pdf.save();
}
