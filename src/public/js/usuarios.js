//  CARGAR USUARIOS (AJAX) 
async function loadUsuarios() {
  document.getElementById('tbodyUsuarios').innerHTML =
    '<tr class="loading-row"><td colspan="7">Cargando...</td></tr>';
  try {
    dataUsuarios = await api('GET', '/api/usuarios');
    renderUsuarios(dataUsuarios);
    const el = document.getElementById('countUsuarios');
    if (el) el.textContent = dataUsuarios.length;
  } catch (e) {
    document.getElementById('tbodyUsuarios').innerHTML =
      '<tr class="empty-row"><td colspan="7">Error al cargar</td></tr>';
  }
}

//  RENDER TABLA 
function renderUsuarios(data) {
  const tbody = document.getElementById('tbodyUsuarios');
  if (!data.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Sin usuarios</td></tr>';
    return;
  }
  const miId = JSON.parse(atob(TOKEN.split('.')[1])).id;
  const miPerfil = (USUARIO.perfil || '').toLowerCase();
  const yoSoyAdmin = miPerfil === 'administrador';

  tbody.innerHTML = data.map(u => {
    const tPerfil = (u.perfil || '').toLowerCase();
    const mismos = tPerfil === miPerfil;
    const esAdmin = tPerfil === 'administrador';
    const esSelf = u.id_usuario === miId;
    const bloqDel = esSelf || mismos || esAdmin;
    const bloqEdit = (!yoSoyAdmin && esAdmin) || (mismos && !esSelf);

    return `<tr>
      <td>${u.id_usuario}</td>
      <td><strong>${u.nombre} ${u.apellido}</strong></td>
      <td><code>${u.username}</code></td>
      <td>${u.email}</td>
      <td><span class="badge-perfil">${u.perfil}</span></td>
      <td><span class="badge-estado ${u.estado === 1 ? 'badge-activo' : 'badge-inactivo'}">${u.estado === 1 ? 'Activo' : 'Inactivo'}</span></td>
      <td style="display:flex;gap:6px">
        ${bloqEdit
        ? `<button class="btn-icon" disabled style="opacity:.35"><i class="bi bi-pencil"></i></button>`
        : `<button class="btn-icon" onclick="editUsuario(${u.id_usuario})"><i class="bi bi-pencil"></i></button>`}
        ${bloqDel
        ? `<button class="btn-icon danger" disabled style="opacity:.35"><i class="bi bi-lock"></i></button>`
        : `<button class="btn-icon danger" onclick="confirmDelete('usuario',${u.id_usuario},'${u.nombre}')"><i class="bi bi-trash"></i></button>`}
      </td>
    </tr>`;
  }).join('');
}

//  CARGAR PERFILES EN SELECT (para modal usuario) 
async function cargarPerfilesSelect() {
  const sel = document.getElementById('usuarioPerfil');
  sel.innerHTML = '<option value="">Seleccionar perfil...</option>';
  try {
    const lista = dataPerfiles.length ? dataPerfiles : await api('GET', '/api/perfiles');
    const yoSoyAdmin = (USUARIO.perfil || '').toLowerCase() === 'administrador';

    lista
      .filter(p => p.estado === 1)
      // Si el ejecutor NO es Administrador, se oculta el perfil Administrador del select
      .filter(p => yoSoyAdmin || p.nombre.toLowerCase() !== 'administrador')
      .forEach(p => {
        sel.innerHTML += `<option value="${p.id_perfil}">${p.nombre}</option>`;
      });
  } catch (e) { }
}

//  RESET FORMULARIO 
function resetForm_usuario() {
  ['usuarioId', 'usuarioNombre', 'usuarioApellido', 'usuarioUsername',
    'usuarioEmail', 'usuarioPassword', 'usuarioAlias'].forEach(id =>
      document.getElementById(id).value = '');
  document.getElementById('usuarioEstadoGroup').style.display = 'none';
  document.getElementById('passLabel').textContent = '(requerida)';
  document.getElementById('modalUsuarioTitle').textContent = 'Nuevo Usuario';
  document.getElementById('alertUsuario').className = 'alert-msg';
  document.getElementById('passGroup').style.display = 'block';
  document.getElementById('usuarioPerfil').disabled = false;
}

//  EDITAR 
function editUsuario(id) {
  const u = dataUsuarios.find(x => x.id_usuario === id);
  if (!u) return;
  const esAdmin = u.perfil?.toLowerCase() === 'administrador';

  document.getElementById('usuarioId').value = id;
  document.getElementById('usuarioNombre').value = u.nombre;
  document.getElementById('usuarioApellido').value = u.apellido;
  document.getElementById('usuarioUsername').value = u.username;
  document.getElementById('usuarioEmail').value = u.email;
  document.getElementById('usuarioPassword').value = '';
  document.getElementById('usuarioAlias').value = u.alias_asesor || '';
  document.getElementById('passLabel').textContent = '(dejar vacío para no cambiar)';
  document.getElementById('modalUsuarioTitle').textContent = 'Editar Usuario';
  document.getElementById('alertUsuario').className = 'alert-msg';

  if (esAdmin) {
    document.getElementById('usuarioEstadoGroup').style.display = 'none';
    document.getElementById('usuarioPerfil').disabled = true;
  } else {
    document.getElementById('usuarioEstado').value = u.estado;
    document.getElementById('usuarioEstadoGroup').style.display = 'block';
    document.getElementById('usuarioPerfil').disabled = false;
  }

  cargarPerfilesSelect().then(() => {
    document.getElementById('usuarioPerfil').value = u.id_perfil || '';
  });

  document.getElementById('modalUsuario').classList.add('open');
}

//  GUARDAR (AJAX POST / PUT) 
async function saveUsuario() {
  const id = document.getElementById('usuarioId').value;
  const nombre = document.getElementById('usuarioNombre').value.trim();
  const apellido = document.getElementById('usuarioApellido').value.trim();
  const username = document.getElementById('usuarioUsername').value.trim();
  const email = document.getElementById('usuarioEmail').value.trim();
  const password = document.getElementById('usuarioPassword').value;
  const id_perfil = document.getElementById('usuarioPerfil').value;
  const alias = document.getElementById('usuarioAlias').value.trim();
  const estado = document.getElementById('usuarioEstado').value;

  if (!nombre || !apellido || !username || !email || !id_perfil) {
    showAlert('alertUsuario', 'Completa todos los campos requeridos');
    return;
  }
  if (!id && !password) {
    showAlert('alertUsuario', 'La contraseña es requerida');
    return;
  }

  // Validación frontend: no-admin no puede asignar perfil Administrador
  const yoSoyAdmin = (USUARIO.perfil || '').toLowerCase() === 'administrador';
  if (!yoSoyAdmin) {
    const perfilSeleccionado = dataPerfiles.find(p => p.id_perfil === Number(id_perfil));
    if (perfilSeleccionado && perfilSeleccionado.nombre.toLowerCase() === 'administrador') {
      showAlert('alertUsuario', 'No tienes permisos para asignar el perfil Administrador');
      return;
    }
  }

  try {
    const body = {
      nombre, apellido, username, email,
      id_perfil: Number(id_perfil),
      alias_asesor: alias || null,
      estado: Number(estado)
    };
    if (password) body.password = password;

    if (id) await api('PUT', `/api/usuarios/${id}`, body);
    else await api('POST', '/api/usuarios', body);

    closeModal('modalUsuario');
    loadUsuarios();
  } catch (e) { showAlert('alertUsuario', e.message); }
}