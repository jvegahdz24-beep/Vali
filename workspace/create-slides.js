const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'slides');

const C = { bg:'#0A0E1A', card:'#111827', border:'#1E293B', text:'#F1F5F9', muted:'#94A3B8', accent:'#00D4AA', blue:'#2196F3', red:'#FF4D4D', green:'#10B981' };

const base = (body, extra='') => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:720pt;height:405pt;font-family:Arial,Helvetica,sans-serif;background:${C.bg};color:${C.text};display:flex;flex-direction:column;overflow:hidden}
${extra}
</style></head><body>${body}</body></html>`;

// ─── SLIDE 1: Cover ───
const s1 = base(`
<div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:40pt;text-align:center">
  <div style="width:80pt;height:3pt;background:${C.accent};margin-bottom:20pt;border-radius:2pt"></div>
  <h1 style="font-size:38pt;font-weight:900;letter-spacing:2pt;color:${C.text};line-height:1.2">JHON v4.0</h1>
  <p style="font-size:18pt;color:${C.accent};margin-top:10pt;font-weight:300;letter-spacing:4pt">LA EVOLUCION</p>
  <div style="width:80pt;height:3pt;background:${C.accent};margin-top:20pt;border-radius:2pt"></div>
  <p style="font-size:11pt;color:${C.muted};margin-top:24pt;max-width:420pt;line-height:1.5">De vendedor de automoviles a consultor comercial multi-agente inteligente. Una transformacion completa de identidad y funcionalidad.</p>
  <p style="font-size:9pt;color:${C.muted};margin-top:30pt;opacity:0.5">ValiAutoFlow — 2026</p>
</div>
`);

// ─── SLIDE 2: v3.1 → v4.0 Comparison ───
const s2 = base(`
<div style="padding:28pt 32pt 0 32pt">
  <p style="font-size:9pt;color:${C.accent};letter-spacing:3pt;font-weight:700">TRANSFORMACION</p>
  <h2 style="font-size:22pt;font-weight:800;margin-top:4pt">JHON v3.1 <span style="color:${C.accent}">→</span> v4.0</h2>
</div>
<div style="display:flex;flex:1;padding:14pt 32pt 28pt 32pt;gap:16pt">
  <!-- BEFORE -->
  <div style="flex:1;background:${C.card};border:1pt solid ${C.border};border-radius:8pt;padding:16pt;display:flex;flex-direction:column">
    <div style="width:100%;height:3pt;background:${C.red};border-radius:2pt;margin-bottom:12pt"></div>
    <p style="font-size:10pt;color:${C.red};font-weight:700;letter-spacing:2pt">ANTES — v3.1</p>
    <p style="font-size:13pt;font-weight:700;margin-top:10pt">Vendedor de autos</p>
    <ul style="margin-top:12pt;padding-left:14pt;color:${C.muted};font-size:9.5pt;line-height:1.7">
      <li>Prompt: 108 lineas</li>
      <li>100% automotriz</li>
      <li>Foco: vehiculos, enganche</li>
      <li>Arquitectura mono-agente</li>
      <li>Respuestas genericas</li>
    </ul>
    <div style="margin-top:auto;padding-top:10pt;border-top:1pt solid ${C.border}">
      <p style="font-size:8pt;color:${C.muted};font-style:italic">"Tengo el auto perfecto para ti"</p>
    </div>
  </div>
  <!-- ARROW -->
  <div style="display:flex;align-items:center;justify-content:center;width:32pt">
    <p style="font-size:28pt;color:${C.accent};font-weight:900">→</p>
  </div>
  <!-- AFTER -->
  <div style="flex:1;background:${C.card};border:1pt solid #00D4AA33;border-radius:8pt;padding:16pt;display:flex;flex-direction:column">
    <div style="width:100%;height:3pt;background:${C.accent};border-radius:2pt;margin-bottom:12pt"></div>
    <p style="font-size:10pt;color:${C.accent};font-weight:700;letter-spacing:2pt">DESPUES — v4.0</p>
    <p style="font-size:13pt;font-weight:700;margin-top:10pt">Consultor multi-agente</p>
    <ul style="margin-top:12pt;padding-left:14pt;color:${C.muted};font-size:9.5pt;line-height:1.7">
      <li>Prompt: <b style="color:${C.accent}">324 lineas</b> (+200%)</li>
      <li>Industry-agnostic</li>
      <li>Foco: perdidas y conversion</li>
      <li>Sistema 3 agentes integrados</li>
      <li>Respuestas personalizadas</li>
    </ul>
    <div style="margin-top:auto;padding-top:10pt;border-top:1pt solid #00D4AA33">
      <p style="font-size:8pt;color:${C.accent};font-style:italic">"El problema no es lo que haces. Es lo que no ves."</p>
    </div>
  </div>
