import React from 'react';
import { MessageSquare, Flame, Gamepad2, Compass, Plus } from 'lucide-react';

export default function ServerSidebar({ activeTab = 'server', onSelectTab }) {
  return (
    <nav aria-label="Szerverek sávja" className="w-[72px] bg-shark-bg flex flex-col items-center py-3 space-y-2 select-none flex-shrink-0 z-20">
      {/* Discord Direct Messages Icon */}
      <button
        onClick={() => onSelectTab && onSelectTab('server')}
        title="Fő Szerver"
        className="relative group flex items-center justify-center"
      >
        <div className="absolute left-0 w-1 bg-white rounded-r transition-all duration-200 h-10 group-hover:h-5" />
        <div className="w-12 h-12 rounded-[24px] group-hover:rounded-[16px] bg-shark-purple text-white flex items-center justify-center transition-all duration-200 shadow-lg cursor-pointer">
          <MessageSquare className="w-6 h-6" />
        </div>
      </button>

      {/* Separator line */}
      <div className="w-8 h-[2px] bg-shark-elevated rounded my-1" />

      {/* Community Server 1 */}
      <div className="relative group flex items-center justify-center">
        <div className="absolute left-0 w-1 bg-white rounded-r transition-all duration-200 h-0 group-hover:h-3" />
        <div className="w-12 h-12 rounded-[24px] group-hover:rounded-[16px] bg-shark-card hover:bg-shark-green text-shark-text hover:text-white flex items-center justify-center transition-all duration-200 cursor-pointer shadow">
          <Gamepad2 className="w-6 h-6" />
        </div>
      </div>

      {/* Community Server 2 */}
      <div className="relative group flex items-center justify-center">
        <div className="absolute left-0 w-1 bg-white rounded-r transition-all duration-200 h-0 group-hover:h-3" />
        <div className="w-12 h-12 rounded-[24px] group-hover:rounded-[16px] bg-shark-card hover:bg-shark-gold text-shark-text hover:text-white flex items-center justify-center transition-all duration-200 cursor-pointer shadow">
          <Flame className="w-6 h-6" />
        </div>
      </div>

      {/* Add server / Explore */}
      <div className="mt-auto flex flex-col space-y-2 items-center">
        <div className="relative group flex items-center justify-center">
          <div className="w-12 h-12 rounded-[24px] group-hover:rounded-[16px] bg-shark-card hover:bg-shark-green text-shark-green hover:text-white flex items-center justify-center transition-all duration-200 cursor-pointer shadow">
            <Plus className="w-6 h-6" />
          </div>
        </div>
        <div className="relative group flex items-center justify-center">
          <div className="w-12 h-12 rounded-[24px] group-hover:rounded-[16px] bg-shark-card hover:bg-shark-purple text-shark-purple hover:text-white flex items-center justify-center transition-all duration-200 cursor-pointer shadow">
            <Compass className="w-6 h-6" />
          </div>
        </div>
      </div>
    </nav>
  );
}
