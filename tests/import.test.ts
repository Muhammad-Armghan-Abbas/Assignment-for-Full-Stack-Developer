import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { AppError } from "@/lib/errors";
import { convertFileToHtml, titleFromFilename } from "@/lib/import";

/** Build a minimal but valid .docx in memory (one heading, one bold run, one paragraph). */
async function makeDocx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Quarterly report</w:t></w:r></w:p>
      <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Revenue</w:t></w:r><w:r><w:t xml:space="preserve"> grew.</w:t></w:r></w:p>
    </w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

async function expect400(p: Promise<unknown>, message: RegExp) {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(400);
  expect((err as AppError).message).toMatch(message);
}

describe("file import", () => {
  it("turns plain text into escaped paragraphs", async () => {
    const html = await convertFileToHtml("notes.txt", Buffer.from("Line one\nline two\n\n<b>not html</b>"));
    expect(html).toBe("<p>Line one<br />line two</p><p>&lt;b&gt;not html&lt;/b&gt;</p>");
  });

  it("renders markdown headings, emphasis and lists", async () => {
    const md = "# Title\n\nSome **bold** and _italic_.\n\n- a\n- b\n\n1. one\n2. two\n\n#### deep";
    const html = await convertFileToHtml("plan.md", Buffer.from(md));
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toMatch(/<ul>\s*<li>a<\/li>/);
    expect(html).toMatch(/<ol>\s*<li>one<\/li>/);
    expect(html).toContain("<h3>deep</h3>"); // h4+ folded into the editor's heading set
  });

  it("converts .docx headings and bold runs", async () => {
    const html = await convertFileToHtml("Report.DOCX", await makeDocx());
    expect(html).toContain("<h1>Quarterly report</h1>");
    expect(html).toContain("<strong>Revenue</strong> grew.");
  });

  it("strips dangerous markup from markdown", async () => {
    const html = await convertFileToHtml("x.md", Buffer.from('hi <script>alert(1)</script> [link](javascript:alert(1))'));
    expect(html).not.toMatch(/script|javascript:/);
  });

  it("rejects unsupported, empty and corrupt files with a clear message", async () => {
    await expect400(convertFileToHtml("photo.png", Buffer.from("x")), /Unsupported file type/);
    await expect400(convertFileToHtml("empty.txt", Buffer.alloc(0)), /empty/);
    await expect400(convertFileToHtml("broken.docx", Buffer.from("not a zip")), /valid Word document/);
  });

  it("derives a readable title from the filename", () => {
    expect(titleFromFilename("Q3_plan (final).docx")).toBe("Q3 plan (final)");
    expect(titleFromFilename(".md")).toBe("Imported document");
  });
});
