import { Router } from 'express';
import { getUsuarios, createUsuario, updateUsuario, deleteUsuario } from '../controllers/usuariosController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

router.get('/',        getUsuarios);
router.post('/',       createUsuario);
router.put('/:id',     updateUsuario);
router.delete('/:id',  deleteUsuario);

export default router;
