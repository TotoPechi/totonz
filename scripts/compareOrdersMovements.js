import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Leer el archivo JSON
const dataPath = path.join(__dirname, '../src/data/balanz_data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const ordenes = data.ordenes?.ordenes || [];
const movimientos = data.movimientos?.movimientos || [];
const boletos = data.boletos?.boletos || [];

console.log('=== ANÁLISIS COMPARATIVO: ÓRDENES vs MOVIMIENTOS ===\n');

console.log(`Total de órdenes: ${ordenes.length}`);
console.log(`Total de movimientos: ${movimientos.length}`);
console.log(`Total de boletos: ${boletos.length}\n`);

// 1. Analizar tipos de registros en órdenes
console.log('--- TIPOS DE REGISTROS EN ÓRDENES ---');
const tiposOperacionOrdenes = {};
const estadosOrdenes = {};
const tickersOrdenes = new Set();

ordenes.forEach(orden => {
  const tipo = orden.Operacion || 'Sin tipo';
  const estado = orden.Estado || 'Sin estado';
  tiposOperacionOrdenes[tipo] = (tiposOperacionOrdenes[tipo] || 0) + 1;
  estadosOrdenes[estado] = (estadosOrdenes[estado] || 0) + 1;
  if (orden.Ticker) tickersOrdenes.add(orden.Ticker);
});

console.log('Tipos de operación:');
Object.entries(tiposOperacionOrdenes).sort((a, b) => b[1] - a[1]).forEach(([tipo, count]) => {
  console.log(`  ${tipo}: ${count}`);
});

console.log('\nEstados:');
Object.entries(estadosOrdenes).forEach(([estado, count]) => {
  console.log(`  ${estado}: ${count}`);
});

console.log(`\nTickers únicos en órdenes: ${tickersOrdenes.size}`);

// 2. Analizar tipos de registros en movimientos
console.log('\n--- TIPOS DE REGISTROS EN MOVIMIENTOS ---');
const tiposDescripcion = {};
const tiposInstrumento = {};
const tickersMovimientos = new Set();
const movimientosConBoleto = [];
const movimientosSinBoleto = [];

movimientos.forEach(mov => {
  const desc = mov.Descripcion || '';
  const tipoInst = mov['Tipo de Instrumento'] || 'Sin tipo';
  
  // Categorizar por tipo de descripción
  if (desc.includes('Boleto /')) {
    movimientosConBoleto.push(mov);
    tiposDescripcion['Boleto'] = (tiposDescripcion['Boleto'] || 0) + 1;
  } else if (desc.includes('Renta')) {
    tiposDescripcion['Renta'] = (tiposDescripcion['Renta'] || 0) + 1;
  } else if (desc.includes('Cargo por Descubierto')) {
    tiposDescripcion['Cargo por Descubierto'] = (tiposDescripcion['Cargo por Descubierto'] || 0) + 1;
  } else if (desc.includes('Comprobante de Pago')) {
    tiposDescripcion['Comprobante de Pago'] = (tiposDescripcion['Comprobante de Pago'] || 0) + 1;
  } else if (desc.includes('Movimiento Manual')) {
    tiposDescripcion['Movimiento Manual'] = (tiposDescripcion['Movimiento Manual'] || 0) + 1;
  } else if (desc.includes('Rescate Parcial')) {
    tiposDescripcion['Rescate Parcial'] = (tiposDescripcion['Rescate Parcial'] || 0) + 1;
  } else {
    tiposDescripcion['Otros'] = (tiposDescripcion['Otros'] || 0) + 1;
  }
  
  tiposInstrumento[tipoInst] = (tiposInstrumento[tipoInst] || 0) + 1;
  if (mov.Ticker) tickersMovimientos.add(mov.Ticker);
  
  if (!desc.includes('Boleto /')) {
    movimientosSinBoleto.push(mov);
  }
});

console.log('Tipos de descripción:');
Object.entries(tiposDescripcion).sort((a, b) => b[1] - a[1]).forEach(([tipo, count]) => {
  console.log(`  ${tipo}: ${count}`);
});

console.log('\nTipos de instrumento:');
Object.entries(tiposInstrumento).sort((a, b) => b[1] - a[1]).forEach(([tipo, count]) => {
  console.log(`  ${tipo}: ${count}`);
});

console.log(`\nTickers únicos en movimientos: ${tickersMovimientos.size}`);
console.log(`Movimientos con referencia a boleto: ${movimientosConBoleto.length}`);
console.log(`Movimientos sin referencia a boleto: ${movimientosSinBoleto.length}`);

// 3. Comparar registros que aparecen en ambos
console.log('\n--- REGISTROS QUE APARECEN EN AMBOS ---');

// Extraer números de boleto de movimientos
const numerosBoletoEnMovimientos = new Set();
movimientosConBoleto.forEach(mov => {
  const match = mov.Descripcion.match(/Boleto \/ (\d+)/);
  if (match) {
    numerosBoletoEnMovimientos.add(parseInt(match[1]));
  }
});

// Extraer números de boleto de boletos
const numerosBoletoEnBoletos = new Set(boletos.map(b => b['Num Boleto']));

// Comparar por ticker y fecha
const ordenesPorTickerFecha = new Map();
ordenes.forEach(orden => {
  if (orden.Ticker && orden.Fecha) {
    const key = `${orden.Ticker}_${orden.Fecha}`;
    if (!ordenesPorTickerFecha.has(key)) {
      ordenesPorTickerFecha.set(key, []);
    }
    ordenesPorTickerFecha.get(key).push(orden);
  }
});

const movimientosPorTickerFecha = new Map();
movimientos.forEach(mov => {
  if (mov.Ticker && mov.Concertacion) {
    const key = `${mov.Ticker}_${mov.Concertacion}`;
    if (!movimientosPorTickerFecha.has(key)) {
      movimientosPorTickerFecha.set(key, []);
    }
    movimientosPorTickerFecha.get(key).push(mov);
  }
});

// Encontrar coincidencias
const coincidencias = [];
ordenesPorTickerFecha.forEach((ordenesList, key) => {
  if (movimientosPorTickerFecha.has(key)) {
    const movsList = movimientosPorTickerFecha.get(key);
    ordenesList.forEach(orden => {
      movsList.forEach(mov => {
        // Verificar si tienen cantidades similares (pueden diferir ligeramente)
        const cantidadOrden = orden.Cantidad || orden['Cantidad Operada'] || 0;
        const cantidadMov = Math.abs(mov.Cantidad || 0);
        
        if (cantidadOrden > 0 && cantidadMov > 0 && 
            Math.abs(cantidadOrden - cantidadMov) <= Math.max(cantidadOrden * 0.01, 1)) {
          coincidencias.push({
            orden: orden,
            movimiento: mov,
            key: key
          });
        }
      });
    });
  }
});

console.log(`Coincidencias encontradas (mismo ticker, fecha y cantidad similar): ${coincidencias.length}`);

if (coincidencias.length > 0) {
  console.log('\nEjemplos de coincidencias:');
  coincidencias.slice(0, 5).forEach((coinc, idx) => {
    console.log(`\n${idx + 1}. Ticker: ${coinc.orden.Ticker}, Fecha: ${coinc.orden.Fecha}`);
    console.log(`   Orden: ${coinc.orden.Operacion} - Cantidad: ${coinc.orden.Cantidad || coinc.orden['Cantidad Operada']} - Precio: ${coinc.orden.Precio || coinc.orden['Precio Operado']}`);
    console.log(`   Movimiento: ${coinc.movimiento.Descripcion.substring(0, 60)}... - Cantidad: ${coinc.movimiento.Cantidad} - Precio: ${coinc.movimiento.Precio}`);
  });
}

// 4. Análisis de boletos vs movimientos
console.log('\n--- RELACIÓN BOLETOS vs MOVIMIENTOS ---');
const boletosEnMovimientos = numerosBoletoEnMovimientos.size;
const boletosEnBoletos = numerosBoletoEnBoletos.size;
const boletosComunes = [...numerosBoletoEnMovimientos].filter(b => numerosBoletoEnBoletos.has(b));

console.log(`Boletos únicos en movimientos: ${boletosEnMovimientos}`);
console.log(`Boletos únicos en sección boletos: ${boletosEnBoletos}`);
console.log(`Boletos que aparecen en ambos: ${boletosComunes.length}`);

// 5. Resumen de campos comunes
console.log('\n--- CAMPOS COMUNES ENTRE ÓRDENES Y MOVIMIENTOS ---');
console.log('Campos en Órdenes:');
console.log('  - Operacion, Estado, id Orden, Ticker, Moneda, Fecha, Hora, Cantidad, Precio, Monto, Precio Operado, Cantidad Operada');

console.log('\nCampos en Movimientos:');
console.log('  - Descripcion, Ticker, Tipo de Instrumento, Concertacion, Cantidad, Precio, Liquidacion, Moneda, Importe');

console.log('\nCampos comunes:');
console.log('  - Ticker');
console.log('  - Moneda');
console.log('  - Cantidad');
console.log('  - Precio');
console.log('  - Fecha (Fecha en órdenes, Concertacion en movimientos)');

// 6. Tipos de registros únicos en cada uno
console.log('\n--- TIPOS DE REGISTROS ÚNICOS ---');
console.log('Solo en Órdenes:');
console.log('  - Transferencias');
console.log('  - Órdenes canceladas');
console.log('  - Operaciones de dólar (Compra/Venta Dólar Bolsa)');
console.log('  - Información de hora de ejecución');
console.log('  - Diferencia entre Precio solicitado y Precio Operado');

console.log('\nSolo en Movimientos:');
console.log('  - Rentas e intereses');
console.log('  - Cargos por descubierto');
console.log('  - Comprobantes de pago');
console.log('  - Movimientos manuales');
console.log('  - Rescates parciales');
console.log('  - Dividendos');

console.log('\n=== FIN DEL ANÁLISIS ===');

