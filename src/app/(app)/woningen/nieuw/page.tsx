import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listWritingStyles } from "@/lib/data/writing-styles";
import { PageHeader } from "@/components/common/page-header";
import { NewPropertyChooser } from "@/components/properties/new-property-chooser";
import { createProperty } from "../actions";

export const metadata: Metadata = { title: "Nieuwe woning" };

export default async function NewPropertyPage() {
  await requirePageSession("properties.create");
  const styles = await listWritingStyles(await createClient());
  return (
    <>
      <PageHeader title="Nieuwe woning" description="Kies de makelaar en hoe u de woninggegevens wilt invoeren. U kunt later altijd aanvullen of corrigeren." />
      <NewPropertyChooser styles={styles.map((s) => ({ id: s.id, label: s.label, description: s.description }))} action={createProperty} />
    </>
  );
}
