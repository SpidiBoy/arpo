// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO: MEMBRESÍAS  (con soporte de cuotas/fraccionamiento)
// ══════════════════════════════════════════════════════════════════════════════

// ─── CARGAR ───────────────────────────────────────────────────────────────────
async function loadMembresias() {
    document.getElementById('listadoMembresias').innerHTML =
        '<div style="text-align:center;padding:40px;color:#aaa">Cargando...</div>';

    const estado = document.getElementById('filtroMembEstado').value;
    const idPlan = document.getElementById('filtroMembPlan').value;

    try {
        let url = '/api/membresias?';
        if (estado !== 'todos') url += `estado=${estado}&`;
        if (idPlan !== 'todos') url += `id_plan=${idPlan}&`;

        dataMembresias = await api('GET', url);
        const el = document.getElementById('countMembresias');
        if (el) el.textContent = dataMembresias.length;

        filtrarMembresias();
    } catch (e) {
        document.getElementById('listadoMembresias').innerHTML =
            `<div style="text-align:center;padding:40px;color:#c62828">${e.message}</div>`;
    }
}

function filtrarMembresias() {
    const q = document.getElementById('searchMembresias').value.toLowerCase();
    const data = q
        ? dataMembresias.filter(m =>
            `${m.nombre_cliente} ${m.dni}`.toLowerCase().includes(q))
        : dataMembresias;
    renderMembresias(data);
}

// ─── RENDER CARDS ─────────────────────────────────────────────────────────────
function renderMembresias(data) {
    const cont = document.getElementById('listadoMembresias');
    if (!data.length) {
        cont.innerHTML = `
        <div style="text-align:center;padding:40px;color:#bbb">
            <i class="bi bi-card-checklist" style="font-size:40px;display:block;margin-bottom:10px"></i>
            Sin membresías con ese filtro
        </div>`;
        return;
    }

    cont.innerHTML = data.map(m => {
        const iniciales = (m.nombre_cliente || '?').split(' ').map(w => w[0]).slice(0, 2).join('');
        const tipoLabel = m.tipo_ingreso === 'nuevo' ? 'Nuevo' : 'Renov.';
        const tipoColor = m.tipo_ingreso === 'nuevo' ? '#2e7d32' : '#e65100';
        const totalC   = parseInt(m.total_cuotas) || 0;
        const pagadasC = parseInt(m.cuotas_pagadas) || 0;
        const pendC    = parseInt(m.cuotas_pendientes) || 0;
        const vencC    = parseInt(m.cuotas_vencidas) || 0;

        // Barra de progreso de cuotas
        const progresoPct = totalC > 0 ? Math.round((pagadasC / totalC) * 100) : 100;
        const progresoHtml = totalC > 1 ? `
        <div style="margin-top:8px">
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#888;margin-bottom:3px">
                <span>${pagadasC}/${totalC} cuotas pagadas</span>
                ${vencC > 0 ? `<span style="color:#c62828;font-weight:700">⚠ ${vencC} vencida(s)</span>` : ''}
                ${pendC > 0 && vencC === 0 ? `<span style="color:#e65100">${pendC} pendiente(s)</span>` : ''}
            </div>
            <div style="height:5px;background:#f0f0f0;border-radius:3px;overflow:hidden">
                <div style="height:100%;background:${vencC > 0 ? '#c62828' : '#26a69a'};width:${progresoPct}%;border-radius:3px;transition:width .3s"></div>
            </div>
        </div>` : '';

        // Saldo badge
        const saldoHtml = m.saldo_pendiente > 0
            ? `<div class="memb-saldo">Saldo: S/ ${parseFloat(m.saldo_pendiente).toFixed(2)}</div>` : '';

        return `
        <div class="memb-card ${m.estado}" data-search="${m.nombre_cliente} ${m.dni}">
            <div class="memb-avatar">${iniciales}</div>
            <div class="memb-info" style="flex:1;min-width:0">
                <div class="memb-nombre">${m.nombre_cliente}</div>
                <div class="memb-plan"><span class="tag-plan">${m.nombre_plan}</span></div>
                <div class="memb-fechas">
                    <i class="bi bi-calendar3 me-1"></i>${formatFechaCorta(m.fecha_inicio)} → ${formatFechaCorta(m.fecha_fin)}
                    &nbsp;·&nbsp;
                    <span style="color:${tipoColor};font-weight:700;font-size:11px">${tipoLabel}</span>
                    &nbsp;·&nbsp;
                    <span class="asesor-tag">${m.asesor}</span>
                </div>
                ${progresoHtml}
            </div>
            <div class="memb-monto">
                <div class="memb-precio">S/ ${parseFloat(m.monto_total).toFixed(2)}</div>
                ${saldoHtml}
                <div style="margin-top:4px">${estadoBadgeMini(m.estado, m.saldo_pendiente, vencC)}</div>
            </div>
            <div class="memb-actions">
                ${m.saldo_pendiente > 0 || pendC > 0 || vencC > 0 ? `
                <button class="btn-icon perm" title="Ver cuotas y registrar pago"
                    style="background:#e8f5e9;color:#2e7d32"
                    onclick="openModalCuotas(${m.id_membresia},'${(m.nombre_cliente || '').replace(/'/g,"\\'")}')">
                    <i class="bi bi-cash-stack"></i>
                </button>` : `
                <button class="btn-icon" title="Ver cuotas"
                    onclick="openModalCuotas(${m.id_membresia},'${(m.nombre_cliente || '').replace(/'/g,"\\'")}')">
                    <i class="bi bi-list-check"></i>
                </button>`}
                <button class="btn-icon perm" title="Actualizar estado"
                    onclick="openMembEstado(${m.id_membresia},'${m.estado}',${m.saldo_pendiente},'${(m.observaciones || '').replace(/'/g,"\\'")}')">
                    <i class="bi bi-pencil-square"></i>
                </button>
            </div>
        </div>`;
    }).join('');
}

