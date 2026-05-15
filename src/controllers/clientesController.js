import { pool } from '../config/bd.js';
import { v4 as uuidv4 } from 'uuid';

// GET /api/clientes — con membresía activa incluida
export const getClientes = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                c.id_cliente, c.dni, c.nombre, c.apellido, c.telefono,
                c.fecha_nacimiento, c.fecha_registro, c.activo, c.created_at,
                -- Usuario que registró (en el sistema)
                u_reg.nombre || ' ' || u_reg.apellido AS registrado_por,
                -- Membresía activa vigente
                m.id_membresia,
                m.fecha_inicio  AS memb_fecha_inicio,
                m.fecha_fin     AS memb_fecha_fin,
                m.tipo_ingreso  AS memb_tipo,
                m.estado        AS memb_estado,
                m.monto_total   AS memb_monto,
                m.saldo_pendiente AS memb_saldo,
                p.nombre        AS plan_nombre,
                p.duracion_meses AS plan_duracion,
                -- Asesor asignado a la membresía
                u_asesor.id_usuario    AS id_asesor,
                COALESCE(u_asesor.alias_asesor, u_asesor.nombre) AS asesor
            FROM cliente c
            JOIN usuarios u_reg ON u_reg.id_usuario = c.id_usuario_reg
            LEFT JOIN LATERAL (
                SELECT * FROM membresia
                WHERE id_cliente = c.id_cliente AND estado = 'activa'
                ORDER BY created_at DESC LIMIT 1
            ) m ON TRUE
            LEFT JOIN plan_membresia p ON p.id_plan = m.id_plan
            LEFT JOIN usuarios u_asesor ON u_asesor.id_usuario = m.id_usuario_reg
            WHERE c.deleted_at IS NULL
            ORDER BY c.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener clientes' });
    }
};

// GET /api/clientes/stats
export const getClientesStats = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE activo = TRUE AND deleted_at IS NULL) AS activos,
                COUNT(*) FILTER (WHERE activo = FALSE AND deleted_at IS NULL) AS inactivos,
                COUNT(*) FILTER (WHERE DATE_TRUNC('month', fecha_registro) = DATE_TRUNC('month', CURRENT_DATE) AND deleted_at IS NULL) AS este_mes
            FROM cliente
        `);
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener estadísticas' });
    }
};

// POST /api/clientes
export const createCliente = async (req, res) => {
    const { dni, nombre, apellido, telefono, fecha_nacimiento, es_mayor_edad, observacion } = req.body;
    if (!dni || !nombre || !apellido)
        return res.status(400).json({ message: 'DNI, nombre y apellido son requeridos' });
    try {
        const existe = await pool.query('SELECT id_cliente FROM cliente WHERE dni=$1', [dni]);
        if (existe.rows.length > 0)
            return res.status(409).json({ message: 'Ya existe un cliente con ese DNI' });

        const qr_code = uuidv4();
        const result = await pool.query(
            `INSERT INTO cliente
             (id_usuario_reg, dni, nombre, apellido, telefono, fecha_nacimiento, qr_code, creado_por)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [req.usuario.id, dni.trim(), nombre.trim(), apellido.trim(),
             telefono || null, fecha_nacimiento || null, qr_code, req.usuario.id]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al crear cliente' });
    }
};

// PUT /api/clientes/:id
export const updateCliente = async (req, res) => {
    const { id } = req.params;
    const { nombre, apellido, telefono, fecha_nacimiento, activo } = req.body;
    try {
        const result = await pool.query(
            `UPDATE cliente SET nombre=$1, apellido=$2, telefono=$3,
             fecha_nacimiento=$4, activo=$5, modificado_por=$6
             WHERE id_cliente=$7 AND deleted_at IS NULL RETURNING *`,
            [nombre, apellido, telefono || null, fecha_nacimiento || null,
             activo ?? true, req.usuario.id, id]
        );
        if (result.rowCount === 0) return res.status(404).json({ message: 'Cliente no encontrado' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al actualizar cliente' });
    }
};

// DELETE /api/clientes/:id (soft delete)
export const deleteCliente = async (req, res) => {
    const { id } = req.params;
    try {
        // No eliminar si tiene membresía activa
        const activa = await pool.query(
            `SELECT id_membresia FROM membresia WHERE id_cliente=$1 AND estado='activa'`, [id]
        );
        if (activa.rows.length > 0)
            return res.status(409).json({ message: 'No se puede eliminar: el cliente tiene una membresía activa' });

        const result = await pool.query(
            `UPDATE cliente SET activo=false, eliminado_por=$1, deleted_at=NOW()
             WHERE id_cliente=$2 RETURNING id_cliente`,
            [req.usuario.id, id]
        );
        if (result.rowCount === 0) return res.status(404).json({ message: 'Cliente no encontrado' });
        res.json({ message: 'Cliente eliminado' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al eliminar cliente' });
    }
};
