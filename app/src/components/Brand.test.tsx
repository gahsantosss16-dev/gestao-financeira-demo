import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';

afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.removeItem('associapec-sidebar-recolhida'); window.location.hash = ''; });
const root = resolve(__dirname, '../..');

describe('logomarca oficial', () => {
  it('os arquivos originais e as versões web existem em public/brand', () => {
    for (const f of ['associapec-logo.png', 'associapec-logo-transparente.png', 'associapec-logo-web.png', 'associapec-logo-web.webp', 'associapec-simbolo.png']) {
      expect(existsSync(resolve(root, 'public/brand', f))).toBe(true);
    }
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    expect(html).toContain('href="favicon.ico"');
    expect(html).toContain('apple-touch-icon.png');
    expect(html).not.toContain('data:image/svg+xml');
  });

  it('login mostra a logomarca oficial (não o ícone genérico)', async () => {
    render(<App />);
    const logo = await screen.findByRole('img', { name: /ASSOCIAPEC — Associação de Pecuaristas/ });
    expect(logo.getAttribute('src')).toBe('brand/associapec-logo-web.png');
    expect(document.querySelector('.brand-mark')).toBeNull();
  });

  it('menu lateral usa a marca completa e, recolhido, o símbolo', async () => {
    render(<App />);
    fireEvent.click(await screen.findByText('Financeiro'));
    await screen.findByRole('heading', { name: 'Painel financeiro' });
    const sidebar = screen.getByRole('complementary', { name: 'Menu principal' });
    const imgs = within(sidebar).getAllByRole('img');
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['brand/associapec-logo-web.png', 'brand/associapec-simbolo.png']);
    expect(document.querySelector('.brand-mark')).toBeNull();
    fireEvent.click(within(sidebar).getByRole('button', { name: /Recolher menu/ }));
    expect(document.querySelector('.sidebar-collapsed')).not.toBeNull();
    expect(localStorage.getItem('associapec-sidebar-recolhida')).toBe('1');
    expect(within(sidebar).getByRole('button', { name: /Expandir menu/ })).toBeTruthy();
  });
});
