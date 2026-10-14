# Sample files for testing Ajaia Docs

Use these files to try every feature on the live app, signed in as the demo users.

| File | Use it to test | Expected result |
|---|---|---|
| `q1-pilot-report.docx` | **Import → Word** | New document "q1-pilot-report" with H1/H2/H3 headings, **bold** / *italic* / underline, a link, a bulleted and a numbered list, a 4-column table, and the **embedded chart image**, which you can resize from its corners. |
| `meeting-notes.md` | **Import → Markdown** | Headings, bold, italic, ~~strikethrough~~, nested bullets, a numbered list, a table with a header row, a quote, a code block, a link and a divider. |
| `release-notes.txt` | **Import → plain text** | Paragraphs and line breaks kept. `<b>` and `<script>` show as literal text and are never executed. Then format it with the toolbar. |
| `architecture-diagram.png` | **Insert image** in any document: toolbar image button, paste, or drag-and-drop | Image uploads and appears inline; resize it from a corner. Users without access to the document can't load the image URL. |
| `pilot-chart.png` | Second image for paste / drag-drop | Same as above. |
| `unsupported-example.csv` | **Validation** on Import | Rejected with "Unsupported file type ".csv". Supported: .txt, .md, .docx". |

## 10-minute test script

Use two browser windows: a normal one and a private/incognito one.

1. **Alice:** Import `q1-pilot-report.docx`. Check the headings, table and chart, then resize the chart.
2. Rename the document (click the title), type `/` on an empty line, and insert a **checklist** and a **table**.
3. Select "52 weekly active writers" and click **Comment**: *"Can we break this down by team?"*
4. Click **Share** and add **bob@ajaia.test as Commenter** and **chris@ajaia.test as Viewer**.
5. **Bob** (private window): open it from **Shared with me**. You should see Alice's avatar, the yellow comment highlight, and that you can comment but not edit. **Reply** to Alice's comment.
6. **Alice:** the reply appears within a few seconds. **Resolve** the thread, then edit a paragraph.
7. **Alice:** open **Version history**, preview the "Imported from q1-pilot-report.docx" version, and **Restore** it. Bob's window updates on its own.
8. **Chris:** open the document. It's view-only: no toolbar, no comment box.
9. Import `meeting-notes.md` and `release-notes.txt` and check the formatting. Try `unsupported-example.csv` to see the error.
10. **Download** a document as Markdown or PDF from the download icon.
