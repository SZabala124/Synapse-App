# Auditoria de Database I/O de Synapse - 4 de octubre de 2026

## Conclusion

El responsable principal del salto no fue descargar nuevos flujogramas: fue
`users:reconcilePlanExpirations`, ejecutado por un cron **cada minuto**, que
recorria todos los usuarios incluso cuando no habia ningun vencimiento.
La cache del navegador no puede evitar una tarea ejecutada en el servidor.

En la primera muestra de 1.000 ejecuciones completadas, entre
2026-10-04 02:46:47 UTC y 14:55:47 UTC (3 de octubre 22:46 a 4 de octubre
10:55 en Caracas), este proceso hizo 730 ejecuciones, leyo 26.280 documentos
y consumio **15.767.270 bytes de lecturas**, sin escrituras. Represento
**96,94 % del Database I/O medido en esa muestra**.

Cada pasada leia 36 usuarios y 21.599 bytes. Manteniendo esa carga durante
24 horas: 1.440 pasadas y 31.102.560 bytes/dia, aproximadamente **31,10 MB
decimales / 29,66 MiB**, sin que nadie tuviera que abrir la pagina.
Esta es una proyeccion del patron observado, no la facturacion diaria exacta.

## Evidencia y alcance

Se consultaron los logs del despliegue configurado
`confident-sturgeon-659` (development). Se sumaron los campos reales
`usageStats.databaseIoReadBytes` y `databaseIoWriteBytes` de las ejecuciones
completadas. No se descargaron tablas de usuarios ni se guardaron argumentos,
identidades o contenidos de materiales.

| Funcion | Ejecuciones | Lecturas facturables, bytes | Documentos leidos |
| --- | ---: | ---: | ---: |
| users:reconcilePlanExpirations | 730 | 15.767.270 | 26.280 |
| flows:getFlow | 4 | 212.172 | 846 |
| quarter:getQuarterOverview | 16 | 116.536 | 339 |
| quarter:getCalendarEvaluations | 4 | 23.664 | 69 |
| users:getEntitlements | 39 | 22.678 | 38 |
| users:getSubjectSelection | 39 | 22.678 | 38 |
| users:getProfile | 39 | 22.678 | 38 |
| payments:myPending | 39 | 20.956 | 40 |
| users:ensureProfile | 21 | 16.093 | 38 |
| flows:listCourses | 2 | 12.414 | 56 |
| quarter:getCourseEvaluations | 13 | 10.773 | 30 |
| quarter:getScheduleWorkspace | 3 | 6.856 | 26 |
| payments:pendingCount | 25 | 5.082 | 12 |
| users:getAccess | 9 | 4.235 | 10 |
| quarter:getCourseSimulations | 1 | 958 | 2 |
| documents:libraryRevision | 10 | 597 | 3 |

El resto de las funciones de esta muestra no registro lecturas facturables.
Varias consultas fueron servidas por la cache de Convex; contar solicitudes
no equivale a contar ejecuciones con Database I/O.

Una segunda muestra, desplazada hasta 15:07:43 UTC y con otras ejecuciones
por los despliegues, arrojo 16.425.366 bytes leidos, 0 escritos y 95,67 %
atribuido al mismo proceso. No se debe restar ni sumar estas muestras:
sus ventanas se superponen. Las 60 ejecuciones mas recientes de esa
segunda consulta no tenian errores.

Separando solo las ejecuciones posteriores a la primera correccion
(desde 14:58 UTC), el nuevo ciclo de reconciliacion completo, Pro y
Excellence, leyo **14 documentos y 10.930 bytes**, en dos lotes, sin
escrituras. Ya no hubo una ejecucion por minuto. Con los mismos usuarios
y sin reparaciones/vencimientos, ese ciclo ahora diario equivale a unos
10,67 KiB/dia frente a los 31,10 MB/dia proyectados del patron anterior.
Es una reduccion proyectada de aproximadamente 99,96 % **de esa tarea**,
no del consumo total de la aplicacion.

No se dispone aqui del desglose completo facturado del 3 y 4 de octubre,
ni de un historial completo de cada navegador. Los 54,54 MB de la captura
son una metrica acumulada con un alcance distinto al de estas muestras.
Los despliegues tambien pueden invalidar resultados cacheados una vez.

## Revision de toda la pagina

| Area | Comportamiento observado en codigo | Evaluacion |
| --- | --- | --- |
| Tareas automaticas | Reconciliacion completa de usuarios cada minuto | Causa dominante confirmada; corregida |
| Trimestre | Consultas directas al montar; resumen releia evaluaciones; horario borraba/reinsertaba bloques | Corregido con versiones, cache persistente y escrituras selectivas |
| Flujograma | Cache local y revision de estados/dificultad; definicion estatica incluida en el resultado | Se agrega version del catalogo estatico para invalidar cambios de planes de estudio |
| Catalogo de materias | Lista cacheada por tiempo; leia todas las dificultades para detectar duplicados | Version pequena global e indices solo para codigos con nombres duplicados |
| Materiales | Metadatos en IndexedDB; revision pequena y descarga de diferencias; filtros locales | Se conserva; se elimina ensureProfile redundante al montar esta seccion |
| Perfil y permisos | Suscripciones globales al perfil, derechos y seleccion | Lecturas pequenas; no se congelan permisos en localStorage |
| Seguridad | Comprobacion de identidad y correo; consultas de usuario para privilegios | Necesarias; no son el origen dominante y no se deshabilitan |
| Pagos | Avisos de solicitudes pendientes; contador admin; expiracion programada | Carga pequena en la muestra; se conserva actualizacion reactiva |
| Comentarios | Lista acotada, likes/reportes y comprobacion de autores; activa solo en esa vista | Potencial coste con mayor actividad, no medido en la muestra |
| Administracion | Usuarios/pagos acotados y reconstruccion explicita de indice de materiales | Operaciones potencialmente caras, no hay evidencia de bucle en esta muestra |
| Registro/dispositivos | Registro y actualizacion al iniciar sesion, no polling permanente | No explica las lecturas del cron |
| Reinicio de trimestre | Proceso por lotes al reiniciar, no cada minuto | Coste puntual esperado |

