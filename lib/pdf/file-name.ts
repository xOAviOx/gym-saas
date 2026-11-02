/** "IRON/25-26/0007" → "IRON-25-26-0007.pdf", safe inside a Content-Disposition header. */
export function pdfFileName(invoiceNumber: string): string {
  const slug = invoiceNumber.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${slug || 'invoice'}.pdf`;
}
