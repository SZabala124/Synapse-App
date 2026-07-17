# Synapse Academia

Prototipo local para organizar material de estudio universitario premium.

## Abrir

Abre `index.html` directamente en el navegador.

Si prefieres servirlo por localhost:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Luego entra en:

```text
http://127.0.0.1:4173
```

## Datos locales

La app no usa login ni base de datos. Las materias, actividades y materiales se guardan en `localStorage` con la clave:

```text
synapse-academia-cache-v1
```
# Synapse-App
