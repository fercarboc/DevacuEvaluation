import React, { useState } from 'react';
import { useRevenue } from '../context/RevenuePropertyContext';
import { FileText, Download, Calendar, Filter, FileBarChart, PieChart, TrendingUp, CheckCircle2 } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const Reports: React.FC = () => {
  const { dailyData, monthlyData, pickupData, activePropertyId, properties } = useRevenue();
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const activeProperty = properties.find(p => p.id === activePropertyId);

  const generatePDF = async (type: 'daily' | 'pickup' | 'monthly' | 'executive') => {
    setIsGenerating(type);
    
    // Simulate a small delay for UX
    await new Promise(resolve => setTimeout(resolve, 800));

    const doc = new jsPDF();
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString();

    // Cover Page
    doc.setFillColor(59, 130, 246); // Blue 600
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('DEBACU REVENUE INTELLIGENCE', 20, 25);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(18);
    doc.text(`Informe: ${type.toUpperCase()}`, 20, 60);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Propiedad: ${activeProperty?.name}`, 20, 75);
    doc.text(`Fecha de generación: ${dateStr} ${timeStr}`, 20, 82);
    doc.text(`Generado por: Revenue Manager Admin`, 20, 89);

    doc.setDrawColor(230, 230, 230);
    doc.line(20, 100, 190, 100);

    if (type === 'daily') {
      const tableData = dailyData.slice(0, 30).map(d => [
        d.date,
        `${d.occ.toFixed(1)}%`,
        d.roomsSold,
        `${d.adr.toFixed(2)}€`,
        `${d.revenue.toLocaleString()}€`,
        `${(d.revenue / (activeProperty?.roomsCount || 18)).toFixed(2)}€`
      ]);

      autoTable(doc, {
        startY: 110,
        head: [['Fecha', 'OCC%', 'Rooms', 'ADR', 'Revenue', 'RevPAR']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [31, 41, 55] }
      });
    } else if (type === 'pickup') {
      const tableData = pickupData.map(d => [
        d.arrivalDate,
        `${d.occToday.toFixed(1)}%`,
        d.roomsToday,
        d.pickup > 0 ? `+${d.pickup}` : d.pickup,
        `${d.adrToday.toFixed(2)}€`,
        `${d.revenueToday.toLocaleString()}€`,
        `${d.paceVsLY.toFixed(1)}%`
      ]);

      autoTable(doc, {
        startY: 110,
        head: [['Llegada', 'OCC', 'Rooms', 'Pickup', 'ADR', 'Revenue', 'Pace vs LY']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [5, 150, 105] }
      });
    } else if (type === 'monthly') {
      const tableData = monthlyData.map(d => [
        d.month,
        `${d.occ.toFixed(1)}%`,
        d.rn,
        `${d.adr.toFixed(2)}€`,
        `${d.revenue.toLocaleString()}€`,
        `${d.difVsLY.toFixed(1)}%`
      ]);

      autoTable(doc, {
        startY: 110,
        head: [['Mes', 'OCC%', 'RN', 'ADR', 'Revenue', 'Dif vs LY']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] }
      });
    } else if (type === 'executive') {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Resumen Ejecutivo MTD', 20, 110);
      
      const currentMonth = monthlyData[0];
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(`Ocupación Media: ${currentMonth.occ.toFixed(1)}%`, 20, 120);
      doc.text(`ADR Medio: ${currentMonth.adr.toFixed(2)}€`, 20, 127);
      doc.text(`Revenue Total: ${currentMonth.revenue.toLocaleString()}€`, 20, 134);
      doc.text(`RevPAR: ${currentMonth.revpar.toFixed(2)}€`, 20, 141);

      doc.setFont('helvetica', 'bold');
      doc.text('Conclusiones Estratégicas:', 20, 155);
      doc.setFont('helvetica', 'normal');
      doc.text('- La demanda se mantiene estable con un crecimiento del 5% vs LY.', 20, 165);
      doc.text('- El ADR ha mejorado gracias a la gestión dinámica de tarifas en fines de semana.', 20, 172);
      doc.text('- Se recomienda mantener la estrategia de precios para el próximo trimestre.', 20, 179);
    }

    doc.save(`Debacu_Report_${type}_${activeProperty?.name.replace(/\s+/g, '_')}.pdf`);
    setIsGenerating(null);
  };

  const reportCards = [
    { id: 'daily', title: 'Informe Diario (Día x Día)', icon: Calendar, desc: 'Detalle diario de OCC, ADR y Revenue de los últimos 30 días.', color: 'blue' },
    { id: 'pickup', title: 'Informe Pickup Avanzado', icon: TrendingUp, desc: 'Análisis de ritmo de reservas y pace comparativo vs año anterior.', color: 'emerald' },
    { id: 'monthly', title: 'Informe Mensual YoY', icon: FileBarChart, desc: 'Comparativa mensual histórica con variaciones porcentuales.', color: 'indigo' },
    { id: 'executive', title: 'Resumen Ejecutivo', icon: PieChart, desc: 'KPIs principales, gráficos de tendencia y conclusiones mock.', color: 'rose' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Centro de Informes</h1>
          <p className="text-gray-500">Generación y descarga de reportes PDF para {activeProperty?.name}</p>
        </div>
        <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-xl text-sm font-bold text-gray-600">
            <Filter size={16} />
            Filtros Globales
          </div>
          <div className="h-6 w-px bg-gray-100"></div>
          <div className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-blue-600">
            <Calendar size={16} />
            Mes Actual
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {reportCards.map((report) => (
          <div key={report.id} className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 hover:border-blue-200 transition-all group">
            <div className="flex items-start justify-between mb-6">
              <div className={`p-4 rounded-2xl bg-${report.color}-50 text-${report.color}-600`}>
                <report.icon size={28} />
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg">
                <CheckCircle2 size={14} />
                Listo para generar
              </div>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">{report.title}</h3>
            <p className="text-gray-500 text-sm leading-relaxed mb-8">{report.desc}</p>
            
            <button 
              onClick={() => generatePDF(report.id as any)}
              disabled={isGenerating !== null}
              className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold transition-all ${
                isGenerating === report.id 
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gray-900 text-white hover:bg-gray-800 shadow-lg shadow-gray-200'
              }`}
            >
              {isGenerating === report.id ? (
                <>
                  <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                  Generando...
                </>
              ) : (
                <>
                  <Download size={20} />
                  Descargar PDF
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      <div className="bg-blue-600 p-10 rounded-[40px] text-white relative overflow-hidden shadow-2xl shadow-blue-200">
        <div className="relative z-10 max-w-2xl">
          <h2 className="text-3xl font-bold mb-4">¿Necesitas un informe personalizado?</h2>
          <p className="text-blue-100 text-lg leading-relaxed mb-8">
            Nuestra versión Enterprise permite programar envíos automáticos por email y crear 
            dashboards a medida con los KPIs que más importan a tu cadena.
          </p>
          <button className="px-8 py-4 bg-white text-blue-600 rounded-2xl font-bold hover:bg-blue-50 transition-all">
            Contactar con Soporte Premium
          </button>
        </div>
        <FileText size={200} className="absolute -right-10 -bottom-10 text-blue-500/20 rotate-12" />
      </div>
    </div>
  );
};

export default Reports;