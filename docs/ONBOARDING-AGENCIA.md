# Playbook — Alta de una agencia nueva (30 minutos)

> Proceso operativo para dar de alta un piloto/cliente en ValiAutoFlow.
> Quien lo ejecuta: Jhon o el operador de plataforma. El Copiloto también lo
> guía paso a paso: pídele **"guíame el alta de una agencia nueva"**.

## Antes de la cita (5 min, sin el cliente)
1. Pedirle por adelantado: **logo**, **inventario** (Excel/CSV/Google Sheets con enlace público) y el **celular del dueño** (para su reporte semanal).
2. Confirmar qué número de WhatsApp usará el bot (ideal: el número de ventas que ya publican — el QR NO interfiere con su uso normal del teléfono).

## Con el cliente en llamada (20-25 min)
3. **Crear la cuenta**: registro en valiautoflow.com con el correo del dueño → se crea su workspace.
4. **Asistente de configuración** (sale solo la primera vez): nombre del negocio, giro *Automotriz*, horarios, dirección, zona horaria correcta (¡importante para citas y reportes!), personalidad del agente (default JHON) — probarla en vivo dentro del propio wizard.
5. **Conectar WhatsApp**: en el paso del wizard (o Configuración → Conexiones) escanear el QR con el teléfono del negocio: WhatsApp → Dispositivos vinculados → Vincular.
   - ✅ Verificar: mandar un "hola" desde otro número y ver la respuesta del bot.
6. **Inventario**: pegar el enlace de Google Sheets en el paso del wizard, o después en Inventario → Importar (la IA acomoda las columnas sola, entiende formatos de agencia/DMS).
   - ✅ Verificar: preguntarle al bot por un auto del inventario.
7. **Tour del panel**: al guardar el wizard arranca solo — dejar que el dueño lo recorra (2-3 min). Se repite desde Manual de uso → "Ver tour de bienvenida".

## Cierre operativo (5 min)
8. **Telegram del dueño** (para alertas y aprobaciones): Configuración → Conexiones → vincular Telegram. Si quiere control total de seguimientos, activar "aprobar por Telegram" en gBrain.
9. **Reporte semanal**: queda activo automático (lunes 9 am, por Telegram). Para que TAMBIÉN llegue por WhatsApp: agregar su celular en la configuración del briefing/reporte (o pedírselo al Copiloto: "manda el reporte semanal también al 521…").
10. **Chat del sitio web** (si tienen página): copiar el snippet de Configuración → Conexiones → "Chat para tu sitio web" y pegarlo antes de `</body>`.
11. **Equipo** (si hay vendedores): Equipo (Roles) → invitarlos como *member*. Los leads calientes se les asignarán solos (round-robin) con aviso a su Telegram.

## Verificación final (checklist de salida)
- [ ] Torre de control (`/admin`): el nuevo tenant aparece **en verde**.
- [ ] Conversación de prueba completa: saludo → pregunta por un auto → agendar cita.
- [ ] La cita aparece en Calendario.
- [ ] El dueño recibió su primer mensaje de Telegram.
- [ ] Zona horaria correcta (Configuración → General).

## Los "no se te olvide"
- El bot SOLO ofrece lo que está en Inventario — inventario vacío = bot cojo.
- El freno anti-spam viene activado (máx 2 seguimientos sin respuesta → cola larga mensual). No tocar salvo pedido del cliente.
- Si el cliente manda audios y quiere que el bot los entienda: se necesita la GROQ_API_KEY (gratis) en Configuración → Conexiones → Voz.
- Ante cualquier duda del cliente en el futuro: Manual de uso (dentro del panel) o el Copiloto.
