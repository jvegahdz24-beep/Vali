// Opciones compartidas de los campos de inventario (formulario + revisión de importación).
export const TRANSMISIONES = ['Automática', 'Manual', 'CVT', 'Automática (DSG)', 'Automatizada']
export const COMBUSTIBLES = ['Gasolina', 'Diésel', 'Híbrido', 'Eléctrico', 'Gas LP', 'GNV']
export const TRACCIONES = ['4x2', '4x4', 'AWD', 'Delantera', 'Trasera']
export const PUERTAS = ['2', '3', '4', '5']
export const CATEGORIAS = ['Nuevo', 'Seminuevo', 'Usado']
export const ESTATUS = ['disponible', 'apartado', 'vendido']
export const CARROCERIAS = ['Sedán', 'SUV', 'Hatchback', 'Pickup', 'Coupé', 'Convertible', 'Minivan', 'Van', 'Wagon', 'Motocicleta', 'ATV / UTV', 'Carrito de Golf', 'Vehículo industrial', 'Trailer / Remolque']
export const TIPOS_FACTURA = ['Factura de agencia', 'Factura de empresa', 'Factura de aseguradora', 'Refacturada de empresa', 'Refacturada de financiera', 'Carta factura', 'Pedimento / Legalizado', 'No especificado', 'Otro']
export const NUM_DUENOS = ['Único dueño', '2 dueños', '3 dueños', 'Más de 3 dueños', 'No especificado']
export const YEARS = Array.from({ length: 36 }, (_, i) => String(new Date().getFullYear() + 1 - i))
