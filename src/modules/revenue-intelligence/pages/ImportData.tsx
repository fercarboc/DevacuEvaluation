 import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { FileUp, CheckCircle2, AlertCircle, Info, FileText, Table as TableIcon, Database } from 'lucide-react';
import { useRevenue } from '../context/RevenueContext';
import { DailyData, DailyChannelSegmentRow, Channel, Segment } from '../types';

type ImportType = 'Reservas' | 'Producción diaria' | 'Producción por Canal/Segmento' | 'Tarifas';

const CHANNELS = ["DIRECT_WEB", "DIRECT_PHONE", "WALK_IN", "BOOKING", "EXPEDIA", "AIRBNB", "AGENCY", "OTHER"];
const SEGMENTS = ["LEISURE", "BUSINESS", "CORPORATE", "GROUPS", "LONG_STAY", "OTHER"];

const ImportData: React.FC = () => {
  const { importDailyData, importChannelSegmentData, importReservations, activePropertyId, properties } = useRevenue();
  const activeProperty = properties.find(p => p.id === activePropertyId);
  const [importType, setImportType] = useState<ImportType>('Reservas');
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isValidated, setIsValidated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (selectedFile && selectedFile.name.endsWith('.csv')) {
      setFile(selectedFile);
      setError(null);
      setSuccess(false);
      setIsValidated(false);
      
      Papa.parse(selectedFile, {
        header: true,
        complete: (results) => {
          setPreviewData(results.data.slice(0, 20));
        },
        error: (err) => {
          setError(`Error al leer el archivo: ${err.message}`);
        }
      });
    } else {
      setError('Por favor, selecciona un archivo .csv válido.');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    multiple: false
  });

  const handleValidate = () => {
    if (!file || previewData.length === 0) return;
    
    let requiredFields: string[] = [];
    if (importType === 'Reservas') {
      requiredFields = ['reservation_id', 'booking_date', 'arrival_date', 'departure_date', 'rooms', 'revenue', 'channel', 'segment', 'status', 'commission_pct'];
    } else if (importType === 'Producción por Canal/Segmento') {
      requiredFields = ['date', 'rooms_sold', 'rooms_total', 'revenue', 'pvp', 'channel', 'segment'];
    } else {
      requiredFields = ['date', 'rooms_sold', 'rooms_total', 'revenue', 'pvp'];
    }

    const headers = Object.keys(previewData[0] || {});
    const missingFields = requiredFields.filter(f => !headers.includes(f));

    if (missingFields.length > 0) {
      setError(`Faltan campos requeridos: ${missingFields.join(', ')}`);
      setIsValidated(false);
      return;
    }

    // Row level validation
    for (let i = 0; i < previewData.length; i++) {
      const row = previewData[i];
      
      if (importType === 'Reservas') {
        if (row.channel && !CHANNELS.includes(row.channel)) {
          setError(`Error en fila ${i + 1}: Canal '${row.channel}' no es válido.`);
          setIsValidated(false);
          return;
        }
        if (row.segment && !SEGMENTS.includes(row.segment)) {
          setError(`Error en fila ${i + 1}: Segmento '${row.segment}' no es válido.`);
          setIsValidated(false);
          return;
        }
        const arr = new Date(row.arrival_date);
        const dep = new Date(row.departure_date);
        if (dep <= arr) {
          setError(`Error en fila ${i + 1}: La fecha de salida debe ser posterior a la de entrada.`);
          setIsValidated(false);
          return;
        }
      } else if (importType === 'Producción por Canal/Segmento') {
        if (row.channel && !CHANNELS.includes(row.channel)) {
          setError(`Error en fila ${i + 1}: Canal '${row.channel}' no es válido.`);
          setIsValidated(false);
          return;
        }
        if (row.segment && !SEGMENTS.includes(row.segment)) {
          setError(`Error en fila ${i + 1}: Segmento '${row.segment}' no es válido.`);
          setIsValidated(false);
          return;
        }
      }
    }

    setError(null);
    setIsValidated(true);
  };

  const handleImport = () => {
    if (!isValidated || !file) return;

    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      complete: (results) => {
        if (importType === 'Reservas') {
          const mappedData = results.data
            .filter((row: any) => row.reservation_id && row.arrival_date)
            .map((row: any) => {
              const arr = new Date(row.arrival_date);
              const dep = new Date(row.departure_date);
              const nights = Math.max(1, Math.round((dep.getTime() - arr.getTime()) / (1000 * 60 * 60 * 24)));
              
              return {
                propertyId: activePropertyId,
                reservationId: String(row.reservation_id),
                bookingDate: row.booking_date,
                arrivalDate: row.arrival_date,
                departureDate: row.departure_date,
                rooms: Number(row.rooms),
                nights,
                revenue: Number(row.revenue),
                channel: row.channel as Channel,
                segment: row.segment as Segment,
                status: (row.status || 'CONFIRMED') as any,
                commissionPct: Number(row.commission_pct || 0)
              };
            });
          importReservations(mappedData);
        } else if (importType === 'Producción por Canal/Segmento') {
          const mappedData: DailyChannelSegmentRow[] = results.data
            .filter((row: any) => row.date && row.rooms_sold !== undefined && row.channel && row.segment)
            .map((row: any) => ({
              propertyId: activePropertyId,
              date: row.date,
              roomsTotal: Number(row.rooms_total),
              roomsSold: Number(row.rooms_sold),
              revenue: Number(row.revenue),
              pvp: Number(row.pvp),
              channel: row.channel as Channel,
              segment: row.segment as Segment,
              status: row.status || 'CHECKED_OUT'
            }));
          importChannelSegmentData(mappedData);
        } else {
          const mappedData: DailyData[] = results.data
            .filter((row: any) => row.date && row.rooms_sold !== undefined)
            .map((row: any) => ({
              propertyId: activePropertyId,
              date: row.date,
              roomsSold: Number(row.rooms_sold),
              occ: (Number(row.rooms_sold) / Number(row.rooms_total)) * 100,
              adr: Number(row.revenue) / Number(row.rooms_sold),
              revenue: Number(row.revenue),
              pvp: Number(row.pvp),
            }));
          importDailyData(mappedData);
        }
        
        setSuccess(true);
        setFile(null);
        setPreviewData([]);
        setIsValidated(false);
      }
    });
  };

  const downloadTemplate = () => {
    let csvContent = "";
    let filename = "";

    if (importType === 'Reservas') {
      csvContent = "reservation_id,booking_date,arrival_date,departure_date,rooms,revenue,channel,segment,status,commission_pct\nRES-001,2026-03-01,2026-05-01,2026-05-03,1,240.00,BOOKING,LEISURE,CONFIRMED,15\nRES-002,2026-03-05,2026-05-10,2026-05-12,1,300.00,DIRECT_WEB,BUSINESS,CONFIRMED,0";
      filename = "plantilla_reservas.csv";
    } else if (importType === 'Producción por Canal/Segmento') {
      csvContent = "date,rooms_sold,rooms_total,revenue,pvp,channel,segment,status\n2026-05-01,5,18,600.00,120.00,BOOKING,LEISURE,CHECKED_OUT\n2026-05-01,3,18,360.00,120.00,DIRECT_WEB,BUSINESS,CHECKED_OUT";
      filename = "plantilla_canales_segmentos.csv";
    } else {
      csvContent = "date,rooms_sold,rooms_total,revenue,pvp\n2026-05-01,15,18,1800.00,120.00\n2026-05-02,16,18,2000.00,125.00";
      filename = "plantilla_importacion_revenue.csv";
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Importación de Datos</h1>
          <p className="text-gray-500">Carga archivos CSV para <span className="font-bold text-blue-600">{activeProperty?.name}</span></p>
        </div>
        <button 
          onClick={downloadTemplate}
          className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-2xl font-bold hover:bg-gray-50 transition-all shadow-sm"
        >
          <FileUp size={20} />
          Descargar Plantilla CSV
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Upload & Preview */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-xl text-blue-600">
                  <FileUp size={24} />
                </div>
                <h2 className="text-xl font-bold">Subir CSV</h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-gray-400 uppercase tracking-wider">Tipo:</span>
                <select 
                  value={importType}
                  onChange={(e) => setImportType(e.target.value as ImportType)}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Reservas">Reservas Individuales</option>
                  <option value="Producción diaria">Producción diaria</option>
                  <option value="Producción por Canal/Segmento">Producción por Canal/Segmento</option>
                  <option value="Tarifas">Tarifas</option>
                </select>
              </div>
            </div>

            <div 
              {...getRootProps()} 
              className={`border-2 border-dashed rounded-3xl p-12 text-center transition-all cursor-pointer ${
                isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'
              }`}
            >
              <input {...getInputProps()} />
              <div className="bg-blue-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
                <FileUp size={32} />
              </div>
              {file ? (
                <div className="space-y-2">
                  <p className="font-bold text-gray-900">{file.name}</p>
                  <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="font-bold text-gray-900">Arrastra tu archivo aquí o haz clic para seleccionar</p>
                  <p className="text-sm text-gray-500">Solo archivos .csv (Máx 10MB)</p>
                </div>
              )}
            </div>

            {error && (
              <div className="mt-6 flex items-center gap-3 bg-rose-50 text-rose-700 p-4 rounded-2xl border border-rose-100">
                <AlertCircle size={20} />
                <span className="text-sm font-bold">{error}</span>
              </div>
            )}

            {success && (
              <div className="mt-6 flex items-center gap-3 bg-emerald-50 text-emerald-700 p-4 rounded-2xl border border-emerald-100">
                <CheckCircle2 size={20} />
                <span className="text-sm font-bold">¡Datos importados correctamente a {activeProperty?.name}!</span>
              </div>
            )}

            <div className="mt-8 flex gap-4">
              <button 
                onClick={handleValidate}
                disabled={!file}
                className={`flex-1 py-3 rounded-2xl font-bold transition-all ${
                  !file ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-900 text-white hover:bg-gray-800'
                }`}
              >
                Validar Archivo
              </button>
              <button 
                onClick={handleImport}
                disabled={!isValidated}
                className={`flex-1 py-3 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 ${
                  !isValidated ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200'
                }`}
              >
                <Database size={18} />
                Importar a Mock Store
              </button>
            </div>
          </div>

          {previewData.length > 0 && (
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex items-center gap-3">
                <TableIcon size={20} className="text-gray-400" />
                <h3 className="font-bold">Vista previa (Primeras 20 filas)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] text-left">
                  <thead className="bg-gray-50 text-gray-400 font-bold uppercase tracking-wider">
                    <tr>
                      {Object.keys(previewData[0]).map(header => (
                        <th key={header} className="px-4 py-3">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {previewData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        {Object.values(row).map((val: any, i) => (
                          <td key={i} className="px-4 py-2 text-gray-600">{val}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Info */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-6">
              <div className="bg-amber-100 p-2 rounded-lg text-amber-600">
                <Info size={20} />
              </div>
              <h3 className="font-bold">Campos Requeridos</h3>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Obligatorios</p>
                <ul className="space-y-2">
                  {importType === 'Reservas' ? (
                    <>
                      <li className="flex items-center justify-between text-sm">
                        <code className="bg-gray-100 px-2 py-1 rounded text-blue-600 font-bold text-[10px]">reservation_id</code>
                        <span className="text-gray-500 text-[10px]">ID único</span>
                      </li>
                      <li className="flex items-center justify-between text-sm">
                        <code className="bg-gray-100 px-2 py-1 rounded text-blue-600 font-bold text-[10px]">booking_date</code>
                        <span className="text-gray-500 text-[10px]">YYYY-MM-DD</span>
                      </li>
                      <li className="flex items-center justify-between text-sm">
                        <code className="bg-gray-100 px-2 py-1 rounded text-blue-600 font-bold text-[10px]">arrival_date</code>
                        <span className="text-gray-500 text-[10px]">YYYY-MM-DD</span>
                      </li>
                      <li className="flex items-center justify-between text-sm">
                        <code className="bg-gray-100 px-2 py-1 rounded text-blue-600 font-bold text-[10px]">departure_date</code>
                        <span className="text-gray-500 text-[10px]">YYYY-MM-DD</span>
                      </li>
                      <li className="flex items-center justify-between text-sm">
                        <code className="bg-gray-100 px-2 py-1 rounded text-blue-600 font-bold text-[10px]">revenue</code>
                        <span className="text-gray-500 text-[10px]">Gross Revenue</span>
                      </li>
                      <li className="flex items-center justify-between text-sm">
                        <code className="bg-gray-100 px-2 py-1 rounded text-blue-600 font-bold text-[10px]">commission_pct</code>
                        <span className="text-gray-500 text-[10px]">0-100</span>
                      </li>
                    </>
                  ) : (
                    <>
                      <li className="flex items-center justify-between text-sm">
                        <code className="bg-gray-100 px-2 py-1 rounded text-blue-600 font-bold">date</code>
                        <span className="text-gray-500">YYYY-MM-DD</span>
                      </li>
                      <li className="flex items-center justify-between text-sm">
                        <code className="bg-gray-100 px-2 py-1 rounded text-blue-600 font-bold">rooms_sold</code>
                        <span className="text-gray-500">Número entero</span>
                      </li>
                      <li className="flex items-center justify-between text-sm">
                        <code className="bg-gray-100 px-2 py-1 rounded text-blue-600 font-bold">rooms_total</code>
                        <span className="text-gray-500">Capacidad total</span>
                      </li>
                      <li className="flex items-center justify-between text-sm">
                        <code className="bg-gray-100 px-2 py-1 rounded text-blue-600 font-bold">revenue</code>
                        <span className="text-gray-500">Importe neto</span>
                      </li>
                    </>
                  )}
                </ul>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ejemplo CSV</p>
                <pre className="bg-gray-900 text-gray-300 p-4 rounded-xl text-[10px] overflow-x-auto">
{importType === 'Reservas' 
? `reservation_id,booking_date,arrival_date,departure_date,rooms,revenue,channel,segment,status,commission_pct
RES-001,2026-03-01,2026-05-01,2026-05-03,1,240.00,BOOKING,LEISURE,CONFIRMED,15`
: importType === 'Producción por Canal/Segmento' 
? `date,rooms_sold,rooms_total,revenue,pvp,channel,segment
2026-02-01,5,18,600.00,120.00,BOOKING,LEISURE`
: `date,rooms_sold,rooms_total,revenue,pvp
2026-02-01,12,18,1250.50,110.00`}
                </pre>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Reglas</p>
                <ul className="space-y-2 text-xs text-gray-500 list-disc pl-4">
                  <li>Formato fecha: AAAA-MM-DD</li>
                  <li>Decimales con punto (1250.50)</li>
                  <li>Sin separador de miles</li>
                  <li>Codificación UTF-8</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-blue-600 p-6 rounded-3xl shadow-lg text-white">
            <div className="flex items-center gap-3 mb-4">
              <FileText size={24} />
              <h4 className="font-bold">¿Necesitas ayuda?</h4>
            </div>
            <p className="text-sm text-blue-100 mb-6">Descarga nuestra plantilla oficial para asegurar que el formato es correcto.</p>
            <button 
              onClick={downloadTemplate}
              className="w-full py-3 bg-white text-blue-600 rounded-2xl font-bold text-sm hover:bg-blue-50 transition-colors"
            >
              Descargar Plantilla
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportData;