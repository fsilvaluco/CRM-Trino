# Proveedores y encargados de tratamiento — Ley 21.719

> Documento operativo. Una fila por proveedor: qué datos personales recibe,
> qué rol tiene ante la ley, qué hay que pedirle, dónde se pide y con qué texto.
>
> Estado: **borrador de trabajo**. Marcar cada casilla a medida que se cierra.
> Última revisión: 17 de septiembre de 2026.

---

## Cómo leer este documento

La Ley 21.719 distingue tres roles, y de eso depende qué hay que pedir:

| Rol | Qué significa | Qué se necesita |
|---|---|---|
| **Responsable** | Decide para qué y cómo se tratan los datos | Es Katarsis. No se "pide" nada: se asume la obligación |
| **Encargado** | Trata datos **por cuenta** del responsable, siguiendo sus instrucciones | **Contrato de encargo (DPA)** por escrito |
| **Responsable independiente / corresponsable** | Usa los datos también para fines propios | Acuerdo específico; no basta un DPA de encargado |

Y por separado: si el proveedor está **fuera de Chile**, además del contrato hay que
habilitar la **transferencia internacional** — con las cláusulas contractuales tipo
que aprobó el Ministerio de Economía, salvo que la Agencia declare al país con nivel
adecuado de protección.

> ⚠️ Dos cosas distintas: el **DPA** cubre *cómo* trata los datos. Las **cláusulas
> tipo** cubren *que salgan de Chile*. Un proveedor extranjero necesita las dos.

---

## Resumen: qué falta con cada uno

| # | Proveedor | Rol | Fuera de Chile | DPA | Cláusulas tipo | Prioridad |
|---|---|---|---|---|---|---|
| 1 | Supabase | Encargado | Sí | ☐ | ☐ | 🔴 Alta |
| 2 | Google (Gmail + Drive) | Encargado | Sí | ☐ | ☐ | 🔴 Alta |
| 3 | Anthropic | Encargado | Sí | ☐ | ☐ | 🔴 Alta |
| 4 | Meta | **Corresponsable** | Sí | ☐ | ☐ | 🔴 Alta |
| 5 | OpenAI | Encargado | Sí | ☐ | ☐ | 🟠 Media |
| 6 | Railway | Encargado | Sí | ☐ | ☐ | 🟠 Media |
| 7 | Resend | Encargado | Sí | ☐ | ☐ | 🟠 Media |
| 8 | Upstash | Encargado | Sí | ☐ | ☐ | 🟡 Baja |
| 9 | Shopify | Encargado | Sí | ☐ | ☐ | 🟡 Baja |
| 10 | Flow | Responsable independiente | **No** | ☐ | No aplica | 🟡 Baja |
| 11 | Telegram | — | — | **No aplica** | No aplica | ✅ Cerrado |

---

## 1. Supabase — 🔴 Alta

**Qué recibe:** absolutamente todo. Las 85 tablas: contactos, RUT, teléfonos,
correos, IPs de escaneos, evidencia de firma electrónica, préstamos, liquidaciones,
honorarios. Es el repositorio central.

**Rol:** encargado de tratamiento.

**Dónde están los datos:** proyecto `CRM Trino`, región `sa-east-1`. Eso es
**São Paulo, Brasil** — no Chile. Es una transferencia internacional aunque
"se sienta" regional.

**Qué pedir:**
- [ ] Aceptar el **DPA** estándar de Supabase (es autogestionado, no hay que negociar).
- [ ] Descargar la **lista de subencargados** (subprocessors) y guardarla fechada.
- [ ] Pedir el **informe SOC 2 Tipo II** — sirve como respaldo de medidas de seguridad.
- [ ] Confirmar por escrito la región de almacenamiento y la de los backups.

**Dónde:** Dashboard → Settings → Legal/Compliance → *Data Processing Addendum*.
Los informes se piden en `security@supabase.io` o desde el Trust Center.

---

## 2. Google — Gmail API + Drive de backups — 🔴 Alta

