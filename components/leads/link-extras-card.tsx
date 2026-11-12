"use client";

import { FileSignature, FileText, Loader2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { addLeadUpload, removeLeadUpload, setAgreementToSign, setLeadDocument } from "@/app/(app)/app/leads/link-documents-actions";
import { uploadLinkDocument } from "@/components/quote-link/upload-document";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CUSTOMER_OFFER_NAME } from "@/lib/quotes/offers";
import { DOCUMENT_ACCEPT, leadUploadPath, nameFromFile } from "@/lib/quote-link/documents";
import type { LinkExtrasData } from "@/lib/quote-link/link-extras-data";

// On their link (quote link take 3, Keenan, 2026-11-11): which of Keenan's
// standard documents this customer's link shows, files for this customer
// only, Agreement to sign, and the agreements they signed (each a PDF).
// Keenan's alone; the lead page shows it only to him, never under View as.
export function LinkExtrasCard({ data }: { data: LinkExtrasData }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const run = async (key: string, action: () => Promise<{ ok: true } | { ok: false; message: string }>) => {
    setBusy(key);
    setMessage(null);
    try {
      const result = await action();
      if (!result.ok) setMessage(result.message);
      else router.refresh();
    } catch {
      setMessage("That didn't save. Check your signal and try again.");
    } finally {
      setBusy(null);
    }
  };

  const upload = async () => {
    if (!file) return;
    await run("upload", async () => {
      const uploaded = await uploadLinkDocument(file, (id, type) => leadUploadPath(data.leadId, id, type));
      if (!uploaded.ok) return uploaded;
      const saved = await addLeadUpload(data.leadId, { name: name.trim() || nameFromFile(file.name) || "Document", ...uploaded.file });
      if (saved.ok) {
        setFile(null);
        setName("");
        if (fileInput.current) fileInput.current.value = "";
      }
      return saved;
    });
  };

  const shown = data.standard.filter((doc) => doc.on).length + data.uploads.length;

  return (
    <Card data-testid="link-extras">
      <CardHeader>
        <CardTitle>On their link</CardTitle>
        <CardDescription>
          {shown === 0 ? "No documents on their link yet." : `${shown} ${shown === 1 ? "document" : "documents"} on their link.`}{" "}
          {data.agreement.on ? "They can sign the agreement there." : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <section className="flex flex-col gap-2" aria-labelledby="link-extras-standard">
          <h3 id="link-extras-standard" className="text-sm font-semibold">
            Standard documents
          </h3>
          {data.standard.length > 0 ? (
            <ul className="flex flex-col">
              {data.standard.map((doc) => (
                <li key={doc.id}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 py-1" data-testid="link-extras-standard">
                    <Checkbox
                      checked={doc.on}
                      disabled={busy !== null}
                      onCheckedChange={(checked) => void run(`doc-${doc.id}`, () => setLeadDocument(data.leadId, doc.id, checked === true))}
                      aria-label={`Show ${doc.name} on their link`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{doc.name}</span>
                      <span className="block text-sm text-muted-foreground">{doc.facts}</span>
                    </span>
                    {busy === `doc-${doc.id}` ? <Loader2 aria-hidden="true" className="size-4 animate-spin text-muted-foreground" /> : null}
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-pretty text-muted-foreground">
              None yet.{" "}
              <Link href="/app/admin/settings/documents" className="font-semibold text-foreground underline underline-offset-4">
                Add them in Settings, Documents
              </Link>
              .
            </p>
          )}
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="link-extras-own">
          <h3 id="link-extras-own" className="text-sm font-semibold">
            For this customer only
          </h3>
          {data.uploads.length > 0 ? (
            <ul className="flex flex-col divide-y rounded-md border">
              {data.uploads.map((doc) => (
                <li key={doc.id} className="flex items-center gap-3 px-3 py-2" data-testid="link-extras-upload">
                  <FileText aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    {doc.url ? (
                      <a href={doc.url} target="_blank" rel="noreferrer noopener" className="block font-semibold underline-offset-4 hover:underline">
                        {doc.name}
                      </a>
                    ) : (
                      <span className="block font-semibold">{doc.name}</span>
                    )}
                    <span className="block text-sm text-muted-foreground">{doc.facts}</span>
                  </span>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      if (confirmRemove !== doc.id) {
                        setConfirmRemove(doc.id);
                        return;
                      }
                      setConfirmRemove(null);
                      void run(`remove-${doc.id}`, () => removeLeadUpload(data.leadId, doc.id));
                    }}
                    className="inline-flex min-h-11 items-center px-2 text-sm font-semibold underline underline-offset-4"
                  >
                    {confirmRemove === doc.id ? "Tap again to remove" : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
            <input
              ref={fileInput}
              type="file"
              accept={DOCUMENT_ACCEPT}
              className="text-sm"
              onChange={(event) => {
                const chosen = event.target.files?.[0] ?? null;
                setFile(chosen);
                if (chosen && name.trim() === "") setName(nameFromFile(chosen.name));
              }}
              data-testid="link-extras-file"
            />
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Name they see, like Your site plan" aria-label="Document name" />
            <Button type="button" variant="outline" onClick={() => void upload()} disabled={!file || busy !== null} className="self-start">
              {busy === "upload" ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Upload aria-hidden="true" className="size-4" />}
              {busy === "upload" ? "Adding" : "Add for this customer"}
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="link-extras-agreement">
          <h3 id="link-extras-agreement" className="text-sm font-semibold">
            Agreement
          </h3>
          <label className={data.agreement.ready ? "flex min-h-12 cursor-pointer items-center gap-3" : "flex min-h-12 cursor-not-allowed items-center gap-3 opacity-60"}>
            <Checkbox
              checked={data.agreement.on}
              disabled={!data.agreement.ready || busy !== null}
              onCheckedChange={(checked) => void run("agreement", () => setAgreementToSign(data.leadId, checked === true))}
              aria-describedby={data.agreement.ready ? undefined : "agreement-needs-text"}
              data-testid="link-extras-agreement"
            />
            <span className="font-semibold">Agreement to sign</span>
          </label>
          {data.agreement.ready ? null : (
            <p id="agreement-needs-text" className="text-sm text-muted-foreground" data-testid="link-extras-agreement-needs-text">
              <Link href="/app/admin/settings/documents" className="underline underline-offset-4">
                Add the agreement text in Settings first.
              </Link>
            </p>
          )}
          {data.signed.length > 0 ? (
            <ul className="flex flex-col divide-y rounded-md border" data-testid="link-extras-signed">
              {data.signed.map((sig) => (
                <li key={sig.id}>
                  <a
                    href={sig.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex min-h-14 items-center gap-3 px-3 py-2 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    <FileSignature aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">Signed by {sig.signerName}</span>
                      <span className="block text-sm text-muted-foreground">
                        {sig.when}, {sig.option === CUSTOMER_OFFER_NAME ? "their own option" : sig.option}. Signed PDF.
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {message ? (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
