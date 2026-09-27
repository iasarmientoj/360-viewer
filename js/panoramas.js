/**
 * Lista de panorámicas del visor.
 *
 * Añade una entrada por cada imagen equirectangular (relación 2:1, p. ej.
 * 4096x2048 u 8192x4096) que coloques en la carpeta `images/`.
 *
 *   title : nombre que se muestra en la barra superior y en el selector
 *   url   : ruta relativa al archivo
 *   lon   : giro horizontal inicial en grados (opcional, por defecto 0)
 *   lat   : giro vertical inicial en grados  (opcional, por defecto 0)
 *   fov   : campo de visión inicial en grados (opcional, por defecto 75)
 */
window.PANORAMAS = [
  {
    title: 'Panorámica 01',
    url: 'images/panorama-01.jpg',
    lon: 0,
    lat: 0,
    fov: 75
  }
];
