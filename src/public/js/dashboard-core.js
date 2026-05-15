if (!localStorage.getItem('token')) {
  window.location.replace('/');
} else {
  history.replaceState(null, '', '/dashboard');
  document.addEventListener('DOMContentLoaded', () => {
    document.body.style.visibility = 'visible';
  });
}

const TOKEN   = localStorage.getItem('token');
const USUARIO = JSON.parse(localStorage.getItem('usuario') || '{}');
let MIS_OPCIONES = JSON.parse(localStorage.getItem('opciones') || '[]');

// Arrays de datos compartidos entre módulos
let dataPerfiles       = [];
let dataUsuarios       = [];
let dataClientes       = [];
let dataPlanes         = [];
let dataMembresias     = [];
let dataCategorias     = [];
let dataPresentaciones = [];   
let todasLasOpciones   = [];
let clientesFiltrados  = [];

// Config de módulos para sidebar y home
const MODULOS_CONFIG = {
  'home':           { icon: 'bi-speedometer2',   label: 'Dashboard',      seccion: 'Principal',       color: '#e94560' },
  'clientes':       { icon: 'bi-person-badge',   label: 'Clientes',       seccion: 'Gestión',          color: '#2e7d32' },
  'membresias':     { icon: 'bi-card-checklist', label: 'Membresías',     seccion: 'Gestión',          color: '#0f3460' },
  'planes':         { icon: 'bi-grid-3x3-gap',   label: 'Planes',         seccion: 'Gestión',          color: '#7c4dff' },
  'categorias':     { icon: 'bi-tag',            label: 'Categorías',     seccion: 'Tienda',           color: '#26a69a' },
  'presentaciones': { icon: 'bi-box2',           label: 'Presentaciones', seccion: 'Tienda',           color: '#00897b' }, // ← NUEVO
  'productos':      { icon: 'bi-box-seam',       label: 'Productos',      seccion: 'Tienda',           color: '#ff7043' },
  'perfiles':       { icon: 'bi-shield-check',   label: 'Perfiles',       seccion: 'Administración',   color: '#e94560' },
  'usuarios':       { icon: 'bi-people',         label: 'Usuarios',       seccion: 'Administración',   color: '#0f3460' },
};

// Helper: normaliza la ruta para comparaciones
const normRuta = r => r?.toLowerCase().replace(/^\//, '').trim() ?? '';

// Topbar y Sidebar toggle
document.getElementById('topbarUser').textContent = USUARIO.nombre || 'Usuario';

document.getElementById('toggleSidebar').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('collapsed');
});

document.getElementById('btnLogout').addEventListener('click', () => {
  localStorage.clear();
  window.location.replace('/');
});

// API HELPER (fetch con JWT)
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Error');
  return data;
}

