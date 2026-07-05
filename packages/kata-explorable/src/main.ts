import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

const target = document.getElementById('app');
if (!target) {
  throw new Error('No se encontró el elemento #app en index.html');
}

const app = mount(App, { target });

export default app;
