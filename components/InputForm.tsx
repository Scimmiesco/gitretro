
import React, { useState } from 'react';
import { Search, Github, Lock, Calendar, Cloud, User, Plus, Trash2, Link as LinkIcon, ChartNoAxesGantt, Loader2, LogIn } from 'lucide-react';
import { Provider } from '../types';

interface InputFormProps {
  onSubmit: (provider: Provider, identity: string, token: string, year: number, secondaryIdentity?: string, repoList?: string[]) => void;
  loading: boolean;
}

const InputForm: React.FC<InputFormProps> = ({ onSubmit, loading }) => {
  const [provider, setProvider] = useState<Provider>('azure'); // Default to Azure based on user preference
  const [primaryInput, setPrimaryInput] = useState(''); // GitHub Username

  const [orgName, setOrgName] = useState('InfortechMS'); // Default Organization
  // Nome do autor pré-selecionado (Exemplo com múltiplos aliases)
  const [secondaryInput, setSecondaryInput] = useState('Scimmiesco, pedro.almeida');

  const [token, setToken] = useState('');
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (provider === 'github') {
      if (primaryInput.trim()) {
        onSubmit(provider, primaryInput.trim(), token.trim(), year, undefined, undefined);
      }
    } else {
      // Azure
      if (orgName.trim() && secondaryInput.trim()) {
        // Passamos o Nome da Organização como 'identity' (2º argumento) revisando a lógica no App.tsx
        onSubmit(provider, orgName.trim(), token.trim(), year, secondaryInput.trim(), []);
      }
    }
  };

  return (
    <div className="w-full max-w-lg bg-surface-muted rounded-md p-2 border-2 border-primary-dark animate-fade-in relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-10 -right-1/3 w-1/2 h-64 bg-primary/10 rounded-full blur-3xl"></div>
      <div className="absolute -bottom-20 -left-20 w-64 h-1/2 bg-primary/10 rounded-full blur-3xl"></div>

      <div className="text-center relative z-10">
        <div className="flex gap-2 align-center justify-center">
          <h1 className="text-5xl font-extrabold  tracking-tight self-center">
            Dev<span className="text-accent">Center</span>
          </h1>

          <div className={`rounded-md flex items-center justify-center transform transition-all duration-300`}>
            {provider === 'github' ? <Github size={32} className="" /> : <ChartNoAxesGantt size={48} className="" />}
          </div>
        </div>

        <p className="nt-light font-bold font-mono">
          Controle sua vida profissional
        </p>
      </div>

      <div className="flex p-1.5 bg-gray-950 rounded-md mb-8 relative z-10">
        <button
          type="button"
          onClick={() => setProvider('azure')}
          className={`
            flex-1 py-2.5 text-sm font-semibold rounded-md transition-all
            ${provider === 'azure' ? 'bg-gradient-to-r from-yellow-700 to-yellow-800' : ''} text-yellow-50 hover:brightness-125 hover:backdrop-brightness-125`}
        >
          Azure DevOps
        </button>
        <button
          type="button"
          onClick={() => setProvider('github')}
          disabled={true}
          className={`${provider === 'github' ? 'bg-yellow-800' : ''} cursor-not-allowed flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all
             text-yellow-50 hover:brightness-125 hover:backdrop-brightness-125`}
        >
          GitHub
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 relative z-10">

        {provider === 'github' ? (
          <div className="space-y-2">
            <label htmlFor="primary" className="text-xs font-bold uppercase tracking-wider text-yellow-50 ml-1">
              Usuário do GitHub
            </label>
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-yellow-50 group-focus-within:text-yellow-500 transition-colors" size={20} />
              <input
                id="primary"
                type="text"
                value={primaryInput}
                onChange={(e) => setPrimaryInput(e.target.value)}
                placeholder="ex: torvalds"
                className="w-full pl-12 pr-4 py-4 bg-gray-950 border border-gray-800 text-yellow-50 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-600/50 focus:border-yellow-600 transition-all placeholder-yellow-100/70"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="orgName" className="text-xs font-bold uppercase tracking-wider text-yellow-50 ml-1">
                Nome da Organização (Azure DevOps)
              </label>
              <div className="relative group">
                <Cloud className="absolute left-4 top-1/2 transform -translate-y-1/2 text-yellow-50 group-focus-within:text-yellow-500 transition-colors" size={20} />
                <input
                  id="orgName"
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Ex: InfortechMS"
                  className="w-full pl-12 pr-4 py-4 bg-gray-950 border border-gray-800 text-yellow-50 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-600/50 focus:border-yellow-600 transition-all placeholder-yellow-100/70"
                />
              </div>
              <p className="text-xs text-pretty text-yellow-50/75">O sistema irá buscar o trabalho em <strong className='text-yellow-50'>todos</strong> os projetos e repositórios desta organização.</p>
            </div>

            <div className="space-y-2 animate-fade-in">
              <label htmlFor="secondary" className="text-xs font-bold uppercase tracking-wider text-yellow-50 ml-1">
                Seus Nomes / E-mails (Separados por vírgula)
              </label>
              <div className="relative group">
                <User className="absolute left-4 top-1/2 transform -translate-y-1/2 text-yellow-50 group-focus-within:text-yellow-500 transition-colors" size={20} />
                <input
                  id="secondary"
                  type="text"
                  value={secondaryInput}
                  onChange={(e) => setSecondaryInput(e.target.value)}
                  placeholder="Ex: Scimmiesco, pedro.almeida"
                  required
                  className="w-full pl-12 pr-4 py-4 bg-gray-950 border border-gray-800 text-yellow-50 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-600/50 focus:border-yellow-600 transition-all placeholder-yellow-100/70"
                />
              </div>
              <p className="text-[10px] text-yellow-50/75 text-pretty">Use vírgulas se você comita com identidades diferentes (pessoal/corporativo).</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="year" className="text-xs font-bold uppercase tracking-wider text-yellow-50 ml-1">Ano Base</label>
            <div className="relative group">
              <Calendar className="absolute left-4 top-1/2 transform -translate-y-1/2 text-yellow-50 group-focus-within:text-yellow-500 transition-colors" size={20} />
              <select
                id="year"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full pl-12 pr-4 py-4 bg-gray-950 border border-gray-800 text-yellow-50 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-yellow-600 appearance-none bg-none"
              >
                {Array.from({ length: 5 }).map((_, i) => (
                  <option key={i} value={currentYear - i} className="bg-gray-900">{currentYear - i}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="token" className="text-xs font-bold uppercase tracking-wider text-yellow-50 ml-1">
              Token <span className="text-yellow-600 font-normal">({provider === 'azure' ? 'Obrigatório' : 'Opcional'})</span>
            </label>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-yellow-50 group-focus-within:text-yellow-500 transition-colors" size={20} />
              <input
                id="token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required={provider === 'azure'}
                placeholder={provider === 'github' ? "ghp_..." : "Personal Access Token"}
                className={`w-full pl-12 pr-4 py-4 bg-gray-950 border border-gray-800 text-yellow-50 rounded-md focus:outline-none focus:ring-2 transition-all placeholder-yellow-100/70 ${provider === 'azure' ? 'focus:ring-yellow-600/50 focus:border-yellow-600' : 'focus:ring-gray-700 focus:border-yellow-100/70'}`}
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`
            w-full py-4 px-6 text-yellow-50
             font-bold rounded-md transition-all 
             active:scale-[0.98] flex justify-center items-center text-lg 
             ${loading ? 'opacity-70 cursor-not-allowed' : ''} 
             ${provider === 'github' ? 'bg-gray-800 hover:bg-gray-700 border border-gray-700' : 'bg-gradient-to-r from-yellow-700 to-yellow-800 hover:from-yellow-600 hover:to-orange-600'}`}
        >
          {loading ? (
            <span className="flex items-center">
              <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5 text-yellow-50" />
              Carregando...
            </span>
          ) : (
            <span className="flex items-center">
              <LogIn className="mr-2 h-5 w-5" />
              Entrar
            </span>
          )}
        </button>
      </form>
    </div>
  );
};

export default InputForm;
