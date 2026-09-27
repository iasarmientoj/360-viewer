# Visor 360°

Visor de imágenes panorámicas equirectangulares, estático y sin build: solo HTML,
CSS y un módulo JS que carga [three.js](https://threejs.org/) desde un CDN.
Pensado para publicarse tal cual en **GitHub Pages**.

## Uso

| Acción | Ratón / táctil | Teclado |
|---|---|---|
| Mirar alrededor | arrastrar | flechas |
| Acercar / alejar | rueda o pellizco | `+` / `-` |
| Restablecer vista | botón ⟲ | `0` |
| Rotación automática | botón ↻ | `R` |
| Pantalla completa | botón ⛶ | `F` |
| Ver una imagen propia | botón 📂 o soltarla sobre la ventana | — |

Las imágenes abiertas desde tu equipo se procesan solo en el navegador: no se suben a ningún sitio.

## Añadir panorámicas

1. Copia la imagen equirectangular (proporción 2:1, p. ej. 4096×2048) en `images/`.
2. Añade una entrada en [`js/panoramas.js`](js/panoramas.js):

```js
window.PANORAMAS = [
  { title: 'Panorámica 01', url: 'images/panorama-01.jpg', lon: 0, lat: 0, fov: 75 },
  { title: 'Salón',         url: 'images/salon.jpg' }
];
```

Con dos o más entradas aparecen automáticamente el selector de escenas y los botones ‹ ›.

`lon`, `lat` y `fov` (todos opcionales) definen la vista inicial en grados.

## Publicar en GitHub Pages

```bash
git init
git add .
git commit -m "Visor 360"
git branch -M main
git remote add origin https://github.com/USUARIO/REPO.git
git push -u origin main
```

Luego, en el repositorio: **Settings → Pages → Source: Deploy from a branch →
Branch: `main` / `/ (root)`**. La web queda en `https://USUARIO.github.io/REPO/`.

## Notas

- **Tamaño de imagen.** GitHub Pages admite hasta 100 MB por archivo, pero cada
  visitante descarga la imagen entera. `images/panorama-01.jpg` son 8192×4096
  (~12 MB); reducirla a 4096×2048 con calidad JPEG 80 baja el peso a ~2 MB y se
  ve prácticamente igual en pantalla. Además, algunos móviles no admiten texturas
  de más de 4096 px: el visor las reescala solo, pero eso gasta memoria y tiempo.
- **Pruebas en local.** Ábrelo con un servidor, no con doble clic
  (`file://` bloquea los módulos ES): `python -m http.server 8000`.
- La versión de three.js está fijada en el import map de `index.html`.

## Estructura

```
index.html          interfaz y import map de three.js
css/style.css       estilos
js/panoramas.js     lista de imágenes (edita esto)
js/viewer.js        lógica del visor
images/             panorámicas
```
