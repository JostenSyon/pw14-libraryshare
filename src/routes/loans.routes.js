import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { createLoan , getInbox,getOutbox,  acceptLoan, rejectLoan, cancelLoan, returnLoan} from "../controllers/loans.controller.js";


const router = Router();
router.post("/", requireAuth, createLoan);          // il richiedente crea una nuova richiesta di prestito
router.get("/inbox", requireAuth, getInbox);        // il proprietario vede le richieste di prestito ricevute
router.get("/outbox", requireAuth, getOutbox);      // il richiedente vede le richieste di prestito inviate

router.post("/:id/accept", requireAuth, acceptLoan); // il proprietario può accettare una richiesta pending
router.post("/:id/reject", requireAuth, rejectLoan); // il proprietario può rifiutare una richiesta pending
router.post("/:id/return", requireAuth, returnLoan); // il proprietario può segnare come restituito un prestito accepted
router.post("/:id/cancel", requireAuth, cancelLoan); // il richiedente può cancellare una richiesta pending
export default router;