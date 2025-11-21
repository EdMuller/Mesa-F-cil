
import React, { useState } from 'react';

interface ConfigModalProps {
    onSave: () => void;
}

const ConfigModal: React.FC<ConfigModalProps> = ({ onSave }) => {
    const [url, setUrl] = useState('');
    const [key, setKey] = useState('');

    const handleSave = () => {
        try {
            const safeUrl = url.trim();
            const safeKey = key.trim();

            if (safeUrl && safeKey) {
                localStorage.setItem('supabase_url', safeUrl);
                localStorage.setItem('supabase_key', safeKey);
                onSave();
            } else {
                alert("Preencha ambos os campos.");
            }
        } catch (error) {
            console.error("Erro ao salvar configurações:", error);
            alert("Não foi possível salvar as credenciais no navegador. Verifique se o armazenamento local (Local Storage) está habilitado.");
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-8">
                <h2 className="text-2xl font-bold mb-4 text-blue-600">Configuração do Servidor</h2>
                <p className="text-gray-600 mb-6 text-sm">
                    Para persistir os dados e permitir acesso multi-dispositivo, este aplicativo requer um projeto <strong>Supabase</strong>.
                </p>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Project URL</label>
                        <input 
                            type="text" 
                            name="sb_project_url_config"
                            autoComplete="off"
                            value={url} 
                            onChange={(e) => setUrl(e.target.value)} 
                            placeholder="https://xyz.supabase.co"
                            className="mt-1 w-full p-3 border border-gray-300 rounded-md"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">API Key (Anon/Public)</label>
                        <input 
                            type="password"
                            name="sb_api_key_config"
                            autoComplete="off" 
                            value={key} 
                            onChange={(e) => setKey(e.target.value)} 
                            placeholder="eyJh..."
                            className="mt-1 w-full p-3 border border-gray-300 rounded-md"
                        />
                    </div>
                </div>

                <button 
                    onClick={handleSave}
                    className="w-full mt-8 bg-blue-600 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:bg-blue-700 transition-colors"
                >
                    Salvar e Conectar
                </button>
                
                <p className="mt-4 text-xs text-center text-gray-400">
                    Esses dados serão salvos apenas no seu navegador local.
                </p>
            </div>
        </div>
    );
};

export default ConfigModal;
