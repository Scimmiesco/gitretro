import React from 'react';
import { UserContext, SeniorityLevel, RoleType } from '../types';
import { Users, BookOpen } from 'lucide-react';

interface ContextSelectorProps {
    context: UserContext;
    onChange: (ctx: UserContext) => void;
    className?: string;
}

export const ContextSelector: React.FC<ContextSelectorProps> = ({ context, onChange, className }) => {

    const update = (field: keyof UserContext, value: any) => {
        onChange({ ...context, [field]: value });
    };

    return (
        <div className={`bg-gray900 border border-gray800 rounded-xl p-4 shadow-sm space-y-4 ${className}`}>
            <h3 className="text-xs font-bold uppercase text-gray-500 flex items-center gap-2">
                <BookOpen size={14} /> Contexto Profissional
            </h3>

            <div className="space-y-3">
                {/* Seniority */}
                <div>
                    <label className="text-xs text-gray-400 mb-1 block">Senioridade</label>
                    <div className="flex bg-gray950 rounded-lg p-1 border border-gray800">
                        {(['Junior', 'Mid-Level', 'Senior'] as SeniorityLevel[]).map((level) => (
                            <button
                                key={level}
                                onClick={() => update('seniority', level)}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${context.seniority === level
                                    ? 'bg-blue-600 text-white shadow'
                                    : 'text-gray-500 hover:text-gray-300'
                                    }`}
                            >
                                {level}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Role */}
                <div>
                    <label className="text-xs text-gray-400 mb-1 block">Papel / Stack</label>
                    <select
                        value={context.role}
                        onChange={(e) => update('role', e.target.value as RoleType)}
                        className="w-full bg-gray950 border border-gray800 text-gray-300 text-sm rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    >
                        <option value="Frontend">Frontend Developer</option>
                        <option value="Backend">Backend Developer</option>
                        <option value="Fullstack">Fullstack Developer</option>
                    </select>
                </div>

                {/* HR Mode Toggle */}
                <div className="flex items-center justify-between pt-2 border-t border-gray800">
                    <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-md ${context.isHRMode ? 'bg-purple-900/30 text-purple-400' : 'bg-gray800 text-gray-500'}`}>
                            <Users size={14} />
                        </div>
                        <span className="text-xs font-medium text-gray-300">Modo RH (3ª Pessoa)</span>
                    </div>
                    <button
                        onClick={() => update('isHRMode', !context.isHRMode)}
                        className={`w-10 h-5 rounded-full relative transition-colors ${context.isHRMode ? 'bg-purple-600' : 'bg-gray700'}`}
                    >
                        <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${context.isHRMode ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                </div>
            </div>
        </div>
    );
};
