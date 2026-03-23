import { useStore } from '../../store/index.js';
import type { TabId } from '../../store/slices/ui.js';

const TABS: { id: TabId; label: string }[] = [
  { id: 'country', label: 'Country' },
  { id: 'map', label: 'Atlas' },
  { id: 'economy', label: 'Economy' },
  { id: 'trade', label: 'Trade' },
  { id: 'tech', label: 'Tech' },
  { id: 'military', label: 'Military' },
  { id: 'nobles', label: 'Nobles' },
  { id: 'diplomacy', label: 'Diplomacy' },
];

export function BottomBar() {
  const activeTab = useStore(s => s.activeTab);
  const setActiveTab = useStore(s => s.setActiveTab);

  return (
    <div className="bottom-bar">
      {TABS.map(tab => (
        <button
          key={tab.id}
          className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
