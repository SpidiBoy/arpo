import { pool } from '../config/bd.js';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Suma N meses a una fecha sin desbordar el fin de mes */
function addMeses(fechaStr, meses) {
    const d = new Date(fechaStr + 'T12:00:00');
    d.setMonth(d.getMonth() + meses);
    return d.toISOString().split('T')[0];
}

/** Suma N días a una fecha */
function addDias(fechaStr, dias) {
    const d = new Date(fechaStr + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    return d.toISOString().split('T')[0];
}

/** Genera un número de comprobante único */
function genComprobante(prefijo = 'MEM') {
    return `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

// ─── GET /api/membresias ─────────────────────────────────────────────────────
export const getMembresias = async (req, res) => {
    try {
        const { estado, id_plan, asesor } = req.query;
        const where = ['c.deleted_at IS NULL'];
        const params = [];
        let i = 1;

        if (estado && estado !== 'todos') { where.push(`m.estado = $${i++}`); params.push(estado); }
        if (id_plan && id_plan !== 'todos') { where.push(`m.id_plan = $${i++}`); params.push(Number(id_plan)); }
        if (asesor && asesor !== 'todos') { where.push(`u.id_usuario = $${i++}`); params.push(Number(asesor)); }

        const result = await pool.query(`
            SELECT
                m.id_membresia,
                m.id_cliente,
                c.nombre || ' ' || c.apellido  AS nombre_cliente,
                c.dni, c.telefono, c.foto_url,
                p.id_plan, p.nombre             AS nombre_plan,
                p.tipo_cliente, p.duracion_meses,
                p.permite_fraccion, p.max_cuotas,
                m.fecha_inicio, m.fecha_fin,
                m.tipo_ingreso, m.estado,
                m.monto_total, m.saldo_pendiente,
                m.observaciones,
                u.id_usuario                    AS id_asesor,
                COALESCE(u.alias_asesor, u.nombre) AS asesor,
                m.created_at,
                -- Cuotas resumidas para mostrar progreso
                (SELECT COUNT(*) FROM pago pa WHERE pa.id_membresia = m.id_membresia)          AS total_cuotas,
                (SELECT COUNT(*) FROM pago pa WHERE pa.id_membresia = m.id_membresia AND pa.estado_cuota = 'pagado') AS cuotas_pagadas,
                (SELECT COUNT(*) FROM pago pa WHERE pa.id_membresia = m.id_membresia AND pa.estado_cuota = 'pendiente') AS cuotas_pendientes,
                (SELECT COUNT(*) FROM pago pa WHERE pa.id_membresia = m.id_membresia AND pa.estado_cuota = 'vencido')   AS cuotas_vencidas
            FROM membresia m
            JOIN cliente c        ON c.id_cliente   = m.id_cliente
            JOIN plan_membresia p ON p.id_plan       = m.id_plan
            JOIN usuarios u       ON u.id_usuario    = m.id_usuario_reg
            WHERE ${where.join(' AND ')}
            ORDER BY m.created_at DESC
        `, params);

        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener membresías' });
    }
};

// ─── GET /api/membresias/stats ───────────────────────────────────────────────
export const getMembresiasStats = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE m.estado = 'activa')  AS activas,
                COUNT(*) FILTER (WHERE m.estado = 'vencida') AS vencidas,
                COUNT(*) FILTER (WHERE m.saldo_pendiente > 0 AND m.estado = 'activa') AS con_deuda,
                COUNT(*) FILTER (WHERE DATE_TRUNC('month', m.created_at) = DATE_TRUNC('month', NOW())) AS este_mes
            FROM membresia m
            JOIN cliente c ON c.id_cliente = m.id_cliente
            WHERE c.deleted_at IS NULL
        `);
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener estadísticas' });
    }
};

