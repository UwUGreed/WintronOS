import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import nodemailer from "nodemailer";
import { db } from "../db";
import { AppError, authorize, type Actor } from "../security";
import { transaction, audit, clientInOrg } from "./ledger";
import { invoiceInclude } from "./invoices";
const root = () =>
  path.resolve(
    /* turbopackIgnore: true */ process.env.DOCUMENT_STORAGE_PATH ||
      "./.data/documents",
  );
export async function makePdf(title: string, sections: string[]) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(
    await readFile(path.join(process.cwd(), "public/fonts/DejaVuSans.ttf")),
    { subset: true },
  );
  const bold = font;
  let page = pdf.addPage([612, 792]);
  let y = 742;
  const clean = (s: string) => s.replace(/[\x00-\x08\x0B-\x1F]/g, " ");
  const draw = (s: string, size = 10, strong = false) => {
    if (y < 55) {
      page = pdf.addPage([612, 792]);
      y = 742;
    }
    page.drawText(clean(s), {
      x: 45,
      y,
      size,
      font: strong ? bold : font,
      color: rgb(0.08, 0.14, 0.22),
    });
    y -= size + 9;
  };
  draw("W  WINTRON OS", 15, true);
  draw(title, 21, true);
  y -= 14;
  for (const section of sections) {
    for (const line of section.split("\n")) {
      const words = clean(line).split(" ");
      let buffer = "";
      for (const word of words) {
        if ((buffer + " " + word).length > 88) {
          draw(buffer);
          buffer = word;
        } else buffer += (buffer ? " " : "") + word;
      }
      draw(buffer);
    }
    y -= 7;
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) =>
    p.drawText(`Wintron Technologies LLC  |  ${i + 1} / ${pages.length}`, {
      x: 45,
      y: 28,
      size: 8,
      font,
      color: rgb(0.4, 0.45, 0.5),
    }),
  );
  return Buffer.from(await pdf.save());
}
export async function invoicePdf(a: Actor, id: string) {
  const invoice = await db.invoice.findFirst({
    where: { id, organizationId: a.organizationId },
    include: invoiceInclude,
  });
  if (!invoice) throw new AppError("Invoice not found.", 404);
  const current = await db.organization.findUniqueOrThrow({
    where: { id: a.organizationId },
  });
  const snapshot = invoice.snapshot as {
    organization: {
      name: string;
      address: string;
      email: string;
      phone: string;
    };
    client: { name: string; billingAddress: string; email: string };
  } | null;
  const organization = snapshot?.organization || current;
  const client = snapshot?.client || invoice.client;
  const sections = [
    `${organization.name}\n${organization.address}\n${organization.email} ${organization.phone}`,
    `BILL TO\n${client.name}\n${client.billingAddress}\n${client.email}`,
    `Issued: ${invoice.issueDate.toISOString().slice(0, 10)}    Due: ${invoice.dueDate.toISOString().slice(0, 10)}\nCurrency: USD\n${invoice.description}`,
    ...invoice.lines.map(
      (l) =>
        `${l.position + 1}. ${l.description}\n${l.quantity} x $${l.unitPrice} | Discount ${l.discountPercent}% | Tax ${l.taxPercent}% ${l.jurisdiction}\nLine total: $${l.total.toFixed(2)}`,
    ),
    `Subtotal: $${invoice.subtotal.toFixed(2)}\nDiscount: $${invoice.discount.toFixed(2)}\nSales tax: $${invoice.tax.toFixed(2)}\nTOTAL: $${invoice.total.toFixed(2)}`,
    `Notes\n${invoice.notes}`,
    `Payment instructions\n${invoice.paymentInstructions}`,
    `Terms\n${invoice.terms}`,
  ];
  if (invoice.status === "VOID")
    sections.unshift(`VOIDED: ${invoice.voidReason}`);
  return {
    bytes: await makePdf(invoice.number || "DRAFT INVOICE", sections),
    filename: (invoice.number || "draft") + ".pdf",
  };
}
export async function sendInvoice(a: Actor, id: string) {
  authorize(a, "write");
  const invoice = await db.invoice.findFirst({
    where: { id, organizationId: a.organizationId },
    include: { client: true },
  });
  if (!invoice || invoice.status !== "ISSUED")
    throw new AppError("Only issued invoices can be sent.");
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM)
    throw new AppError(
      "Configure SMTP_HOST and SMTP_FROM on the server. PDF download is available.",
      409,
    );
  if (!invoice.client.email)
    throw new AppError("Add a billing email to the client before sending.");
  const { bytes, filename } = await invoicePdf(a, id);
  const delivery = await db.invoiceDelivery.create({
    data: {
      invoiceId: id,
      status: "PENDING",
      recipient: invoice.client.email,
      actorId: a.userId,
    },
  });
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      requireTLS: process.env.SMTP_SECURE !== "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
      connectionTimeout: 10000,
      socketTimeout: 20000,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: invoice.client.email,
      subject: `Invoice ${invoice.number} - Wintron Technologies LLC`,
      text: `Please find invoice ${invoice.number} attached. Total: $${invoice.total.toFixed(2)} USD. Due ${invoice.dueDate.toISOString().slice(0, 10)}.`,
      attachments: [
        { filename, content: bytes, contentType: "application/pdf" },
      ],
    });
    await transaction(async (tx) => {
      await tx.invoiceDelivery.update({
        where: { id: delivery.id },
        data: { status: "SENT" },
      });
      await audit(
        tx,
        a,
        "SENT",
        "INVOICE",
        id,
        `Sent ${invoice.number} to ${invoice.client.email}`,
        invoice.clientId,
      );
    });
    return { ok: true };
  } catch {
    await db.invoiceDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        error:
          "SMTP delivery failed. Check provider configuration and logs; credentials are not recorded.",
      },
    });
    throw new AppError(
      "Email delivery failed. The invoice PDF remains available.",
      502,
    );
  }
}
export async function upload(a: Actor, form: FormData) {
  authorize(a, "write");
  const file = form.get("file");
  const clientId = String(form.get("clientId") || "");
  const expenseId = String(form.get("expenseId") || "");
  const retainerId = String(form.get("retainerId") || "");
  const projectId = String(form.get("projectId") || "");
  if (
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > 10 * 1024 * 1024
  )
    throw new AppError("Upload a file up to 10 MB.");
  if (!clientId && !expenseId && !retainerId && !projectId)
    throw new AppError("Associate the file with a client or business record.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(bytes);
  const allowed: Record<string, string[]> = {
    "application/pdf": [".pdf"],
    "image/png": [".png"],
    "image/jpeg": [".jpg", ".jpeg"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
      ".docx",
    ],
  };
  if (
    !detected ||
    !allowed[detected.mime]?.includes(path.extname(file.name).toLowerCase())
  )
    throw new AppError(
      "Allowed files: PDF, PNG, JPEG, DOCX. File content must match its extension.",
    );
  const key = randomUUID();
  await mkdir(root(), { recursive: true, mode: 0o700 });
  return transaction(async (tx) => {
    if (clientId) await clientInOrg(tx, a, clientId);
    if (
      expenseId &&
      !(await tx.expense.findFirst({
        where: { id: expenseId, organizationId: a.organizationId },
      }))
    )
      throw new AppError("Expense not found.", 404);
    if (
      retainerId &&
      !(await tx.retainer.findFirst({
        where: { id: retainerId, organizationId: a.organizationId },
      }))
    )
      throw new AppError("Retainer not found.", 404);
    if (
      projectId &&
      !(await tx.project.findFirst({
        where: { id: projectId, client: { organizationId: a.organizationId } },
      }))
    )
      throw new AppError("Project not found.", 404);
    await writeFile(path.join(/* turbopackIgnore: true */ root(), key), bytes, {
      flag: "wx",
      mode: 0o600,
    });
    try {
      const doc = await tx.document.create({
        data: {
          organizationId: a.organizationId,
          clientId: clientId || null,
          expenseId: expenseId || null,
          retainerId: retainerId || null,
          projectId: projectId || null,
          name: path
            .basename(file.name)
            .replace(/[\r\n"\\]/g, "_")
            .slice(0, 200),
          storageKey: key,
          mimeType: detected.mime,
          size: file.size,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          uploadedBy: a.userId,
        },
      });
      await audit(
        tx,
        a,
        "UPLOADED",
        "DOCUMENT",
        doc.id,
        `Uploaded ${doc.name}`,
        clientId || undefined,
      );
      return doc;
    } catch (e) {
      await unlink(path.join(/* turbopackIgnore: true */ root(), key));
      throw e;
    }
  });
}
export async function download(a: Actor, id: string) {
  const doc = await db.document.findFirst({
    where: { id, organizationId: a.organizationId },
  });
  if (!doc) throw new AppError("Document not found.", 404);
  if (!/^[a-f0-9-]{36}$/.test(doc.storageKey))
    throw new AppError("Invalid document key.", 500);
  const bytes = await readFile(
    /* turbopackIgnore: true */ path.join(
      /* turbopackIgnore: true */ root(),
      doc.storageKey,
    ),
  );
  if (createHash("sha256").update(bytes).digest("hex") !== doc.sha256)
    throw new AppError("Document integrity check failed.", 500);
  return { doc, bytes };
}
