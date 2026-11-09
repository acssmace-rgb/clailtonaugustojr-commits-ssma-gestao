/* Documentos impressos no padrão visual SSMA (abrem em nova janela para imprimir / salvar em PDF). */
(function () {
  'use strict';
  const e = U.esc;

  function logoURL() {
    if (S.cfg.logo) return S.cfg.logo;
    return new URL('assets/img/logo-ssma.svg', location.href).href;
  }

  const cssBase = `
  *{box-sizing:border-box} body{margin:0;font-family:Corbel,Carlito,"Segoe UI",Arial,sans-serif;color:#2C302F;font-size:11pt}
  .pg{position:relative;page-break-after:always;overflow:hidden}
  .pg:last-child{page-break-after:auto}
  .cab{display:flex;align-items:center;gap:18px;padding-bottom:8px;border-bottom:3px solid #64E169}
  .cab img{height:58px}
  .cab .end{margin-left:auto;text-align:right;font-size:8pt;color:#7a7f7c;line-height:1.35;max-width:125mm}
  h1{font-size:15pt;text-align:center;margin:14px 0 10px;letter-spacing:.04em}
  table{border-collapse:collapse;width:100%}
  th{background:#64E169;color:#2C302F;font-size:9pt;padding:5px 6px;border:1px solid #BDBFBC;text-transform:uppercase}
  td{border:1px solid #BDBFBC;padding:5px 6px;font-size:9.5pt}
  .info td{border:1px solid #BDBFBC}
  .info td.r{background:#F3F4F3;font-weight:700;width:150px}
  .ass{margin-top:30px;text-align:center}
  .ass .linha{width:320px;margin:0 auto;border-top:1px solid #2C302F;padding-top:4px;font-size:9.5pt;position:relative}
  .ass img{height:56px;display:block;margin:0 auto -10px}
  .rod{position:absolute;left:0;right:0;bottom:0;text-align:center;font-size:8pt;color:#7a7f7c;border-top:1px solid #BDBFBC;padding-top:4px}
  .barra-imp{position:fixed;top:10px;right:10px;z-index:9} .barra-imp button{font:inherit;padding:8px 16px;background:#64E169;border:none;border-radius:6px;font-weight:700;cursor:pointer}
  @media print{.barra-imp{display:none}}
  `;

  function abrir(titulo, corpo, css, pagina) {
    const w = window.open('', '_blank');
    if (!w) { alert('Permita pop-ups para este site para gerar os documentos.'); return; }
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${e(titulo)}</title>
      <style>@page{size:${pagina || 'A4 portrait'};margin:0}${cssBase}${css || ''}</style></head>
      <body><div class="barra-imp"><button onclick="print()">Imprimir / Salvar PDF</button></div>${corpo}</body></html>`);
    w.document.close();
  }

  function cabecalho() {
    const em = S.cfg.empresa;
    return `<div class="cab"><img src="${logoURL()}" alt="SSMA">
      <div class="end">${e(em.endereco)}<br>CNPJ ${e(em.cnpj)}<br>${e(em.emails)} · ${e(em.telefone)}</div></div>`;
  }
  function blocoAssinatura(inst) {
    const sig = S.cfg.assinatura ? `<img src="${S.cfg.assinatura}" alt="">` : '<div style="height:46px"></div>';
    return `<div class="ass">${sig}<div class="linha"><b>${e(inst.nome)}</b><br>${e(inst.formacao)}<br>${e(inst.cbo)} – ${e(inst.registro)}</div></div>`;
  }
  function instrutorDe(t) {
    const p = S.cfg.instrutor;
    return { nome: t.instrutorNome || p.nome, formacao: t.instrutorFormacao || p.formacao, registro: t.instrutorRegistro || p.registro, cbo: t.instrutorCbo || p.cbo };
  }
  function participantesOrdenados(t) {
    return (t.participantes || []).filter((p) => p.nome).slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  // ---------- Registro de treinamento (lista de presença) ----------
  function registro(t) {
    const c = S.cliente(t.clienteId) || {}; const inst = instrutorDe(t);
    const parts = participantesOrdenados(t);
    const POR = 26; const paginas = [];
    for (let i = 0; i < Math.max(parts.length, 1); i += POR) paginas.push(parts.slice(i, i + POR));
    const titulo = (t.titulo || S.curso(t.cursoId).nome).toUpperCase();
    const corpo = paginas.map((lote, pi) => `
      <div class="pg" style="width:210mm;height:297mm;padding:12mm 14mm 16mm">
        ${cabecalho()}
        <h1>REGISTRO DE TREINAMENTO</h1>
        ${pi === 0 ? `<table class="info">
          <tr><td class="r">Empresa</td><td colspan="3">${e(c.razaoSocial || '')}${c.fantasia ? ' (' + e(c.fantasia) + ')' : ''}</td></tr>
          <tr><td class="r">CNPJ</td><td>${e(c.cnpj || '')}</td><td class="r">Data</td><td>${U.br(t.data)}</td></tr>
          <tr><td class="r">Treinamento</td><td colspan="3"><b>${e(titulo)}</b></td></tr>
          <tr><td class="r">Carga horária</td><td>${e(t.cargaHoraria || '')}</td><td class="r">Local</td><td>${e(t.local || '')}</td></tr>
          <tr><td class="r">Instrutor</td><td colspan="3">${e(inst.nome)} – ${e(inst.formacao)} – ${e(inst.registro)}</td></tr>
        </table>` : '<div style="font-size:9pt;margin-bottom:6px">(continuação)</div>'}
        <table style="margin-top:12px">
          <tr><th style="width:36px">Nº</th><th>Nome</th><th style="width:120px">CPF</th><th style="width:190px">Assinatura</th></tr>
          ${lote.map((p, i) => `<tr><td style="text-align:center">${pi * POR + i + 1}</td><td>${e(p.nome.toUpperCase())}</td><td>${e(U.fmtCPF(p.cpf || ''))}</td><td style="height:24px"></td></tr>`).join('')}
        </table>
        ${pi === paginas.length - 1 ? blocoAssinatura(inst) : ''}
        <div class="rod" style="left:14mm;right:14mm;bottom:8mm">${e(S.cfg.empresa.nome)}</div>
      </div>`).join('');
    abrir(`Registro_Treinamento_${t.titulo || ''}_${c.fantasia || c.razaoSocial || ''}`, corpo, '', 'A4 portrait');
  }

  // ---------- Certificados (2 páginas por participante) ----------
  function certificados(t, somente) {
    const c = S.cliente(t.clienteId) || {}; const inst = instrutorDe(t); const em = S.cfg.empresa;
    let parts = participantesOrdenados(t);
    if (somente) parts = parts.filter((p) => p.nome === somente);
    const titulo = (t.titulo || S.curso(t.cursoId).nome).toUpperCase();
    const itens = (t.conteudo || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const css = `
      .pg{width:297mm;height:210mm;padding:0}
      .moldura{position:absolute;top:9mm;left:24mm;right:9mm;bottom:17mm;border:2px solid #2C302F}
      .moldura:after{content:"";position:absolute;inset:3mm;border:1px solid #64E169}
      .faixa{position:absolute;left:0;top:0;bottom:0;width:16mm;background:#2C302F}
      .faixa:after{content:"";position:absolute;right:-4mm;top:0;bottom:0;width:4mm;background:#64E169}
      .miolo{position:absolute;left:34mm;right:22mm;top:18mm;bottom:28mm;text-align:center}
      .miolo img.logo{height:62px}
      .titulo{font-size:40pt;letter-spacing:.14em;margin:10mm 0 2mm;font-weight:700}
      .sub{width:70mm;height:4px;background:#64E169;margin:0 auto 9mm}
      .txt{font-size:14pt;line-height:1.6}
      .nome{font-size:24pt;font-weight:700;margin:3mm 0;letter-spacing:.03em}
      .local{margin-top:7mm;font-size:12pt}
      .rodc{position:absolute;left:16mm;right:0;bottom:0;height:12mm;background:#2C302F;color:#fff;font-size:9pt;display:flex;align-items:center;justify-content:center;gap:18px}
      .rodc b{color:#64E169}
      .cont h2{font-size:20pt;letter-spacing:.1em;margin:4mm 0 2mm}
      .cont ol{text-align:left;font-size:12pt;line-height:1.55;columns:2;column-gap:12mm;margin:6mm 0}
      .cont .desc{text-align:justify;font-size:11.5pt;border-left:4px solid #64E169;padding:3mm 5mm;background:#F3F4F3;margin-top:4mm}
      .cont .meta{font-size:10.5pt;color:#5E6461}
      .ass .linha{width:300px}
    `;
    const rod = `<div class="rodc"><span><b>SSMA</b> Assessoria e Consultoria em Segurança do Trabalho</span><span>${e(em.emails)}</span><span>${e(em.telefone)}</span></div>`;
    const corpo = parts.map((p) => `
      <div class="pg"><div class="faixa"></div><div class="moldura"></div>
        <div class="miolo">
          <img class="logo" src="${logoURL()}" alt="SSMA">
          <div class="titulo">CERTIFICADO</div><div class="sub"></div>
          <div class="txt">Certificamos que</div>
          <div class="nome">${e(p.nome.toUpperCase())}</div>
          <div class="txt">${p.cpf ? 'CPF ' + e(U.fmtCPF(p.cpf)) + ', ' : ''}colaborador(a) da empresa <b>${e(c.razaoSocial || '')}</b>, CNPJ ${e(c.cnpj || '')}, concluiu o treinamento
            <b>${e(titulo)}</b>, realizado em ${U.br(t.data)}, com carga horária de ${e(t.cargaHoraria || '')}.</div>
          <div class="local">${e(em.cidade || 'Fortaleza/CE')}, ${U.extenso(t.data)}.</div>
          ${blocoAssinatura(inst)}
        </div>${rod}
      </div>
      <div class="pg"><div class="faixa"></div><div class="moldura"></div>
        <div class="miolo cont">
          <img class="logo" src="${logoURL()}" alt="SSMA">
          <h2>CONTEÚDO PROGRAMÁTICO</h2><div class="sub" style="margin-bottom:3mm"></div>
          <div class="meta">${e(titulo)} · ${U.br(t.data)} · ${e(t.cargaHoraria || '')} · ${e(p.nome.toUpperCase())}</div>
          ${itens.length ? `<ol>${itens.map((i) => `<li>${e(i)}</li>`).join('')}</ol>` : '<p class="meta">(conteúdo programático não informado)</p>'}
          ${t.descricao ? `<div class="desc">${e(t.descricao)}</div>` : ''}
        </div>${rod}
      </div>`).join('');
    abrir(`Certificados_${t.titulo || ''}_${c.fantasia || c.razaoSocial || ''}`, corpo || '<p style="padding:40px">Nenhum participante cadastrado.</p>', css, 'A4 landscape');
  }

  // ---------- Relatório de visita técnica ----------
  function relatorioVisita(v) {
    const c = S.cliente(v.clienteId) || {}; const inst = S.cfg.instrutor;
    const bloco = (t, txt) => txt ? `<h3 style="background:#2C302F;color:#fff;padding:5px 8px;font-size:10.5pt;margin:14px 0 6px;border-left:6px solid #64E169">${t}</h3><div style="white-space:pre-wrap;font-size:10.5pt">${e(txt)}</div>` : '';
    const corpo = `<div class="pg" style="width:210mm;min-height:297mm;padding:12mm 14mm 18mm">
      ${cabecalho()}<h1>RELATÓRIO DE VISITA TÉCNICA</h1>
      <table class="info">
        <tr><td class="r">Empresa</td><td colspan="3">${e(c.razaoSocial || '')}</td></tr>
        <tr><td class="r">CNPJ</td><td>${e(c.cnpj || '')}</td><td class="r">Data</td><td>${U.br(v.data)} ${e(v.horario || '')}</td></tr>
        <tr><td class="r">Unidade / setor</td><td>${e(v.setores || c.unidade || '')}</td><td class="r">Acompanhante</td><td>${e(v.acompanhante || '')}</td></tr>
        <tr><td class="r">Objetivo</td><td colspan="3">${e(v.objetivo || '')}</td></tr>
      </table>
      ${bloco('CONSTATAÇÕES', v.constatacoes)}
      ${bloco('RECOMENDAÇÕES / AÇÕES', v.recomendacoes)}
      ${bloco('PRAZOS ACORDADOS', v.prazos)}
      ${blocoAssinatura(inst)}
      <div style="display:flex;justify-content:center;margin-top:24px"><div class="ass"><div style="height:46px"></div><div class="linha">${e(v.acompanhante || 'Representante da empresa')}<br>${e(c.fantasia || c.razaoSocial || '')}</div></div></div>
      <div class="rod" style="left:14mm;right:14mm;bottom:8mm">${e(S.cfg.empresa.nome)}</div></div>`;
    abrir(`Relatorio_Visita_${U.br(v.data)}_${c.fantasia || ''}`, corpo, '', 'A4 portrait');
  }

  // ---------- Relatório de situação do cliente ----------
  function situacaoCliente(cid) {
    const c = S.cliente(cid) || {};
    const docs = S.lista('documentos').filter((d) => d.clienteId === cid && d.status !== 'substituido');
    const venc = R.vencimentos(cid).filter((x) => x.tipo !== 'Documento');
    const pend = S.lista('pendencias').filter((p) => p.clienteId === cid && p.status !== 'concluida');
    const sitCor = { ok: '#1E7A28', alerta: '#8A5E00', vencido: '#A82828', neutro: '#5E6461', info: '#2F6FB3' };
    const sit = (s) => `<b style="color:${sitCor[s.cls]}">${e(s.txt)}</b>`;
    const corpo = `<div class="pg" style="width:210mm;min-height:297mm;padding:12mm 14mm 18mm">
      ${cabecalho()}<h1>SITUAÇÃO DE SST DO CLIENTE</h1>
      <table class="info">
        <tr><td class="r">Razão social</td><td colspan="3">${e(c.razaoSocial || '')}</td></tr>
        <tr><td class="r">CNPJ</td><td>${e(c.cnpj || '')}</td><td class="r">Grau de risco</td><td>${e(c.grauRisco || '')}</td></tr>
        <tr><td class="r">CNAE</td><td>${e(c.cnae || '')}</td><td class="r">Nº empregados</td><td>${e(c.empregados || '')}</td></tr>
        <tr><td class="r">Emitido em</td><td colspan="3">${U.br(U.iso(new Date()))}</td></tr>
      </table>
      <h3 style="margin-top:16px">Documentos e programas</h3>
      <table><tr><th>Documento</th><th>Emissão</th><th>Vencimento</th><th>Situação</th></tr>
      ${docs.map((d) => { const v = R.vencDocumento(d); return `<tr><td>${e(S.tipoDoc(d.tipo).sigla)} ${e(d.descricao || '')}</td><td>${U.br(d.emissao)}</td><td>${U.br(v)}</td><td>${sit(U.situacao(v, S.cfg.alertaDias))}</td></tr>`; }).join('') || '<tr><td colspan="4">Nenhum documento cadastrado.</td></tr>'}</table>
      <h3 style="margin-top:16px">Treinamentos, CIPA, eSocial e auditorias</h3>
      <table><tr><th>Tipo</th><th>Item</th><th>Data/prazo</th><th>Situação</th></tr>
      ${venc.map((x) => `<tr><td>${e(x.tipo)}</td><td>${e(x.titulo)}</td><td>${U.br(x.venc)}</td><td>${sit(x.sit)}</td></tr>`).join('') || '<tr><td colspan="4">Nada pendente.</td></tr>'}</table>
      <h3 style="margin-top:16px">Pendências em aberto</h3>
      <table><tr><th>Pendência</th><th>Responsável</th><th>Prazo</th></tr>
      ${pend.map((p) => `<tr><td>[${e(p.categoria)}] ${e(p.titulo)}</td><td>${p.status === 'aguardando' ? 'Cliente' : 'SSMA'}</td><td>${U.br(p.prazo)}</td></tr>`).join('') || '<tr><td colspan="3">Nenhuma pendência em aberto.</td></tr>'}</table>
      ${blocoAssinatura(S.cfg.instrutor)}
      <div class="rod" style="left:14mm;right:14mm;bottom:8mm">${e(S.cfg.empresa.nome)}</div></div>`;
    abrir(`Situacao_SST_${c.fantasia || c.razaoSocial || ''}`, corpo, '', 'A4 portrait');
  }

  // ---------- Textos para o GitHub (convenções SSMA) ----------
  function readmeCliente(cid) {
    const c = S.cliente(cid) || {};
    const docs = S.lista('documentos').filter((d) => d.clienteId === cid && d.status !== 'substituido')
      .sort((a, b) => (R.vencDocumento(a) || '9').localeCompare(R.vencDocumento(b) || '9'));
    const linhas = docs.map((d) => `| ${S.tipoDoc(d.tipo).sigla}${d.descricao ? ' – ' + d.descricao : ''} | ${U.br(d.emissao)} | ${U.br(R.vencDocumento(d))} | ${U.situacao(R.vencDocumento(d), S.cfg.alertaDias).txt} |`);
    return `# ${c.razaoSocial || ''}

- **Razão social:** ${c.razaoSocial || ''}
- **Nome fantasia:** ${c.fantasia || '—'}
- **CNPJ:** ${c.cnpj || ''}
- **Unidade:** ${c.unidade || '—'}
- **Endereço:** ${c.endereco || '—'}
- **CNAE / Grau de risco:** ${c.cnae || '—'} / ${c.grauRisco || '—'}
- **Nº de empregados:** ${c.empregados || '—'}

## Contatos DP/RH
- ${c.contatoNome || '—'} · ${c.contatoEmail || ''} · ${c.contatoFone || ''}

## Documentos vigentes e vencimentos
| Documento | Emissão | Vencimento | Situação |
|---|---|---|---|
${linhas.join('\n') || '| — | — | — | — |'}

## Estrutura de pastas
\`pgr/\` · \`pcmso/\` · \`ltcat/\` · \`aep/\` · \`cipa/\` · \`treinamentos/\` · \`brigada-pae/\` · \`auditorias/\` · \`psicossocial-nr01/\` · \`outros/\`

Arquivos no padrão \`AAAA-MM_tipo-documento_${U.slug(c.fantasia || c.razaoSocial)}.ext\`.
ASO, exames e laudos individuais de trabalhadores **não** devem ser guardados neste repositório.

_Atualizado em ${U.br(U.iso(new Date()))} pelo SSMA Gestão._
`;
  }
  function issuePendencia(p) {
    return { titulo: `[${p.categoria}] ${p.titulo}`, corpo: `${p.descricao || ''}\n\n**Data limite:** ${U.br(p.prazo)}\n**Cliente:** ${S.nomeCliente(p.clienteId)}`.trim(), etiquetas: (p.etiquetas || []).join(',') };
  }
  function nomeArquivo(d) {
    const t = S.tipoDoc(d.tipo); const c = S.cliente(d.clienteId) || {};
    const ym = (d.emissao || U.iso(new Date())).slice(0, 7);
    return `${t.pasta || 'outros'}/${ym}_${U.slug(t.sigla)}_${U.slug(c.fantasia || c.razaoSocial)}.pdf`;
  }

  window.IMP = { registro, certificados, relatorioVisita, situacaoCliente, readmeCliente, issuePendencia, nomeArquivo };
})();
