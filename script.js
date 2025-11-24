// Variables Globales
let rawData = [];
let filteredData = [];
let charts = {}; // Objeto para guardar instancias de gráficos
let materialAverages = {};

// Elementos DOM
const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const fileNameDisplay = document.getElementById('fileName');
const mainContent = document.getElementById('mainContent');
const themeToggle = document.getElementById('themeToggle');
const fileStatus = document.getElementById('fileStatus');

// Filtros
const filters = {
    month: document.getElementById('monthFilter'),
    material: document.getElementById('materialFilter'),
    supplier: document.getElementById('supplierFilter'),
    search: document.getElementById('searchFilter')
};

// Event Listeners
fileInput.addEventListener('change', handleFileUpload);
themeToggle.addEventListener('click', toggleTheme);

// Drag and Drop
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--primary-color)';
});
dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--border-color)';
});
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--border-color)';
    const files = e.dataTransfer.files;
    if (files.length) {
        fileInput.files = files;
        handleFile(files[0]);
    }
});

// Añadir listener para el botón de reset
document.getElementById('resetFilters').addEventListener('click', () => {
    filters.month.value = 'all';
    filters.material.value = 'all';
    filters.supplier.value = 'all';
    filters.search.value = '';
    applyFilters();
});

// Filtros Events
Object.values(filters).forEach(filter => {
    filter.addEventListener('change', applyFilters);
    if(filter.id === 'searchFilter') filter.addEventListener('input', applyFilters);
});

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
        
        e.target.classList.add('active');
        document.getElementById(`${e.target.dataset.target}View`).classList.add('active');
    });
});

// Función de carga de archivo
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) handleFile(file);
}

function handleFile(file) {
    fileNameDisplay.textContent = file.name;
    fileStatus.innerHTML = '<span class="status-dot ready"></span> Procesando...';
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        
        // CRUCIAL: cellDates: true hace que Excel parsee las fechas correctamente
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        processData(jsonData);
        fileStatus.innerHTML = '<span class="status-dot ready"></span> Archivo Cargado';
    };
    reader.readAsArrayBuffer(file);
}

// Procesar Datos
function processData(data) {
    // 1. Mapeo y Limpieza (Igual que antes)
    rawData = data.map(item => {
        const normalize = (key) => item[key] || item[Object.keys(item).find(k => k.toLowerCase().includes(key.toLowerCase()))];
        return {
            fecha: normalize('fecha') || normalize('date'),
            proveedor: normalize('proveedor') || 'Desconocido',
            articulo: normalize('art') || '',
            descripcion: normalize('descrip') || 'Sin Descripción',
            cantidad: Number(normalize('cant') || 0),
            precio: Number(normalize('precio') || 0)
        };
    }).filter(item => item.fecha);

    // 2. NUEVO: Calcular Precios Promedio Históricos (Precio de Referencia)
    // Usamos rawData para que el promedio sea GLOBAL (de todo el año), no solo del mes filtrado.
    const stats = {};
    rawData.forEach(item => {
        if (!stats[item.descripcion]) stats[item.descripcion] = { totalSpent: 0, totalQty: 0 };
        stats[item.descripcion].totalSpent += (item.cantidad * item.precio);
        stats[item.descripcion].totalQty += item.cantidad;
    });

    materialAverages = {};
    Object.keys(stats).forEach(material => {
        if (stats[material].totalQty > 0) {
            materialAverages[material] = stats[material].totalSpent / stats[material].totalQty;
        }
    });

    // 3. Inicializar interfaz
    populateFilters();
    applyFilters();
    mainContent.style.display = 'block';
}

// Helpers de Fecha Robustos
function getMonthFromDate(dateInput) {
    if (!dateInput) return null;
    let date = dateInput;
    
    // Si viene como string, intentar convertir
    if (!(date instanceof Date)) {
        date = new Date(dateInput);
    }
    
    if (isNaN(date.getTime())) return null; // Fecha inválida
    return date.getMonth() + 1; // 1-12
}