**Qué recibe:** dos flujos distintos, y el segundo es el problema.

- **Gmail API:** la app lee las bandejas conectadas (6 cuentas) para detectar leads.
- **Google Drive:** recibe el **dump semanal completo de la base**, comprimido en
  gzip pero **sin cifrar** (`.github/workflows/weekly-db-backup.yml`).

**Rol:** encargado.

> 🚨 **Pregunta que hay que responder antes de pedir nada:** ¿la cuenta de Drive
> donde caen los backups es de **Google Workspace** (dominio propio) o una cuenta
> personal `@gmail.com`?
>
> Las variables del workflow (`GDRIVE_CLIENT_ID`, `GDRIVE_REFRESH_TOKEN`) sugieren
> una app OAuth personal. **Si es una cuenta personal, no hay DPA posible** — Google
> no ofrece contrato de encargado para cuentas de consumidor. En ese caso no se
> "pide" nada: hay que **mover los backups** a una cuenta Workspace o a otro destino,
> y cifrarlos antes de subirlos.

**Qué pedir (si es Workspace):**
- [ ] Aceptar el **Cloud Data Processing Addendum**.
- [ ] Confirmar regiones de almacenamiento.
- [ ] Revisar los scopes de la Gmail API: confirmar que son de solo lectura y los
      mínimos necesarios.

**Dónde:** Admin Console → Cuenta → Configuración legal y de cumplimiento.
El CDPA también está en `cloud.google.com/terms/data-processing-addendum`.

---

## 3. Anthropic — 🔴 Alta

**Qué recibe:** el **contenido de correos de terceros**. `src/lib/lead-detector.ts`
manda el texto de los correos de las bandejas conectadas para extraer nombre,
correo, teléfono y empresa. Esos terceros no saben que existimos.

**Rol:** encargado.

**Qué pedir:**
- [ ] Firmar el **DPA** de Anthropic.
- [ ] Solicitar **Zero Data Retention (ZDR)** para la API key. Esto es lo más
      importante del punto: con ZDR el contenido no se retiene tras procesar la
      solicitud, lo que reduce mucho la exposición.
- [ ] Confirmar por escrito que los datos de API **no se usan para entrenar**
      (es la política por defecto, pero conviene tenerlo documentado).

**Dónde:** Consola de Anthropic → Settings → Compliance, o escribir a
`privacy@anthropic.com`. El ZDR se solicita a través de soporte o del equipo comercial.

---

## 4. Meta — 🔴 Alta — *este es distinto a todos los demás*

**Qué recibe:** vía Conversions API (`src/lib/meta-capi.ts`), por cada escaneo de
QR: **IP completa y user-agent en claro**, más `fbc`/`fbp` cuando existen. Además,
por las integraciones de Instagram y Facebook, métricas y demografía agregada.

**Rol: NO es un encargado.** Meta usa esos eventos también para sus propios fines
(optimización de su plataforma, modelos de atribución, segmentación). Ante la ley
eso lo convierte en **corresponsable** o responsable independiente, según cómo se
configure.

**Por qué importa la distinción:** un DPA de encargado no sirve acá. Un encargado
solo puede tratar datos siguiendo instrucciones del responsable; Meta no hace eso.
Hay que apoyarse en los **Términos de Herramientas Empresariales** y la **Adenda de
Tratamiento de Datos** que Meta impone, y documentar que se conoce y se acepta ese
rol compartido.

**Qué pedir / verificar:**
- [ ] Entrar al Business Manager y **verificar que la Adenda de Tratamiento de Datos
      esté aceptada**. Guardar captura con fecha.
- [ ] Revisar los **Términos de Herramientas Empresariales** vigentes y archivar copia.
- [ ] Documentar internamente la base de licitud del envío CAPI. (Hoy no existe:
      es el punto que se resuelve con la pantalla de consentimiento antes de
      diciembre — ver el plan de trabajo.)
- [ ] Evaluar activar **Limited Data Use (LDU)**, que restringe el uso que Meta hace
      de los datos recibidos.