Las definiciones de carreras estan en codigo: agregar una carrera no escribe
60 documentos de materias en una tabla de Convex. Si crece el numero de
estados guardados, una lectura fria de `getFlow` si puede costar mas. Hoy
esa funcion lee estados de otras carreras para mantener el estado compartido;
no se elimino ese comportamiento requerido por el usuario.

## Cambios aplicados y desplegados

1. Reconciliacion de planes una vez al dia, indexada por plan y vencimiento,
   limitada a Pro/Excellence. Los vencimientos siguen teniendo sus trabajos
   programados a la hora exacta: el cron diario es respaldo/reparacion.
2. `ensureProfile` deja de reescribir incondicionalmente el administrador.
   Materiales ya no vuelve a llamar esa mutacion al montar la vista.
3. Trimestre mantiene una revision pequena por usuario/trimestre con versiones
   independientes para resumen, calendario, horario, evaluaciones y simulaciones
   de cada materia. Las consultas grandes se omiten mientras su version coincide.
4. Cache persistente de trimestre y flujograma sin vencimiento por tiempo si
   la version sigue vigente. Aislada por cuenta, argumentos y contexto de permisos;
   acotada a unas 80 entradas y sujeta a espacio/limpieza del navegador.
5. Cache reactiva entre componentes y entre pestañas: invalidar una entrada
   se refleja inmediatamente en los consumidores, sin depender de recargar.
6. Resumen de notas guardado por materia y mantenido en la misma transaccion
   al crear, editar o borrar evaluaciones. Las materias antiguas sin resumen
   tienen una lectura de compatibilidad; se actualizan al modificar evaluaciones.
7. Guardar datos iguales no vuelve a escribir evaluaciones, simulaciones,
   metas ni horarios. Los horarios conservan los IDs de bloques no modificados.
8. Catalogos estaticos usan una version derivada del contenido del flujograma.
   El selector de materias tambien observa una revision global de dificultad,
   para que eliminar duplicados no quede desactualizado en otros dispositivos.

Los cambios de backend se desplegaron con `convex dev --once` en el despliegue
configurado, a las 10:58 y 11:07 de Caracas. El frontend esta actualizado en
el workspace; esta tarea no publico un despliegue del hosting del frontend.

No se promete Database I/O cero: comprobar versiones, actualizar datos,
iniciar sesion, vencimientos y cambios de permisos siguen siendo operaciones
reales. La eliminacion del cron por minuto es independiente de que un usuario
reciba la nueva version del frontend.

## Medicion reproducible

Desde la raiz del proyecto:

```powershell
node scripts/auditConvexIo.mjs 1000 25
```

Para excluir el periodo anterior al arreglo:

```powershell
node scripts/auditConvexIo.mjs 1000 25 2026-10-04T14:58:00Z
```

El primer argumento es el historial solicitado y el segundo cuantos segundos
escuchar antes de cerrar el proceso. La salida agrega bytes de I/O, documentos,
cache hits, errores y porcentajes por funcion. No imprime datos de usuarios.
Si hay mas de un despliegue, confirmar que la CLI apunta al mismo que el panel.

Los mensajes de consola del frontend miden **bytes del JSON UTF-8** y muestran
cuando el resultado grande se reutiliza con 0 bytes descargados para esa
consulta. No incluyen compresion/protocolo ni la consulta pequena de revision.
Un mensaje "cache reutilizada" no significa que se haya descargado el catalogo.
Tampoco esos bytes representan Database I/O: el servidor puede leer documentos
enteros, aunque devuelva un resumen muy pequeno.

Convex distingue Database I/O y transferencia de red en sus
[metricas de logs](https://docs.convex.dev/production/integrations/log-streams).
Consultar documentos completos tambien cuenta aunque se reduzca el resultado;
ver [limites de lecturas](https://docs.convex.dev/production/state/limits).

## Verificacion y limites

- 50 pruebas pasaron, incluyendo seguridad, cache por revision, aislamiento
  entre cuentas/pestañas, resumen de notas, no-op de horario y solapamientos.
- Compilacion Vite correcta; advertencia preexistente por chunks grandes.
- Backend compilado y desplegado correctamente; nuevo indice de revisiones creado.
- Frontend local: http://127.0.0.1:5176/.
- El navegador de prueba no tiene sesion iniciada: no se realizaron cambios
  en evaluaciones reales ni una prueba autenticada de ida/vuelta entre vistas.
- Hace falta comparar un periodo posterior de uso normal para medir el ahorro
  diario total real. El patron antiguo y su causa si estan confirmados por logs.
