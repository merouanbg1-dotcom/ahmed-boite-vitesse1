/* =====================================================================
   Factures : génération PDF sans bibliothèque externe (A4, Helvetica)
   + montant en lettres + version imprimable (pour l'arabe)
   ===================================================================== */
(function () {
  /* ---------- Montant en lettres (français) ---------- */
  const U = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
  const D = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];
  function lt100(n) {
    if (n < 17) return U[n];
    if (n < 20) return 'dix-' + U[n - 10];
    const t = Math.floor(n / 10), u = n % 10;
    if (t === 7) return 'soixante' + (u === 1 ? '-et-' : '-') + lt100(10 + u);
    if (t === 8) return u === 0 ? 'quatre-vingts' : 'quatre-vingt-' + U[u];
    if (t === 9) return 'quatre-vingt-' + lt100(10 + u);
    return D[t] + (u === 0 ? '' : u === 1 ? '-et-un' : '-' + U[u]);
  }
  function lt1000(n, final) {
    const h = Math.floor(n / 100), r = n % 100;
    let s = '';
    if (h === 1) s = 'cent'; else if (h > 1) s = U[h] + '-cent' + (r === 0 && final ? 's' : '');
    if (r) s += (s ? '-' : '') + lt100(r);
    if (!final && s.endsWith('quatre-vingts')) s = s.slice(0, -1);
    return s;
  }
  function words(n) {
    n = Math.floor(n);
    if (n === 0) return 'zéro';
    const parts = [];
    const bil = Math.floor(n / 1e9), mil = Math.floor((n % 1e9) / 1e6), th = Math.floor((n % 1e6) / 1000), rest = n % 1000;
    if (bil) parts.push(lt1000(bil, true) + ' milliard' + (bil > 1 ? 's' : ''));
    if (mil) parts.push(lt1000(mil, true) + ' million' + (mil > 1 ? 's' : ''));
    if (th) parts.push(th === 1 ? 'mille' : lt1000(th, false) + '-mille');
    if (rest) parts.push(lt1000(rest, true));
    return parts.join(' ');
  }
  function amountInWords(v) {
    const total = Math.round(Number(v || 0) * 100);
    const da = Math.floor(total / 100), c = total % 100;
    let s = words(da) + (da >= 1e6 && da % 1e6 === 0 ? ' de' : '') + ' dinar' + (da > 1 ? 's' : '') + ' algérien' + (da > 1 ? 's' : '');
    if (c) s += ' et ' + words(c) + ' centime' + (c > 1 ? 's' : '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* ---------- Formats ---------- */
  function num(v) {
    const n = Number(v || 0); const neg = n < 0; const [i, d] = Math.abs(n).toFixed(2).split('.');
    return (neg ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + d;
  }
  const money = (v) => num(v) + ' DA';
  const dateFr = (d) => { if (!d) return ''; const [y, m, j] = String(d).slice(0, 10).split('-'); return j + '/' + m + '/' + y; };
  const PAY = { especes: 'Espèces', cheque: 'Chèque', virement: 'Virement bancaire', ccp: 'CCP / BaridiMob', autre: 'Autre' };
  const STATUS = { impayee: 'Non payée', payee: 'Payée', annulee: 'Annulée' };
  function totals(inv) {
    const sub = (inv.items || []).reduce((s, it) => s + Math.round(Number(it.qty || 0) * Number(it.unit_price || 0) * 100) / 100, 0);
    const ht = Math.max(sub - Number(inv.discount || 0), 0);
    const tva = Math.round(ht * Number(inv.tva_rate || 0)) / 100;
    const ttc = ht + tva + Number(inv.stamp_duty || 0);
    return { sub, ht, tva, ttc };
  }

  /* ---------- Encodage WinAnsi ---------- */
  const SPECIAL = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‰': 0x89, 'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F };
  function canEncode(str) { for (const ch of String(str || '')) { const c = ch.charCodeAt(0); if (!(c < 256 || SPECIAL[ch] || c === 0x202F || c === 0x2009)) return false; } return true; }
  function enc(str) {
    let out = '';
    for (const ch of String(str ?? '')) {
      let c = ch.charCodeAt(0);
      if (SPECIAL[ch]) c = SPECIAL[ch]; else if (c === 0x202F || c === 0x2009) c = 32; else if (c > 255 || (c >= 0x80 && c <= 0x9F)) c = 63;
      if (c === 40 || c === 41 || c === 92) out += '\\';
      out += String.fromCharCode(c);
    }
    return out;
  }

  /* ---------- Largeurs Helvetica (32..126) ---------- */
  const WR = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  const WB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
  function width(str, size, bold) {
    const t = bold ? WB : WR; let w = 0;
    for (const ch of String(str ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')) { const c = ch.charCodeAt(0); w += (c >= 32 && c <= 126) ? t[c - 32] : 556; }
    return w * size / 1000;
  }
  function wrap(str, size, bold, maxW) {
    const out = [];
    String(str ?? '').split('\n').forEach((para) => {
      let line = '';
      para.split(/\s+/).forEach((w) => {
        const tryL = line ? line + ' ' + w : w;
        if (width(tryL, size, bold) <= maxW || !line) line = tryL; else { out.push(line); line = w; }
      });
      out.push(line);
    });
    return out;
  }

  /* ---------- Mini moteur PDF ---------- */
  function jpegSize(bytes) {
    let i = 2;
    while (i < bytes.length) {
      if (bytes[i] !== 0xFF) { i++; continue; }
      const m = bytes[i + 1]; const len = (bytes[i + 2] << 8) + bytes[i + 3];
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: (bytes[i + 5] << 8) + bytes[i + 6], w: (bytes[i + 7] << 8) + bytes[i + 8] };
      i += 2 + len;
    }
    return null;
  }
  function Doc() { this.pages = []; this.cur = null; this.newPage(); }
  Doc.prototype.newPage = function () { this.cur = []; this.pages.push(this.cur); };
  Doc.prototype.H = 841.89;
  Doc.prototype.color = function (hex, stroke) { const v = [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(' '); this.cur.push(v + (stroke ? ' RG' : ' rg')); };
  Doc.prototype.text = function (str, x, y, size, opt) {
    opt = opt || {}; const bold = !!opt.bold; let tx = x;
    if (opt.align === 'right') tx = x - width(str, size, bold); else if (opt.align === 'center') tx = x - width(str, size, bold) / 2;
    this.color(opt.color || '#16181C');
    this.cur.push('BT /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' + tx.toFixed(2) + ' ' + (this.H - y).toFixed(2) + ' Td (' + enc(str) + ') Tj ET');
  };
  Doc.prototype.rect = function (x, y, w, h, fill, stroke) {
    if (fill) this.color(fill); if (stroke) { this.color(stroke, true); this.cur.push('0.8 w'); }
    this.cur.push(x.toFixed(2) + ' ' + (this.H - y - h).toFixed(2) + ' ' + w.toFixed(2) + ' ' + h.toFixed(2) + ' re ' + (fill && stroke ? 'B' : fill ? 'f' : 'S'));
  };
  Doc.prototype.line = function (x1, y1, x2, y2, hex, w) { this.color(hex || '#D4D4D8', true); this.cur.push((w || 0.8) + ' w ' + x1.toFixed(2) + ' ' + (this.H - y1).toFixed(2) + ' m ' + x2.toFixed(2) + ' ' + (this.H - y2).toFixed(2) + ' l S'); };
  Doc.prototype.image = function (x, y, w, h) { this.cur.push('q ' + w.toFixed(2) + ' 0 0 ' + h.toFixed(2) + ' ' + x.toFixed(2) + ' ' + (this.H - y - h).toFixed(2) + ' cm /Im1 Do Q'); };
  Doc.prototype.output = function (jpeg) {
    const objs = []; const add = (s) => { objs.push(s); return objs.length; };
    const catalog = add(null), pagesId = add(null);
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    let img = null;
    if (jpeg) {
      const sz = jpegSize(jpeg); let bin = '';
      for (let i = 0; i < jpeg.length; i += 8192) bin += String.fromCharCode.apply(null, jpeg.subarray(i, i + 8192));
      img = add('<< /Type /XObject /Subtype /Image /Width ' + sz.w + ' /Height ' + sz.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + bin.length + ' >>\nstream\n' + bin + '\nendstream');
    }
    const kids = [];
    this.pages.forEach((ops) => {
      const content = ops.join('\n');
      const c = add('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
      kids.push(add('<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 595.28 841.89] /Contents ' + c + ' 0 R /Resources << /Font << /F1 ' + f1 + ' 0 R /F2 ' + f2 + ' 0 R >>' + (img ? ' /XObject << /Im1 ' + img + ' 0 R >>' : '') + ' >> >>'));
    });
    objs[catalog - 1] = '<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>';
    objs[pagesId - 1] = '<< /Type /Pages /Kids [' + kids.map((k) => k + ' 0 R').join(' ') + '] /Count ' + kids.length + ' >>';
    let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    const xref = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catalog + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    const bytes = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
    return bytes;
  }

  /* ---------- Mise en page de la facture ---------- */
  const RED = '#E31B23', INK = '#16181C', MUTED = '#5A5F67', LIGHT = '#F4F4F5';
  function buildPdf(inv, set, logo) {
    const d = new Doc(); const L = 40, R = 555;
    const t = totals(inv);
    function header(first) {
      let top = 34;
      if (logo) { const sz = jpegSize(logo); const w = 150, h = w * sz.h / sz.w; d.image(L, top, w, h); }
      d.text('FACTURE', R, 66, 26, { bold: true, align: 'right', color: RED });
      d.text('N° ' + (inv.number || '—'), R, 88, 12, { bold: true, align: 'right' });
      d.text('Date : ' + dateFr(inv.invoice_date), R, 104, 10, { align: 'right', color: MUTED });
      if (!first) d.text('(suite)', R, 118, 9, { align: 'right', color: MUTED });
      d.line(L, 134, R, 134, RED, 2);
    }
    header(true);
    // Entreprise
    let y = 154;
    d.text(set.company_name || '', L, y, 12, { bold: true }); y += 14;
    [set.activity, set.address, set.phones && ('Tél : ' + set.phones), set.email].filter(Boolean).forEach((s) => { wrap(s, 9, false, 255).forEach((ln) => { d.text(ln, L, y, 9, { color: MUTED }); y += 12; }); });
    const legal = [['RC', set.rc], ['NIF', set.nif], ['NIS', set.nis], ['AI', set.ai]].filter((p) => p[1]).map((p) => p[0] + ' : ' + p[1]);
    if (legal.length) { y += 2; for (let i = 0; i < legal.length; i += 2) { d.text(legal.slice(i, i + 2).join('    '), L, y, 8.5, { color: MUTED }); y += 11; } }
    // Client
    const bx = 320, bw = R - bx; const lines = [];
    if (inv.customer_phone) lines.push('Tél : ' + inv.customer_phone);
    if (inv.customer_address) wrap(inv.customer_address, 9, false, bw - 24).forEach((l) => lines.push(l));
    if (inv.customer_tax_id) lines.push('NIF / RC : ' + inv.customer_tax_id);
    if (inv.vehicle) lines.push('Véhicule : ' + inv.vehicle);
    if (inv.repair_code) lines.push('Dossier : ' + inv.repair_code);
    const bh = 44 + lines.length * 12;
    d.rect(bx, 146, bw, bh, LIGHT);
    d.rect(bx, 146, 3, bh, RED);
    d.text('FACTURÉ À', bx + 14, 162, 8.5, { bold: true, color: RED });
    d.text(inv.customer_name || '', bx + 14, 178, 11.5, { bold: true });
    let cy = 192; lines.forEach((l) => { d.text(l, bx + 14, cy, 9, { color: INK }); cy += 12; });
    y = Math.max(y, 146 + bh) + 22;
    // Tableau
    const cols = { desc: L + 8, qty: 372, pu: 465, tot: R - 8 };
    function tableHead() { d.rect(L, y, R - L, 22, RED); d.text('Désignation', cols.desc, y + 15, 9.5, { bold: true, color: '#FFFFFF' }); d.text('Qté', cols.qty, y + 15, 9.5, { bold: true, color: '#FFFFFF', align: 'right' }); d.text('P.U. HT', cols.pu, y + 15, 9.5, { bold: true, color: '#FFFFFF', align: 'right' }); d.text('Montant HT', cols.tot, y + 15, 9.5, { bold: true, color: '#FFFFFF', align: 'right' }); y += 22; }
    tableHead();
    (inv.items || []).forEach((it, i) => {
      const ls = wrap(it.label || '', 9.5, false, 300); const h = 10 + ls.length * 12;
      if (y + h > 700) { d.newPage(); header(false); y = 150; tableHead(); }
      if (i % 2) d.rect(L, y, R - L, h, '#FAFAFA');
      ls.forEach((l, k) => d.text(l, cols.desc, y + 15 + k * 12, 9.5));
      d.text(String(Number(it.qty || 0)).replace('.', ','), cols.qty, y + 15, 9.5, { align: 'right' });
      d.text(num(it.unit_price), cols.pu, y + 15, 9.5, { align: 'right' });
      d.text(num(Number(it.qty || 0) * Number(it.unit_price || 0)), cols.tot, y + 15, 9.5, { align: 'right' });
      y += h; d.line(L, y, R, y, '#E4E4E7', 0.6);
    });
    // Totaux
    const rows = [['Sous-total HT', t.sub]];
    if (Number(inv.discount)) rows.push(['Remise', -Number(inv.discount)]);
    rows.push(['Total HT', t.ht], ['TVA ' + String(Number(inv.tva_rate || 0)).replace('.', ',') + ' %', t.tva]);
    if (Number(inv.stamp_duty)) rows.push(['Droit de timbre', Number(inv.stamp_duty)]);
    const need = rows.length * 18 + 30 + 90;
    if (y + need > 790) { d.newPage(); header(false); y = 150; }
    y += 14; const tx = 345; let ty = y;
    rows.forEach(([lab, v]) => { d.text(lab, tx + 10, ty + 12, 9.5, { color: MUTED }); d.text(money(v), R - 8, ty + 12, 9.5, { align: 'right' }); ty += 18; });
    d.rect(tx, ty + 2, R - tx, 26, RED);
    d.text('TOTAL TTC', tx + 10, ty + 19, 11, { bold: true, color: '#FFFFFF' });
    d.text(money(t.ttc), R - 8, ty + 19, 11, { bold: true, color: '#FFFFFF', align: 'right' });
    // Paiement (à gauche des totaux)
    let py = y + 12;
    d.text('Mode de paiement : ' + (PAY[inv.payment_method] || ''), L, py, 9.5); py += 14;
    d.text('Statut : ' + (STATUS[inv.status] || ''), L, py, 9.5, { bold: inv.status === 'payee', color: inv.status === 'payee' ? '#15803D' : inv.status === 'annulee' ? RED : INK }); py += 14;
    if (inv.status === 'payee') { d.rect(L, py + 4, 92, 30, null, '#15803D'); d.text('PAYÉE', L + 46, py + 24, 14, { bold: true, color: '#15803D', align: 'center' }); }
    if (inv.status === 'annulee') { d.rect(L, py + 4, 100, 30, null, RED); d.text('ANNULÉE', L + 50, py + 24, 14, { bold: true, color: RED, align: 'center' }); }
    y = Math.max(ty + 46, py + 44);
    // Montant en lettres + notes
    wrap('Arrêtée la présente facture à la somme de : ' + amountInWords(t.ttc) + '.', 9.5, false, R - L).forEach((l, i) => { d.text(l, L, y, 9.5, { bold: i === 0 ? false : false }); y += 13; });
    if (inv.notes) { y += 6; d.text('Notes', L, y, 9, { bold: true }); y += 12; wrap(inv.notes, 9, false, R - L).forEach((l) => { if (y > 790) { d.newPage(); header(false); y = 150; } d.text(l, L, y, 9, { color: MUTED }); y += 12; }); }
    // Pied de page sur chaque page
    const nb = d.pages.length;
    d.pages.forEach((p, i) => {
      d.cur = p;
      d.line(L, 800, R, 800, '#E4E4E7', 0.8);
      d.text([set.footer_note, set.rib && ('RIB / CCP : ' + set.rib)].filter(Boolean).join('   ·   '), (L + R) / 2, 814, 8.5, { align: 'center', color: MUTED });
      d.text((set.company_name || '') + ' — ' + (inv.number || '') + (nb > 1 ? '   ·   page ' + (i + 1) + '/' + nb : ''), (L + R) / 2, 826, 8, { align: 'center', color: MUTED });
    });
    return d.output(logo);
  }

  /* ---------- Version imprimable (gère l'arabe) ---------- */
  function htmlInvoice(inv, set, logoUrl) {
    const t = totals(inv); const e = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const legal = [['RC', set.rc], ['NIF', set.nif], ['NIS', set.nis], ['AI', set.ai]].filter((p) => p[1]).map((p) => p[0] + ' : ' + e(p[1])).join(' · ');
    const rows = [['Sous-total HT', t.sub]]; if (Number(inv.discount)) rows.push(['Remise', -Number(inv.discount)]);
    rows.push(['Total HT', t.ht], ['TVA ' + Number(inv.tva_rate || 0) + ' %', t.tva]); if (Number(inv.stamp_duty)) rows.push(['Droit de timbre', Number(inv.stamp_duty)]);
    return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>' + e(inv.number) + '</title><style>@page{size:A4;margin:14mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:Arial,Helvetica,"Noto Naskh Arabic",sans-serif;color:#16181C;font-size:12px;margin:0}' +
      '.h{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #E31B23;padding-bottom:10px}.h img{height:80px}.t{text-align:right}.t h1{color:#E31B23;font-size:30px;margin:0}.g{display:flex;justify-content:space-between;gap:20px;margin:16px 0}.m{color:#5A5F67}' +
      '.c{background:#F4F4F5;border-left:3px solid #E31B23;padding:10px 14px;min-width:240px}.c b.k{color:#E31B23;font-size:10px}table{width:100%;border-collapse:collapse}th{background:#E31B23;color:#fff;text-align:left;padding:7px}td{padding:7px;border-bottom:1px solid #E4E4E7}.r{text-align:right}' +
      '.tot{margin-left:auto;width:260px;margin-top:12px}.tot div{display:flex;justify-content:space-between;padding:4px 8px}.tot .ttc{background:#E31B23;color:#fff;font-weight:bold;font-size:14px}.f{margin-top:30px;border-top:1px solid #E4E4E7;padding-top:8px;text-align:center;color:#5A5F67;font-size:10px}</style></head><body>' +
      '<div class="h"><div>' + (logoUrl ? '<img src="' + logoUrl + '" alt="">' : '') + '</div><div class="t"><h1>FACTURE</h1><b>N° ' + e(inv.number) + '</b><div class="m">Date : ' + dateFr(inv.invoice_date) + '</div></div></div>' +
      '<div class="g"><div><b>' + e(set.company_name) + '</b><div class="m">' + [set.activity, set.address, set.phones && 'Tél : ' + set.phones, set.email].filter(Boolean).map(e).join('<br>') + '</div><div class="m" style="font-size:10px;margin-top:4px">' + legal + '</div></div>' +
      '<div class="c"><b class="k">FACTURÉ À</b><div style="font-size:14px;font-weight:bold">' + e(inv.customer_name) + '</div>' + [inv.customer_phone && 'Tél : ' + inv.customer_phone, inv.customer_address, inv.customer_tax_id && 'NIF / RC : ' + inv.customer_tax_id, inv.vehicle && 'Véhicule : ' + inv.vehicle, inv.repair_code && 'Dossier : ' + inv.repair_code].filter(Boolean).map(e).join('<br>') + '</div></div>' +
      '<table><thead><tr><th>Désignation</th><th class="r">Qté</th><th class="r">P.U. HT</th><th class="r">Montant HT</th></tr></thead><tbody>' +
      (inv.items || []).map((it) => '<tr><td>' + e(it.label) + '</td><td class="r">' + Number(it.qty || 0) + '</td><td class="r">' + num(it.unit_price) + '</td><td class="r">' + num(Number(it.qty || 0) * Number(it.unit_price || 0)) + '</td></tr>').join('') + '</tbody></table>' +
      '<div class="tot">' + rows.map(([l, v]) => '<div><span class="m">' + l + '</span><span>' + money(v) + '</span></div>').join('') + '<div class="ttc"><span>TOTAL TTC</span><span>' + money(t.ttc) + '</span></div></div>' +
      '<p>Mode de paiement : ' + e(PAY[inv.payment_method]) + ' · Statut : <b>' + e(STATUS[inv.status]) + '</b></p><p>Arrêtée la présente facture à la somme de : <b>' + e(amountInWords(t.ttc)) + '</b>.</p>' + (inv.notes ? '<p class="m">' + e(inv.notes) + '</p>' : '') +
      '<div class="f">' + [set.footer_note, set.rib && 'RIB / CCP : ' + set.rib].filter(Boolean).map(e).join(' · ') + '</div></body></html>';
  }

  window.ABVInvoice = { buildPdf, htmlInvoice, amountInWords, totals, canEncode, num, money, PAY, STATUS, dateFr };
})();