</div>
`);

// ─── SLIDE 3: Multi-Agent System ───
const s3 = base(`
<div style="padding:28pt 32pt 0 32pt">
  <p style="font-size:9pt;color:${C.accent};letter-spacing:3pt;font-weight:700">ARQUITECTURA</p>
  <h2 style="font-size:22pt;font-weight:800;margin-top:4pt">Sistema Multi-Agente</h2>
</div>
<div style="display:flex;flex:1;padding:12pt 32pt 28pt 32pt;gap:10pt;align-items:stretch">
  ${[
    {n:'AGENTE 1',sub:'DIAGNOSTICO',color:C.blue,fn:'Pregunta, detecta la fuga',skills:'Investigacion · Escucha activa · Deteccion de patrones',phrase:'"Que no estas viendo que te cuesta dinero?"'},
    {n:'AGENTE 2',sub:'ESTRATEGIA',color:C.accent,fn:'Traduce en numeros, cuantifica',skills:'Analisis financiero · ROI · Proyecciones',phrase:'"La perdida es $X,000 este mes."'},
    {n:'AGENTE 3',sub:'CIERRE',color:'#A78BFA',fn:'Invita sin presion',skills:'Negociacion · Propuesta de valor · Cierre natural',phrase:'"Tiene sentido ver como resolver esto?"'}
  ].map((a,i)=>`
    <div style="flex:1;background:${C.card};border:1pt solid ${C.border};border-radius:8pt;padding:14pt;display:flex;flex-direction:column;position:relative;overflow:hidden">
      <div style="position:absolute;top:0;left:0;right:0;height:3pt;background:${a.color}"></div>
      <p style="font-size:8pt;color:${a.color};font-weight:700;letter-spacing:2pt">${a.n}</p>
      <p style="font-size:12pt;font-weight:800;margin-top:4pt">${a.sub}</p>
      <p style="font-size:9pt;color:${C.muted};margin-top:8pt">${a.fn}</p>
      <div style="margin-top:10pt;padding:8pt;background:${C.bg};border-radius:4pt">
        <p style="font-size:7.5pt;color:${C.muted};line-height:1.5">${a.skills}</p>
      </div>
      <div style="margin-top:auto;padding-top:8pt;border-top:1pt solid ${C.border}">
        <p style="font-size:7.5pt;color:${a.color};font-style:italic;line-height:1.4">${a.phrase}</p>
      </div>
    </div>
  `).join('')}
</div>
<div style="padding:0 32pt 20pt 32pt">
  <div style="display:flex;align-items:center;justify-content:center;gap:8pt">
    <p style="font-size:9pt;color:${C.blue};font-weight:700">DIAGNOSTICO</p>
    <p style="color:${C.muted}">→</p>
    <p style="font-size:9pt;color:${C.accent};font-weight:700">ESTRATEGIA</p>
    <p style="color:${C.muted}">→</p>
    <p style="font-size:9pt;color:#A78BFA;font-weight:700">CIERRE</p>
  </div>
</div>
`);

// ─── SLIDE 4: Prompt Master ───
const s4 = base(`
<div style="padding:28pt 32pt 0 32pt">
  <p style="font-size:9pt;color:${C.accent};letter-spacing:3pt;font-weight:700">PROMPT MAESTRO</p>
  <h2 style="font-size:22pt;font-weight:800;margin-top:4pt">324 Lineas de Inteligencia</h2>