function estadoBadgeMini(estado, saldo, vencidas = 0) {
    if (vencidas > 0)    return '<span class="tag-estado-vencida">Cuota vencida</span>';
    if (saldo > 0)       return '<span class="tag-estado-pendiente">Saldo pend.</span>';
    if (estado === 'activa')   return '<span class="tag-estado-activa">Activa</span>';
    if (estado === 'vencida')  return '<span class="tag-estado-vencida">Vencida</span>';
    return `<span class="tag-estado-anulada">${estado}</span>`;
}

// ─── MODAL CUOTAS ─────────────────────────────────────────────────────────────
let _membresiaActivaCuotas = null;

async function openModalCuotas(idMembresia, nombreCliente) {
    _membresiaActivaCuotas = idMembresia;

    // Inyectar modal si no existe
    if (!document.getElementById('modalCuotas')) {
        document.body.insertAdjacentHTML('beforeend', buildModalCuotasHTML());
    }

    document.getElementById('modalCuotasTitulo').textContent = `Cuotas — ${nombreCliente}`;
    document.getElementById('cuotasBody').innerHTML =
        '<div style="text-align:center;padding:30px;color:#aaa">Cargando...</div>';
    document.getElementById('modalCuotas').classList.add('open');

    await refreshCuotas(idMembresia);
}

async function refreshCuotas(idMembresia) {
    try {
        const cuotas = await api('GET', `/api/membresias/${idMembresia}/cuotas`);
        renderCuotasModal(cuotas);
    } catch (e) {
        document.getElementById('cuotasBody').innerHTML =
            `<div style="color:#c62828;padding:16px">${e.message}</div>`;
    }
}

function buildModalCuotasHTML() {
    return `
    <div class="modal-overlay" id="modalCuotas">
        <div class="modal-box" style="width:580px;max-height:88vh;overflow-y:auto">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                <div class="modal-title" id="modalCuotasTitulo" style="margin-bottom:0">Cuotas</div>
                <button onclick="document.getElementById('modalCuotas').classList.remove('open')"
                    style="background:none;border:none;font-size:20px;cursor:pointer;color:#888">✕</button>
            </div>
            <div id="cuotasBody"></div>
        </div>
    </div>`;
}

