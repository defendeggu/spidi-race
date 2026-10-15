import './style.css';
import './renderer';
import { loadAssets } from './render/assets';
import { App } from './ui/app';
import { html, setHtml } from './ui/html';

const ui = document.getElementById('ui')!;
setHtml(ui, html`
  <div class="menu panel loading">
    <h1 class="logo">SPIDI<span>RACE</span></h1>
    <div class="bar"><i id="load-bar"></i></div>
    <div class="hint" id="load-text">Lade Modelle und Texturen…</div>
  </div>`);
const bar = document.getElementById('load-bar')!;

loadAssets((done, total) => {
  bar.style.width = `${Math.round((done / total) * 100)}%`;
}).then((ok) => {
  if (!ok) console.info('Spidi Race läuft mit prozeduraler Grafik.');
  new App();
});
