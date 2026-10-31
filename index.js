// Convertir : ton appli d'origine (HTML et code inchangés), livrée en plugin.
// Ses données sont dans le dossier du plugin, que NeoBase sauvegarde (synchro cloud et sauvegardes) ; à la première ouverture elle reprend ce que tu avais dans NeoBase.
// Elle demande l'accès complet pour utiliser les outils d'interface de NeoBase. NeoBase ne l'ouvre que si elle est signée.
const HTML = "<div class=\"appWrap\">\n      <div class=\"agHead\"><span class=\"label\">Convertir</span><span class=\"hint\" id=\"cvCaps\"></span></div>\n      <div id=\"cvDrop\" class=\"px\"><b>Glisse des fichiers ici</b><span class=\"hint\">ou</span><button class=\"btn main px\" id=\"cvPick\">Choisir des fichiers…</button>\n        <div class=\"hint\">Images, sons, vidéos, tableaux (Excel, ODS, CSV, JSON) et documents (Word, Markdown, HTML, texte → PDF…). Le fichier converti est créé à côté de l'original, qui n'est jamais modifié.</div></div>\n      <div class=\"sysCard px\"><span class=\"label\">Réglages</span>\n        <div class=\"bdPlan\">Taille <select class=\"f\" id=\"cvSize\"><option value=\"full\">d'origine</option><option value=\"75\">75 %</option><option value=\"50\">50 %</option><option value=\"25\">25 %</option><option value=\"1920\">1920 px max</option><option value=\"1280\">1280 px max</option><option value=\"720\">720 px max</option><option value=\"512\">512 px max</option><option value=\"256\">256 px (icône)</option></select>\n          Qualité <select class=\"f\" id=\"cvQuality\"><option value=\"high\">haute</option><option value=\"normal\" selected>normale</option><option value=\"small\">fichier léger</option></select>\n          <label class=\"check\"><input type=\"checkbox\" id=\"cvSquare\"> Recadrer en carré (icônes de vignettes)</label></div>\n        <div class=\"hint\">La taille, la qualité et le recadrage s'appliquent aux images et aux vidéos.</div></div>\n      <div id=\"cvList\"></div>\n      <div class=\"row\"><button class=\"btn main px\" id=\"cvGo\">Tout convertir</button><button class=\"btn ghost px\" id=\"cvClear\">Vider la liste</button></div>\n    </div>";
export default async function (ctx) {
  const view = ctx.view;
  if (!ctx.host) { view.textContent = "Ce plugin doit être approuvé par NeoBase pour s'ouvrir."; return; }
  const host = ctx.host, { el, toast, sfx, ask, newTab, pixIcon, PIX, WX } = host;
  const folder = ctx.folder, legacy = ctx.legacy || {};
  view.innerHTML = HTML;
  const $ = id => id === "convApp" ? view : (view.querySelector('#' + id) || document.getElementById(id));  // les identifiants de ta vue d'abord, puis ceux de la page (fenêtres, menus)
  const doc = async n => { try { return await folder.read(n); } catch { return null; } };
  const __icon = () => ctx.icon;  // l'icône de ce plugin
  // ---- ton code d'origine ----
/* ---------- Convertir app: any file dropped or chosen becomes a new file in another format, next to the original (converter.js does the work) ---------- */
let cvCaps = null, cvItems = [], cvBusy = false, cvSeq = 0;
const CV_LABEL = {image: 'IMAGE', audio: 'SON', video: 'VIDÉO', table: 'TABLEAU', doc: 'DOCUMENT'};
const cvKind = f => { const e = f.split('.').pop().toLowerCase(); return Object.keys(cvCaps.kinds).find(k => cvCaps.kinds[k].includes(e)) || null; };
// the usual target of each kind, or a second choice when the file is already in that format
const CV_DEF = {image: ['png', 'webp'], audio: ['mp3', 'wav'], video: ['mp4', 'mp3'], table: ['xlsx', 'csv'], doc: ['pdf', 'html']};
const cvDefault = (kind, f) => { const [a, b] = CV_DEF[kind]; return f.toLowerCase().endsWith('.' + a) ? b : a; };
const kb = b => b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' Ko' : (b / 1048576).toFixed(1).replace('.', ',') + ' Mo';
async function cvOpen() { cvCaps ??= await neo.convCaps(); $('cvCaps').textContent = cvCaps.ffmpeg ? '' : "ffmpeg introuvable : seuls les tableaux et documents peuvent être convertis."; cvRender(); }
function cvAdd(paths) {
  for (const f of paths) if (f && !cvItems.some(i => i.file === f && i.state !== 'done')) {
    const kind = cvKind(f);
    cvItems.push({id: ++cvSeq, file: f, kind, to: kind && cvDefault(kind, f), state: kind ? 'wait' : 'err', pct: 0, msg: kind ? '' : 'format non pris en charge'});
  }
  cvRender();
}
function cvRender() {
  if (!cvCaps) return;
  $('cvList').replaceChildren(...cvItems.map(it => {
    const r = el('div', 'sysCard px cvItem ' + it.state), name = it.file.split(/[\\/]/).pop(), head = el('div', 'cvHead');
    head.append(el('span', 'badge', it.kind ? CV_LABEL[it.kind] : '?'), el('span', 'tn', name));
    if (it.kind) {
      const sel = el('select', 'f'); sel.disabled = it.state === 'run';
      sel.append(...cvCaps.targets[it.kind].map(t => new Option('→ ' + t.toUpperCase(), t)));
      sel.value = it.to; sel.onchange = () => { it.to = sel.value; if (it.state !== 'run') { it.state = 'wait'; it.msg = ''; } cvRender(); };
      head.append(sel);
    }
    const x = el('button', 'x', 'X'); x.title = 'Retirer de la liste'; x.disabled = it.state === 'run';
    x.onclick = () => { cvItems = cvItems.filter(o => o !== it); cvRender(); };
    head.append(x); r.append(head);
    const bar = el('div', 'dlBar'), fill = el('i', it.state === 'err' ? 'warn' : ''); fill.style.width = (it.state === 'done' || it.state === 'err' ? 100 : it.pct) + '%'; bar.append(fill);
    const info = el('div', 'dlInfo');
    info.append(el('span', '', {wait: 'Prêt à convertir', run: 'Conversion… ' + Math.round(it.pct) + ' %', done: 'Terminé · ' + it.msg, err: 'Échec : ' + it.msg}[it.state]), el('span', 'sp'));
    if (it.state === 'done') {
      const act = (label, f) => { const b = el('button', '', label); b.onclick = f; info.append(b); };
      act('OUVRIR', () => neo.openFile(it.output)); act('DOSSIER', () => neo.showFile(it.output));
    }
    r.append(bar, info);
    return r;
  }));
  $('cvGo').disabled = cvBusy || !cvItems.some(i => i.state === 'wait');
  $('cvGo').textContent = cvBusy ? 'Conversion en cours…' : 'Tout convertir';
}
async function cvRun() {
  if (cvBusy) return;
  cvBusy = true;
  const opts = {size: $('cvSize').value, quality: $('cvQuality').value, square: $('cvSquare').checked};
  for (const it of cvItems.filter(i => i.state === 'wait')) {  // one at a time: video encoding already uses every core
    it.state = 'run'; it.pct = 0; cvRender();
    try { const r = await neo.convRun({id: it.id, file: it.file, to: it.to, opts}); it.state = 'done'; it.output = r.output; it.msg = r.output.split(/[\\/]/).pop() + ' · ' + kb(r.size); }
    catch (e) { it.state = 'err'; it.msg = e.message.replace(/^.*Error: /, ''); }
    cvRender();
  }
  cvBusy = false; cvRender();
  const done = cvItems.filter(i => i.state === 'done').length;
  if (done) toast(done + ' fichier' + (done > 1 ? 's' : '') + ' converti' + (done > 1 ? 's' : ''));
}
if (window.neo) {
  neo.onConvProgress(({id, pct}) => { const it = cvItems.find(i => i.id === id); if (it) { it.pct = pct; cvRender(); } });
  $('cvPick').onclick = async () => cvAdd(await neo.convPick());
  $('cvGo').onclick = cvRun;
  $('cvClear').onclick = () => { cvItems = cvItems.filter(i => i.state === 'run'); cvRender(); };
  const drop = $('convApp');
  drop.ondragover = e => { e.preventDefault(); $('cvDrop').classList.add('over'); };
  drop.ondragleave = e => { if (!drop.contains(e.relatedTarget)) $('cvDrop').classList.remove('over'); };
  drop.ondrop = e => { e.preventDefault(); $('cvDrop').classList.remove('over'); cvAdd([...e.dataTransfer.files].map(f => neo.pathOf(f))); };
}  // (non indenté : les textes sur plusieurs lignes restent exactement les tiens)
  // ---- fin ----
  window.cvOpen = cvOpen; window.cvAdd = cvAdd;  // ce que NeoBase (Fichiers, Visionneuse, recherche dans la page) peut demander à ce plugin
  ctx.onOpen(() => { cvOpen(); });
}