function renderCuotasModal(cuotas) {
    const cont = document.getElementById('cuotasBody');
    if (!cuotas.length) {
        cont.innerHTML = '<div style="text-align:center;color:#bbb;padding:20px">Sin cuotas registradas</div>';
        return;
    }

    const hoy = new Date().toISOString().split('T')[0];

    const rows = cuotas.map(c => {
        const esPendiente = c.estado_cuota === 'pendiente';
        const esVencido   = c.estado_cuota === 'vencido';
        const esPagado    = c.estado_cuota === 'pagado';

        const estadoHtml = esPagado
            ? '<span style="background:#e8f5e9;color:#2e7d32;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">PAGADO</span>'
            : esVencido
            ? '<span style="background:#ffebee;color:#c62828;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">VENCIDO</span>'
            : '<span style="background:#fff3e0;color:#e65100;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">PENDIENTE</span>';

        const fechaInfo = esPagado
            ? `<span style="color:#2e7d32;font-size:11px">Pagado: ${formatFechaLarga(c.fecha_pago)}</span>`
            : c.fecha_limite
            ? `<span style="color:${esVencido ? '#c62828' : '#888'};font-size:11px">
                Vence: ${formatFechaLarga(c.fecha_limite)}
                ${esVencido ? ' <b>(mora)</b>' : ''}
               </span>`
            : '';

        const btnPagar = (esPendiente || esVencido)
            ? `<button class="btn-save" style="padding:5px 12px;font-size:12px"
                onclick="abrirFormPagoCuota(${c.id_pago}, ${c.monto})">
                <i class="bi bi-cash me-1"></i>Pagar
               </button>`
            : `<span style="color:#bbb;font-size:12px">—</span>`;

        const metodoBadge = c.metodo_pago
            ? `<span style="background:#f0f4ff;color:#3949ab;padding:2px 7px;border-radius:10px;font-size:11px">${c.metodo_pago}</span>`
            : '';

        return `
        <tr style="border-bottom:1px solid #f0f0f0">
            <td style="padding:10px 8px;text-align:center;font-weight:700;color:#0f3460">C${c.num_cuota}</td>
            <td style="padding:10px 8px">
                <div style="font-weight:700">S/ ${parseFloat(c.monto).toFixed(2)}</div>
                ${metodoBadge}
            </td>
            <td style="padding:10px 8px">${estadoHtml}</td>
            <td style="padding:10px 8px">${fechaInfo}</td>
            <td style="padding:10px 8px;text-align:right">${btnPagar}</td>
        </tr>`;
    }).join('');

    // Totales
    const totalPagado  = cuotas.filter(c => c.estado_cuota === 'pagado').reduce((s, c) => s + parseFloat(c.monto), 0);
    const totalPendiente = cuotas.filter(c => c.estado_cuota !== 'pagado').reduce((s, c) => s + parseFloat(c.monto), 0);

    cont.innerHTML = `
    <table style="width:100%;border-collapse:collapse">
        <thead>
            <tr style="background:#f8f9fa;font-size:12px;color:#666">
                <th style="padding:8px;text-align:center">#</th>
                <th style="padding:8px">Monto</th>
                <th style="padding:8px">Estado</th>
                <th style="padding:8px">Fecha</th>
                <th style="padding:8px;text-align:right">Acción</th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>
    <div style="display:flex;justify-content:space-between;margin-top:14px;padding:10px 12px;background:#f8f9fa;border-radius:8px;font-size:13px">
        <span>✅ Pagado: <b style="color:#2e7d32">S/ ${totalPagado.toFixed(2)}</b></span>
        ${totalPendiente > 0
            ? `<span>⏳ Pendiente: <b style="color:#c62828">S/ ${totalPendiente.toFixed(2)}</b></span>`
            : '<span style="color:#2e7d32;font-weight:700">✓ Sin saldo pendiente</span>'}
    </div>
    <div id="formPagoCuota" style="display:none;margin-top:16px;padding:16px;border:1.5px solid #e0e7ff;border-radius:10px;background:#f8f9fa"></div>`;
}

