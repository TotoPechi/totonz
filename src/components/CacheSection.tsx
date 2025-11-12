import React from 'react';

interface CacheInfo {
  label: string;
  isCached: boolean;
  fecha: string;
  url: string;
  onClear: () => void;
}

interface CacheSectionProps {
  caches: CacheInfo[];
}

const CacheSection: React.FC<CacheSectionProps> = ({ caches }) => {
  if (!caches.some(c => c.isCached)) return null;
  return (
    <div className="mt-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
      {caches.filter(c => c.isCached).map((cache, idx) => (
        <div key={idx} className="flex items-center justify-between gap-2" style={{ paddingTop: '5px', paddingBottom: '5px' }}>
          <div className="flex items-center gap-2 text-xs text-slate-400 flex-1">
            <span className="font-mono">
              📦 Caché({cache.fecha})
            </span>
            <span>•</span>
            <a
              href={cache.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono break-all text-blue-400 hover:text-blue-300 hover:underline"
              title={cache.url}
            >
              {cache.label}
            </a>
          </div>
          <button
            onClick={cache.onClear}
            className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded transition-colors whitespace-nowrap"
            title={`Limpiar caché de ${cache.label} y recargar`}
          >
            🗑️ Limpiar caché
          </button>
        </div>
      ))}
    </div>
  );
};

export default CacheSection;
