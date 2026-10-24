import { forwardRef, type ChangeEvent, type InputHTMLAttributes } from "react";
import { digitosParaCentavos, formatCentavos } from "@/lib/money";
import { cn } from "@/lib/utils";
import { inputClass } from "./input";

// Reaproveitado do Neuro Hub Pro (src/components/ui/money-input.tsx): o estado
// é sempre um inteiro de centavos; o texto exibido é derivado dele.
type MoneyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  valueCentavos: number;
  onValueCentavosChange: (centavos: number) => void;
};

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { valueCentavos, onValueCentavosChange, placeholder = "R$ 0,00", className, ...props },
  ref,
) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onValueCentavosChange(digitosParaCentavos(event.target.value));
  }
  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={valueCentavos ? formatCentavos(valueCentavos) : ""}
      onChange={handleChange}
      placeholder={placeholder}
      className={cn(inputClass, "text-right tabular-nums", className)}
      {...props}
    />
  );
});