function formatDate(dateInput) {
    if (!dateInput) return '-';
    let date = dateInput;
    
    if (!(date instanceof Date)) {
        date = new Date(dateInput);
    }
    
    if (isNaN(date.getTime())) return 'Fecha Inválida';
    
    return new Intl.DateTimeFormat('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    }).format(date);
}

// Rellenar Selects
function populateFilters() {
    const uniqueMaterials = [...new Set(rawData.map(i => i.descripcion))].sort();
    const uniqueSuppliers = [...new Set(rawData.map(i => i.proveedor))].sort();
    
    // Rellenar Meses (solo los disponibles)
    const monthsAvailable = [...new Set(rawData.map(i => getMonthFromDate(i.fecha)))].sort((a,b) => a-b);
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    
    filters.month.innerHTML = '<option value="all">Todo el año</option>';
    monthsAvailable.forEach(m => {
        if(m) {
            filters.month.innerHTML += `<option value="${m}">${monthNames[m-1]}</option>`;
        }
    });

    filters.material.innerHTML = '<option value="all">Todas</option>' + 
        uniqueMaterials.map(m => `<option value="${m}">${m}</option>`).join('');
        
    filters.supplier.innerHTML = '<option value="all">Todos</option>' + 
        uniqueSuppliers.map(s => `<option value="${s}">${s}</option>`).join('');
}

// Aplicar Filtros
function applyFilters() {
    filteredData = rawData.filter(item => {
        const matchMonth = filters.month.value === 'all' || getMonthFromDate(item.fecha) == filters.month.value;
        const matchMat = filters.material.value === 'all' || item.descripcion === filters.material.value;
        const matchSup = filters.supplier.value === 'all' || item.proveedor === filters.supplier.value;
        const matchSearch = !filters.search.value || item.descripcion.toLowerCase().includes(filters.search.value.toLowerCase());
        
        return matchMonth && matchMat && matchSup && matchSearch;
    });
    
    updateUI();
}

function updateUI() {
    updateKPIs();
    updateTables();
    updateCharts();
}

function updateKPIs() {
    const total = filteredData.reduce((acc, curr) => acc + (curr.cantidad * curr.precio), 0);
    const qty = filteredData.reduce((acc, curr) => acc + curr.cantidad, 0);
    
    document.getElementById('totalSpent').textContent = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(total);
    document.getElementById('totalMaterials').textContent = [...new Set(filteredData.map(i => i.descripcion))].length;
    document.getElementById('totalSuppliers').textContent = [...new Set(filteredData.map(i => i.proveedor))].length;
    document.getElementById('avgPrice').textContent = qty ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(total / qty) : '0 €';
}

function updateTables() {
    const tbody = document.getElementById('tableBody');
    
    tbody.innerHTML = filteredData.slice(0, 100).map(item => {
        // --- LÓGICA DE ALERTAS ---
        const avgPrice = materialAverages[item.descripcion] || 0;
        let alertBadge = '';
        
        // Solo calculamos si hay precio y promedio válido
        if (avgPrice > 0 && item.precio > 0) {
            const diffPercent = ((item.precio - avgPrice) / avgPrice) * 100;
            
            // Umbral del 5% para que no salten alertas por céntimos irrelevantes
            if (diffPercent > 5) {
                // Subida de precio > 5% (ROJO)
                alertBadge = `<span class="trend-badge trend-up" title="Precio un ${diffPercent.toFixed(1)}% mayor al promedio anual (${avgPrice.toFixed(2)}€)">
                                <i class="ri-arrow-up-line"></i> ${Math.abs(diffPercent).toFixed(0)}%
                              </span>`;
            } else if (diffPercent < -5) {
                // Bajada de precio > 5% (VERDE)
                alertBadge = `<span class="trend-badge trend-down" title="Precio un ${Math.abs(diffPercent.toFixed(1))}% menor al promedio anual (${avgPrice.toFixed(2)}€)">
                                <i class="ri-arrow-down-line"></i> ${Math.abs(diffPercent).toFixed(0)}%
                              </span>`;
            }
        }
        // -------------------------

        return `
        <tr>
            <td>${formatDate(item.fecha)}</td>
            <td>${item.proveedor}</td>
            <td>${item.articulo}</td>
            <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.descripcion}">${item.descripcion}</td>
            <td>${item.cantidad}</td>
            <td>
                ${item.precio.toFixed(2)} €
                ${alertBadge} </td>
            <td>${(item.cantidad * item.precio).toFixed(2)} €</td>
        </tr>
    `}).join('');
    
    // Tabla Resumen (Sin cambios, pero la incluyo para mantener el código completo si copias/pegas)
    const summaryMap = {};
    filteredData.forEach(item => {
        if(!summaryMap[item.descripcion]) {
            summaryMap[item.descripcion] = { qty: 0, total: 0 };
        }
        summaryMap[item.descripcion].qty += item.cantidad;
        summaryMap[item.descripcion].total += (item.cantidad * item.precio);
    });
    
    document.getElementById('summaryBody').innerHTML = Object.entries(summaryMap)
        .sort((a,b) => b[1].total - a[1].total)
        .map(([name, data]) => `
            <tr>
                <td>${name}</td>
                <td>${data.qty}</td>
                <td>${data.total.toFixed(2)} €</td>
                <td>${(data.total / data.qty).toFixed(2)} €</td>
            </tr>
        `).join('');
}

// --- COPIA ESTO EN TU SCRIPT.JS (Reemplaza updateCharts y renderChart) ---

// Configuración de Gráficos con Interactividad
function updateCharts() {
    const isDark = document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    Chart.defaults.color = textColor;
    Chart.defaults.borderColor = gridColor;

    // 1. Preparar Datos Mensuales (Siempre fijos 12 meses para mantener el índice correcto)
    const monthlyData = new Array(12).fill(0);
    // Usamos rawData aquí para que el gráfico de línea muestre el contexto global si no hay filtros de mes
    // O usamos filteredData si queremos que reaccione. Para drill-down, suele ser mejor filteredData.
    filteredData.forEach(item => {
        const m = getMonthFromDate(item.fecha);
        if(m) monthlyData[m-1] += (item.cantidad * item.precio);
    });

    // 2. Preparar Datos Top Materiales y Proveedores
    const matData = {};
    const supData = {};
    filteredData.forEach(item => {
        matData[item.descripcion] = (matData[item.descripcion] || 0) + (item.cantidad * item.precio);
        supData[item.proveedor] = (supData[item.proveedor] || 0) + (item.cantidad * item.precio);
    });

    const getTop = (obj) => Object.entries(obj).sort((a,b) => b[1]-a[1]).slice(0, 5);
    const topMat = getTop(matData);
    const topSup = getTop(supData);

    // 3. Renderizar Gráficos con Callback de Click
    
    // Gráfico Mensual
    renderChart('monthlyChart', 'line', {
        labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
        datasets: [{
            label: 'Gasto Mensual',
            data: monthlyData,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointHoverRadius: 8
        }]
    }, (index) => {
        // Lógica click Mes: El índice 0 es Enero (valor 1)
        syncFilterAndApply('monthFilter', index + 1);
    });

    // Gráfico Materiales
    renderChart('materialsChart', 'doughnut', {
        labels: topMat.map(i => i[0]),
        datasets: [{
            data: topMat.map(i => i[1]),
            backgroundColor: ['#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e'],
            hoverOffset: 10
        }]
    }, (index, chartLabels) => {
        // Lógica click Material
        syncFilterAndApply('materialFilter', chartLabels[index]);
    });

    // Gráfico Proveedores
    renderChart('suppliersChart', 'bar', {
        labels: topSup.map(i => i[0]),
        datasets: [{
            label: 'Gasto por Proveedor',
            data: topSup.map(i => i[1]),
            backgroundColor: '#10b981',
            borderRadius: 6,
            hoverBackgroundColor: '#059669'
        }]
    }, (index, chartLabels) => {
        // Lógica click Proveedor
        syncFilterAndApply('supplierFilter', chartLabels[index]);
    });
}

// Función Genérica para Renderizar y manejar Clics
function renderChart(id, type, data, clickCallback) {
    const ctx = document.getElementById(id).getContext('2d');
    if (charts[id]) charts[id].destroy();
    
    charts[id] = new Chart(ctx, {
        type: type,
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) { label += ': '; }
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(context.parsed.y);
                            } else {
                                // Para gráficos doughnut/pie
                                label += new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(context.parsed);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: type !== 'doughnut' ? {
                y: { beginAtZero: true }
            } : {},
            // CAPTURAR EL CLIC AQUÍ
            onClick: (e, activeElements, chart) => {
                if (activeElements.length > 0) {
                    const index = activeElements[0].index;
                    const labels = chart.data.labels;
                    if (clickCallback) clickCallback(index, labels);
                }
            },
            onHover: (event, chartElement) => {
                event.native.target.style.cursor = chartElement.length ? 'pointer' : 'default';
            }
        }
    });
}

