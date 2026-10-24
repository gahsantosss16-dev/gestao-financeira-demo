// Reaproveitado do LSB: Enter em <input> de um <form> dispara submit
// implícito e salvava/fechava modais sem ação explícita. Bloqueia Enter só em
// campos de texto; preserva <textarea> e o próprio botão.
type EnterGuardEvent = {
  key: string;
  target: EventTarget | null;
  preventDefault: () => void;
};

export function bloquearEnterComoSubmit(event: EnterGuardEvent) {
  if (event.key !== "Enter") return;
  const tagName = (event.target as HTMLElement | null)?.tagName;
  if (tagName === "TEXTAREA" || tagName === "BUTTON") return;
  event.preventDefault();
}