// ─── GET /api/membresias/cliente/:id ────────────────────────────────────────
export const getMembresiasByCliente = async (req, res) => {
    const { id } = req.params;
    try {
        // Membresías con cuotas embebidas
        const membResult = await pool.query(`
            SELECT
                m.id_membresia, m.fecha_inicio, m.fecha_fin,
                m.tipo_ingreso, m.estado,
                m.monto_total, m.saldo_pendiente,
                m.observaciones, m.created_at,
                p.nombre AS nombre_plan, p.duracion_meses,
                p.permite_fraccion, p.max_cuotas,
                COALESCE(u.alias_asesor, u.nombre) AS asesor
            FROM membresia m
            JOIN plan_membresia p ON p.id_plan       = m.id_plan
            JOIN usuarios u       ON u.id_usuario    = m.id_usuario_reg
            WHERE m.id_cliente = $1
            ORDER BY m.created_at DESC
        `, [id]);

        // Para cada membresía, traer sus cuotas
        const membresias = await Promise.all(membResult.rows.map(async (m) => {
            const cuotasResult = await pool.query(`
                SELECT id_pago, num_cuota, monto, fecha_programada,
                       fecha_limite, fecha_pago, metodo_pago,
                       num_comprobante, estado_cuota, created_at
                FROM pago
                WHERE id_membresia = $1
                ORDER BY num_cuota ASC
            `, [m.id_membresia]);
            return { ...m, cuotas: cuotasResult.rows };
        }));

        res.json(membresias);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener membresías del cliente' });
    }
};

