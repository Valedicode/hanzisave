import { redirect } from "next/navigation";

// Temporary: the landing page replaces this redirect next.
export default function Home() {
  redirect("/analyze");
}
