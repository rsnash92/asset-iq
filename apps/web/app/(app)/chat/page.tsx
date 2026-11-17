import { Chat } from "@/components/chat/chat";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("documents").select("industry").eq("status", "ready").not("industry", "is", null);
  const industries = [...new Set((data ?? []).map((d) => d.industry!))].sort();
  return <Chat industries={industries} />;
}
