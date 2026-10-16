import Localized from "../../../src/i18n/Localized";
import { CommerceShell } from "../../../src/commerce/Shell";
import LegacyPanel from "./LegacyPanel";

export default function LegacyAdminPage() {
  return (
    <Localized>
      <CommerceShell>
        <LegacyPanel />
      </CommerceShell>
    </Localized>
  );
}
