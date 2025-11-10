import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directorio donde están los archivos xlsx
const balanzDataDir = path.join(__dirname, '../balanz_data');

// Obtener todos los archivos .xlsx
const xlsxFiles = fs.readdirSync(balanzDataDir).filter(file => file.endsWith('.xlsx'));

console.log(`📊 Encontrados ${xlsxFiles.length} archivos .xlsx para convertir\n`);

xlsxFiles.forEach(file => {
  const xlsxPath = path.join(balanzDataDir, file);
  const csvPath = path.join(balanzDataDir, file.replace('.xlsx', '.csv'));
  
  console.log(`🔄 Convirtiendo: ${file}`);
  
  try {
    // Leer el archivo Excel
    const workbook = XLSX.readFile(xlsxPath);
    
    // Tomar la primera hoja (sheet)
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convertir a CSV
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    
    // Guardar el archivo CSV
    fs.writeFileSync(csvPath, csv, 'utf8');
    
    console.log(`✅ Creado: ${file.replace('.xlsx', '.csv')}\n`);
  } catch (error) {
    console.error(`❌ Error convirtiendo ${file}:`, error.message, '\n');
  }
});

console.log('🎉 Conversión completada!');
