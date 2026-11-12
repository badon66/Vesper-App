import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { LINK_DOCUMENTS_BUCKET, documentFacts } from "@/lib/quote-link/documents";
import { createClient } from "@/lib/supabase/server";
import { AgreementTextForm, StandardDocuments } from "./documents-editor";

// Settings, Documents (quote link take 3, Keenan, 2026-11-11): the standard
// documents Keenan uploads once (warranty, how it works, FAQ and so on),
// each with a name, which he then ticks per lead for that customer's link;
// and the agreement customers sign there. Owner only (the Admin layout and
// the database both see to that).

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsSettingsPage() {
  const supabase = await createClient();
  const [{ data: rows }, { data: settings }] = await Promise.all([
    supabase
      .from("link_documents")
      .select("id, name, storage_path, content_type, size_bytes, position, created_at")
      .is("retired_at", null)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("settings").select("agreement_text").eq("id", 1).single(),
  ]);
  const documents = rows ?? [];
  const signed =
    documents.length > 0
      ? await supabase.storage.from(LINK_DOCUMENTS_BUCKET).createSignedUrls(documents.map((doc) => doc.storage_path), 600)
      : null;
  const urls = new Map((signed?.data ?? []).flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/app/admin/settings" className="-ml-2 inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ChevronLeft aria-hidden="true" className="size-4" />
          Settings
        </Link>
        <h1 className="text-2xl font-bold">Documents</h1>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          What a customer can open and save from their quote link, and the agreement they can sign there. On each lead you
          tick which documents that customer&apos;s link shows.
        </p>
      </div>
      <StandardDocuments
        documents={documents.map((doc) => ({
          id: doc.id,
          name: doc.name,
          facts: documentFacts(doc.content_type, Number(doc.size_bytes)),
          url: urls.get(doc.storage_path) ?? null,
        }))}
      />
      <AgreementTextForm text={settings?.agreement_text ?? ""} />
    </div>
  );
}
