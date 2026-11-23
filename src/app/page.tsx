import { DashboardTour } from "@/components/dashboard/tour"
import { VpDashboard } from "@/components/dashboard/vp-dashboard"

export default function Page() {
  return (
    <>
      <VpDashboard />
      {/* Opens on a first visit; the ? button in the header replays it. */}
      <DashboardTour />
    </>
  )
}
