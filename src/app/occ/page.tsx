import type { Metadata } from "next"

import { OccComingSoon } from "@/components/dashboard/occ-coming-soon"

export const metadata: Metadata = {
  title: "OCC view · American Airlines Operations Dashboard",
}

export default function OccPage() {
  return <OccComingSoon />
}