**Dónde:** Business Manager → Configuración del negocio → Centro de seguridad /
Información de la empresa → Adenda de tratamiento de datos.

---

## 5. OpenAI — 🟠 Media

**Qué recibe:** imágenes y texto de **boletas, BHE y comprobantes de pago** —
que llevan RUT, nombres y montos de personas naturales. Rutas:
`cost-submissions-extract`, `match-receipt`, `km-extract`, `tickets-extract`,
`press-extract`, `spotify/extract`, `admin/import/parse`.

**Rol:** encargado.

**Qué pedir:**
- [ ] Firmar el **DPA** de OpenAI.
- [ ] Solicitar **Zero Data Retention** para la API key.
- [ ] Confirmar la política de no entrenamiento sobre datos de API (es el default
      desde marzo 2023, pero dejarlo por escrito).

**Dónde:** `platform.openai.com` → Settings → Organization → Data controls.
El DPA se firma en `openai.com/policies/data-processing-addendum`.

---

## 6. Railway — 🟠 Media

**Qué recibe:** es donde corre la aplicación. Ve todo el tráfico en tránsito, y sus
**logs** capturan IPs, rutas y potencialmente payloads.

**Rol:** encargado.

**Qué pedir:**
- [ ] Firmar o aceptar el **DPA**.
- [ ] Confirmar **región de despliegue** y retención de logs.
- [ ] Revisar que no se estén logueando datos personales innecesariamente.

**Dónde:** `railway.com/legal/dpa` o escribir a `legal@railway.app`.

---

## 7. Resend — 🟠 Media

**Qué recibe:** nombres y direcciones de correo de todo el equipo y de quienes
reciben invitaciones, códigos de firma electrónica y digests diarios.

**Rol:** encargado.

**Qué pedir:**
- [ ] Firmar el **DPA**.
- [ ] Confirmar **retención de logs de envío** y región.

**Dónde:** `resend.com/legal/dpa` o `support@resend.com`.

---

## 8. Upstash (Redis) — 🟡 Baja

**Qué recibe:** las claves de rate limiting se construyen con la **IP del visitante**
(`ratelimit:strict:<ip>` en `src/lib/rate-limit.ts`). Son IPs con vida corta —
ventanas de 60 segundos — pero mientras existen son datos personales.

**Rol:** encargado.

**Qué pedir:**
- [ ] Firmar el **DPA**.
- [ ] Confirmar región y TTL efectivo de las claves.

**Alternativa que evita el trámite:** hashear la IP antes de usarla como clave.
El rate limiting funciona idéntico con un hash, y deja de salir una IP de Chile.
Es más barato que negociar un contrato. **Recomendado.**

**Dónde:** `upstash.com/trust/dpa`.

---

## 9. Shopify — 🟡 Baja

**Qué recibe:** la app lee órdenes vía OAuth. **Buena noticia:** la tabla
`shopify_orders` guarda solo número de orden, fecha, totales e ítems —
**ningún dato del comprador**. La minimización ya está bien hecha.

**Rol:** encargado, pero con superficie mínima.

**Qué pedir:**
- [ ] Confirmar que el **DPA** de Shopify Partners cubre esta app.
- [ ] Verificar que los scopes sigan siendo `read_products`, `read_inventory`,
      `read_orders` y nada más.

**Dónde:** Partner Dashboard → Settings → Legal.

---

## 10. Flow — 🟡 Baja

**Qué recibe:** correo del pagador y monto, al generar un pago.

**Rol:** **responsable independiente**, no encargado. Un procesador de pagos trata
los datos para cumplir sus propias obligaciones legales (tributarias, antilavado),
no solo por instrucción nuestra.

**La buena noticia:** Flow es chileno. **No hay transferencia internacional**, así
que no se necesitan cláusulas tipo. Es el proveedor más simple de la lista.

**Qué pedir:**
- [ ] Confirmar por escrito el rol que asumen.
- [ ] Pedir su política de privacidad vigente y archivarla.

