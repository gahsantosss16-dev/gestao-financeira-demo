import type { ChangeEvent, ComponentProps } from "react";
import { posicaoAposDigitos } from "@/lib/caret";
import { onlyDigits } from "@/lib/documento";
import { Input } from "./input";

type MaskedInputProps = Omit<ComponentProps<"input">, "value" | "onChange"> & {
  /** Somente dígitos (estado real do formulário). */
  digits: string | null;
  maxDigits: number;
  format: (digits: string) => string;
  onDigitsChange: (digits: string | null) => void;
};

/**
 * Campo com máscara que preserva a posição do cursor: editar no meio do CPF,
 * telefone ou CEP não joga o cursor para o fim.
 */
export function MaskedInput({ digits, maxDigits, format, onDigitsChange, ...props }: MaskedInputProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const el = event.target;
    const antesDoCursor = onlyDigits(el.value.slice(0, el.selectionStart ?? el.value.length)).length;
    const next = onlyDigits(el.value).slice(0, maxDigits);
    onDigitsChange(next || null);
    requestAnimationFrame(() => {
      if (document.activeElement !== el) return;
      const pos = posicaoAposDigitos(el.value, Math.min(antesDoCursor, next.length));
      el.setSelectionRange(pos, pos);
    });
  }
  return <Input inputMode="numeric" value={format(digits ?? "")} onChange={handleChange} {...props} />;
}
