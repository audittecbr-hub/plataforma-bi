"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, Loader2 } from 'lucide-react';

export default function ExecutiveAgent() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Qual seria sua análise hoje? 📊' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para a última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      // Usando URL absoluta do backend que subimos na porta 3001
      const res = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: userMsg }],
          // Podemos passar contextos reais aqui depois (ex: qual relatório está aberto)
          context: { reportId: 'metas_dashboard' }
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`Erro na API (Status ${res.status}):`, errText);
        
        if (res.status === 500 && (errText.includes('Quota') || errText.includes('quota') || errText.includes('rate limit') || errText.includes('429') || errText.includes('demand'))) {
          setMessages(prev => [...prev, { role: 'assistant', content: '⏳ O modelo da inteligência artificial (Gemini) está com alta demanda neste momento ou o limite gratuito foi atingido. Por favor, aguarde cerca de 1 minuto antes de enviar a próxima pergunta!' }]);
        } else {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Desculpe, houve um erro inesperado ao conectar com a inteligência artificial. Por favor, tente novamente em alguns instantes.' }]);
        }
        return;
      }

      const data = await JSON.parse(await res.text());
      setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
    } catch (error: unknown) {
      console.error("Erro no chat:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Desculpe, houve um erro de conexão com o servidor. Verifique sua internet ou tente novamente em instantes.' }]);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className="absolute bottom-24 right-0 w-[400px] max-h-[650px] bg-[#0F172A]/90 backdrop-blur-2xl border border-slate-700/60 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col font-sans ring-1 ring-white/10"
          >
            {/* Premium Header */}
            <div className="relative p-5 bg-gradient-to-b from-slate-800/80 to-slate-900/40 border-b border-slate-700/60 flex items-center justify-between">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#EAB308]/50 to-transparent"></div>
              <div className="flex items-center gap-4">
                <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-[#EAB308]/30 shadow-[0_0_20px_rgba(234,179,8,0.2)] bg-slate-800 flex items-center justify-center">
                  <img src="/avatar.png" alt="Executive" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = 'https://ui-avatars.com/api/?name=AI&background=0D1424&color=EAB308' }} />
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent"></div>
                </div>
                <div>
                  <h3 className="text-slate-100 font-bold text-base tracking-wide">JC I.A</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="relative flex w-2 h-2">
                      <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping"></span>
                      <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-emerald-400 text-xs font-medium tracking-wider uppercase">Online</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all duration-300 border border-slate-700/50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Chat Area */}
            <div className="flex-1 p-5 overflow-y-auto min-h-[350px] max-h-[450px] space-y-5 scrollbar-thin scrollbar-thumb-slate-700/50">
              {messages.map((m, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10, filter: 'blur(5px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ delay: i * 0.1 }}
                  key={i} 
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {m.role !== 'user' && (
                    <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 mr-3 border border-slate-700/50 shadow-md">
                       <img src="/avatar.png" alt="AI" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = 'https://ui-avatars.com/api/?name=AI&background=0D1424&color=EAB308' }} />
                    </div>
                  )}
                  <div 
                    className={`max-w-[80%] p-4 text-sm leading-relaxed shadow-lg relative ${
                      m.role === 'user' 
                        ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-2xl rounded-tr-sm border border-blue-500/30' 
                        : 'bg-slate-800/60 text-slate-200 border border-slate-700/50 rounded-2xl rounded-tl-sm backdrop-blur-md'
                    }`}
                  >
                    {m.content}
                  </div>
                </motion.div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                   <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 mr-3 border border-slate-700/50 shadow-md">
                       <img src="/avatar.png" alt="AI" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = 'https://ui-avatars.com/api/?name=AI&background=0D1424&color=EAB308' }} />
                    </div>
                  <div className="bg-slate-800/60 border border-slate-700/50 p-4 rounded-2xl rounded-tl-sm flex gap-2 items-center backdrop-blur-md shadow-lg">
                    <span className="w-2 h-2 rounded-full bg-[#EAB308] animate-pulse" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-[#EAB308] animate-pulse" style={{ animationDelay: '200ms' }} />
                    <span className="w-2 h-2 rounded-full bg-[#EAB308] animate-pulse" style={{ animationDelay: '400ms' }} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-slate-900/80 border-t border-slate-700/60 backdrop-blur-2xl">
              <form onSubmit={handleSubmit} className="relative flex items-center">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Solicite uma análise financeira..."
                  className="w-full bg-slate-950 text-slate-100 placeholder-slate-500 border border-slate-700/80 rounded-2xl py-4 pl-5 pr-14 focus:outline-none focus:ring-2 focus:ring-[#EAB308]/50 focus:border-[#EAB308]/30 transition-all text-sm shadow-inner"
                  disabled={isLoading}
                />
                <button 
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="absolute right-2 p-2.5 bg-gradient-to-r from-[#EAB308] to-amber-600 hover:from-amber-500 hover:to-amber-700 text-slate-900 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(234,179,8,0.3)] group"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Send className="w-4 h-4 text-white group-hover:scale-110 transition-transform" />}
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Mascot & Speech Bubble */}
      <div className="relative flex items-end justify-end">
        {/* Speech Bubble */}
        <AnimatePresence>
          {!isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.8, x: 20 }}
              transition={{ delay: 1, type: 'spring', stiffness: 200, damping: 15 }}
              className="absolute right-20 bottom-4 mb-2 mr-2 z-40 origin-bottom-right"
            >
              <div className="relative bg-white text-slate-800 text-sm font-medium px-5 py-3 rounded-2xl shadow-[0_10px_25px_rgba(0,0,0,0.3)] border border-slate-200 whitespace-nowrap cursor-pointer hover:bg-slate-50 transition-colors"
                   onClick={() => setIsOpen(true)}>
                Qual será a análise de hoje? 📊
                {/* Bubble tail */}
                <div className="absolute -right-2 bottom-4 w-4 h-4 bg-white border-r border-b border-slate-200 transform rotate-45"></div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mascot Avatar */}
        <motion.button
          onClick={() => setIsOpen(!isOpen)}
          whileHover={{ scale: 1.05, y: -4 }}
          whileTap={{ scale: 0.95 }}
          className="relative w-[72px] h-[72px] rounded-full flex items-center justify-center shadow-[0_10px_40px_rgba(0,0,0,0.5)] group overflow-hidden z-50 bg-slate-900 ring-2 ring-[#EAB308]/80 hover:ring-[#EAB308] transition-all duration-300"
        >
          <img 
            src="/avatar.png" 
            alt="JC I.A" 
            className="w-full h-full object-cover scale-110 object-top" 
            onError={(e) => { e.currentTarget.src = 'https://ui-avatars.com/api/?name=AI&background=0D1424&color=EAB308' }} 
          />
          
          {/* Subtle Glow inside */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-t from-black/40 to-transparent"></div>
          
          {/* Notification Dot */}
          {!isOpen && (
            <span className="absolute top-1 right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border border-slate-900 shadow-sm"></span>
            </span>
          )}
        </motion.button>
      </div>
    </div>
  );
}
