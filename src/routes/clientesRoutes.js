import { Router } from 'express';
import { getClientes, getClientesStats, createCliente, updateCliente, deleteCliente } from '../controllers/clientesController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

router.get('/',        getClientes);
router.get('/stats',   getClientesStats);
router.post('/',       createCliente);
router.put('/:id',     updateCliente);
router.delete('/:id',  deleteCliente);

export default router;
