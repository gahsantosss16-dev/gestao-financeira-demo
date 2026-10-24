import { act, cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { formatDocumentProgressive } from '../lib/documents';
import { TextInput } from './TextInput';

afterEach(cleanup);

function DocField() {
  const [v, setV] = useState('');
  return <TextInput aria-label="doc" numericMaskCaret value={formatDocumentProgressive(v, 'PJ')} onChange={(e) => setV(e.target.value.replace(/\D/g, ''))} />;
}

// simula a digitação nativa: altera o valor/cursor e dispara o evento input
function typeAt(input: HTMLInputElement, value: string, caret: number) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('campo com máscara (correção de cursor do LSB)', () => {
  it('mantém o cursor após o dígito inserido no meio do CNPJ', () => {
    const { getByLabelText } = render(<DocField />);
    const input = getByLabelText('doc') as HTMLInputElement;
    input.focus();
    typeAt(input, '1122233300018', 13);
    expect(input.value).toBe('11.222.333/0001-8');
    // corrige o 3º dígito: insere "9" depois de "11.2" (cursor na posição 5)
    typeAt(input, '11.2922.333/0001-8', 5);
    expect(input.value).toBe('11.292.233/3000-18');
    // o cursor fica logo após o "9" digitado (4 dígitos antes dele), não no fim
    expect(input.selectionStart).toBe(5);
  });
});
