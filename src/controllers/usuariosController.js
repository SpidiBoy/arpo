import bcrypt from 'bcryptjs';
import { pool } from '../config/bd.js';

// GET /api/usuarios
export const getUsuarios = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.id_usuario, u.nombre, u.apellido, u.username, u.email,
                   u.alias_asesor, u.estado, u.created_at, u.id_perfil,
                   p.nombre AS perfil
            FROM usuarios u
            JOIN perfiles p ON p.id_perfil = u.id_perfil
            WHERE u.estado != 2
            ORDER BY u.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener usuarios' });
    }
};

// POST /api/usuarios
export const createUsuario = async (req, res) => {
    const { nombre, apellido, username, email, password, id_perfil, alias_asesor } = req.body;
    if (!nombre || !apellido || !username || !email || !password || !id_perfil)
        return res.status(400).json({ message: 'Faltan campos requeridos' });
    try {
        // Obtener perfil del ejecutor
        const ejecutorRes = await pool.query(
            `SELECT p.nombre AS perfil_nombre
             FROM usuarios u JOIN perfiles p ON p.id_perfil = u.id_perfil
             WHERE u.id_usuario = $1`, [req.usuario.id]
        );
        const ejecutorEsAdmin = ejecutorRes.rows[0]?.perfil_nombre?.toLowerCase() === 'administrador';

        // Verificar perfil destino
        const perfilDestinoRes = await pool.query(
            `SELECT nombre FROM perfiles WHERE id_perfil = $1 AND estado != 2`, [id_perfil]
        );
        if (!perfilDestinoRes.rows.length)
            return res.status(404).json({ message: 'Perfil no encontrado' });

        const perfilDestinoNombre = perfilDestinoRes.rows[0].nombre.toLowerCase();

        // No-admin no puede crear usuarios con perfil Administrador
        if (perfilDestinoNombre === 'administrador' && !ejecutorEsAdmin)
            return res.status(403).json({ message: 'No tienes permisos para asignar el perfil Administrador' });

        const existe = await pool.query(
            'SELECT id_usuario FROM usuarios WHERE username=$1 OR email=$2',
            [username, email]
        );
        if (existe.rows.length > 0)
            return res.status(409).json({ message: 'Username o email ya existe' });

        const hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO usuarios (id_perfil, nombre, apellido, username, email, password_hash, alias_asesor, creado_por)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id_usuario, nombre, apellido, username, email, estado`,
            [id_perfil, nombre.trim(), apellido.trim(), username.trim(), email.trim(), hash, alias_asesor || null, req.usuario.id]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al crear usuario' });
    }
};

// PUT /api/usuarios/:id
export const updateUsuario = async (req, res) => {
    const { id } = req.params;
    const { nombre, apellido, email, id_perfil, alias_asesor, estado, password } = req.body;
    try {
        // Obtener perfil del TARGET y del EJECUTOR juntos
        const info = await pool.query(
            `SELECT
                t.id_usuario        AS target_id,
                t.id_perfil         AS target_perfil_id,
                pt.nombre           AS target_perfil_nombre,
                e.id_perfil         AS ejecutor_perfil_id,
                pe.nombre           AS ejecutor_perfil_nombre
             FROM usuarios t
             JOIN perfiles pt ON pt.id_perfil = t.id_perfil
             JOIN usuarios e  ON e.id_usuario = $2
             JOIN perfiles pe ON pe.id_perfil = e.id_perfil
             WHERE t.id_usuario = $1`,
            [id, req.usuario.id]
        );
        if (!info.rows.length) return res.status(404).json({ message: 'Usuario no encontrado' });

        const {
            target_perfil_id, target_perfil_nombre,
            ejecutor_perfil_id, ejecutor_perfil_nombre
        } = info.rows[0];

        const targetEsAdmin   = target_perfil_nombre?.toLowerCase() === 'administrador';
        const ejecutorEsAdmin = ejecutor_perfil_nombre?.toLowerCase() === 'administrador';
        const mismosPerfil    = target_perfil_id === ejecutor_perfil_id;

        // Un perfil no-Admin NO puede editar a ningún usuario Administrador
        if (targetEsAdmin && !ejecutorEsAdmin) {
            return res.status(403).json({
                message: 'No tienes permisos para editar a un usuario Administrador'
            });
        }

        // Usuarios del mismo perfil no pueden editarse entre sí
        // (excepto si se editan a sí mismos — eso sí está permitido)
        if (mismosPerfil && Number(id) !== req.usuario.id) {
            return res.status(403).json({
                message: `Los usuarios con perfil "${target_perfil_nombre}" no pueden editarse entre sí`
            });
        }

        // Un usuario Administrador no puede desactivarse
        if (targetEsAdmin && estado != null && Number(estado) !== 1) {
            return res.status(403).json({
                message: 'Los usuarios Administrador no pueden desactivarse'
            });
        }

        // Un usuario Administrador no puede cambiar de perfil
        if (targetEsAdmin && id_perfil && Number(id_perfil) !== target_perfil_id) {
            return res.status(403).json({
                message: 'No se puede cambiar el perfil de un usuario Administrador'
            });
        }

        // ── NUEVA PROTECCIÓN: no-admin no puede asignar perfil Administrador ──
        if (!ejecutorEsAdmin && id_perfil) {
            const perfilDestinoRes = await pool.query(
                `SELECT nombre FROM perfiles WHERE id_perfil = $1`, [id_perfil]
            );
            const perfilDestinoNombre = perfilDestinoRes.rows[0]?.nombre?.toLowerCase();
            if (perfilDestinoNombre === 'administrador') {
                return res.status(403).json({
                    message: 'No tienes permisos para asignar el perfil Administrador'
                });
            }
        }

        if (password) {
            const hash = await bcrypt.hash(password, 10);
            await pool.query(
                `UPDATE usuarios SET nombre=$1, apellido=$2, email=$3, id_perfil=$4,
                 alias_asesor=$5, estado=$6, password_hash=$7 WHERE id_usuario=$8`,
                [nombre, apellido, email, id_perfil, alias_asesor || null, estado ?? 1, hash, id]
            );
        } else {
            await pool.query(
                `UPDATE usuarios SET nombre=$1, apellido=$2, email=$3, id_perfil=$4,
                 alias_asesor=$5, estado=$6 WHERE id_usuario=$7`,
                [nombre, apellido, email, id_perfil, alias_asesor || null, estado ?? 1, id]
            );
        }
        res.json({ message: 'Usuario actualizado' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al actualizar usuario' });
    }
};

// DELETE /api/usuarios/:id (soft delete)
export const deleteUsuario = async (req, res) => {
    const { id } = req.params;

    // No puede eliminarse a sí mismo
    if (Number(id) === req.usuario.id)
        return res.status(400).json({ message: 'No puedes eliminarte a ti mismo' });

    try {
        // Obtener perfil del TARGET y del EJECUTOR en una sola consulta
        const resultado = await pool.query(
            `SELECT
                t.id_perfil      AS target_perfil_id,
                pt.nombre        AS target_perfil_nombre,
                e.id_perfil      AS ejecutor_perfil_id,
                pe.nombre        AS ejecutor_perfil_nombre
             FROM usuarios t
             JOIN perfiles pt ON pt.id_perfil = t.id_perfil
             JOIN usuarios e  ON e.id_usuario = $2
             JOIN perfiles pe ON pe.id_perfil = e.id_perfil
             WHERE t.id_usuario = $1`, [id, req.usuario.id]
        );
        if (!resultado.rows.length) return res.status(404).json({ message: 'Usuario no encontrado' });

        const { target_perfil_id, target_perfil_nombre,
                ejecutor_perfil_id, ejecutor_perfil_nombre } = resultado.rows[0];

        // Mismos perfiles no pueden eliminarse entre sí
        if (target_perfil_id === ejecutor_perfil_id) {
            return res.status(403).json({
                message: `Los usuarios con perfil "${target_perfil_nombre}" no pueden eliminarse entre sí`
            });
        }

        // Perfil de menor jerarquía no puede eliminar al de mayor jerarquía
        // (Administrador siempre está protegido ante cualquier perfil distinto)
        if (target_perfil_nombre?.toLowerCase() === 'administrador') {
            return res.status(403).json({
                message: `No tienes permisos para eliminar a un Administrador`
            });
        }

        const result = await pool.query(
            `UPDATE usuarios SET estado=2, eliminado_por=$1 WHERE id_usuario=$2 RETURNING id_usuario`,
            [req.usuario.id, id]
        );
        if (result.rowCount === 0) return res.status(404).json({ message: 'Usuario no encontrado' });
        res.json({ message: 'Usuario eliminado' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al eliminar usuario' });
    }
};