</div>
<div style="display:flex;flex:1;padding:14pt 32pt 28pt 32pt;gap:20pt">
  <div style="flex:1;display:flex;flex-direction:column;gap:8pt">
    ${[
      {label:'1. IDENTIDAD',desc:'Consultor comercial que convierte conversaciones en decisiones'},
      {label:'2. PRINCIPIO CENTRAL',desc:'El problema no es lo que haces. Es lo que no ves.'},
      {label:'3. MULTI-AGENTE',desc:'3 agentes: diagnostico, estrategia, cierre'},
      {label:'4. PERSONALIDAD',desc:'Profesional, empatico, estrategico'},
      {label:'5. KEY BEHAVIORS',desc:'Escucha activa, cuantificacion, cierre natural'},
      {label:'6. FORMATO',desc:'5 secciones claras en cada respuesta'},
      {label:'7. EJEMPLOS',desc:'Escenarios de conversacion contextualizados'}
    ].map(item=>`
      <div style="background:${C.card};border-left:3pt solid ${C.accent};padding:8pt 12pt;border-radius:0 4pt 4pt 0">
        <p style="font-size:8.5pt;color:${C.accent};font-weight:700">${item.label}</p>
        <p style="font-size:8pt;color:${C.muted};margin-top:2pt">${item.desc}</p>
      </div>
    `).join('')}
  </div>
  <div style="width:200pt;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:16pt">
    <div style="background:${C.card};border:1pt solid ${C.border};border-radius:8pt;padding:20pt;text-align:center;width:100%">
      <p style="font-size:42pt;font-weight:900;color:${C.accent}">324</p>
      <p style="font-size:9pt;color:${C.muted};margin-top:4pt">LINEAS DE PROMPT</p>
    </div>
    <div style="background:${C.card};border:1pt solid ${C.border};border-radius:8pt;padding:14pt;width:100%">
      <p style="font-size:10pt;font-weight:700;color:${C.text};margin-bottom:8pt">Caracteristicas Clave</p>
      <ul style="padding-left:12pt;color:${C.muted};font-size:8pt;line-height:1.7">
        <li>Industry-Agnostic</li>
        <li>Multi-Fase (diag → estr → cierre)</li>
        <li>Data-Driven (ROI cuantificado)</li>
        <li>Customer-Centric</li>
        <li>Extensible a nuevas industrias</li>
      </ul>
    </div>
  </div>
</div>
`);

// ─── SLIDE 5: Objections ───
const s5 = base(`
<div style="padding:24pt 32pt 0 32pt">
  <p style="font-size:9pt;color:${C.accent};letter-spacing:3pt;font-weight:700">OBJECIONES</p>
  <h2 style="font-size:20pt;font-weight:800;margin-top:4pt">De Automotrices a Servicios</h2>
</div>
<div style="display:flex;flex-direction:column;flex:1;padding:10pt 32pt 20pt 32pt;gap:8pt">
  ${[
    {title:'OBJECION DE PRECIO',before:['Enganche desde 10%','24-48 MSI disponibles','Tasas competitivas'],after:['Los leads no atendidos costaron $X este mes','La automatizacion paga sola en 2-3 meses','ROI de 300-400% en el primer año'],insight:'Del costo del producto al costo de NO tenerlo'},
    {title:'OBJECION DE TIEMPO',before:['El auto sube $3,000 cada mes','Ofertas por tiempo limitado','Rebajas especiales'],after:['Los leads se enfrian mientras esperas','Pierdes ventas por no responder rapido','La competencia ya automatiza'],insight:'De urgencia artificial a urgencia basada en perdidas reales'},
    {title:'OBJECION DE NECESIDAD',before:['Necesitas un auto nuevo','Actualiza tu vehiculo'],after:['Tu problema no es el volumen, es la velocidad','Estas dejando dinero sobre la mesa'],insight:'De presionar necesidad a revelar oportunidad'}
  ].map(o=>`
    <div style="display:flex;gap:10pt;flex:1">
      <div style="width:22%;display:flex;flex-direction:column;justify-content:center">
        <p style="font-size:9pt;font-weight:700;color:${C.text}">${o.title}</p>
        <p style="font-size:7pt;color:${C.muted};margin-top:4pt">${o.insight}</p>
      </div>
      <div style="flex:1;background:#2A1515;border:1pt solid #FF4D4D33;border-radius:6pt;padding:8pt 10pt">
        <p style="font-size:7pt;color:${C.red};font-weight:700;margin-bottom:4pt">ANTES</p>
        ${o.before.map(b=>`<p style="font-size:7.5pt;color:${C.muted};line-height:1.4">✗ ${b}</p>`).join('')}
      </div>
      <div style="width:16pt;display:flex;align-items:center;justify-content:center">
        <p style="font-size:16pt;color:${C.accent}">→</p>
      </div>
      <div style="flex:1;background:#0A2A20;border:1pt solid #00D4AA33;border-radius:6pt;padding:8pt 10pt">
        <p style="font-size:7pt;color:${C.accent};font-weight:700;margin-bottom:4pt">DESPUES</p>
        ${o.after.map(a=>`<p style="font-size:7.5pt;color:${C.muted};line-height:1.4">✓ ${a}</p>`).join('')}
      </div>
    </div>
  `).join('')}
