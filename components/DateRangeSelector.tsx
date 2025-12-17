import React, { useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';

export type DateRange = {
    label: string;
    start: Date;
    end: Date;
};

interface DateRangeSelectorProps {
    currentRange: DateRange;
    onRangeChange: (range: DateRange) => void;
    disabled?: boolean;
}

const PRESETS = [
    { label: '2 Semanas', days: 14 },
    { label: '1 Mês', days: 30 },
    { label: '2 Meses', days: 60 },
    { label: '6 Meses', days: 180 },
    { label: '1 Ano', days: 365 },
];

export const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({ currentRange, onRangeChange, disabled }) => {
    const [isCustom, setIsCustom] = useState(false);
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");

    const handlePreset = (days: number, label: string) => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - days);

        setIsCustom(false);
        onRangeChange({ label, start, end });
    };

    const handleCustomSubmit = () => {
        if (!customStart || !customEnd) return;
        const start = new Date(customStart);
        const end = new Date(customEnd);
        onRangeChange({ label: 'Personalizado', start, end });
    };

    // Sync custom inputs if external range changes to a custom one
    useEffect(() => {
        if (currentRange.label === 'Personalizado') {
            setIsCustom(true);
            setCustomStart(currentRange.start.toISOString().split('T')[0]);
            setCustomEnd(currentRange.end.toISOString().split('T')[0]);
        }
    }, [currentRange]);

    return (
        <div className="w-full bg-transparent flex flex-col gap-2">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">
                <Calendar size={14} /> Período de Análise
            </div>

            <div className="flex flex-wrap gap-2">
                {PRESETS.map(preset => (
                    <button
                        key={preset.label}
                        disabled={disabled}
                        onClick={() => handlePreset(preset.days, preset.label)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${!isCustom && currentRange.label === preset.label
                            ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/20'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                            }`}
                    >
                        {preset.label}
                    </button>
                ))}
                <button
                    disabled={disabled}
                    onClick={() => setIsCustom(true)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${isCustom
                        ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/20'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                        }`}
                >
                    Personalizado
                </button>
            </div>

            {isCustom && (
                <div className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-200">
                    <input
                        type="date"
                        className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-white color-scheme-dark"
                        value={customStart}
                        onChange={e => setCustomStart(e.target.value)}
                        disabled={disabled}
                    />
                    <span className="text-slate-600">-</span>
                    <input
                        type="date"
                        className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-white color-scheme-dark"
                        value={customEnd}
                        onChange={e => setCustomEnd(e.target.value)}
                        disabled={disabled}
                    />
                    <button
                        onClick={handleCustomSubmit}
                        disabled={disabled}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-bold ml-2"
                    >
                        Aplicar
                    </button>
                </div>
            )}
        </div>
    );
};
