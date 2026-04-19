import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * `/tasks` retired — merged into `/daily-brief` as the "All Sites" mode.
 * Keith Apr 2026 Q1=b. This redirect keeps any old bookmarks + email
 * links working.
 */
export default function TasksPage() {
  redirect("/daily-brief");
}
