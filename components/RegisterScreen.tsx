
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Role } from '../types';

interface RegisterScreenProps {
    role: Role;
    onBack: () => void;
}

const RegisterScreen: React.FC<RegisterScreenProps> = ({ role, onBack }) => {
    const { registerCustomer, registerEstablishment } = useAppContext();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState(''); 
    const [cep, setCep] = useState(''); // Customer only
    const [phrase, setPhrase] = useState(''); // Establishment only
    const [photo, setPhoto] = useState<string | null>(null); // Establishment only
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showCamera, setShowCamera] = useState(false);

    const isEstablishment = role === Role.ESTABLISHMENT;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        
        try {
            if (isEstablishment) {
                await registerEstablishment(name, phone, email, password, photo, phrase);
            } else {
                await registerCustomer(name, email, password, phone, cep);
            }
            
            // Sucesso
            alert("Cadastro realizado com sucesso!");
            onBack(); // Volta para a tela anterior (Login ou Seleção)
            
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Falha no cadastro. Verifique os dados e tente novamente.');
        } finally {
            setIsLoading(false);
        }
    };
    
    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setPhoto(event.target?.result as string);
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    }
    
    const handlePhotoCapture = (imageDataUrl: string) => {
        setPhoto(imageDataUrl);
        setShowCamera(false);
    }

    if (showCamera) {
        return <CameraCapture onCapture={handlePhotoCapture} onCancel={() => setShowCamera(false)} />
    }


    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
             <button onClick={onBack} className="absolute top-4 left-4 text-blue-600 hover:text-blue-800">
                    &larr; Voltar
             </button>
            <div className="w-full max-w-sm text-center">
                <h1 className="text-3xl font-bold text-blue-600 mb-2">Criar Conta de {isEstablishment ? 'Estabelecimento' : 'Cliente Fidelizado'}</h1>
                <p className="text-md text-slate-600 mb-8">Preencha os dados para começar.</p>
                
                <form onSubmit={handleSubmit} className="w-full bg-white p-8 rounded-2xl shadow-lg text-left space-y-4" autoComplete="off">
                    {error && <p className="bg-red-100 text-red-700 p-3 rounded-md text-center text-sm">{error}</p>}
                    
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700">{isEstablishment ? 'Nome do Estabelecimento' : 'Seu Nome'}</label>
                        <input id="name" name="user_name" type="text" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full p-3 border border-gray-300 rounded-md" required autoComplete="off" />
                    </div>

                    {isEstablishment ? (
                        <>
                            <div>
                                <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Telefone de Contato (para clientes favoritarem)</label>
                                <input id="phone" name="est_phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full p-3 border border-gray-300 rounded-md" required autoComplete="off"/>
                            </div>
                            <div>
                                <label htmlFor="phrase" className="block text-sm font-medium text-gray-700">Frase de Efeito</label>
                                <input id="phrase" name="est_phrase" type="text" value={phrase} onChange={(e) => setPhrase(e.target.value)} className="mt-1 w-full p-3 border border-gray-300 rounded-md" placeholder="Ex: A melhor pizza da cidade!" autoComplete="off"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Foto do Estabelecimento</label>
                                <div className="mt-1 flex items-center gap-4">
                                    {photo ? (
                                        <img src={photo} alt="Preview" className="w-20 h-20 rounded-lg object-cover" />
                                    ) : (
                                        <div className="w-20 h-20 rounded-lg bg-gray-200 flex items-center justify-center text-gray-400">Foto</div>
                                    )}
                                    <div className="flex flex-col gap-2">
                                        <label htmlFor="photo-upload" className="cursor-pointer bg-white py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm leading-4 font-medium text-gray-700 hover:bg-gray-50 text-center">
                                            Escolher Arquivo
                                        </label>
                                        <input id="photo-upload" name="photo-upload" type="file" className="sr-only" onChange={handlePhotoUpload} accept="image/*" />
                                        <button type="button" onClick={() => setShowCamera(true)} className="bg-white py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm leading-4 font-medium text-gray-700 hover:bg-gray-50">Tirar Foto</button>
                                        {photo && <button type="button" onClick={() => setPhoto(null)} className="bg-red-100 py-1 px-2 border border-red-200 rounded-md text-sm text-red-700 hover:bg-red-200">Limpar Foto</button>}
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div>
                                <label htmlFor="customer-phone" className="block text-sm font-medium text-gray-700">Número de Telefone</label>
                                <input id="customer-phone" name="cust_phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full p-3 border border-gray-300 rounded-md" autoComplete="off" />
                            </div>
                             <div>
                                <label htmlFor="customer-cep" className="block text-sm font-medium text-gray-700">CEP</label>
                                <input id="customer-cep" name="cust_cep" type="text" value={cep} onChange={(e) => setCep(e.target.value)} className="mt-1 w-full p-3 border border-gray-300 rounded-md" autoComplete="off" />
                            </div>
                        </>
                    )}
                    
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                        <input id="email" name="new_user_email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full p-3 border border-gray-300 rounded-md" required autoComplete="off" />
                    </div>
                     <div>
                        <label htmlFor="password"className="block text-sm font-medium text-gray-700">Senha</label>
                        <input id="password" name="new_user_password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full p-3 border border-gray-300 rounded-md" required autoComplete="new-password" />
                    </div>
                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className={`w-full text-white font-bold py-3 px-6 rounded-lg shadow-md transition-colors duration-300 ${isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                        {isLoading ? 'Cadastrando...' : 'Cadastrar'}
                    </button>
                </form>
            </div>
        </div>
    );
};

const CameraCapture: React.FC<{onCapture: (data: string) => void, onCancel: () => void}> = ({ onCapture, onCancel }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const startCamera = useCallback(async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
            streamRef.current = mediaStream;
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        } catch (err) {
            console.error("Error accessing camera:", err);
            alert("Não foi possível acessar a câmera. Verifique as permissões do seu navegador.");
            onCancel();
        }
    }, [onCancel]);
    
    useEffect(() => {
        startCamera();
        return () => {
            streamRef.current?.getTracks().forEach(track => track.stop());
        }
    }, [startCamera]);

    const handleCapture = () => {
        if (videoRef.current && canvasRef.current) {
            const context = canvasRef.current.getContext('2d');
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
            context?.drawImage(videoRef.current, 0, 0, videoRef.current.videoWidth, videoRef.current.videoHeight);
            const dataUrl = canvasRef.current.toDataURL('image/jpeg');
            onCapture(dataUrl);
            streamRef.current?.getTracks().forEach(track => track.stop());
        }
    };

    return (
        <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
            <canvas ref={canvasRef} className="hidden"></canvas>
            <div className="absolute bottom-4 flex gap-4">
                 <button onClick={onCancel} className="px-4 py-2 bg-gray-500 text-white rounded-md">Cancelar</button>
                 <button onClick={handleCapture} className="px-4 py-2 bg-blue-600 text-white rounded-md">Tirar Foto</button>
            </div>
        </div>
    );
};


export default RegisterScreen;
