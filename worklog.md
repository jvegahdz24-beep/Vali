# ValiAutoFlow — DIAGNÓSTICO COMPLETO Y CORRECCIONES

## Fecha: 2026-04-24

---

## 🔴 PROBLEMA 1: PANTALLA NEGRA

### Causa Raíz
El servidor Next.js en modo desarrollo (`next dev` con Turbopack) **se cae consistentemente** durante la compilación/renderizado SSR de la página principal (`/`). La aplicación tiene:
- **14 componentes lazy-loaded** en page.tsx
- **recharts** (librería pesada de gráficos)
- **70+ rutas API**
- **30+ componentes UI** de shadcn/ui

Turbopack no tiene suficiente memoria para compilar todo esto en cada petición, causando un OOM (Out Of Memory) que mata el proceso del servidor. Cuando el servidor muere, el navegador muestra la última respuesta recibida (o nada), resultando en la "pantalla negra".

### Evidencia
```
Test 1: API login → OK, main page → SERVER CRASHED
Test 2: API login → OK, main page → SERVER CRASHED  
Test 3: API login → OK, main page → SERVER CRASHED
Test 4: Production build → OK, main page → HTTP 200 (ESTABLE)
```

### Solución Aplicada
- Usar **`next build` + `node .next/standalone/server.js`** (producción) en lugar de `next dev`
- Scripts actualizados: `start-server.sh` y `run-server.sh`
- El servidor standalone es **100% estable** y maneja todas las peticiones sin caerse

---

## 🔴 PROBLEMA 2: ERRORES TYPESCRRIPT SILENCIADOS

### Causa Raíz
`next.config.ts` tiene `typescript: { ignoreBuildErrors: true }` que **oculta errores críticos** de TypeScript. Se encontraron:

1. **`dashboard-main.tsx:1155`** — `Property 'deadline' does not exist on type globalPriority`
   - El tipo `JhonPanelData.globalPriority` no incluía la propiedad `deadline`
   - Esto causaba que el componente `GlobalPriorityBanner` accediera a una propiedad undefined
   
2. **`memory.ts:150,156`** — `Date | null | undefined` no es asignable a `Date | null`
   - `contact.lastMessageAt || profile?.lastActiveAt` producía `Date | null | undefined`
   - Las funciones `detectPattern()` y `buildDecisionTrace()` esperaban `Date | null`

### Solución Aplicada
- Agregado `deadline?: number` al tipo `globalPriority` 
- Cambiado `priority.deadline > 0` por `(priority.deadline ?? 0) > 0`
- Corregido tipo en memory.ts: `const lastInteraction: Date | null = contact.lastMessageAt ?? profile?.lastActiveAt ?? null`

---

## 🔴 PROBLEMA 3: PÉRDIDA/MEZCLA DE DATOS

### Causa Raíz
1. **Seed parcial**: El endpoint `/api/seed` tiene un guard `if (existingContacts > 0)` que saltea la creación de datos si ya hay contactos. En algún punto anterior (FASE 10.5), se crearon 5 contactos de prueba sin conversaciones, deals ni agents. El seed detectó estos 5 contactos y nunca creó el resto de datos.

2. **Aleatoriedad**: El seed usa `randomBetween()` y `randomPick()` para generar datos. Cada ejecución produce datos completamente diferentes.

3. **Workspace inconsistente**: El workspace actual tenía slug "valiautoflow-main" (de una creación anterior) pero el seed crea slug "valiflow-jvega". Esto causaba que el seed no encontrara el workspace existente y creara uno duplicado.

### Estado Anterior de la Base de Datos
```
Users: 1
Workspaces: 1 (slug: "valiautoflow-main" — INCORRECTO)
Contacts: 5 (solo de pruebas FASE 10.5)
Conversations: 0
Deals: 0
Agents: 0
EngineEvents: 15 (de pruebas)
```

### Solución Aplicada
- Base de datos reseteada completamente
- Re-seed ejecutado exitosamente con datos completos
- Estado posterior:
```
Users: 1
Workspaces: 1 (slug: "valiflow-jvega" — CORRECTO)
Contacts: 20
Conversations: 15 (con 66 mensajes)
Deals: 12
Agents: 3
Automations: 3
AnalyticsEvents: 50
```

---

## 🔴 PROBLEMA 4: CAÍDAS CON CAMBIOS GRANDES

### Causa Raíz
Cada cambio grande fuerza a Turbopack a **recompilar toda la aplicación** desde cero. Con 70+ rutas y 14 componentes lazy-loaded, esta recompilación consume toda la memoria disponible, causando OOM.

### Solución
- Desarrollo: Hacer cambios pequeños e incrementales
- Para cambios grandes: Hacer `next build` y usar el servidor standalone
- Incrementar memoria: `NODE_OPTIONS="--max-old-space-size=2048"`

---

## 🟡 MEDIDAS PREVENTIVAS RECOMENDADAS

1. **Nunca usar `ignoreBuildErrors: true`** en producción — corregir errores TS antes de deployar
2. **Hacer build antes de cambios grandes** para verificar que no hay errores de compilación
3. **No reiniciar el seed sin borrar la DB primero** — usar el endpoint con `?reset=true&pin=VALIFLOW_DEMO_2024`
4. **Usar `next build` + standalone** en lugar de `next dev` para estabilidad
5. **Considerar dividir page.tsx** en rutas separadas para reducir el tamaño del bundle

---

## Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `src/components/dashboard/dashboard-main.tsx` | Agregado `deadline?: number` a tipo `globalPriority`, null-safe access |
| `src/lib/engine/memory.ts` | Corregido tipo `lastInteraction` con `?? null` |
| `start-server.sh` | Mejorado: build check, copia de assets, NODE_OPTIONS |
| `run-server.sh` | Mejorado: build + restart automático |