**Dónde:** `soporte@flow.cl`.

**Nota:** el módulo de facturación está implementado pero sin uso
(`billing_payments` tiene 0 filas). Si no se va a cobrar pronto, esto puede esperar.

---

## 11. Telegram — ✅ Cerrado, no requiere acción

**Qué recibe:** solo alertas del bot de Meta Ads — nombres de campaña, presupuestos
y métricas. Revisado `src/lib/meta-ads/telegram.ts`: **no circula ningún dato
personal**. El `chat_id` es de una cuenta del propio equipo.

**Acción:** ninguna. Queda documentado acá como verificado para que no aparezca
como pendiente en la próxima revisión.

**Condición:** si algún día el bot pasa a mandar nombres de contactos o datos de
clientes, este análisis deja de valer y hay que reabrirlo.

---

## Pendiente de activar (revisar antes de conectar)

- **Google Maps / Places API** — aún no conectado (`GOOGLE_MAPS_API_KEY` vacía).
  Cuando se active, enviará direcciones de venues a Google. Queda cubierto por el
  mismo CDPA del punto 2, pero hay que confirmarlo al momento de conectar.

---

## Texto modelo para pedir el DPA

Para los proveedores que no tienen un DPA autogestionado, sirve este correo:

> **Asunto:** Data Processing Agreement request — Chile Law 21.719 compliance
>
> Hello,
>
> We are a Chilean company using [PRODUCTO] in production. Chile's new data
> protection law (Ley 21.719) takes full effect on **December 1, 2026**, and we are
> completing our processor documentation ahead of that date.
>
> Could you please provide:
>
> 1. Your standard **Data Processing Agreement / Addendum**, and how to execute it
>    for our account.
> 2. Your current list of **sub-processors**.
> 3. The **region(s)** where our data is stored and processed, including backups.
> 4. Your **data retention periods** for logs and customer content.
> 5. Any **security certifications** available to customers (SOC 2, ISO 27001).
>
> We also need to document the legal basis for transferring personal data outside
> Chile. Chile's Ministry of Economy has approved **standard contractual clauses**
> for this purpose — please let us know whether you can execute those, or which
> equivalent mechanism you rely on.
>
> Our account: [CORREO / ID DE CUENTA]
>
> Thank you,
> [NOMBRE] — [CARGO], Agencia Katarsis

**Para Flow, en español:**

> **Asunto:** Consulta sobre rol de tratamiento — Ley 21.719
>
> Estimados,
>
> Somos clientes de Flow y estamos preparando nuestra documentación para la entrada
> en vigencia de la Ley 21.719 el 1 de diciembre de 2026.
>
> Necesitamos precisar el rol de Flow respecto de los datos personales de los
> pagadores que se procesan a través de la plataforma: entendemos que Flow actúa
> como **responsable independiente** y no como encargado de tratamiento, dado que
> trata esos datos para el cumplimiento de obligaciones legales propias.
>
> ¿Nos pueden confirmar ese criterio por escrito, e indicarnos la política de
> privacidad vigente que aplica a estos tratamientos?
>
> Saludos cordiales,
> [NOMBRE] — [CARGO], Agencia Katarsis

---

## Orden sugerido

**Semana 1 — los que se resuelven solos.** Supabase, OpenAI, Railway, Resend y
Shopify tienen DPA autogestionado o formulario: son clics, no negociación.

**Semana 1 — la pregunta bloqueante.** Averiguar si el Drive de los backups es
Workspace o cuenta personal. De eso depende si el punto 2 es un trámite o una
migración.

**Semana 2 — los que tardan.** Anthropic (el ZDR pasa por soporte) y Meta
(verificación en Business Manager + decisión de LDU).

**Cuando haya tiempo.** Upstash — o mejor, hashear la IP y saltarse el trámite.
Flow queda para cuando se active la facturación.

---

## Control de cambios

| Fecha | Cambio |
|---|---|
| 2026-09-17 | Versión inicial. Inventario de 11 proveedores + 1 pendiente de activar. |
