import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth/session";
import { listDocuments } from "@/lib/data/sources";
import { getProperty } from "@/lib/data/properties";
import { QuickEntry } from "@/components/sources/quick-entry";

export const metadata: Metadata = { title: "Snelle invoer" };

export default async function QuickEntryPage({ params }: PageProps<"/woningen/[id]/snelle-invoer">) {
  await requirePageSession("properties.edit");
  const { id } = await params;
  const [property, documents] = await Promise.all([getProperty(id), listDocuments(id)]);
  return <QuickEntry propertyId={property.id} documents={documents} />;
}
