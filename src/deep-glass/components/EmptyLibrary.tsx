import { Plus } from 'lucide-react';

export function EmptyLibrary({ label, onImport }: { label: string; onImport: () => void }) {
  return (
    <div className="empty-state" data-testid="empty-library">
      <strong>{label}</strong>
      <p>VOID only shows audio you’ve added. No catalog, recommendations, or placeholder tracks.</p>
      <button className="button" onClick={onImport} data-testid="button-empty-add-files">
        <Plus />
        Add audio files
      </button>
    </div>
  );
}
