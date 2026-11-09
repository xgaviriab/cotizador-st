/* Asignación de solicitudes de cotización. Ajustar reglas comerciales aquí. */
const PREDETERMINADO = {
  nombre: 'Alexandra Ferreira',
  correo: 'ventasmostrador2@solucionestubulares.com'
};

// La primera regla coincidente gana. Mantener vacía si todas las solicitudes
// deben llegar al asesor predeterminado configurado abajo.
const REGLAS = [];

export function asignar(datos) {
  const lineas = (datos.productos || []).map(p => p.linea);
  for (const regla of REGLAS) {
    if (regla.lineas && lineas.some(linea => regla.lineas.includes(linea))) {
      return { nombre: regla.nombre, correo: regla.correo };
    }
    if (regla.ciudad && regla.ciudad.test(datos.ciudad || '')) {
      return { nombre: regla.nombre, correo: regla.correo };
    }
  }
  return {
    nombre: process.env.ASESOR_NOMBRE || PREDETERMINADO.nombre,
    correo: process.env.ASESOR_CORREO || PREDETERMINADO.correo
  };
}

export { PREDETERMINADO, REGLAS };
