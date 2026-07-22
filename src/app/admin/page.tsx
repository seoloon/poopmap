import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AdminPanel from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const me = await getSessionUser();
  if (!me || (me.role !== "admin" && me.role !== "moderator")) redirect("/");
  return <AdminPanel me={me} />;
}
