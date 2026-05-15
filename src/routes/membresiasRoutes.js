import { Router } from 'express';
import {
    getMembresias,
    getMembresiasStats,
    getMembresiasByCliente,
    getCuotasByMembresia,
    createMembresia,
    updateMembresia,
    pagarCuota
} from '../controllers/membresiasController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

router.get('/',                    getMembresias);
router.get('/stats',               getMembresiasStats);
router.get('/cliente/:id',         getMembresiasByCliente);
router.get('/:id/cuotas',          getCuotasByMembresia);
router.post('/',                   createMembresia);
router.post('/:id/pagar-cuota',    pagarCuota);
router.put('/:id',                 updateMembresia);

export default router;
