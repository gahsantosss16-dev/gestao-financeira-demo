// Logomarca oficial da ASSOCIAPEC — arquivos originais enviados pela associação
// (public/brand/). Versões web: marca completa sem as margens vazias e símbolo
// (círculo com os animais) separado da palavra por uma faixa transparente do
// próprio arquivo original. Nenhuma recriação, distorção ou alteração de cores.
import { useState } from 'react';

export const LOGO_FULL = 'brand/associapec-logo-web.png';
export const LOGO_FULL_WEBP = 'brand/associapec-logo-web.webp';
export const LOGO_SYMBOL = 'brand/associapec-simbolo.png';
const ALT = 'ASSOCIAPEC — Associação de Pecuaristas de Fazendas Certificadas';

type Variant = 'sidebar' | 'login' | 'symbol';

export function BrandLogo({ variant = 'sidebar' }: { variant?: Variant }) {
  const [failed, setFailed] = useState(false);
  // se o arquivo não carregar (ex.: conexão), mostra só o nome — nunca um ícone genérico
  if (failed) return <span className={`brand-fallback brand-${variant}`}>ASSOCIAPEC</span>;
  if (variant === 'symbol') {
    return <span className="brand-logo brand-symbol-img"><img src={LOGO_SYMBOL} alt={ALT} width={44} height={44} onError={() => setFailed(true)} /></span>;
  }
  return (
    // prefixo brand-: a classe "sidebar" já pertence à barra lateral (position: fixed)
    <span className={`brand-logo brand-${variant}`}>
      <picture>
        <source srcSet={LOGO_FULL_WEBP} type="image/webp" />
        <img src={LOGO_FULL} alt={ALT} width={518} height={430} onError={() => setFailed(true)} />
      </picture>
      {variant === 'sidebar' && <small>Gestão Financeira</small>}
    </span>
  );
}