// Función auxiliar para sincronizar el select HTML con el clic del gráfico
function syncFilterAndApply(filterId, value) {
    const select = document.getElementById(filterId);
    
    // Verificar si el valor existe en el select (para evitar errores)
    let optionExists = false;
    for (let i = 0; i < select.options.length; i++) {
        // Comparamos como string porque los value del HTML son strings
        if (select.options[i].value == value.toString()) {
            optionExists = true;
            break;
        }
    }

    if (optionExists) {
        select.value = value;
        // Efecto visual de "flash" en el select para que el usuario vea qué cambió
        select.style.borderColor = 'var(--primary-color)';
        select.style.boxShadow = '0 0 0 2px var(--primary-color)';
        setTimeout(() => {
            select.style.borderColor = '';
            select.style.boxShadow = '';
        }, 500);
        
        applyFilters(); // Aplicar el filtro
    } else {
        console.warn(`El valor "${value}" no se encuentra en el filtro ${filterId}`);
    }
}

// Toggle Dark Mode
function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const icon = themeToggle.querySelector('i');
    if (document.body.classList.contains('dark-mode')) {
        icon.classList.replace('ri-moon-line', 'ri-sun-line');
    } else {
        icon.classList.replace('ri-sun-line', 'ri-moon-line');
    }
    updateCharts(); // Redibujar gráficos para actualizar colores de texto
}