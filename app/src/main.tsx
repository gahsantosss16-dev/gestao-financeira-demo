// deve ser o primeiro import: lê e limpa da URL os tokens dos links de e-mail do Supabase
import './auth/authRedirect';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/base.css';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