</div>
`);

// ─── SLIDE 6: Impact Metrics ───
const s6 = base(`
<div style="padding:24pt 32pt 0 32pt">
  <p style="font-size:9pt;color:${C.accent};letter-spacing:3pt;font-weight:700">IMPACTO</p>
  <h2 style="font-size:20pt;font-weight:800;margin-top:4pt">Metricas de Transformacion</h2>
</div>
<div style="display:flex;flex:1;padding:12pt 32pt 16pt 32pt;gap:12pt">
  <div style="flex:1;display:flex;flex-direction:column;gap:10pt">
    ${[
      {label:'CONVERSION',old:'15-20%',new_:'30-40%',delta:'+133%',bar:100},
      {label:'TIEMPO RESPUESTA',old:'2-24 hrs',new_:'<5 min',delta:'+99%',bar:96},
      {label:'RETENCION',old:'60-70%',new_:'80-90%',delta:'+30%',bar:30},
      {label:'SCORE PROMEDIO',old:'55-65',new_:'75-85',delta:'+23%',bar:23}
    ].map(m=>`
      <div style="background:${C.card};border:1pt solid ${C.border};border-radius:6pt;padding:10pt 14pt;flex:1;display:flex;align-items:center;gap:12pt">
        <div style="width:100pt">
          <p style="font-size:7pt;color:${C.muted};font-weight:700;letter-spacing:1pt">${m.label}</p>
          <p style="font-size:8pt;color:${C.muted};margin-top:2pt"><span style="text-decoration:line-through">${m.old}</span> → <b style="color:${C.accent}">${m.new_}</b></p>
        </div>
        <div style="flex:1;display:flex;align-items:center;gap:8pt">
          <div style="flex:1;height:6pt;background:${C.border};border-radius:3pt;overflow:hidden">
            <div style="width:${m.bar}%;height:100%;background:${C.accent};border-radius:3pt"></div>
          </div>
          <p style="font-size:14pt;font-weight:900;color:${C.accent};width:50pt;text-align:right">${m.delta}</p>
        </div>
      </div>
    `).join('')}
  </div>
  <div style="width:210pt;background:${C.card};border:1pt solid ${C.border};border-radius:8pt;padding:14pt;display:flex;flex-direction:column">
    <p style="font-size:10pt;font-weight:700;margin-bottom:10pt">Mejoras Cualitativas</p>
    ${[
      'Mayor personalizacion de respuestas',
      'Mejor cuantificacion del valor',
      'Cierres mas naturales',
      'Experiencia mas consultiva'
    ].map(m=>`
      <div style="display:flex;gap:8pt;margin-bottom:8pt;align-items:flex-start">
        <div style="width:6pt;height:6pt;background:${C.accent};border-radius:50%;margin-top:4pt;flex-shrink:0"></div>
        <p style="font-size:8pt;color:${C.muted};line-height:1.4">${m}</p>
      </div>
    `).join('')}
  </div>
</div>
`);

// ─── SLIDE 7: Roadmap ───
const s7 = base(`
<div style="padding:24pt 32pt 0 32pt">
  <p style="font-size:9pt;color:${C.accent};letter-spacing:3pt;font-weight:700">IMPLEMENTACION</p>
  <h2 style="font-size:20pt;font-weight:800;margin-top:4pt">Roadmap: 4 Fases</h2>
