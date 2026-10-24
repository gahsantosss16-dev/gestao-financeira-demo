import { forwardRef, useLayoutEffect, useRef, type InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  /**
   * Campo com máscara numérica (CPF/CNPJ, IE, CEP, telefone, valor): após a
   * reformatação, o cursor volta para depois do mesmo número de dígitos em vez
   * de pular para o fim. Correção portada do LSB (src/components/ui/input.tsx).
   */
  numericMaskCaret?: boolean;
};

export const TextInput = forwardRef<HTMLInputElement, Props>(function TextInput({ numericMaskCaret, onChange, className, ...props }, ref) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingSelection = useRef<{ start: number; end: number; direction: 'forward' | 'backward' | 'none' } | null>(null);
  const pendingDigits = useRef<number | null>(null);

  useLayoutEffect(() => {
    const input = inputRef.current;
    const selection = pendingSelection.current;
    const digits = pendingDigits.current;
    pendingSelection.current = null;
    pendingDigits.current = null;
    if (!input || document.activeElement !== input) return;
    if (digits !== null) {
      let position = 0;
      let count = 0;
      while (position < input.value.length && count < digits) {
        if (/\d/.test(input.value[position])) count++;
        position++;
      }
      input.setSelectionRange(position, position);
      return;
    }
    if (selection) {
      try { input.setSelectionRange(selection.start, selection.end, selection.direction); } catch { /* tipos sem seleção */ }
    }
  });

  return (
    <input
      className={className ?? 'input'}
      ref={(node) => {
        inputRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      {...props}
      onChange={(e) => {
        const input = e.currentTarget;
        if (input.selectionStart !== null) {
          if (numericMaskCaret) pendingDigits.current = (input.value.slice(0, input.selectionStart).match(/\d/g) ?? []).length;
          else if (input.selectionEnd !== null && /^(text|search|tel|url|password)?$/.test(input.type)) {
            pendingSelection.current = { start: input.selectionStart, end: input.selectionEnd, direction: input.selectionDirection ?? 'none' };
          }
        }
        onChange?.(e);
      }}
    />
  );
});

/** Campo monetário em reais: digita-se livremente "1.234,56"; ao sair, formata. */
export function MoneyInput({ value, onChange, ...props }: Omit<Props, 'value' | 'onChange'> & { value: string; onChange(v: string): void }) {
  return (
    <div className="money-input">
      <span aria-hidden="true">R$</span>
      <TextInput
        {...props}
        inputMode="decimal"
        placeholder={props.placeholder ?? '0,00'}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (!v) return;
          const normalized = v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v;
          const num = Number(normalized);
          if (Number.isFinite(num)) onChange(num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
          props.onBlur?.(e);
        }}
      />
    </div>
  );
}
