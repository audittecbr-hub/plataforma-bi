// Server Component — sem 'use client', sem framer-motion.
// Animações via CSS keyframes definidos em globals.css (orb1-pulse … orb4-pulse).
export function LoginGlow() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Orb central — ouro */}
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        width: 700, height: 700,
        marginTop: -350, marginLeft: -350,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(213,174,119,0.18) 0%, transparent 70%)',
        filter: 'blur(50px)',
        animation: 'orb1-pulse 5s ease-in-out infinite',
      }} />

      {/* Orb inferior — bronze */}
      <div style={{
        position: 'absolute',
        bottom: -120, left: '50%',
        marginLeft: -450,
        width: 900, height: 450,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(146,114,69,0.14) 0%, transparent 70%)',
        filter: 'blur(70px)',
        animation: 'orb2-pulse 8s ease-in-out infinite',
        animationDelay: '-3s',
      }} />

      {/* Orb superior-direito — destaque sutil */}
      <div style={{
        position: 'absolute',
        top: -80, right: -120,
        width: 480, height: 480,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(213,174,119,0.09) 0%, transparent 70%)',
        filter: 'blur(90px)',
        animation: 'orb3-pulse 7s ease-in-out infinite',
        animationDelay: '-5s',
      }} />

      {/* Orb inferior-esquerdo — contraponto */}
      <div style={{
        position: 'absolute',
        bottom: -60, left: -100,
        width: 380, height: 380,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(146,114,69,0.10) 0%, transparent 70%)',
        filter: 'blur(80px)',
        animation: 'orb4-pulse 9s ease-in-out infinite',
        animationDelay: '-1.5s',
      }} />
    </div>
  )
}
