import { useState } from 'react';
import { Icon } from './Icon';

// Logomarca oficial da ASSOCIAPEC. Os arquivos ficam em public/brand/; enquanto
// não forem publicados, exibe-se a marca textual (nunca uma recriação da logo).
export const LOGO_TRANSPARENT = 'brand/associapec-logo-transparente.png';
export const LOGO_LIGHT_BG = 'brand/associapec-logo.png';

export function BrandLogo({ variant = 'sidebar' }: { variant?: 'sidebar' | 'login' }) {
  const [failed, setFailed] = useState(false);
  if (!failed) {
    return (
      <span className={`brand-logo ${variant}`}>
        <img src={LOGO_TRANSPARENT} alt="ASSOCIAPEC — Associação de Pecuaristas de Fazendas Certificadas" onError={() => setFailed(true)} />
        {variant === 'sidebar' && <small>Gestão Financeira</small>}
      </span>
    );
  }
  return (
    <span className={`brand ${variant === 'login' ? 'login-brand' : ''}`}>
      <span className="brand-mark" aria-hidden="true"><Icon name="check" /></span>
      <span className="brand-text"><b>ASSOCIAPEC</b><small>{variant === 'login' ? 'Associação de Pecuaristas de Fazendas Certificadas' : 'Gestão Financeira'}</small></span>
    </span>
  );
}
