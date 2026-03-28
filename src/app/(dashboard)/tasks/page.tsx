import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TasksClient } from "@/components/tasks/TasksClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tasks | Sight Manager",
};

export default async function TasksPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return <TasksClient />;
}
