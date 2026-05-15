
let _filtroClienteActual = 'todos';

// CARGAR CLIENTES (AJAX) 
async function loadClientes() {
  document.getElementById('tbodyClientes').innerHTML =
    '<tr class="loading-row"><td colspan="10">Cargando...</td></tr>';
  try {
    dataClientes = await api('GET', '/api/clientes');
    const stats = await api('GET', '/api/clientes/stats');

    document.getElementById('cl-activos').textContent = stats.activos;
    document.getElementById('cl-inactivos').textContent = stats.inactivos;
    document.getElementById('cl-mes').textContent = stats.este_mes;

    const el = document.getElementById('countClientes');
    if (el) el.textContent = dataClientes.length;

    filtroCliente(
      _filtroClienteActual,
      document.querySelector(`.chip[data-f="${_filtroClienteActual}"]`)
    );
  } catch (e) {
    document.getElementById('tbodyClientes').innerHTML =
      `<tr class="empty-row"><td colspan="10">${e.message}</td></tr>`;
  }
}

// FILTROS 
function filtroCliente(f, el) {
  _filtroClienteActual = f;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');

  let data = dataClientes;
  if (f === 'activos') data = data.filter(c => c.activo);
  if (f === 'inactivos') data = data.filter(c => !c.activo);
  if (f === 'saldo') data = data.filter(c => c.memb_saldo > 0);

  clientesFiltrados = data;
  renderClientes(data);
}

// RENDER TABLA 
function renderClientes(data) {
  const tbody = document.getElementById('tbodyClientes');
  if (!data.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="10">Sin clientes</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(c => {
    const planTag = c.plan_nombre
      ? `<span class="tag-plan">${c.plan_nombre}</span>`
      : '<span style="color:#bbb;font-size:12px">—</span>';

    const vence = c.memb_fecha_fin ? formatFechaCorta(c.memb_fecha_fin) : '—';

    let estadoBadge = '<span style="color:#bbb;font-size:12px">Sin memb.</span>';
    if (c.memb_estado) {
      if (c.memb_saldo > 0) {
        estadoBadge = '<span class="tag-estado-pendiente">Saldo pend.</span>';
      } else if (c.memb_estado === 'activa') {
        estadoBadge = '<span class="tag-estado-activa">Activa</span>';
      } else if (c.memb_estado === 'vencida') {
        estadoBadge = '<span class="tag-estado-vencida">Vencida</span>';
      } else {
        estadoBadge = `<span class="tag-estado-anulada">${c.memb_estado}</span>`;
      }
    }

    const tipoTag = c.memb_tipo
      ? `<span class="badge-estado ${c.memb_tipo === 'nuevo' ? 'tag-tipo-nuevo' :
        c.memb_tipo === 'renovacion' ? 'tag-tipo-renov' : 'tag-tipo-inter'}">
          ${c.memb_tipo === 'nuevo' ? 'Nuevo' : c.memb_tipo === 'renovacion' ? 'Renov.' : 'Interdiario'}
         </span>`
      : '—';

    const asesor = c.asesor || '—';

    return `<tr>
      <td><strong>${c.nombre} ${c.apellido}</strong></td>
      <td><code>${c.dni}</code></td>
      <td>${c.telefono || '—'}</td>
      <td style="font-size:12px;color:#666">${formatFechaCorta(c.fecha_registro)}</td>
      <td>${planTag}</td>
      <td style="font-size:12px">${vence}</td>
      <td>${estadoBadge}</td>
      <td>${tipoTag}</td>
      <td><span class="asesor-tag">${asesor}</span></td>
      <td>
        <button class="btn-icon me-1" title="Editar" onclick="editCliente(${c.id_cliente})">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="btn-icon danger" title="Eliminar"
          onclick="confirmDelete('cliente',${c.id_cliente},'${c.nombre} ${c.apellido}')">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>`;
  }).join('');
}

// RESET FORMULARIO
function resetClienteForm() {
  ['clienteId', 'clienteNombre', 'clienteApellido', 'clienteDni',
    'clienteTelefono', 'clienteFechaNac'].forEach(id =>
      document.getElementById(id).value = '');
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('clienteFechaReg').value = hoy;
  document.getElementById('clienteDni').readOnly = false;
  document.getElementById('clienteMayorEdad').value = 'si';
  document.getElementById('modalClienteTitle').textContent = 'Registrar nuevo cliente';
  document.getElementById('alertCliente').className = 'alert-msg';
}

// EDITAR 
function editCliente(id) {
  const c = dataClientes.find(x => x.id_cliente === id);
  if (!c) return;
  document.getElementById('clienteId').value = id;
  document.getElementById('clienteNombre').value = c.nombre;
  document.getElementById('clienteApellido').value = c.apellido;
  document.getElementById('clienteDni').value = c.dni;
  document.getElementById('clienteDni').readOnly = true;
  document.getElementById('clienteTelefono').value = c.telefono || '';
  document.getElementById('clienteFechaNac').value = c.fecha_nacimiento
    ? c.fecha_nacimiento.split('T')[0] : '';
  document.getElementById('modalClienteTitle').textContent = 'Editar Cliente';
  document.getElementById('alertCliente').className = 'alert-msg';
  document.getElementById('modalCliente').classList.add('open');
}

// GUARDAR (AJAX POST / PUT) 
async function saveCliente() {
  const id = document.getElementById('clienteId').value;
  const dni = document.getElementById('clienteDni').value.trim();
  const nombre = document.getElementById('clienteNombre').value.trim();
  const apellido = document.getElementById('clienteApellido').value.trim();
  const tel = document.getElementById('clienteTelefono').value.trim();
  const fnac = document.getElementById('clienteFechaNac').value;

  if (!nombre || !apellido || (!id && !dni)) {
    showAlert('alertCliente', 'Nombre, apellido y DNI son requeridos');
    return;
  }
  try {
    if (id) await api('PUT', `/api/clientes/${id}`,
      { nombre, apellido, telefono: tel || null, fecha_nacimiento: fnac || null });
    else await api('POST', '/api/clientes',
      { dni, nombre, apellido, telefono: tel || null, fecha_nacimiento: fnac || null });

    closeModal('modalCliente');
    loadClientes();
  } catch (e) { showAlert('alertCliente', e.message); }
}
