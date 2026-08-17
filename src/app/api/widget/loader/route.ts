// ═══════════════════════════════════════════════════════════════
// WIDGET WEBCHAT EMBEBIBLE — loader JS público.
// La agencia pega UNA línea en su sitio:
//   <script src="https://valiautoflow.com/api/widget/loader?ws=SU_ID" async></script>
// y aparece la burbuja de chat con SU marca, atendida por su asesor IA.
// Vanilla JS, sin dependencias, ~4 KB. GET ?ws=<workspaceId>
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const ws = (req.nextUrl.searchParams.get('ws') || '').replace(/[^a-zA-Z0-9]/g, '')
  const origin = process.env.NEXT_PUBLIC_APP_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`
  if (!ws) return new NextResponse('// falta ?ws=', { status: 400, headers: { 'Content-Type': 'application/javascript' } })

  const js = `(function(){
if (window.__vfWidget) return; window.__vfWidget = 1;
var WS=${JSON.stringify(ws)}, API=${JSON.stringify(origin)};
var sid; try { sid = localStorage.getItem('vf_w_sid'); } catch(e) {}
if(!sid){ sid = 'w' + Math.random().toString(36).slice(2,10) + Date.now().toString(36); try { localStorage.setItem('vf_w_sid', sid); } catch(e) {} }
function h(tag, style, html){ var el=document.createElement(tag); if(style) el.style.cssText=style; if(html!=null) el.innerHTML=html; return el; }
fetch(API + '/api/widget/config?ws=' + WS).then(function(r){ return r.ok ? r.json() : null; }).then(function(cfg){
  if(!cfg || !cfg.name) return;
  var COLOR = cfg.color || '#7c3aed';
  // ── burbuja ──
  var btn = h('button','position:fixed;z-index:2147483000;bottom:20px;right:20px;width:58px;height:58px;border-radius:50%;border:none;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.28);background:'+COLOR+';display:flex;align-items:center;justify-content:center;transition:transform .15s');
  btn.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  btn.setAttribute('aria-label','Chat');
  btn.onmouseenter=function(){btn.style.transform='scale(1.07)'}; btn.onmouseleave=function(){btn.style.transform='scale(1)'};
  // ── panel ──
  var panel = h('div','position:fixed;z-index:2147483000;bottom:90px;right:20px;width:min(370px,calc(100vw - 24px));height:min(540px,calc(100vh - 120px));background:#fff;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.3);display:none;flex-direction:column;overflow:hidden;font-family:system-ui,-apple-system,Segoe UI,sans-serif');
  var header = h('div','background:'+COLOR+';color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px');
  var logoHtml = cfg.logo ? '<img src="'+cfg.logo+'" style="width:34px;height:34px;border-radius:50%;object-fit:cover;background:#fff" onerror="this.style.display=(void 0,\\'none\\')">' : '';
  header.innerHTML = logoHtml + '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+cfg.name+'</div><div style="font-size:11px;opacity:.85">🟢 En línea — respuesta en segundos</div></div><button id="vfw-x" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1">×</button>';
  var msgs = h('div','flex:1;overflow-y:auto;padding:14px;background:#f6f7f9;display:flex;flex-direction:column;gap:8px');
  var form = h('form','display:flex;gap:8px;padding:10px;border-top:1px solid #eee;background:#fff');
  form.innerHTML = '<input id="vfw-in" placeholder="Escribe tu mensaje…" autocomplete="off" style="flex:1;border:1px solid #ddd;border-radius:999px;padding:10px 14px;font-size:14px;outline:none"/><button type="submit" style="background:'+COLOR+';border:none;color:#fff;border-radius:999px;width:42px;height:42px;cursor:pointer;font-size:16px">➤</button>';
  var brand = h('div','text-align:center;font-size:10px;color:#9aa;padding:4px 0 8px;background:#fff','Impulsado por <a href="https://valiautoflow.com" target="_blank" rel="noopener" style="color:'+COLOR+';text-decoration:none;font-weight:600">ValiAutoFlow</a>');
  panel.appendChild(header); panel.appendChild(msgs); panel.appendChild(form); panel.appendChild(brand);
  document.body.appendChild(btn); document.body.appendChild(panel);

  function bubble(text, mine){
    var b = h('div','max-width:82%;padding:9px 12px;border-radius:14px;font-size:13.5px;line-height:1.45;white-space:pre-wrap;word-break:break-word;'+(mine?'align-self:flex-end;background:'+COLOR+';color:#fff;border-bottom-right-radius:4px':'align-self:flex-start;background:#fff;color:#222;border:1px solid #eee;border-bottom-left-radius:4px'));
    b.textContent = text; msgs.appendChild(b); msgs.scrollTop = msgs.scrollHeight; return b;
  }
  var greeted = false;
  function openPanel(){ panel.style.display='flex'; btn.style.display='none'; if(!greeted){ greeted=true; bubble(cfg.greeting,false);} document.getElementById('vfw-in').focus(); }
  function closePanel(){ panel.style.display='none'; btn.style.display='flex'; }
  btn.onclick = openPanel;
  header.querySelector('#vfw-x').onclick = closePanel;

  var busy=false;
  form.onsubmit = function(e){
    e.preventDefault();
    if(busy) return;
    var inp = document.getElementById('vfw-in');
    var text = (inp.value||'').trim(); if(!text) return;
    inp.value=''; bubble(text,true);
    var typing = bubble('escribiendo…',false); typing.style.opacity='.6'; typing.style.fontStyle='italic';
    busy=true;
    fetch(API + '/api/widget/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ws:WS, sid:sid, message:text }) })
      .then(function(r){ return r.json(); })
      .then(function(d){ typing.remove(); if(d && d.reply){ bubble(d.reply,false); } else { bubble(d && (d.note||d.error) ? (d.note||d.error) : 'Un asesor te responderá en breve.', false); } })
      .catch(function(){ typing.remove(); bubble('No pude enviar tu mensaje, intenta de nuevo.', false); })
      .finally(function(){ busy=false; });
  };
});
})();`

  return new NextResponse(js, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
