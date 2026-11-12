/**
 * Generates the sample policy set required by the assignment into ../sample_docs:
 *  - remote-work v1 (EXPIRED, PDF) + v2 (CURRENT, DOCX)            -> TC4
 *  - a document of ANOTHER tenant (globex remote-work)             -> TC5
 *  - "remote work" wording, to be asked as "working from home"     -> TC1/TC2
 *  - paid vs. unpaid leave in one doc (similar wording, diff facts) -> TC8
 *  - one OpenDocument (.odt) file to demo the third supported format
 * Run: npm run sample-docs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, HeadingLevel, Packer, Paragraph } from 'docx';
import JSZip from 'jszip';
import PDFDocument from 'pdfkit';

type Section = { heading: string; paragraphs: string[] };
type Policy = { file: string; title: string; sections: Section[] };

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../sample_docs');

const policies: Policy[] = [
  {
    file: 'acme_remote-work_v1_2024.pdf',
    title: 'ACME Corp - Remote Work Policy (Version 1)',
    sections: [
      { heading: '1. Scope', paragraphs: [
        'This policy applies to all full-time employees of ACME Corp. It is valid from 1 January 2024 to 31 December 2025.',
      ] },
      { heading: '2. Remote work allowance', paragraphs: [
        'Employees may perform remote work for up to 2 days per week. Remote days cannot be carried over to the following week.',
        'Remote work must be approved by the direct manager at least 3 working days in advance.',
      ] },
      { heading: '3. Equipment', paragraphs: [
        'ACME does not reimburse home office equipment. Employees use their company laptop only.',
      ] },
    ],
  },
  {
    file: 'acme_remote-work_v2_2026.docx',
    title: 'ACME Corp - Remote Work Policy (Version 2)',
    sections: [
      { heading: '1. Scope', paragraphs: [
        'This policy applies to all full-time employees of ACME Corp and replaces Version 1. It is valid from 1 January 2026 until further notice.',
      ] },
      { heading: '2. Remote work allowance', paragraphs: [
        'Employees may perform remote work for up to 3 days per week. Tuesday is a mandatory in-office day for all teams.',
        'Remote work requests are submitted in the HR portal at least 1 working day in advance and are approved by the direct manager.',
      ] },
      { heading: '3. Core hours and availability', paragraphs: [
        'During remote work, employees must be reachable on chat and phone during core hours from 10:00 to 15:00.',
        'Employees must attend video meetings with the camera turned on when requested by the meeting organizer.',
      ] },
      { heading: '4. Equipment allowance', paragraphs: [
        'Each employee receives a home office equipment allowance of USD 300 per calendar year. Receipts must be submitted within 60 days of purchase.',
      ] },
      { heading: '5. Security', paragraphs: [
        'Company data may only be accessed through the corporate VPN. Public Wi-Fi networks must not be used without the VPN.',
      ] },
    ],
  },
  {
    file: 'acme_annual-leave_v1_2026.docx',
    title: 'ACME Corp - Annual Leave Policy',
    sections: [
      { heading: '1. Paid annual leave', paragraphs: [
        'Full-time employees are entitled to 15 days of paid annual leave per year. Employees receive 1 additional paid day for every 2 years of service, up to a maximum of 20 days.',
        'Up to 5 unused paid leave days may be carried over to the next year and must be used before 31 March.',
      ] },
      { heading: '2. Unpaid leave', paragraphs: [
        'Employees may request up to 30 days of unpaid leave per year. Unpaid leave requires approval from the department director and must be requested at least 2 weeks in advance.',
      ] },
      { heading: '3. Sick leave', paragraphs: [
        'Employees are entitled to 10 days of paid sick leave per year, separate from annual leave. A medical certificate is required for absences longer than 2 consecutive days.',
      ] },
      { heading: '4. Public holidays', paragraphs: [
        'Public holidays are not counted as annual leave. If a public holiday falls on a weekend, the next working day is a day off.',
      ] },
    ],
  },
  {
    file: 'acme_travel-expense_v1_2026.pdf',
    title: 'ACME Corp - Travel Expense Policy',
    sections: [
      { heading: '1. Per diem', paragraphs: [
        'Employees on business trips receive a daily allowance (per diem) of USD 50 for domestic trips and USD 80 for international trips, covering meals and local transport.',
      ] },
      { heading: '2. Accommodation', paragraphs: [
        'Hotel costs are reimbursed up to USD 150 per night. Exceptions require written approval from the finance department before booking.',
      ] },
      { heading: '3. Flights', paragraphs: [
        'Flights shorter than 6 hours must be booked in economy class. Business class is allowed for flights longer than 6 hours with Vice President approval.',
      ] },
      { heading: '4. Claims', paragraphs: [
        'Expense claims must be submitted with original receipts within 30 days after the trip ends. Late claims are not reimbursed.',
      ] },
    ],
  },
  {
    file: 'globex_remote-work_v1_2026.docx',
    title: 'Globex Inc - Remote Work Policy',
    sections: [
      { heading: '1. Scope', paragraphs: [
        'This policy applies to all employees of Globex Inc. It is valid from 1 January 2026.',
      ] },
      { heading: '2. Remote work allowance', paragraphs: [
        'Globex is a remote-first company. Employees may perform remote work 5 days per week without prior approval.',
      ] },
      { heading: '3. Home office stipend', paragraphs: [
        'Each employee receives a one-time home office stipend of USD 1,000 when they join the company.',
      ] },
    ],
  },
  {
    file: 'globex_travel-expense_v1_2026.odt',
    title: 'Globex Inc - Travel Expense Policy',
    sections: [
      { heading: '1. Per diem', paragraphs: [
        'Globex pays a flat per diem of USD 70 for every travel day, domestic or international.',
      ] },
      { heading: '2. Accommodation & flights', paragraphs: [
        'Hotels are reimbursed up to USD 200 per night. All flights are booked in economy class, regardless of duration.',
      ] },
      { heading: '3. Claims', paragraphs: [
        'Expense claims are submitted in the Globex expense app within 14 days after the trip.',
      ] },
    ],
  },
];

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Minimal valid ODT: `mimetype` first + uncompressed, content.xml, manifest (opens in LibreOffice). */
async function writeOdt(p: Policy) {
  const body = [
    `<text:h text:outline-level="1">${xmlEscape(p.title)}</text:h>`,
    ...p.sections.flatMap((s) => [
      `<text:h text:outline-level="2">${xmlEscape(s.heading)}</text:h>`,
      ...s.paragraphs.map((t) => `<text:p>${xmlEscape(t)}</text:p>`),
    ]),
  ].join('\n');
  const zip = new JSZip();
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });
  zip.file('content.xml', `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.3">
<office:body><office:text>
${body}
</office:text></office:body></office:document-content>`);
  zip.file('META-INF/manifest.xml', `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`);
  fs.writeFileSync(path.join(outDir, p.file), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

async function writeDocx(p: Policy) {
  const children = [new Paragraph({ text: p.title, heading: HeadingLevel.TITLE })];
  for (const s of p.sections) {
    children.push(new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_1 }));
    for (const t of s.paragraphs) children.push(new Paragraph({ text: t }));
  }
  const buf = await Packer.toBuffer(new Document({ sections: [{ children }] }));
  fs.writeFileSync(path.join(outDir, p.file), buf);
}

function writePdf(p: Policy): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 56 });
    const stream = fs.createWriteStream(path.join(outDir, p.file));
    doc.pipe(stream);
    doc.font('Helvetica-Bold').fontSize(18).text(p.title).moveDown();
    for (const s of p.sections) {
      doc.font('Helvetica-Bold').fontSize(13).text(s.heading).moveDown(0.3);
      for (const t of s.paragraphs) doc.font('Helvetica').fontSize(11).text(t).moveDown(0.5);
      doc.moveDown(0.5);
    }
    doc.end();
    stream.on('finish', resolve).on('error', reject);
  });
}

fs.mkdirSync(outDir, { recursive: true });
for (const p of policies) {
  if (p.file.endsWith('.pdf')) await writePdf(p);
  else if (p.file.endsWith('.odt')) await writeOdt(p);
  else await writeDocx(p);
  console.log('wrote', path.join('sample_docs', p.file));
}
