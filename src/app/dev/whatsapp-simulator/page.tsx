import { assertDevEnvironment } from "@/lib/dev/guard";
import { WhatsAppSimulator } from "./WhatsAppSimulator";

export const metadata = {
  title: "DEV — WhatsApp Simulator | Homigo",
  robots: { index: false, follow: false },
};

export default function DevWhatsAppSimulatorPage() {
  assertDevEnvironment();
  return <WhatsAppSimulator />;
}
