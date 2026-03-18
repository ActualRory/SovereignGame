import { useStore } from '../../store/index.js';
import { CountryTab } from '../tabs/CountryTab.js';
import { MapTab } from '../tabs/MapTab.js';
import { EconomyTab } from '../tabs/EconomyTab.js';
import { TradeTab } from '../tabs/TradeTab.js';
import { TechTab } from '../tabs/TechTab.js';
import { MilitaryTab } from '../tabs/MilitaryTab.js';
import { DiplomacyTab } from '../tabs/DiplomacyTab.js';

const TAB_COMPONENTS = {
  country: CountryTab,
  map: MapTab,
  economy: EconomyTab,
  trade: TradeTab,
  tech: TechTab,
  military: MilitaryTab,
  diplomacy: DiplomacyTab,
} as const;

export function TabOverlay() {
  const activeTab = useStore(s => s.activeTab);

  if (!activeTab) return null;

  const TabComponent = TAB_COMPONENTS[activeTab];

  return (
    <div className="tab-overlay">
      <TabComponent />
    </div>
  );
}