// ─── FORMULARIO INLINE PARA PAGAR CUOTA ───────────────────────────────────────
function abrirFormPagoCuota(idPago, monto) {
    const form = document.getElementById('formPagoCuota');
    form.style.display = 'block';
    form.innerHTML = `
    <div style="font-weight:700;margin-bottom:12px;color:#0f3460">
        <i class="bi bi-cash-stack me-2" style="color:#26a69a"></i>Registrar pago — Cuota
    </div>
    <div class="alert-msg" id="alertPagoCuota"></div>
    <div class="row g-2">
        <div class="col-6">
            <div class="form-label">Monto (S/) *</div>
            <input class="form-control" id="pcMonto" type="number" step="0.01"
                value="${parseFloat(monto).toFixed(2)}" placeholder="0.00">
        </div>
        <div class="col-6">
            <div class="form-label">Método de pago *</div>
            <select class="form-control" id="pcMetodo">
                <option value="efectivo">Efectivo</option>
                <option value="yape">Yape</option>
                <option value="plin">Plin</option>
                <option value="transferencia">Transferencia</option>
            </select>
        </div>
    </div>
    <div class="mt-2">
        <div class="form-label">N° Comprobante (opcional)</div>
        <input class="form-control" id="pcComprobante" placeholder="Ej: REC-001">
    </div>
    <div class="modal-footer" style="margin-top:12px;padding-top:12px;border-top:1px solid #eee">
        <button class="btn-cancel" onclick="document.getElementById('formPagoCuota').style.display='none'">
            Cancelar
        </button>
        <button class="btn-save" onclick="confirmarPagoCuota(${idPago})">
            <i class="bi bi-check2 me-1"></i>Confirmar pago
        </button>
    </div>`;

    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function confirmarPagoCuota(idPago) {
    const monto       = document.getElementById('pcMonto').value;
    const metodo      = document.getElementById('pcMetodo').value;
    const comprobante = document.getElementById('pcComprobante').value.trim();

    if (!monto || parseFloat(monto) <= 0) {
        showAlert('alertPagoCuota', 'Ingresa un monto válido');
        return;
    }

    try {
        const result = await api('POST', `/api/membresias/${_membresiaActivaCuotas}/pagar-cuota`, {
            id_pago:         idPago,
            metodo_pago:     metodo,
            num_comprobante: comprobante || null,
            monto_pagado:    parseFloat(monto)
        });

        document.getElementById('formPagoCuota').style.display = 'none';
        renderCuotasModal(result.cuotas);

        // Actualizar el listado de membresías en segundo plano
        loadMembresias();
        loadClientes();

    } catch (e) {
        showAlert('alertPagoCuota', e.message);
    }
}

// ─── MODAL ESTADO MEMBRESÍA ───────────────────────────────────────────────────
function openMembEstado(id, estado, saldo, obs) {
    document.getElementById('membEstadoId').value  = id;
    document.getElementById('membEstadoVal').value = estado;
    document.getElementById('membSaldoUpdate').value = parseFloat(saldo).toFixed(2);
    document.getElementById('membObsUpdate').value   = obs;
    document.getElementById('membSaldoUpdateGroup').style.display = saldo > 0 ? 'block' : 'none';
    document.getElementById('alertMembEstado').className = 'alert-msg';
    document.getElementById('modalMembEstado').classList.add('open');
}

async function saveMembEstado() {
    const id     = document.getElementById('membEstadoId').value;
    const estado = document.getElementById('membEstadoVal').value;
    const saldo  = document.getElementById('membSaldoUpdate').value;
    const obs    = document.getElementById('membObsUpdate').value;
    try {
        await api('PUT', `/api/membresias/${id}`,
            { estado, observaciones: obs || null, saldo_pendiente: parseFloat(saldo) || 0 });
        closeModal('modalMembEstado');
        loadMembresias();
    } catch (e) { showAlert('alertMembEstado', e.message); }
}

// ─── RESET FORMULARIO NUEVA MEMBRESÍA ─────────────────────────────────────────
function resetMembresiaForm() {
    ['membresiaId', 'membClienteBuscar', 'membObservaciones'].forEach(id =>
        document.getElementById(id).value = '');
    document.getElementById('membClienteId').value = '';
    document.getElementById('membClienteSeleccionado').style.display = 'none';
    document.getElementById('membClienteSeleccionado').textContent   = '';
    document.getElementById('membClienteSugerencias').innerHTML      = '';
    document.getElementById('membMonto').value    = '';
    document.getElementById('membPago1').value    = '';
    document.getElementById('membNumCuotas').value = '1';
    document.getElementById('membInfo').style.display         = 'none';
    document.getElementById('membFraccionInfo').style.display = 'none';
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('membFechaInicio').value = hoy;
    document.getElementById('alertMembresia').className     = 'alert-msg';
    document.getElementById('modalMembresiaTitle').textContent = 'Nueva Membresía';
    actualizarResumenCuotas();
}

// ─── SELECTS AUXILIARES ───────────────────────────────────────────────────────
async function cargarPlanesSelect() {
    const sel = document.getElementById('membPlan');
    sel.innerHTML = '<option value="">Seleccionar plan...</option>';
    try {
        const planes = dataPlanes.length
            ? dataPlanes.filter(p => p.activo)
            : await api('GET', '/api/planes/activos');
        planes.forEach(p => {
            sel.innerHTML += `<option value="${p.id_plan}"
                data-precio="${p.precio}"
                data-meses="${p.duracion_meses}"
                data-fraccion="${p.permite_fraccion}"
                data-max="${p.max_cuotas}"
                data-dias-limite="${p.dias_limite_fraccion}"
                data-dias-entre="${p.dias_entre_cuotas}"
                data-minimo="${p.monto_minimo_cuota}">
                ${p.nombre} — S/ ${p.precio}
            </option>`;
        });
    } catch (e) { console.warn(e); }
}

async function cargarAsesoresSelect() {
    const sel = document.getElementById('membAsesor');
    sel.innerHTML = '<option value="">Seleccionar asesor...</option>';
    try {
        const usuarios = dataUsuarios.length ? dataUsuarios : await api('GET', '/api/usuarios');
        usuarios.filter(u => u.estado === 1).forEach(u => {
            const alias  = u.alias_asesor || u.nombre;
            const esSelf = u.id_usuario === JSON.parse(atob(TOKEN.split('.')[1])).id;
            sel.innerHTML += `<option value="${u.id_usuario}" ${esSelf ? 'selected' : ''}>${alias}</option>`;
        });
    } catch (e) { console.warn(e); }
}

// ─── LÓGICA PLAN / CUOTAS / RESUMEN ──────────────────────────────────────────
function onPlanChange() {
    const sel = document.getElementById('membPlan');
    const opt = sel.options[sel.selectedIndex];
    if (!opt || !opt.value) {
        document.getElementById('membInfo').style.display = 'none';
        document.getElementById('membFraccionInfo').style.display = 'none';
        return;
    }
    const precio     = parseFloat(opt.dataset.precio);
    const meses      = parseInt(opt.dataset.meses);
    const fraccion   = opt.dataset.fraccion === 'true';
    const maxCuotas  = parseInt(opt.dataset.max) || 1;

    document.getElementById('membMonto').value = precio.toFixed(2);
    document.getElementById('membPago1').value = precio.toFixed(2);

    // Panel cuotas
    const fraccionWrap = document.getElementById('membFraccionInfo');
    if (fraccion && maxCuotas > 1) {
        fraccionWrap.style.display = 'block';
        const selCuotas = document.getElementById('membNumCuotas');
        selCuotas.innerHTML = '';
        for (let n = 1; n <= maxCuotas; n++) {
            selCuotas.innerHTML += `<option value="${n}">${n === 1 ? 'Pago único' : `${n} cuotas`}</option>`;
        }
    } else {
        fraccionWrap.style.display = 'none';
        document.getElementById('membNumCuotas').innerHTML = '<option value="1">Pago único</option>';
    }

    document.getElementById('mbDuracion').textContent = `${meses} mes${meses > 1 ? 'es' : ''}`;
    document.getElementById('mbPrecio').textContent   = `S/ ${precio.toFixed(2)}`;
    calcularFechaFin();
    document.getElementById('membInfo').style.display = 'block';
    actualizarResumenCuotas();
}

function calcularFechaFin() {
    const sel = document.getElementById('membPlan');
    const opt = sel.options[sel.selectedIndex];
    const fi  = document.getElementById('membFechaInicio').value;
    if (!opt || !opt.value || !fi) { document.getElementById('mbFin').textContent = '—'; return; }
    const d = new Date(fi + 'T12:00:00');
    d.setMonth(d.getMonth() + parseInt(opt.dataset.meses));
    document.getElementById('mbFin').textContent = formatFechaCorta(d.toISOString().split('T')[0]);
    actualizarResumenCuotas();
}

function actualizarResumenCuotas() {
    const sel      = document.getElementById('membPlan');
    const opt      = sel?.options[sel.selectedIndex];
    const monto    = parseFloat(document.getElementById('membMonto')?.value) || 0;
    const pago1    = parseFloat(document.getElementById('membPago1')?.value) || monto;
    const numC     = parseInt(document.getElementById('membNumCuotas')?.value) || 1;
    const fi       = document.getElementById('membFechaInicio')?.value;
    const resumen  = document.getElementById('membResumenCuotas');
    if (!resumen) return;

    if (!opt || !opt.value || numC <= 1) {
        resumen.style.display = 'none';
        return;
    }

    const diasEntre  = parseInt(opt.dataset.diasEntre) || 30;
    const diasLimite = parseInt(opt.dataset.diasLimite) || 20;
    const saldo      = Math.max(0, monto - pago1);
    const cuotasRest = numC - 1;
    const montoCuota = cuotasRest > 0 ? (saldo / cuotasRest).toFixed(2) : 0;

    let html = `<div style="font-size:12px;font-weight:700;color:#0f3460;margin-bottom:8px">
        <i class="bi bi-calendar3 me-1"></i>Calendario de pagos
    </div>`;

    // Cuota 1
    html += cuotaRow(1, pago1, fi, fi ? addDiasStr(fi, diasLimite) : null, true);

    // Cuotas restantes
    if (fi && saldo > 0) {
        for (let n = 2; n <= numC; n++) {
            const offset = (n - 1) * diasEntre;
            const fechaP = addDiasStr(fi, offset);
            const fechaL = addDiasStr(fechaP, diasLimite);
            const esUltima = n === numC;
            // Última cuota absorbe redondeo
            const mc = esUltima ? (saldo - (montoCuota * (cuotasRest - 1))).toFixed(2) : montoCuota;
            html += cuotaRow(n, mc, fechaP, fechaL, false);
        }
    }

    resumen.innerHTML = html;
    resumen.style.display = 'block';
}

function cuotaRow(n, monto, fechaProg, fechaLim, pagadaAhora) {
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:6px 10px;background:${pagadaAhora ? '#e8f5e9' : '#f8f9fa'};border-radius:8px;margin-bottom:4px">
        <div style="width:24px;height:24px;border-radius:50%;background:${pagadaAhora ? '#26a69a' : '#e0e0e0'};color:${pagadaAhora ? '#fff' : '#666'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">${n}</div>
        <div style="flex:1">
            <span style="font-weight:700;font-size:13px">S/ ${parseFloat(monto).toFixed(2)}</span>
            ${pagadaAhora ? ' <span style="font-size:11px;color:#2e7d32">(hoy)</span>' : ''}
        </div>
        ${fechaProg ? `<div style="font-size:11px;color:#888">
            <i class="bi bi-calendar3 me-1"></i>${formatFechaLarga(fechaProg)}
            ${fechaLim ? `<span style="color:#e65100"> · lím: ${formatFechaLarga(fechaLim)}</span>` : ''}
        </div>` : ''}
    </div>`;
}

// Helper: sumar días a fecha string
function addDiasStr(fechaStr, dias) {
    const d = new Date(fechaStr + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    return d.toISOString().split('T')[0];
}

function formatFechaLarga(f) {
    if (!f) return '—';
    const s = typeof f === 'string' ? f.split('T')[0] : f;
    const d = new Date(s + 'T12:00:00');
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── AUTOCOMPLETE CLIENTE ─────────────────────────────────────────────────────
let _buscarTimer = null;

function buscarClienteMemb(q) {
    clearTimeout(_buscarTimer);
    const cont = document.getElementById('membClienteSugerencias');
    if (q.length < 2) { cont.innerHTML = ''; return; }

    _buscarTimer = setTimeout(() => {
        const matches = dataClientes.filter(c =>
            `${c.nombre} ${c.apellido}`.toLowerCase().includes(q.toLowerCase()) ||
            c.dni.includes(q)
        ).slice(0, 6);

        if (!matches.length) {
            cont.innerHTML = `<div style="padding:8px 14px;font-size:12px;color:#aaa;
                background:#fff;border-radius:8px;box-shadow:0 4px 12px #0001">Sin resultados</div>`;
            return;
        }

        cont.innerHTML = `
        <div style="position:absolute;z-index:100;width:100%;background:#fff;border-radius:8px;
            box-shadow:0 4px 12px #0002;overflow:hidden">
            ${matches.map(c => `
            <div onclick="seleccionarClienteMemb(${c.id_cliente},'${c.nombre} ${c.apellido}','${c.dni}')"
                style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid #f5f5f5;
                transition:background .1s"
                onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='#fff'">
                <strong>${c.nombre} ${c.apellido}</strong>
                <span style="color:#888;font-size:11px;margin-left:6px">${c.dni}</span>
                ${c.memb_estado === 'activa'
                    ? '<span style="float:right;color:#c62828;font-size:10px">⚠ Memb. activa</span>' : ''}
            </div>`).join('')}
        </div>`;
    }, 200);
}

