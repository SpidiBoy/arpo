import { pool } from '../config/bd.js';

// ─── GET /api/planes ─────────────────────────────────────────────────────────
export const getPlanes = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id_plan, nombre, tipo_cliente, duracion_meses, precio,
                   permite_fraccion, dias_limite_fraccion,
                   max_cuotas, dias_entre_cuotas, monto_minimo_cuota,
                   descripcion, activo, created_at
            FROM plan_membresia
            ORDER BY activo DESC, tipo_cliente, duracion_meses
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener planes' });
    }
};

// ─── GET /api/planes/activos ─────────────────────────────────────────────────
export const getPlanesActivos = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id_plan, nombre, tipo_cliente, duracion_meses, precio,
                   permite_fraccion, dias_limite_fraccion,
                   max_cuotas, dias_entre_cuotas, monto_minimo_cuota,
                   descripcion
            FROM plan_membresia
            WHERE activo = TRUE
            ORDER BY tipo_cliente, duracion_meses
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener planes activos' });
    }
};

// ─── POST /api/planes ────────────────────────────────────────────────────────
export const createPlan = async (req, res) => {
    const {
        nombre, tipo_cliente, duracion_meses, precio,
        permite_fraccion, dias_limite_fraccion,
        max_cuotas, dias_entre_cuotas, monto_minimo_cuota,
        descripcion
    } = req.body;

    if (!nombre || !tipo_cliente || !duracion_meses || !precio)
        return res.status(400).json({ message: 'Nombre, tipo_cliente, duracion_meses y precio son requeridos' });

    const tiposValidos = ['nuevo', 'renovacion', 'interdiario'];
    if (!tiposValidos.includes(tipo_cliente))
        return res.status(400).json({ message: 'tipo_cliente inválido. Valores: nuevo, renovacion, interdiario' });

    const fraccion = permite_fraccion ?? false;
    const cuotas   = parseInt(max_cuotas) || 1;
    const diasEntre = parseInt(dias_entre_cuotas) || 30;

    if (fraccion && cuotas < 2)
        return res.status(400).json({ message: 'Si permite_fraccion es true, max_cuotas debe ser >= 2' });
    if (!fraccion && cuotas > 1)
        return res.status(400).json({ message: 'Para usar múltiples cuotas debes activar permite_fraccion' });

    try {
        const result = await pool.query(
            `INSERT INTO plan_membresia
             (nombre, tipo_cliente, duracion_meses, precio,
              permite_fraccion, dias_limite_fraccion,
              max_cuotas, dias_entre_cuotas, monto_minimo_cuota,
              descripcion)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [
                nombre.trim(), tipo_cliente, Number(duracion_meses), Number(precio),
                fraccion, dias_limite_fraccion ?? 20,
                cuotas, diasEntre,
                Number(monto_minimo_cuota ?? 0),
                descripcion || null
            ]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al crear plan' });
    }
};

// ─── PUT /api/planes/:id ─────────────────────────────────────────────────────
export const updatePlan = async (req, res) => {
    const { id } = req.params;
    const {
        nombre, tipo_cliente, duracion_meses, precio,
        permite_fraccion, dias_limite_fraccion,
        max_cuotas, dias_entre_cuotas, monto_minimo_cuota,
        descripcion, activo
    } = req.body;

    const fraccion = permite_fraccion ?? false;
    const cuotas   = parseInt(max_cuotas) || 1;

    if (fraccion && cuotas < 2)
        return res.status(400).json({ message: 'Si permite_fraccion es true, max_cuotas debe ser >= 2' });

    try {
        const result = await pool.query(
            `UPDATE plan_membresia SET
                nombre=$1, tipo_cliente=$2, duracion_meses=$3, precio=$4,
                permite_fraccion=$5, dias_limite_fraccion=$6,
                max_cuotas=$7, dias_entre_cuotas=$8, monto_minimo_cuota=$9,
                descripcion=$10, activo=$11
             WHERE id_plan=$12 RETURNING *`,
            [
                nombre, tipo_cliente, Number(duracion_meses), Number(precio),
                fraccion, dias_limite_fraccion ?? 20,
                cuotas, parseInt(dias_entre_cuotas) || 30,
                Number(monto_minimo_cuota ?? 0),
                descripcion || null, activo ?? true,
                id
            ]
        );
        if (!result.rowCount)
            return res.status(404).json({ message: 'Plan no encontrado' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al actualizar plan' });
    }
};

// ─── DELETE /api/planes/:id (soft: activo=false) ─────────────────────────────
export const deletePlan = async (req, res) => {
    const { id } = req.params;
    try {
        const check = await pool.query(
            `SELECT COUNT(*) FROM membresia WHERE id_plan=$1 AND estado='activa'`, [id]
        );
        if (parseInt(check.rows[0].count) > 0)
            return res.status(409).json({ message: 'No se puede desactivar: hay membresías activas con este plan' });

        const result = await pool.query(
            `UPDATE plan_membresia SET activo=false WHERE id_plan=$1 RETURNING id_plan`, [id]
        );
        if (!result.rowCount)
            return res.status(404).json({ message: 'Plan no encontrado' });
        res.json({ message: 'Plan desactivado correctamente' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al desactivar plan' });
    }
};