</div>
<div style="display:flex;flex:1;padding:10pt 32pt 20pt 32pt;gap:8pt">
  ${[
    {n:'FASE 1',title:'Testing',time:'1-2 sem',color:C.blue,tasks:['Testeo sandbox','Ajuste prompt','Optimizacion multi-agente','Validacion UI'],crit:['Respuestas coherentes','Sin errores de logica','Transiciones fluidas']},
    {n:'FASE 2',title:'Rollout',time:'2-4 sem',color:C.accent,tasks:['10% leads iniciales','Monitoreo metricas','Expansion a 30%','Doc patrones'],crit:['Conversion mejorada','Sin degradacion UX','Feedback positivo']},
    {n:'FASE 3',title:'Escalamiento',time:'1-2 meses',color:'#A78BFA',tasks:['100% leads','Analytics avanzado','Reporting auto','ML optimization'],crit:['Sistema estable a escala','Metricas consistentes','Aprendizaje auto']},
    {n:'FASE 4',title:'Optimizacion',time:'Ongoing',color:'#F59E0B',tasks:['A/B testing','Personalizacion por industria','Nuevos canales','Nuevas features IA'],crit:['Mejoras continuas','Adaptacion mercado','ROI sostenido']}
  ].map((f,i)=>`
    <div style="flex:1;background:${C.card};border:1pt solid ${C.border};border-radius:6pt;padding:10pt;display:flex;flex-direction:column;position:relative;overflow:hidden">
      <div style="position:absolute;top:0;left:0;right:0;height:3pt;background:${f.color}"></div>
      <p style="font-size:7pt;color:${f.color};font-weight:700;letter-spacing:1pt">${f.n}</p>
      <p style="font-size:11pt;font-weight:800;margin-top:2pt">${f.title}</p>
      <p style="font-size:7pt;color:${C.muted};margin-top:2pt">${f.time}</p>
      <div style="margin-top:8pt">
        ${f.tasks.map(t=>`<p style="font-size:7pt;color:${C.muted};line-height:1.6">· ${t}</p>`).join('')}
      </div>
      <div style="margin-top:auto;padding-top:6pt;border-top:1pt solid ${C.border}">
        ${f.crit.map(c=>`<p style="font-size:6.5pt;color:${C.muted};opacity:0.7;line-height:1.4">✓ ${c}</p>`).join('')}
      </div>
    </div>
  `).join('')}
</div>
`);

// ─── SLIDE 8: KPIs ───
const s8 = base(`
<div style="padding:24pt 32pt 0 32pt">
  <p style="font-size:9pt;color:${C.accent};letter-spacing:3pt;font-weight:700">EXITO</p>
  <h2 style="font-size:20pt;font-weight:800;margin-top:4pt">KPIs a Monitorear</h2>
</div>
<div style="display:flex;flex:1;padding:10pt 32pt 16pt 32pt;gap:10pt">
  ${[
    {title:'CONVERSION',items:['Tasa leads → citas','Tasa citas → ventas','Tiempo promedio conversion'],color:C.accent},
    {title:'ENGAGEMENT',items:['Tiempo respuesta prom.','Tasa respuesta leads','Score promedio leads'],color:C.blue},
    {title:'CALIDAD',items:['NPS satisfaccion','Tasa retencion leads','Calidad conversaciones'],color:'#A78BFA'},
    {title:'NEGOCIO',items:['ROI automatizacion','Costo por lead cualificado','Ingresos por JHON'],color:'#F59E0B'}
  ].map(k=>`
    <div style="flex:1;background:${C.card};border:1pt solid ${C.border};border-radius:6pt;padding:12pt;display:flex;flex-direction:column">
      <div style="width:100%;height:3pt;background:${k.color};border-radius:2pt;margin-bottom:10pt"></div>
      <p style="font-size:8pt;color:${k.color};font-weight:700;letter-spacing:1pt">${k.title}</p>
      ${k.items.map(it=>`
        <div style="display:flex;align-items:flex-start;gap:6pt;margin-top:8pt">
          <div style="width:4pt;height:4pt;background:${k.color};border-radius:50%;margin-top:4pt;flex-shrink:0"></div>
          <p style="font-size:7.5pt;color:${C.muted};line-height:1.4">${it}</p>
        </div>
      `).join('')}
    </div>
  `).join('')}
</div>
<div style="padding:0 32pt 20pt 32pt;display:flex;gap:16pt;justify-content:center">
  <p style="font-size:8pt;color:${C.muted}"><b style="color:${C.accent}">Dashboard</b> en tiempo real</p>
  <p style="font-size:8pt;color:${C.muted}"><b style="color:${C.accent}">Alertas</b> automaticas</p>
  <p style="font-size:8pt;color:${C.muted}"><b style="color:${C.accent}">Reportes</b> semanales</p>
  <p style="font-size:8pt;color:${C.muted}"><b style="color:${C.accent}">Proyecciones</b> de tendencia</p>
</div>
`);

const slides = [s1, s2, s3, s4, s5, s6, s7, s8];
slides.forEach((html, i) => {
  fs.writeFileSync(path.join(dir, `slide${i+1}.html`), html);
});
console.log(`Created ${slides.length} HTML slides`);