function seleccionarClienteMemb(id, nombre, dni) {
    document.getElementById('membClienteId').value       = id;
    document.getElementById('membClienteBuscar').value   = `${nombre} — ${dni}`;
    document.getElementById('membClienteSugerencias').innerHTML = '';
    const info = document.getElementById('membClienteSeleccionado');
    const c    = dataClientes.find(x => x.id_cliente === id);
    info.textContent = `✓ ${nombre} | DNI: ${dni}`;
    if (c && c.memb_estado === 'activa')
        info.textContent += ' ⚠️ Ya tiene membresía activa';
    info.style.display = 'block';
}

// ─── GUARDAR MEMBRESÍA ────────────────────────────────────────────────────────
async function saveMembresia() {
    const id_cliente    = document.getElementById('membClienteId').value;
    const id_plan       = document.getElementById('membPlan').value;
    const fecha_inicio  = document.getElementById('membFechaInicio').value;
    const monto         = document.getElementById('membMonto').value;
    const pago1         = document.getElementById('membPago1').value || monto;
    const numCuotas     = document.getElementById('membNumCuotas').value || '1';
    const metodo        = document.getElementById('membMetodoPago').value;
    const id_asesor     = document.getElementById('membAsesor').value;
    const obs           = document.getElementById('membObservaciones').value;

    if (!id_cliente)   { showAlert('alertMembresia', 'Selecciona un cliente'); return; }
    if (!id_plan)      { showAlert('alertMembresia', 'Selecciona un plan'); return; }
    if (!monto || !fecha_inicio) { showAlert('alertMembresia', 'Completa todos los campos requeridos'); return; }
    if (parseFloat(pago1) <= 0) { showAlert('alertMembresia', 'El pago inicial debe ser mayor a 0'); return; }
    if (parseFloat(pago1) > parseFloat(monto)) {
        showAlert('alertMembresia', 'El pago inicial no puede superar el monto total'); return;
    }

    try {
        await api('POST', '/api/membresias', {
            id_cliente:              Number(id_cliente),
            id_plan:                 Number(id_plan),
            fecha_inicio,
            monto_total:             parseFloat(monto),
            monto_pagado_ahora:      parseFloat(pago1),
            num_cuotas_solicitadas:  parseInt(numCuotas),
            metodo_pago:             metodo,
            id_asesor:               id_asesor ? Number(id_asesor) : null,
            observaciones:           obs || null
        });
        closeModal('modalMembresia');
        loadMembresias();
        loadClientes();
    } catch (e) { showAlert('alertMembresia', e.message); }
}
