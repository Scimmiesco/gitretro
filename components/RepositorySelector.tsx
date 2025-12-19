import React, { useMemo, useState, useEffect, useRef } from 'react';
import { AzureRepository } from '../types';
import { Check, ChevronDown, FolderGit2, Search, Star } from 'lucide-react';

interface RepositorySelectorProps {
    repositories: AzureRepository[];
    selectedRepoIds: string[];
    onSelectionChange: (ids: string[]) => void;
    onConfirm: () => void;
    isLoading: boolean;
}

export const RepositorySelector: React.FC<RepositorySelectorProps> = ({
    repositories,
    selectedRepoIds,
    onSelectionChange,
    onConfirm,
    isLoading
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [favorites, setFavorites] = useState<string[]>(() => {
        try {
            return JSON.parse(localStorage.getItem('gitretro_favorites') || '[]');
        } catch {
            return [];
        }
    });

    // Auto-select favorites only once when repositories are loaded
    const hasAutoSelected = useRef(false);

    useEffect(() => {
        if (repositories.length > 0 && !hasAutoSelected.current && favorites.length > 0) {
            // Find valid favorites that exist in the loaded repos
            const validFavorites = repositories
                .filter(r => favorites.includes(r.id))
                .map(r => r.id);

            if (validFavorites.length > 0) {
                // Merge with existing selection if any (though usually empty on start)
                const uniqueSelection = Array.from(new Set([...selectedRepoIds, ...validFavorites]));
                onSelectionChange(uniqueSelection);
            }
            hasAutoSelected.current = true;
        }
    }, [repositories, favorites]); // Depend on repositories loading

    const filteredRepos = useMemo(() => {
        return repositories.filter(r =>
            r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.project.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [repositories, searchTerm]);

    const toggleRepo = (id: string) => {
        const newSelection = selectedRepoIds.includes(id)
            ? selectedRepoIds.filter(s => s !== id)
            : [...selectedRepoIds, id];

        onSelectionChange(newSelection);
    };

    const reposSelecionados = useMemo(() => {
        return repositories.filter(r => selectedRepoIds.includes(r.id));
    }, [repositories, selectedRepoIds]);

    const toggleFavorite = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const newFavs = favorites.includes(id)
            ? favorites.filter(f => f !== id)
            : [...favorites, id];

        setFavorites(newFavs);
        localStorage.setItem('gitretro_favorites', JSON.stringify(newFavs));
    };

    const selectAll = () => onSelectionChange(filteredRepos.map(r => r.id));
    const clearSelection = () => onSelectionChange([]);

    return (
        <div className="w-full sticky top-0 z-50 ">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2">
                {/* Header / Trigger */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-1 rounded-md text-accent">
                        <FolderGit2 size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-yellow-50 leading-tight">Selecione os repositórios </h2>
                        <div className="text-xs text-yellow-100/70">
                            {selectedRepoIds.length === 0
                                ? "Nenhum repositório selecionado"
                                : `${reposSelecionados.map(r => r.name).join(' - ')}`
                            }
                        </div>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-3 w-full md:w-auto relative">
                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        className="flex-1 md:flex-none flex items-center justify-between gap-3 px-4 py-2 bg-gray-950 border border-yellow-50 rounded-md text-sm font-medium text-yellow-50 hover:bg-gray-750 transition-colors min-w-[200px]"
                    >
                        <span className="text-yellow-50">{selectedRepoIds.length > 0 ? `${selectedRepoIds.length} Selecionados` : 'Selecionar Repositórios'}</span>
                        <ChevronDown size={16} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isLoading || selectedRepoIds.length === 0}
                        className="
                        bg-accent text-surface font-bold
                        px-6 py-2  font-bold rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                    >
                        {isLoading ? 'Carregando...' : 'Analisar'}
                    </button>

                    {/* Dropdown Panel */}
                    {isOpen && (
                        <div className="absolute top-full right-0 mt-2 w-full md:w-[400px] max-h-[60vh] bg-emerald-950 border-2 border-emerald-900 rounded-md flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 z-50">
                            {/* Search */}
                            <div className="p-3 border-b border-emerald-900 bg-emerald-900/50">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-yellow-100" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Filtrar repositórios..."
                                        className="placeholder:text-yellow-100/70 w-full bg-gray-950 border border-yellow-50 rounded-md pl-9 pr-3 py-2 text-xs text-yellow-50 focus:outline-none focus:border-orange-700"
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                                <div className="flex items-center justify-between mt-2 text-[10px] text-yellow-100/70 px-1">
                                    <span>{filteredRepos.length} encontrados</span>
                                    <div className="flex gap-2">
                                        <button onClick={selectAll} className="hover:text-orange-600">Todos</button>
                                        <button onClick={clearSelection} className="hover:text-red-500">Nenhum</button>
                                    </div>
                                </div>
                            </div>

                            {/* List */}
                            <div className="overflow-y-auto flex-1 p-2 space-y-1">
                                {filteredRepos.map(repo => {
                                    const isSelected = selectedRepoIds.includes(repo.id);
                                    const isFavorite = favorites.includes(repo.id);
                                    return (
                                        <div
                                            key={repo.id}
                                            onClick={() => toggleRepo(repo.id)}
                                            className={`
                                                flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors group border-2 border-transparent
                                                 ${isSelected ? 'bg-orange-800/20 border-2 border-orange-700/70' : 'hover:bg-gray-950 hover:border-2 hover:border-yellow-100'}`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <button
                                                    onClick={(e) => toggleFavorite(e, repo.id)}
                                                    className={`p-1 rounded-md transition-colors 
                                                        ${isFavorite ? 'text-yellow-400 hover:text-yellow-300' : 'text-yellow-100 hover:text-yellow-500 hover:bg-yellow-500/10'}`}
                                                    title={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                                                >
                                                    <Star size={16} fill={isFavorite ? "currentColor" : "none"} />
                                                </button>
                                                <div className="min-w-0">
                                                    <div className={`text-sm font-medium truncate ${isSelected ? 'text-orange-600' : 'text-yellow-50'}`}>{repo.name}</div>
                                                    <div className="text-[10px]  text-yellow-100/70 truncate">{repo.project.name}</div>
                                                </div>
                                            </div>
                                            {isSelected && <Check size={16} className="text-orange-600 flex-shrink-0 ml-2" />}
                                        </div>
                                    );
                                })}
                                {filteredRepos.length === 0 && (
                                    <div className="p-4 text-center text-xs text-yellow-100/70">Nenhum repositório encontrado.</div>
                                )}
                            </div>
                        </div>
                    )}

                </div>
            </div>

            {/* Backdrop to close */}
            {isOpen && <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>}
        </div>
    );
};
