import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lista de archivos Excel a procesar
const excelFiles = [
  'boletos.xlsx',
  'cuentacorriente.xlsx',
  'movimientos.xlsx',
  'ordenes.xlsx',
  'resultados_por_info_completa.xlsx'
];

const allData = {};

console.log('🔄 Procesando archivos Excel...\n');

excelFiles.forEach(fileName => {
  const excelFilePath = path.join(__dirname, '../balanz_data', fileName);
  
  if (!fs.existsSync(excelFilePath)) {
    console.log(`⚠️  Archivo no encontrado: ${fileName}`);
    return;
  }

  console.log(`📄 Procesando: ${fileName}`);
  const workbook = XLSX.readFile(excelFilePath);
  
  console.log(`   Hojas: ${workbook.SheetNames.join(', ')}`);
  
  const fileData = {};
  
  workbook.SheetNames.forEach(sheetName => {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    fileData[sheetName] = jsonData;
    
    console.log(`   📊 ${sheetName}: ${jsonData.length} registros`);
    
    if (jsonData.length > 0) {
      console.log(`      Columnas: ${Object.keys(jsonData[0]).slice(0, 5).join(', ')}...`);
    }
  });
  
  // Usar el nombre del archivo (sin .xlsx) como clave
  const fileKey = fileName.replace('.xlsx', '');
  allData[fileKey] = fileData;
  console.log('');
});

// Guardar como JSON
const outputPath = path.join(__dirname, '../src/data/balanz_data.json');
const outputDir = path.dirname(outputPath);

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(outputPath, JSON.stringify(allData, null, 2));
console.log(`✅ Datos guardados en: ${outputPath}`);
