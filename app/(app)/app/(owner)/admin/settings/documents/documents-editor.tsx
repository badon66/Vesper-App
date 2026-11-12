"use client";

import { FileText, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { addLibraryDocument, renameLibraryDocument, retireLibraryDocument, saveAgreementText } from "@/app/(app)/app/leads/link-documents-actions";
import { uploadLinkDocument } from "@/components/quote-link/upload-document";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DOCUMENT_ACCEPT, libraryPath, nameFromFile } from "@/lib/quote-link/documents";

type StandardDocument = { id: string; name: string; facts: string; url: string | null };

// The standard set: upload once, each with a name; rename or remove later.
// Remove takes a second tap and retires it, so any link that showed it
// stops showing it.
export function StandardDocuments({ documents }: { documents: StandardDocument[] }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function add() {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const uploaded = await uploadLinkDocument(file, (id, type) => libraryPath(id, type));
      if (!uploaded.ok) {
        setMessage(uploaded.message);
        return;
      }
      const saved = await addLibraryDocument({ name: name.trim() || nameFromFile(file.name) || "Document", ...uploaded.file });
      if (!saved.ok) {
        setMessage(saved.message);
        return;
      }
      setFile(null);
      setName("");
      if (fileInput.current) fileInput.current.value = "";
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="standard-documents">
      <CardHeader>
        <CardTitle>Standard documents</CardTitle>
        <CardDescription>PDFs or photos, up to 25 MB each. Customers see the name you give each one.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {documents.length > 0 ? (
          <ul className="flex flex-col divide-y rounded-md border">
            {documents.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} onChanged={() => router.refresh()} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-pretty text-muted-foreground" data-testid="standard-documents-empty">
            None yet. Add your warranty, how it works, an FAQ and anything else you send with every quote. Then tick them on a
            lead to show them on that customer&apos;s link.
          </p>
        )}
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
            data-testid="standard-document-file"
          />
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Name customers see, like Our warranty" aria-label="Document name" data-testid="standard-document-name" />
          <Button type="button" onClick={() => void add()} disabled={!file || busy} className="self-start" data-testid="standard-document-add">
            {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Upload aria-hidden="true" className="size-4" />}
            {busy ? "Adding" : "Add document"}
          </Button>
          {message ? (
            <p role="alert" className="text-sm font-semibold text-destructive">
              {message}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function DocumentRow({ doc, onChanged }: { doc: StandardDocument; onChanged: () => void }) {
  const [name, setName] = useState(doc.name);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const changed = name.trim() !== doc.name && name.trim() !== "";
  return (
    <li className="flex flex-col gap-2 px-3 py-3" data-testid="standard-document">
      <div className="flex items-center gap-3">
        <FileText aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} aria-label="Document name" className="min-w-0 flex-1" />
        {changed ? (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const result = await renameLibraryDocument(doc.id, name);
              setBusy(false);
              if (!result.ok) setMessage(result.message);
              else onChanged();
            }}
          >
            Save
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3 pl-8 text-sm text-muted-foreground">
        <span>{doc.facts}</span>
        {doc.url ? (
          <a href={doc.url} target="_blank" rel="noreferrer noopener" className="font-semibold text-foreground underline underline-offset-4">
            Open
          </a>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!confirm) {
              setConfirm(true);
              return;
            }
            setBusy(true);
            const result = await retireLibraryDocument(doc.id);
            setBusy(false);
            setConfirm(false);
            if (!result.ok) setMessage(result.message);
            else onChanged();
          }}
          className="ml-auto inline-flex min-h-11 items-center px-2 font-semibold text-foreground underline underline-offset-4"
          data-testid="standard-document-remove"
        >
          {confirm ? "Tap again to remove" : "Remove"}
        </button>
      </div>
      {message ? (
        <p role="alert" className="pl-8 text-sm font-semibold text-destructive">
          {message}
        </p>
      ) : null}
    </li>
  );
}

// The agreement customers sign on their link, in Keenan's own words. Until
// it has text, Agreement to sign stays greyed out on every lead.
export function AgreementTextForm({ text }: { text: string }) {
  const router = useRouter();
  const [value, setValue] = useState(text);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <Card data-testid="agreement-settings">
      <CardHeader>
        <CardTitle>Agreement to sign</CardTitle>
        <CardDescription>
          Shows on a customer&apos;s link only when you tick Agreement to sign on their lead. They read it, type their name, sign
          with a finger and tap Sign; you get a signed PDF on the lead. Leave a blank line between paragraphs.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea value={value} onChange={(event) => setValue(event.target.value)} rows={12} maxLength={20000} aria-label="Agreement text" data-testid="agreement-text-input" />
        <div className="flex items-center gap-3">
          <Button
            type="button"
            disabled={busy || value === text}
            onClick={async () => {
              setBusy(true);
              setMessage(null);
              const result = await saveAgreementText(value);
              setBusy(false);
              if (!result.ok) setMessage({ ok: false, text: result.message });
              else {
                setMessage({ ok: true, text: value.trim() ? "Saved." : "Saved. Agreement to sign is off on every lead until there is text." });
                router.refresh();
              }
            }}
            data-testid="agreement-text-save"
          >
            {busy ? "Saving" : "Save agreement"}
          </Button>
          {message ? (
            <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-sm text-muted-foreground" : "text-sm font-semibold text-destructive"}>
              {message.text}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