// ─── GET /api/membresias/:id/cuotas ─────────────────────────────────────────
export const getCuotasByMembresia = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            SELECT pa.id_pago, pa.num_cuota, pa.monto,
                   pa.fecha_programada, pa.fecha_limite, pa.fecha_pago,
                   pa.metodo_pago, pa.num_comprobante, pa.estado_cuota,
                   pa.created_at,
                   u.nombre || ' ' || u.apellido AS registrado_por
            FROM pago pa
            LEFT JOIN usuarios u ON u.id_usuario = pa.id_usuario_reg
            WHERE pa.id_membresia = $1
            ORDER BY pa.num_cuota ASC
        `, [id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener cuotas' });
    }
};

// ─── POST /api/membresias ────────────────────────────────────────────────────
export const createMembresia = async (req, res) => {
    const {
        id_cliente, id_plan, fecha_inicio,
        monto_total, monto_pagado_ahora,   // monto_pagado_ahora = cuota 1
        metodo_pago, observaciones, id_asesor,
        num_cuotas_solicitadas              // cuántas cuotas quiere el cliente (1 = pago completo)
    } = req.body;

    if (!id_cliente || !id_plan || !fecha_inicio || !monto_total || !metodo_pago)
        return res.status(400).json({ message: 'Faltan campos requeridos: cliente, plan, fecha_inicio, monto_total, metodo_pago' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Verificar membresía activa
        const activa = await client.query(
            `SELECT id_membresia FROM membresia WHERE id_cliente=$1 AND estado='activa'`, [id_cliente]
        );
        if (activa.rows.length > 0)
            return res.status(409).json({ message: 'El cliente ya tiene una membresía activa. Debe renovar o vencer la actual.' });

        // 2. Obtener plan con los nuevos campos
        const planRes = await client.query(
            `SELECT * FROM plan_membresia WHERE id_plan=$1 AND activo=TRUE`, [id_plan]
        );
        if (!planRes.rows.length)
            return res.status(404).json({ message: 'Plan no encontrado o inactivo' });

        const plan = planRes.rows[0];

        // 3. Validar num_cuotas_solicitadas
        const numCuotas = parseInt(num_cuotas_solicitadas) || 1;
        if (numCuotas < 1)
            return res.status(400).json({ message: 'El número de cuotas debe ser al menos 1' });
        if (numCuotas > 1 && !plan.permite_fraccion)
            return res.status(400).json({ message: 'Este plan no permite fraccionamiento' });
        if (numCuotas > plan.max_cuotas)
            return res.status(400).json({ message: `Este plan permite máximo ${plan.max_cuotas} cuotas` });

        // Validar monto mínimo por cuota
        const montoPorCuota = Number(monto_total) / numCuotas;
        if (numCuotas > 1 && plan.monto_minimo_cuota > 0 && montoPorCuota < plan.monto_minimo_cuota)
            return res.status(400).json({ message: `El monto por cuota (S/ ${montoPorCuota.toFixed(2)}) es menor al mínimo permitido (S/ ${plan.monto_minimo_cuota})` });

        // 4. Calcular fechas
        const fechaFin = addMeses(fecha_inicio, plan.duracion_meses);

        // 5. Tipo ingreso
        const historial = await client.query(
            `SELECT COUNT(*) FROM membresia WHERE id_cliente=$1`, [id_cliente]
        );
        const tipo_ingreso = parseInt(historial.rows[0].count) === 0 ? 'nuevo' : 'renovacion';

        const idUsuarioReg = id_asesor || req.usuario.id;

        // 6. Calcular saldo pendiente (todo lo que NO se paga ahora)
        const montoPagadoAhora = Number(monto_pagado_ahora ?? monto_total);
        const saldoPendiente = Math.max(0, Number(monto_total) - montoPagadoAhora);

        // 7. Crear membresía
        const membRes = await client.query(
            `INSERT INTO membresia
             (id_cliente, id_plan, id_usuario_reg, fecha_inicio, fecha_fin,
              tipo_ingreso, estado, monto_total, saldo_pendiente, observaciones)
             VALUES ($1,$2,$3,$4,$5,$6,'activa',$7,$8,$9) RETURNING *`,
            [id_cliente, id_plan, idUsuarioReg, fecha_inicio, fechaFin,
             tipo_ingreso, Number(monto_total), saldoPendiente, observaciones || null]
        );
        const membresia = membRes.rows[0];

        // 8. Insertar cuota 1 (pagada ahora)
        await client.query(
            `INSERT INTO pago
             (id_membresia, id_usuario_reg, num_cuota, monto,
              fecha_pago, fecha_programada, fecha_limite,
              metodo_pago, num_comprobante, estado_cuota)
             VALUES ($1,$2,1,$3,CURRENT_DATE,$4,$5,$6,$7,'pagado')`,
            [
                membresia.id_membresia, idUsuarioReg,
                montoPagadoAhora,
                fecha_inicio,
                addDias(fecha_inicio, plan.dias_limite_fraccion),
                metodo_pago,
                genComprobante('MEM')
            ]
        );

        // 9. Si hay más cuotas, crearlas como PENDIENTES con fechas calculadas
        if (numCuotas > 1 && saldoPendiente > 0) {
            // Distribuir el saldo restante en las cuotas restantes
            const cuotasRestantes = numCuotas - 1;
            const montoPorCuotaRestante = +(saldoPendiente / cuotasRestantes).toFixed(2);
            let saldoAcumulado = 0;

            for (let n = 2; n <= numCuotas; n++) {
                // La última cuota absorbe el redondeo
                const esUltima = n === numCuotas;
                const montoCuota = esUltima
                    ? +(saldoPendiente - saldoAcumulado).toFixed(2)
                    : montoPorCuotaRestante;
                saldoAcumulado += montoCuota;

                // fecha_programada = fecha_inicio + (n-1) * dias_entre_cuotas
                const diasOffset = (n - 1) * plan.dias_entre_cuotas;
                const fechaProgr = addDias(fecha_inicio, diasOffset);
                const fechaLimCuota = addDias(fechaProgr, plan.dias_limite_fraccion);

                await client.query(
                    `INSERT INTO pago
                     (id_membresia, id_usuario_reg, num_cuota, monto,
                      fecha_programada, fecha_limite,
                      estado_cuota)
                     VALUES ($1,$2,$3,$4,$5,$6,'pendiente')`,
                    [
                        membresia.id_membresia, idUsuarioReg,
                        n, montoCuota,
                        fechaProgr, fechaLimCuota
                    ]
                );
            }
        }

        await client.query('COMMIT');

        // Retornar membresía con cuotas
        const cuotasResult = await pool.query(
            `SELECT * FROM pago WHERE id_membresia=$1 ORDER BY num_cuota`, [membresia.id_membresia]
        );
        res.status(201).json({ ...membresia, cuotas: cuotasResult.rows });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: err.message || 'Error al crear membresía' });
    } finally {
        client.release();
    }
};

// ─── POST /api/membresias/:id/pagar-cuota ───────────────────────────────────
// Registra el pago de una cuota pendiente
export const pagarCuota = async (req, res) => {
    const { id } = req.params;         // id_membresia
    const { id_pago, metodo_pago, num_comprobante, monto_pagado } = req.body;

    if (!id_pago || !metodo_pago)
        return res.status(400).json({ message: 'id_pago y metodo_pago son requeridos' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verificar que la cuota pertenece a esta membresía y está pendiente/vencida
        const cuotaRes = await client.query(
            `SELECT * FROM pago WHERE id_pago=$1 AND id_membresia=$2 AND estado_cuota IN ('pendiente','vencido')
             FOR UPDATE`,
            [id_pago, id]
        );
        if (!cuotaRes.rows.length)
            return res.status(404).json({ message: 'Cuota no encontrada o ya fue pagada' });

        const cuota = cuotaRes.rows[0];
        const montoFinal = monto_pagado ? Number(monto_pagado) : cuota.monto;

        // Actualizar la cuota
        await client.query(
            `UPDATE pago SET
                estado_cuota  = 'pagado',
                fecha_pago    = CURRENT_DATE,
                metodo_pago   = $1,
                num_comprobante = $2,
                monto         = $3,
                modificado_por = $4
             WHERE id_pago = $5`,
            [metodo_pago, num_comprobante || genComprobante('MEM'), montoFinal, req.usuario.id, id_pago]
        );

        // Recalcular saldo_pendiente en la membresía
        const saldoRes = await client.query(
            `SELECT COALESCE(SUM(monto), 0) AS saldo
             FROM pago
             WHERE id_membresia=$1 AND estado_cuota IN ('pendiente','vencido')`,
            [id]
        );
        const nuevoSaldo = parseFloat(saldoRes.rows[0].saldo);

        await client.query(
            `UPDATE membresia SET saldo_pendiente=$1 WHERE id_membresia=$2`,
            [nuevoSaldo, id]
        );

        await client.query('COMMIT');

        // Retornar cuotas actualizadas
        const cuotasResult = await pool.query(
            `SELECT * FROM pago WHERE id_membresia=$1 ORDER BY num_cuota`, [id]
        );
        res.json({ message: 'Cuota registrada correctamente', cuotas: cuotasResult.rows, nuevo_saldo: nuevoSaldo });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: err.message || 'Error al registrar pago de cuota' });
    } finally {
        client.release();
    }
};

// ─── PUT /api/membresias/:id ─────────────────────────────────────────────────
export const updateMembresia = async (req, res) => {
    const { id } = req.params;
    const { estado, observaciones, saldo_pendiente } = req.body;
    try {
        const sets = [];
        const params = [];
        let i = 1;
        if (estado !== undefined)           { sets.push(`estado=$${i++}`);           params.push(estado); }
        if (observaciones !== undefined)     { sets.push(`observaciones=$${i++}`);    params.push(observaciones); }
        if (saldo_pendiente !== undefined)   { sets.push(`saldo_pendiente=$${i++}`);  params.push(Number(saldo_pendiente)); }
        if (!sets.length)
            return res.status(400).json({ message: 'Nada que actualizar' });
        params.push(id);
        const result = await pool.query(
            `UPDATE membresia SET ${sets.join(',')} WHERE id_membresia=$${i} RETURNING *`,
            params
        );
        if (!result.rowCount)
            return res.status(404).json({ message: 'Membresía no encontrada' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al actualizar membresía' });
    }
};
