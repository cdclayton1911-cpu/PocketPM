import { ScannerClient } from "@/components/aia-scanner/ScannerClient";

/**
 * Needs no project data: the clause is pasted in. Left as a plain server
 * component so the route still requires a session via the (app) layout.
 */
export default function ScannerPage() {
  return <ScannerClient />;
}