// HELPERS
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function formatFechaCorta(f) {
  if (!f) return '—';
  const fechaLimpia = typeof f === 'string' ? f.split('T')[0] : f;
  const d = new Date(fechaLimpia + 'T12:00:00');
  if (isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function filtrarTabla(mod) {
  const q = document.getElementById(`search${cap(mod)}`).value.toLowerCase();
  document.querySelectorAll(`#tbody${cap(mod)} tr`).forEach(tr => {
    tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

// ── MODALES 
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function showAlert(id, msg, type = 'error') {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = `alert-msg ${type}`;
}

function openModal(tipo) {
  if (tipo === 'cliente')       { resetClienteForm();      document.getElementById('modalCliente').classList.add('open'); }
  if (tipo === 'membresia')     { resetMembresiaForm();    document.getElementById('modalMembresia').classList.add('open'); cargarPlanesSelect(); cargarAsesoresSelect(); }
  if (tipo === 'plan')          { resetPlanForm();         document.getElementById('modalPlan').classList.add('open'); }
  if (tipo === 'perfil')        { resetForm('perfil');     document.getElementById('modalPerfil').classList.add('open'); }
  if (tipo === 'usuario')       { resetForm('usuario');    document.getElementById('modalUsuario').classList.add('open'); cargarPerfilesSelect(); }
  if (tipo === 'categoria')     { resetCategoriaForm();    document.getElementById('modalCategoria').classList.add('open'); }
  if (tipo === 'producto')      { resetProductoForm();     cargarCategoriasSelect(); document.getElementById('modalProducto').classList.add('open'); }
  if (tipo === 'presentacion')  { resetPresentacionForm(); document.getElementById('modalPresentacion').classList.add('open'); } // ← NUEVO
}

// Cerrar modales al hacer click fuera
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
});

// ── CONFIRM / DELETE 
function confirmDelete(tipo, id, nombre) {
  document.getElementById('confirmMsg').textContent = `¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`;
  document.getElementById('confirmBtn').onclick = () => doDelete(tipo, id);
  document.getElementById('modalConfirm').classList.add('open');
}

async function doDelete(tipo, id) {
  try {
    const paths = {
      perfil:        'perfiles',
      usuario:       'usuarios',
      cliente:       'clientes',
      plan:          'planes',
      categoria:     'categorias',
      producto:      'productos',
      presentacion:  'presentaciones',   // ← NUEVO
    };
    await api('DELETE', `/api/${paths[tipo]}/${id}`);
    closeModal('modalConfirm');
    if (tipo === 'perfil')        loadPerfiles();
    if (tipo === 'usuario')       loadUsuarios();
    if (tipo === 'cliente')       loadClientes();
    if (tipo === 'plan')          loadPlanes();
    if (tipo === 'categoria')     loadCategorias();
    if (tipo === 'producto')      loadProductos();
    if (tipo === 'presentacion')  loadPresentaciones();  // ← NUEVO
  } catch (e) { alert(e.message); }
}

// ── SIDEBAR 
function buildSidebar() {
  const navMenu = document.getElementById('navMenu');
  navMenu.innerHTML = '';
  const homeItem = buildNavItem('home', 'bi-speedometer2', 'Dashboard');
  navMenu.appendChild(buildSection('Principal'));
  navMenu.appendChild(homeItem);

  const secciones = {};
  MIS_OPCIONES.forEach(op => {
    const ruta = normRuta(op.ruta);
    const cfg  = MODULOS_CONFIG[ruta];
    if (!cfg || ruta === 'home') return;
    if (!secciones[cfg.seccion]) secciones[cfg.seccion] = [];
    secciones[cfg.seccion].push({ ...op, _ruta: ruta });
  });

  Object.entries(secciones).forEach(([sec, ops]) => {
    navMenu.appendChild(buildSection(sec));
    ops.forEach(op => {
      const cfg = MODULOS_CONFIG[op._ruta] || {};
      navMenu.appendChild(buildNavItem(op._ruta, cfg.icon || 'bi-circle', op.nombre));
    });
  });

  homeItem.classList.add('active');
}

function buildNavItem(view, icon, label) {
  const a = document.createElement('a');
  a.className = 'nav-item';
  a.dataset.view = view;
  a.innerHTML = `<i class="bi ${icon}"></i><span>${label}</span>`;
  a.addEventListener('click', () => goTo(view));
  return a;
}

function buildSection(title) {
  const div = document.createElement('div');
  div.className = 'nav-section';
  div.textContent = title;
  return div;
}

// HOME CARDS
function buildHomeCards() {
  const c = document.getElementById('homeCards');
  c.innerHTML = '';
  const cards = [
    { ruta: 'clientes',       color: '#2e7d32', icon: 'bi-person-badge',   label: 'Clientes',       countId: 'countClientes'       },
    { ruta: 'membresias',     color: '#0f3460', icon: 'bi-card-checklist', label: 'Membresías',     countId: 'countMembresias'     },
    { ruta: 'planes',         color: '#7c4dff', icon: 'bi-grid-3x3-gap',   label: 'Planes',         countId: 'countPlanes'         },
    { ruta: 'categorias',     color: '#26a69a', icon: 'bi-tag',            label: 'Categorías',     countId: 'countCategorias'     },
    { ruta: 'presentaciones', color: '#00897b', icon: 'bi-box2',           label: 'Presentaciones', countId: 'countPresentaciones' }, // ← NUEVO
    { ruta: 'productos',      color: '#ff7043', icon: 'bi-box-seam',       label: 'Productos',      countId: 'countProductos'      },
    { ruta: 'perfiles',       color: '#e94560', icon: 'bi-shield-check',   label: 'Perfiles',       countId: 'countPerfiles'       },
    { ruta: 'usuarios',       color: '#0f3460', icon: 'bi-people',         label: 'Usuarios',       countId: 'countUsuarios'       },
  ];
  cards.forEach(d => {
    if (!MIS_OPCIONES.some(o => normRuta(o.ruta) === d.ruta)) return;
    const col = document.createElement('div');
    col.className = 'col-md-4 col-lg-3';
    col.innerHTML = `<div class="stat-card" onclick="goTo('${d.ruta}')">
      <div class="stat-icon" style="background:${d.color}"><i class="bi ${d.icon}"></i></div>
      <div><div class="stat-value" id="${d.countId}">—</div><div class="stat-label">${d.label}</div></div>
    </div>`;
    c.appendChild(col);
  });
}

// NAVEGACIÓN
function goTo(view) {
  if (view !== 'home' && !MIS_OPCIONES.some(o => normRuta(o.ruta) === view)) {
    alert('Sin permisos');
    return;
  }
  document.querySelectorAll('.nav-item[data-view]').forEach(e => e.classList.remove('active'));
  document.querySelector(`[data-view="${view}"]`)?.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`)?.classList.add('active');

  if (view === 'clientes')       loadClientes();
  if (view === 'membresias')     loadMembresias();
  if (view === 'planes')         loadPlanes();
  if (view === 'perfiles')       loadPerfiles();
  if (view === 'usuarios')       loadUsuarios();
  if (view === 'categorias')     loadCategorias();
  if (view === 'presentaciones') loadPresentaciones();  // ← NUEVO
  if (view === 'productos')      loadProductos();
}

// CARGA INICIAL
(async () => {
  try {
    MIS_OPCIONES = await api('GET', '/api/permisos/mis-opciones');
    localStorage.setItem('opciones', JSON.stringify(MIS_OPCIONES));
  } catch (e) {
    console.warn('No se pudieron cargar las opciones del usuario:', e.message);
  }

  buildSidebar();
  buildHomeCards();

  const accesos = {
    clientes:       async () => { dataClientes      = await api('GET', '/api/clientes');            const el = document.getElementById('countClientes');       if (el) el.textContent = dataClientes.length; },
    planes:         async () => { dataPlanes        = await api('GET', '/api/planes');              const el = document.getElementById('countPlanes');         if (el) el.textContent = dataPlanes.filter(p => p.activo).length; },
    membresias:     async () => { const s           = await api('GET', '/api/membresias/stats');    const el = document.getElementById('countMembresias');     if (el) el.textContent = s.activas; },
    perfiles:       async () => { dataPerfiles      = await api('GET', '/api/perfiles');            const el = document.getElementById('countPerfiles');       if (el) el.textContent = dataPerfiles.length; },
    usuarios:       async () => { dataUsuarios      = await api('GET', '/api/usuarios');            const el = document.getElementById('countUsuarios');       if (el) el.textContent = dataUsuarios.length; },
    categorias:     async () => { dataCategorias    = await api('GET', '/api/categorias');          const el = document.getElementById('countCategorias');     if (el) el.textContent = dataCategorias.filter(c => c.estado === 1).length; },
    presentaciones: async () => { dataPresentaciones= await api('GET', '/api/presentaciones');     const el = document.getElementById('countPresentaciones'); if (el) el.textContent = dataPresentaciones.filter(p => p.estado === 1).length; }, // ← NUEVO
    productos:      async () => { const s           = await api('GET', '/api/productos/stats');    const el = document.getElementById('countProductos');      if (el) el.textContent = s.activos; },
  };

  for (const [ruta, fn] of Object.entries(accesos)) {
    if (MIS_OPCIONES.some(o => normRuta(o.ruta) === ruta)) {
      try { await fn(); } catch (e) { console.warn(`Error cargando ${ruta}:`, e.message); }
    }
  }

  // Poblar filtro planes en membresías
  if (dataPlanes.length) {
    const sel = document.getElementById('filtroMembPlan');
    dataPlanes.forEach(p => sel.innerHTML += `<option value="${p.id_plan}">${p.nombre}</option>`);
  }
})();
